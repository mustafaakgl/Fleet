import {
  JOB_TYPES,
  JOB_TYPE_REGISTRY,
  PROPOSAL_SCHEMAS,
  PROPOSAL_TYPES,
} from './job-type-registry';
import type { FieldSpec, ObjectSpec } from './schema-validation';
import { CURRENT_PROTOCOL_VERSION, MIN_SUPPORTED_PROTOCOL_VERSION } from '../ordivan.config';

/**
 * SOZLESMENIN TEK KAYNAGI (Faz 12 ek sartname).
 *
 * OpenAPI dosyasi ve JSON Schema'lar ELLE YAZILMAZ: hepsi burada, calisan
 * kodun kullandigi registry'den URETILIR. Bagimsiz kopya birakmamanin tek
 * guvenilir yolu bu — elle tutulan bir yaml, ilk sema degisikliginde sessizce
 * yalan soylemeye baslar.
 *
 * DRIFT: `contract-drift.spec.ts` diskteki dosyalari burada uretilenle
 * karsilastirir. DTO ya da registry degisip dosyalar guncellenmezse test
 * KIRILIR.
 */

export const CONTRACT_VERSION = '1.0.0';

type JsonSchema = Record<string, unknown>;

function fieldToJsonSchema(field: FieldSpec): JsonSchema {
  switch (field.type) {
    case 'string': {
      const schema: JsonSchema = { type: 'string' };
      if (field.maxLength !== undefined) schema.maxLength = field.maxLength;
      return schema;
    }
    case 'number':
    case 'integer': {
      const schema: JsonSchema = { type: field.type === 'integer' ? 'integer' : 'number' };
      if (field.min !== undefined) schema.minimum = field.min;
      if (field.max !== undefined) schema.maximum = field.max;
      return schema;
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'enum':
      return { type: 'string', enum: [...(field.values ?? [])] };
  }
}

/**
 * Bir ObjectSpec'i JSON Schema'ya cevirir.
 *
 * `additionalProperties: false` KRITIK: dogrulayicinin "beklenmeyen alan
 * reddedilir" kurali sozlesmede de gorunur olmali, yoksa disaridan bakan biri
 * fazladan alan gonderilebilecegini sanar.
 */
export function objectSpecToJsonSchema(spec: ObjectSpec, title: string): JsonSchema {
  const properties: JsonSchema = {};
  const required: string[] = [];

  for (const [name, field] of Object.entries(spec)) {
    properties[name] = fieldToJsonSchema(field);
    if (field.required) {
      required.push(name);
    }
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://fleet.local/contracts/ordivan/${title}.schema.json`,
    title,
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export interface ExportedSchema {
  /** Dosya adi — surum ADIN ICINDE, yani eski surum silinmeden yenisi eklenir. */
  fileName: string;
  schema: JsonSchema;
}

/** Butun is ve oneri semalarini surumleriyle birlikte uretir. */
export function exportJsonSchemas(): ExportedSchema[] {
  const exported: ExportedSchema[] = [];

  for (const jobType of JOB_TYPES) {
    const definition = JOB_TYPE_REGISTRY[jobType];
    for (const [version, spec] of Object.entries(definition.schemaVersions)) {
      const title = `job.${jobType}.v${version}`;
      exported.push({ fileName: `${title}.schema.json`, schema: objectSpecToJsonSchema(spec, title) });
    }
  }

  for (const proposalType of PROPOSAL_TYPES) {
    for (const [version, spec] of Object.entries(PROPOSAL_SCHEMAS[proposalType])) {
      const title = `proposal.${proposalType}.v${version}`;
      exported.push({ fileName: `${title}.schema.json`, schema: objectSpecToJsonSchema(spec, title) });
    }
  }

  return exported.sort((left, right) => left.fileName.localeCompare(right.fileName));
}

/** Makine tarafindan okunabilir protokol ozeti — mock worker bunu kullanir. */
export function exportContractIndex(): JsonSchema {
  return {
    contractVersion: CONTRACT_VERSION,
    protocol: {
      current: CURRENT_PROTOCOL_VERSION,
      minimumSupported: MIN_SUPPORTED_PROTOCOL_VERSION,
    },
    jobTypes: JOB_TYPES.map((jobType) => {
      const definition = JOB_TYPE_REGISTRY[jobType];
      return {
        jobType,
        requiredCapability: definition.requiredCapability,
        schemaVersions: Object.keys(definition.schemaVersions).map(Number).sort(),
        allowedProposalTypes: [...definition.allowedProposalTypes],
        toolset: [...definition.toolset],
      };
    }),
    proposalTypes: PROPOSAL_TYPES.map((proposalType) => ({
      proposalType,
      schemaVersions: Object.keys(PROPOSAL_SCHEMAS[proposalType]).map(Number).sort(),
    })),
  };
}

function yamlScalar(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) =>
        item !== null && typeof item === 'object'
          ? `${pad}-\n${toYaml(item, indent + 1)}`
          : `${pad}- ${yamlScalar(item)}`,
      )
      .join('\n');
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([key, item]) => {
        if (item !== null && typeof item === 'object') {
          const nested = toYaml(item, indent + 1);
          return `${pad}${key}:\n${nested}`;
        }
        return `${pad}${key}: ${yamlScalar(item)}`;
      })
      .join('\n');
  }

  return `${pad}${yamlScalar(value)}`;
}

const CREDENTIAL_SCHEME = {
  type: 'apiKey',
  in: 'header',
  name: 'x-ordivan-credential',
  description:
    'Connector anahtari. Duz metin DB de saklanmaz; kiraci yalnizca bu anahtarin bagli oldugu kayittan cozulur.',
};

/**
 * OpenAPI belgesi — registry'den URETILIR.
 *
 * Elle tutulan bir yaml yerine bunun secilme sebebi tek satirla: sema
 * degistiginde belge de degisir, degismezse drift testi kirilir.
 */
export function exportOpenApiDocument(): JsonSchema {
  const leaseResponse = {
    type: 'object',
    properties: {
      job: {
        nullable: true,
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          jobType: { type: 'string', enum: [...JOB_TYPES] },
          schemaVersion: { type: 'integer' },
          payload: { type: 'object' },
          attempt: { type: 'integer' },
          leaseToken: { type: 'string' },
          leaseExpiresAt: { type: 'string', format: 'date-time' },
          toolset: { type: 'array', items: { type: 'string' } },
          allowedProposalTypes: { type: 'array', items: { type: 'string' } },
          protocolVersion: { type: 'integer' },
        },
      },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'Ordivan Connector Protocol',
      version: CONTRACT_VERSION,
      description:
        'Connector protokolu. BU DOSYA URETILIR — kaynak backend/src/ordivan/core/job-type-registry.ts. Elle duzenlemeyin; contract-drift.spec.ts kirilir.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: { connectorCredential: CREDENTIAL_SCHEME },
    },
    paths: {
      '/ordivan/connector/enroll': {
        post: {
          summary: 'Enrollment kodu karsiliginda kalici anahtar. Anahtar BIR KEZ doner.',
          description:
            'Kimlik dogrulamasi kodun kendisidir. Kod tek kullanimlik ve kisa omurludur. Gecersiz, suresi dolmus ve kullanilmis kod AYNI cevabi alir.',
          responses: { '200': { description: 'Anahtar uretildi' }, '401': { description: 'ordivan_enrollment_invalid' } },
        },
      },
      '/ordivan/connector/heartbeat': {
        post: {
          summary: 'Canlilik ve surum bildirimi',
          security: [{ connectorCredential: [] }],
          responses: { '200': { description: 'Alindi' } },
        },
      },
      '/ordivan/connector/jobs/lease': {
        post: {
          summary: 'Uygun bir isi kirala',
          description:
            'Yalnizca ayni kiracinin ve connector yeteneklerine uyan isleri doner. Ayni isi iki connector ayni anda alamaz. Arac seti SUNUCUDAN gelir.',
          security: [{ connectorCredential: [] }],
          responses: {
            '200': { description: 'Kiralanan is ya da null', content: { 'application/json': { schema: leaseResponse } } },
          },
        },
      },
      '/ordivan/connector/jobs/{id}/running': {
        post: {
          summary: 'Is calistirilmaya baslandi',
          security: [{ connectorCredential: [] }],
          responses: { '200': { description: 'Guncellendi' }, '409': { description: 'ordivan_lease_not_current' } },
        },
      },
      '/ordivan/connector/jobs/{id}/complete': {
        post: {
          summary: 'Sonuc ve oneri',
          description:
            'IDEMPOTENT: ayni leaseToken ile tekrar cagrildiginda yeni oneri uretilmez. BAYAT deneme reddedilir.',
          security: [{ connectorCredential: [] }],
          responses: {
            '200': { description: 'Oneri yazildi' },
            '400': { description: 'ordivan_proposal_invalid | ordivan_check_contract_violation' },
            '409': { description: 'ordivan_lease_not_current' },
          },
        },
      },
      '/ordivan/connector/jobs/{id}/fail': {
        post: {
          summary: 'Hata sinifi bildirimi',
          description: 'Deneme siniri dolduysa is dead-letter olur; otomatik tekrar yoktur.',
          security: [{ connectorCredential: [] }],
          responses: { '200': { description: 'Kaydedildi' }, '409': { description: 'ordivan_lease_not_current' } },
        },
      },
    },
  };
}

export function renderOpenApiYaml(): string {
  return [
    '# URETILEN DOSYA — ELLE DUZENLEMEYIN.',
    '# Kaynak: backend/src/ordivan/core/job-type-registry.ts + ordivan.config.ts',
    '# Yeniden uretmek icin: npm --prefix backend run ordivan:contract',
    '# Drift testi: backend/src/ordivan/core/contract-drift.spec.ts',
    toYaml(exportOpenApiDocument()),
    '',
  ].join('\n');
}
