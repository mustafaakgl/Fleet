/**
 * Calisma zamani sema dogrulamasi (Faz 12).
 *
 * NEDEN ELDE YAZILMIS BIR DOGRULAYICI: bu katmanin girdisi GUVENILMEYEN
 * veridir — belge metni, OCR ciktisi, connector yaniti. Guvenlik siniri
 * uzerinde calisan kodun davranisi tam olarak okunabilir olmali; bir
 * kutuphanenin "coercion", "unknown keys" ve "transform" varsayilanlari
 * sessizce degistiginde sinir da degisir.
 *
 * TEMEL KURAL: BEKLENMEYEN ALAN REDDEDILIR. Yok sayilmaz, kirpilmaz —
 * reddedilir. Yok saymak, saldirganin fazladan alan gondererek davranis
 * degistirmeyi denemesini sessiz birakirdi.
 */

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum';

export interface FieldSpec {
  type: FieldType;
  required?: boolean;
  /** string icin */
  maxLength?: number;
  /** number/integer icin — MAKUL ARALIK kontrolu */
  min?: number;
  max?: number;
  /** enum icin */
  values?: readonly string[];
}

export type ObjectSpec = Record<string, FieldSpec>;

export class SchemaValidationError extends Error {
  constructor(
    /** Makine tarafindan okunabilir sinif — kullaniciya ham metin gitmez. */
    readonly reason: string,
    readonly field?: string,
  ) {
    super(field ? `${reason} (${field})` : reason);
    this.name = 'SchemaValidationError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bir nesneyi sema ile dogrular ve YALNIZCA semada tanimli alanlari doner.
 *
 * Donen nesne yeni bir nesnedir: girdinin prototype'i, getter'lari ya da
 * fazladan anahtarlari cikisa TASINMAZ.
 */
export function validateObject(value: unknown, spec: ObjectSpec): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new SchemaValidationError('not_an_object');
  }

  // __proto__ / constructor gibi anahtarlar prototype kirletme denemesidir;
  // "beklenmeyen alan" kurali bunlari zaten yakalar ama sinif ayri verilir.
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new SchemaValidationError('forbidden_key', key);
    }
    if (!(key in spec)) {
      throw new SchemaValidationError('unexpected_field', key);
    }
  }

  const result: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(spec)) {
    const raw = value[key];

    if (raw === undefined || raw === null) {
      if (field.required) {
        throw new SchemaValidationError('missing_required_field', key);
      }
      continue;
    }

    switch (field.type) {
      case 'string': {
        if (typeof raw !== 'string') {
          throw new SchemaValidationError('wrong_type', key);
        }
        if (field.maxLength !== undefined && raw.length > field.maxLength) {
          throw new SchemaValidationError('too_long', key);
        }
        result[key] = raw;
        break;
      }
      case 'number':
      case 'integer': {
        // Sayi metni SESSIZCE sayiya cevrilmez: "12" gonderip sayi alani
        // doldurmak, tur kontrolunu etkisiz kilardi.
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
          throw new SchemaValidationError('wrong_type', key);
        }
        if (field.type === 'integer' && !Number.isInteger(raw)) {
          throw new SchemaValidationError('not_an_integer', key);
        }
        if (field.min !== undefined && raw < field.min) {
          throw new SchemaValidationError('out_of_range', key);
        }
        if (field.max !== undefined && raw > field.max) {
          throw new SchemaValidationError('out_of_range', key);
        }
        result[key] = raw;
        break;
      }
      case 'boolean': {
        if (typeof raw !== 'boolean') {
          throw new SchemaValidationError('wrong_type', key);
        }
        result[key] = raw;
        break;
      }
      case 'enum': {
        if (typeof raw !== 'string') {
          throw new SchemaValidationError('wrong_type', key);
        }
        if (!field.values?.includes(raw)) {
          throw new SchemaValidationError('not_in_enum', key);
        }
        result[key] = raw;
        break;
      }
    }
  }

  return result;
}
