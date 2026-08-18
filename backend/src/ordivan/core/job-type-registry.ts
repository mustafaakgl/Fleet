import { SchemaValidationError, validateObject, type ObjectSpec } from './schema-validation';

/**
 * Is turu ve oneri turu REGISTRY'si (Faz 12).
 *
 * WHITELIST, BLACKLIST DEGIL: burada tanimli olmayan bir `jobType` ya da
 * `proposalType` sistemde YOKTUR. Belgeden, e-postadan ya da connector
 * yanitindan gelen bir metin yeni bir tur ACAMAZ; en fazla var olan bir turu
 * secebilir ve o secim de bu listeye karsi dogrulanir.
 *
 * ARAC SETI DE BURADA: bir isin hangi araclari kullanabilecegi is turune
 * baglidir, modelin karari degildir. `sql`, `shell`, `http` gibi genel araclar
 * hicbir turde YOKTUR ve eklenemez (bkz. FORBIDDEN_TOOLS).
 */

/** Faz 12'de yalnizca bu iki is turu var. */
export const JOB_TYPES = [
  'system.echo',
  'document.mock_classification',
  /** Faz 13 — servis faturasi cikarimi. */
  'document.service_invoice.extract',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const PROPOSAL_TYPES = [
  'system.echo_result',
  'document.classification',
  /** Faz 13 — servis kaydi TASLAGI. Bir ServiceRecord DEGILDIR. */
  'service_invoice.draft',
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

/**
 * Hicbir is turune verilemeyecek araclar.
 *
 * Bu liste bir "yasak listesi" degil, bir GUVENLIK TESTI: registry'ye bu
 * araclardan biri eklenirse acilis testleri patlar. Genel SQL/shell/HTTP
 * yetkisi, connector'i Fleet'in veritabanina acar ve butun kiraci sinirini
 * anlamsiz kilar.
 */
export const FORBIDDEN_TOOLS = [
  'sql',
  'raw_sql',
  'shell',
  'exec',
  'http',
  'fetch',
  'file_write',
  'eval',
] as const;

export interface JobTypeDefinition {
  jobType: JobType;
  /** Bu isi alabilmek icin connector'da bulunmasi gereken yetenek. */
  requiredCapability: string;
  /** Desteklenen payload surumleri. Listede olmayan surum REDDEDILIR. */
  schemaVersions: Record<number, ObjectSpec>;
  /** Bu isin uretebilecegi oneri turleri — baskasini uretemez. */
  allowedProposalTypes: readonly ProposalType[];
  /** Bu isin kullanabilecegi araclar. Bos liste = arac yok. */
  toolset: readonly string[];
}

export const JOB_TYPE_REGISTRY: Record<JobType, JobTypeDefinition> = {
  'system.echo': {
    jobType: 'system.echo',
    requiredCapability: 'system.echo',
    schemaVersions: {
      1: {
        message: { type: 'string', required: true, maxLength: 500 },
      },
    },
    allowedProposalTypes: ['system.echo_result'],
    // Protokolun ucdan uca calistigini kanitlamak icin var; hicbir arac
    // gerekmiyor ve verilmiyor.
    toolset: [],
  },
  'document.mock_classification': {
    jobType: 'document.mock_classification',
    requiredCapability: 'document.classification',
    schemaVersions: {
      1: {
        documentName: { type: 'string', required: true, maxLength: 255 },
        /** Belge METNI degil, yalnizca uzunlugu — icerik is kaydina girmez. */
        contentLength: { type: 'integer', required: false, min: 0, max: 50_000_000 },
        mimeType: { type: 'string', required: false, maxLength: 120 },
      },
    },
    allowedProposalTypes: ['document.classification'],
    toolset: [],
  },
  'document.service_invoice.extract': {
    jobType: 'document.service_invoice.extract',
    requiredCapability: 'document.service_invoice.extract',
    schemaVersions: {
      1: {
        /**
         * Belge KIMLIGI — icerigi degil. Belge metni is kaydina GIRMEZ:
         * kuyruk kaydinda duran her sey loglara ve denetime sizabilir.
         */
        documentId: { type: 'string', required: true, maxLength: 64 },
        originalName: { type: 'string', required: false, maxLength: 255 },
        contentLength: { type: 'integer', required: false, min: 0, max: 50_000_000 },
      },
    },
    allowedProposalTypes: ['service_invoice.draft'],
    // Arac seciminde bile arac YOK: eslestirme SUNUCUDA, deterministik
    // kurallarla yapiliyor (bkz. vehicle-match.ts).
    toolset: [],
  },
};

/** Oneri govdelerinin semasi — surum bazinda. */
export const PROPOSAL_SCHEMAS: Record<ProposalType, Record<number, ObjectSpec>> = {
  'system.echo_result': {
    1: {
      echoed: { type: 'string', required: true, maxLength: 500 },
    },
  },
  'service_invoice.draft': {
    1: {
      /** --- Atolye / tedarikci --- */
      vendorName: { type: 'string', required: true, maxLength: 200 },
      invoiceNumber: { type: 'string', required: false, maxLength: 80 },
      /** --- Tarihler: ISO 'YYYY-MM-DD' --- */
      invoiceDate: { type: 'string', required: false, maxLength: 10 },
      serviceDate: { type: 'string', required: false, maxLength: 10 },
      /** --- Arac ipuclari. AJAN ARAC SECMEZ; bunlar yalnizca aday. --- */
      plateNumber: { type: 'string', required: false, maxLength: 20 },
      vin: { type: 'string', required: false, maxLength: 20 },
      mileageKm: { type: 'integer', required: false, min: 0, max: 3_000_000 },
      /**
       * Para birimi. EUR VARSAYILMAZ: eksikse alan bos kalir ve kontrol
       * `unknown` doner (bkz. service-invoice-checks.ts).
       */
      currency: { type: 'string', required: false, maxLength: 3 },
      /** --- Tutarlar. Makul aralik: tek bir servis faturasi. --- */
      netAmount: { type: 'number', required: false, min: 0, max: 1_000_000 },
      taxAmount: { type: 'number', required: false, min: 0, max: 1_000_000 },
      grossAmount: { type: 'number', required: false, min: 0, max: 1_000_000 },
      serviceDescription: { type: 'string', required: false, maxLength: 500 },
      /** Fatura satirlari — onerinin icinde KORUNUYOR (paralel model yok). */
      lineItems: {
        type: 'array',
        required: false,
        maxItems: 50,
        items: {
          description: { type: 'string', required: true, maxLength: 300 },
          quantity: { type: 'number', required: false, min: 0, max: 100_000 },
          unitPrice: { type: 'number', required: false, min: 0, max: 1_000_000 },
          totalPrice: { type: 'number', required: false, min: 0, max: 1_000_000 },
        },
      },
    },
  },
  'document.classification': {
    1: {
      documentKind: {
        type: 'enum',
        required: true,
        // Modelin uydurdugu bir belge turu KABUL EDILMEZ.
        values: ['invoice', 'delivery_note', 'fuel_receipt', 'insurance', 'other'],
      },
      /** 0..1 araligi disi bir guven skoru makul degildir. */
      confidence: { type: 'number', required: true, min: 0, max: 1 },
      pageCount: { type: 'integer', required: false, min: 1, max: 2_000 },
      issuedAt: { type: 'string', required: false, maxLength: 40 },
    },
  },
};

export function isKnownJobType(value: string): value is JobType {
  return (JOB_TYPES as readonly string[]).includes(value);
}

export function isKnownProposalType(value: string): value is ProposalType {
  return (PROPOSAL_TYPES as readonly string[]).includes(value);
}

/** Is payload'ini `jobType + schemaVersion` ciftine gore dogrular. */
export function validateJobPayload(
  jobType: string,
  schemaVersion: number,
  payload: unknown,
): Record<string, unknown> {
  if (!isKnownJobType(jobType)) {
    throw new SchemaValidationError('unknown_job_type');
  }
  const definition = JOB_TYPE_REGISTRY[jobType];
  const spec = definition.schemaVersions[schemaVersion];
  if (!spec) {
    throw new SchemaValidationError('unsupported_schema_version');
  }
  return validateObject(payload, spec);
}

/**
 * Oneri govdesini dogrular.
 *
 * Ayrica onerinin ISE AIT olup olmadigini kontrol eder: bir `system.echo` isi
 * `document.classification` onerisi URETEMEZ. Bu kontrol olmasaydi, girdiyi
 * kontrol eden biri "sunu bir fatura onerisi olarak dondur" diyerek is turunu
 * atlayabilirdi.
 */
export function validateProposal(
  jobType: string,
  proposalType: string,
  schemaVersion: number,
  payload: unknown,
): Record<string, unknown> {
  if (!isKnownJobType(jobType)) {
    throw new SchemaValidationError('unknown_job_type');
  }
  if (!isKnownProposalType(proposalType)) {
    throw new SchemaValidationError('unknown_proposal_type');
  }
  const definition = JOB_TYPE_REGISTRY[jobType];
  if (!definition.allowedProposalTypes.includes(proposalType)) {
    throw new SchemaValidationError('proposal_type_not_allowed_for_job');
  }
  const spec = PROPOSAL_SCHEMAS[proposalType][schemaVersion];
  if (!spec) {
    throw new SchemaValidationError('unsupported_schema_version');
  }
  return validateObject(payload, spec);
}

/**
 * ISE BAGLI OLMAYAN YETENEKLER (Faz 14).
 *
 * `document.intake.upload@v1`: tarayici connector'i Fleet'e BELGE YUKLEYEBILIR.
 * Bu bir is turu DEGIL — connector kuyruktan bir sey almiyor, tek yonlu icerik
 * gonderiyor. Ayri tutulmasinin sebebi: yukleme yetkisi olan bir connector'in
 * otomatikman is de alabilmesi, tarayiciya gereksiz genislikte yetki verirdi.
 *
 * SURUMLU: yukleme oturumunun sozlesmesi degisirse `@v2` acilir ve eski
 * connector'lar sessizce yeni davranisa gecmez.
 *
 * BURADA DA GENEL ARAC YOK: `sql`, `shell`, `http` bu listeye de giremez —
 * `FORBIDDEN_TOOLS` testi ikisini birden tariyor.
 */
export const NON_JOB_CAPABILITIES = ['document.intake.upload@v1'] as const;
export type NonJobCapability = (typeof NON_JOB_CAPABILITIES)[number];

/** Connector'a verilebilecek BUTUN yetenekler. */
export function knownCapabilities(): Set<string> {
  return new Set<string>([
    ...Object.values(JOB_TYPE_REGISTRY).map((definition) => definition.requiredCapability),
    ...NON_JOB_CAPABILITIES,
  ]);
}

/** Connector'in bildirdigi yeteneklerden YALNIZCA taninanlari kabul eder. */
export function sanitizeCapabilities(requested: unknown): string[] {
  if (!Array.isArray(requested)) {
    return [];
  }
  const known = knownCapabilities();
  return [...new Set(requested.filter((item): item is string => typeof item === 'string'))].filter(
    (item) => known.has(item),
  );
}

/**
 * Connector bu yetenege sahip mi.
 *
 * Yetenek listesi ENROLLMENT'ta belirlenir ve connector kendi istegiyle
 * genisletemez; bu kontrol yalnizca kayittaki listeye bakar.
 */
export function connectorHasCapability(
  capabilities: readonly string[],
  required: string,
): boolean {
  return capabilities.includes(required);
}

/** Bir is turunun arac seti — connector'in istegine gore DEGISMEZ. */
export function toolsetFor(jobType: JobType): readonly string[] {
  return JOB_TYPE_REGISTRY[jobType].toolset;
}
