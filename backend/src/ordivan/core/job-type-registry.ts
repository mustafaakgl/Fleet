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
  /** Faz 16 — e-posta/PDF'ten tasima emri alani cikarimi. */
  'transport_order.extract',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const PROPOSAL_TYPES = [
  'system.echo_result',
  'document.classification',
  /** Faz 13 — servis kaydi TASLAGI. Bir ServiceRecord DEGILDIR. */
  'service_invoice.draft',
  /**
   * Faz 16 — siparis alani cikarimi.
   *
   * ADI BILINCLI OLARAK `draft` DEGIL: bu ciktinin kendisi bir siparis taslagi
   * bile degildir, yalnizca OKUNAN ALANLARDIR. Canonical `TransportOrder`
   * taslagi insan onayindan sonra Faz 15 servisinde olusur.
   */
  'transport_order.extraction',
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
  'transport_order.extract': {
    jobType: 'transport_order.extract',
    /**
     * SURUMLU YETENEK.
     *
     * `@v1` anahtarin ICINDE: cikarim sozlesmesi degistiginde `@v2` acilir ve
     * eski connector'lar SESSIZCE yeni davranisa gecmez. Ayri bir surum alani
     * unutulabilir, anahtar unutulamaz (bkz. `document.intake.upload@v1`).
     */
    requiredCapability: 'transport_order.extract@v1',
    schemaVersions: {
      1: {
        /**
         * MESAJ KIMLIGI — ICERIGI DEGIL.
         *
         * E-posta govdesi, konu ve PDF metni is kaydina GIRMEZ. Kuyruk
         * kaydinda duran her sey loglara, denetime ve hata raporlarina
         * sizabilir; guvensiz metnin oraya kopyalanmasi icin hicbir sebep yok.
         * Worker icerigi ayri, yetkilendirilmis bir uctan alir.
         */
        messageId: { type: 'string', required: true, maxLength: 64 },
        /** Kabul edilen eklerin Faz 14 yukleme kimlikleri. */
        attachmentIntakeIds: {
          type: 'array',
          required: false,
          maxItems: 20,
          items: { id: { type: 'string', required: true, maxLength: 64 } },
        },
        contentLength: { type: 'integer', required: false, min: 0, max: 50_000_000 },
      },
    },
    allowedProposalTypes: ['transport_order.extraction'],
    /**
     * ARAC YOK.
     *
     * Musteri ve mevcut siparis eslestirmesi SUNUCUDA, deterministik
     * kurallarla yapiliyor (bkz. order-intake-match.ts). Ajana bir "musteri
     * ara" araci vermek, gonderen adresini kesin eslesmeye cevirmenin ve
     * kiraci sinirini ajanin karar verdigi bir seye donusturmenin yoluydu.
     */
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
  /**
   * FAZ 16 — CIKARIM SOZLESMESI.
   *
   * BURADA OLMAYAN ALAN YOKTUR: `validateObject` beklenmeyen alani yok
   * saymaz, REDDEDER. Bu yuzden asagidaki liste ayni zamanda bir YASAK
   * LISTESIDIR — sayilmayan her sey otomatik olarak disaridadir:
   *
   *   - `latitude`/`longitude` ve her turlu koordinat: adres metni bir
   *     konuma ajan tarafindan cevrilemez; geocoding sunucunun isi.
   *   - `companyId`, `vehicleId`, `driverId`, `assignmentId`, `consignmentId`:
   *     Fleet'in ic kimlikleri. Ajanin bir kimlik YAZABILMESI, e-posta
   *     govdesine kimlik gomen birine baska bir kiracinin kaydini
   *     gosterebilirdi. Eslestirme SUNUCUDA yapilir.
   *   - `status`, `confirmed`, `approved`, `cancelled`: durum ve onay sonucu.
   *     Bir e-posta kendi kendini onaylatamaz.
   *   - `orderNumber`: BIZIM numaramiz. Musteri kendi referansini yazar
   *     (`externalReference`); bizim numaramizi ona yazdirmak, var olan bir
   *     siparisi isaret etmesine izin vermek olurdu.
   *
   * UYDURMA YOK: eksik `timezone`, `currency`, `adr` ve tarih icin alan BOS
   * KALIR. Hicbiri varsayilana dusmez — `unknown` ile `verified` ayni sey
   * degildir ve makul bir tahmin, kanit degildir.
   */
  'transport_order.extraction': {
    1: {
      /**
       * NIYET.
       *
       * ZORUNLU ve `unknown` GECERLI BIR CEVAP: modelin "anlamadim"
       * diyebilmesi gerekiyor. Alan opsiyonel olsaydi, bos birakilan her mesaj
       * sessizce bir varsayilana duserdi — ve o varsayilan ne olursa olsun
       * yanlis olurdu.
       */
      intent: {
        type: 'enum',
        required: true,
        values: ['new_order', 'amendment', 'cancellation', 'unknown'],
      },

      /** --- MUSTERI IPUCLARI. AJAN MUSTERI SECMEZ; bunlar yalnizca aday. --- */
      customerName:   { type: 'string', required: false, maxLength: 200 },
      /** Musterinin BIZDEKI numarasi (DATEV borclu numarasi metin olarak). */
      customerNumber: { type: 'string', required: false, maxLength: 40 },
      vatId:          { type: 'string', required: false, maxLength: 30 },
      contactEmail:   { type: 'string', required: false, maxLength: 254 },
      contactPhone:   { type: 'string', required: false, maxLength: 40 },
      contactName:    { type: 'string', required: false, maxLength: 120 },

      /** --- Referanslar --- */
      /// Musterinin KENDI referansi. Bizim siparis numaramiz DEGIL.
      externalReference: { type: 'string', required: false, maxLength: 80 },
      /// ISO 'YYYY-MM-DD'. Okunamadiysa BOS KALIR.
      orderDate:         { type: 'string', required: false, maxLength: 10 },

      /** --- Finans. EUR VARSAYILMAZ. --- */
      revenueAmount: { type: 'number', required: false, min: 0, max: 10_000_000 },
      /// ISO 4217. Belgede yoksa BOS — para birimi tahmin edilmez.
      currency:      { type: 'string', required: false, maxLength: 3 },
      billingMode:   {
        type: 'enum',
        required: false,
        values: ['on_order_completion', 'per_delivery'],
      },

      specialInstructions: { type: 'string', required: false, maxLength: 2_000 },

      /**
       * --- KALEMLER ---
       *
       * BIRDEN FAZLA OLABILIR: tek kaleme zorlamak, iki bosaltma noktali bir
       * siparisi sessizce tek noktaya indirirdi.
       */
      consignments: {
        type: 'array',
        required: false,
        maxItems: 20,
        items: {
          /** Adres METNI. Koordinat YOK — bkz. sozlesme basligi. */
          pickupAddress:   { type: 'string', required: false, maxLength: 300 },
          deliveryAddress: { type: 'string', required: false, maxLength: 300 },

          /**
           * ZAMAN PENCERESI: yerel 'YYYY-MM-DDTHH:mm', ZAMAN DILIMSIZ.
           *
           * NEDEN UTC DEGIL: guvensiz metinden okunan bir saati UTC'ye
           * cevirmek, bilinmeyen bir zaman dilimini VARSAYMAK demektir. Saat
           * oldugu gibi tasinir; donusum yalnizca `timezone` BILINIYORSA ve
           * sunucuda yapilir.
           */
          pickupWindowStart:   { type: 'string', required: false, maxLength: 16 },
          pickupWindowEnd:     { type: 'string', required: false, maxLength: 16 },
          deliveryWindowStart: { type: 'string', required: false, maxLength: 16 },
          deliveryWindowEnd:   { type: 'string', required: false, maxLength: 16 },
          /// IANA adi (ornegin 'Europe/Berlin'). Belgede yoksa BOS KALIR.
          timezone:            { type: 'string', required: false, maxLength: 64 },

          cargoDescription: { type: 'string', required: false, maxLength: 500 },
          quantity:         { type: 'number', required: false, min: 0, max: 1_000_000 },
          /// Serbest kisa metin: repoda canonical birim enum'u YOK.
          unit:             { type: 'string', required: false, maxLength: 20 },

          weightKg:    { type: 'number', required: false, min: 0, max: 1_000_000 },
          volumeM3:    { type: 'number', required: false, min: 0, max: 100_000 },
          palletCount: { type: 'integer', required: false, min: 0, max: 10_000 },

          /**
           * ADR ZORUNLU ve `unknown` GECERLI.
           *
           * Alani opsiyonel yapsaydik, tehlikeli madde tasiyan bir siparis
           * "belirtilmemis" diye sessizce `no` gibi islem gorebilirdi. Modeli
           * ACIKCA soylemeye zorluyoruz; "bilmiyorum" durust bir cevaptir,
           * bos birakmak degil.
           */
          adr: { type: 'enum', required: true, values: ['yes', 'no', 'unknown'] },

          temperatureMinC: { type: 'number', required: false, min: -80, max: 80 },
          temperatureMaxC: { type: 'number', required: false, min: -80, max: 80 },

          shipperReference:   { type: 'string', required: false, maxLength: 80 },
          consigneeReference: { type: 'string', required: false, maxLength: 80 },
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
/**
 * `order_intake.message.push@v1` (Faz 16): posta connector'u Fleet'e MESAJ
 * gonderebilir. Bu da bir is turu DEGIL — connector kuyruktan bir sey almiyor,
 * tek yonlu icerik gonderiyor.
 *
 * BELGE YUKLEMEDEN AYRI: bir tarayici connector'unun belge yuklemesi ile bir
 * posta connector'unun siparis mesaji gondermesi FARKLI yetkilerdir. Tek
 * yetenekte birlestirmek, ofisteki tarayiciya siparis akisini besleme hakki
 * vermek olurdu.
 */
export const NON_JOB_CAPABILITIES = [
  'document.intake.upload@v1',
  'order_intake.message.push@v1',
] as const;
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
