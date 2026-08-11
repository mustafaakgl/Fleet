export type NormalizedTelemetryEvents = Array<{
  type: 'speeding' | 'harsh_accel' | 'harsh_brake' | 'harsh_corner' | 'crash';
  value: number;
  threshold?: number;
}>;

export type NormalizedTelemetryDtc = Array<{
  code: string;
  description?: string;
  severity: 'medium' | 'critical';
}>;

export type ParsedIoValue = number | bigint;

export type ParsedAvlIo = {
  eventId: number;
  totalCount: number;
  values: Map<number, ParsedIoValue>;
  /** Codec 8 Extended'in degisken uzunluklu elemanlarinin ham baytlari. */
  rawValues?: Map<number, Buffer>;
};

/**
 * Ariza kodlarinin nasil okunacagi.
 *
 * `bitmask`  — tek bir sayinin bitleri kod yerine geciyor (FMC130/FMC650'de
 *              bugune kadar varsayilan davranis).
 * `obd`      — OBD dongle'i: bir sayac elemani (kac kod var) ve ayri bir metin
 *              elemani (kodlarin kendisi, ornegin "P0100,P0234").
 */
export type DtcReadMode = 'bitmask' | 'obd';

export type TelematicsIoMap = {
  fields: {
    ignition: readonly number[];
    rpm: readonly number[];
    fuelLevelPct: readonly number[];
    coolantTemp: readonly number[];
    voltageMv: readonly number[];
    odometerMeters: readonly number[];
  };
  events: {
    overspeed: readonly number[];
    harshAccel: readonly number[];
    harshBrake: readonly number[];
    harshCorner: readonly number[];
  };
  dtc:
    | { mode: 'bitmask'; ids: readonly number[] }
    | { mode: 'obd'; countId: number; codesId: number };
  thresholds: {
    overspeedKph: number;
    harshAccel: number;
    harshBrake: number;
    harshCorner: number;
  };
};

/**
 * Araca sabitlenen ana uniteler (FMC130, FMC650).
 *
 * TODO device-side verify (FOTA IO config): exact IDs and scaling vary by
 * firmware/profile. FMC130 usually provides subset via OBD adapter; FMC650
 * typically exposes richer FMS/CAN set.
 */
export const TELEMATICS_IO_MAP: TelematicsIoMap = {
  fields: {
    ignition: [239, 1],
    rpm: [32],
    fuelLevelPct: [86, 90],
    coolantTemp: [112],
    voltageMv: [66],
    odometerMeters: [16],
  },
  events: {
    overspeed: [255],
    harshAccel: [253],
    harshBrake: [254],
    harshCorner: [246],
  },
  dtc: {
    mode: 'bitmask',
    ids: [272, 385, 48],
  },
  thresholds: {
    overspeedKph: 90,
    harshAccel: 3,
    harshBrake: 3,
    harshCorner: 2,
  },
};

/**
 * FMC003 — OBD-II soketine takilan dongle.
 *
 * AYRI BIR HARITA OLMAK ZORUNDA: ust haritada AVL 32 `rpm` demek, bu cihazda
 * ise 32 SOGUTUCU SICAKLIGI. Ortak harita kullanilsaydi motor sicakligi devir
 * sutununa sessizce yazilirdi.
 *
 * Kaynak: docs/telematik-donanim-secim.md:100 tablosu (uretici veri sayfasi
 * FMC003 Datasheet v1.5 · 2025-03-19 ve wiki AVL parametre tablosundan).
 *
 * DOGRULANMAMIS: `rpm` icin OBD grubunun devir elemani varsayildi; veri
 * sayfasi tabloda ID vermiyor. Cihaz gelince TELEMATICS_IO_CAPTURE ile gercek
 * ID okunup burasi duzeltilmeli. Yanlis olsa bile zarari yok — 36 bu haritada
 * baska bir alana bagli degil, alan yalnizca bos kalir.
 */
export const FMC003_IO_MAP: TelematicsIoMap = {
  fields: {
    ignition: [239, 1],
    rpm: [36],
    fuelLevelPct: [390],
    coolantTemp: [32],
    voltageMv: [66],
    odometerMeters: [389],
  },
  // Surus olaylari cihazin kendi ivmeolcerinden gelir, OBD'den degil; bu yuzden
  // ana unitelerle ayni elemanlar. Green-driving semantigi (253 tur, 254 siddet)
  // cihaz uzerinde dogrulanmali.
  events: {
    overspeed: [255],
    harshAccel: [253],
    harshBrake: [254],
    harshCorner: [246],
  },
  dtc: {
    mode: 'obd',
    countId: 30,
    codesId: 281,
  },
  thresholds: {
    overspeedKph: 90,
    harshAccel: 3,
    harshBrake: 3,
    harshCorner: 2,
  },
};

const IO_MAP_BY_MODEL: Record<string, TelematicsIoMap> = {
  FMC003: FMC003_IO_MAP,
  FMC130: TELEMATICS_IO_MAP,
  FMC650: TELEMATICS_IO_MAP,
};

/**
 * Cihaz modeline karsilik gelen haritayi verir.
 *
 * Taninmayan model ana unite haritasina duser: yeni bir model eklendiginde
 * veri tamamen kesilmesin, ama bu durumun log'a dusmesi cagiranin isi.
 */
export function resolveIoMap(model?: string | null): TelematicsIoMap {
  if (!model) {
    return TELEMATICS_IO_MAP;
  }

  return IO_MAP_BY_MODEL[model] ?? TELEMATICS_IO_MAP;
}

/** Haritada karsiligi olmayan IO elemanlari — cihaz devreye alinirken okunur. */
export function collectUnmappedIoIds(io: ParsedAvlIo, map: TelematicsIoMap): number[] {
  const known = new Set<number>([
    ...map.fields.ignition,
    ...map.fields.rpm,
    ...map.fields.fuelLevelPct,
    ...map.fields.coolantTemp,
    ...map.fields.voltageMv,
    ...map.fields.odometerMeters,
    ...map.events.overspeed,
    ...map.events.harshAccel,
    ...map.events.harshBrake,
    ...map.events.harshCorner,
    ...(map.dtc.mode === 'bitmask' ? map.dtc.ids : [map.dtc.countId, map.dtc.codesId]),
  ]);

  return [...io.values.keys()].filter((id) => !known.has(id)).sort((a, b) => a - b);
}

function firstIoValue(io: ParsedAvlIo, ids: readonly number[]): number | undefined {
  for (const id of ids) {
    const value = io.values.get(id);
    if (value === undefined) {
      continue;
    }

    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        return asNumber;
      }
      continue;
    }

    return value;
  }

  return undefined;
}

/** "P0100" / "U0155" bicimindeki standart OBD-II ariza kodu. */
const OBD_DTC_PATTERN = /^[PBCU][0-9][0-9A-F]{3}$/;

/**
 * OBD dongle'inin metin elemanindan ariza kodlarini cikarir.
 *
 * Cihazin bu alani hangi ayracla yazdigi firmware'e gore degisebiliyor; bu
 * yuzden kod bicimine uymayan her parca ATILIR. Boylece format beklenenden
 * farkli cikarsa arac sagligina uydurma kod yazilmaz, alan bos kalir.
 */
function parseObdDtcCodes(raw?: Buffer): string[] {
  if (!raw || raw.length === 0) {
    return [];
  }

  return [
    ...new Set(
      raw
        .toString('ascii')
        .split(/[^0-9A-Za-z]+/)
        .map((part) => part.trim().toUpperCase())
        .filter((part) => OBD_DTC_PATTERN.test(part)),
    ),
  ];
}

export function normalizeIoToTelemetry(
  io: ParsedAvlIo,
  speedKph: number,
  map: TelematicsIoMap = TELEMATICS_IO_MAP,
): {
  ignition?: boolean;
  rpm?: number;
  fuelLevelPct?: number;
  coolantTemp?: number;
  voltage?: number;
  odometerKm?: number;
  events: NormalizedTelemetryEvents;
  dtc: NormalizedTelemetryDtc;
  /** Ariza kodu durumu okunabildi mi — false ise mevcut kayitlara dokunulmaz. */
  dtcPresent: boolean;
  /** Cihaz "ariza var" dedi ama kodlar cozulemedi; cagiranin log'lamasi icin. */
  dtcUnreadable: boolean;
} {
  const ignitionRaw = firstIoValue(io, map.fields.ignition);
  const rpmRaw = firstIoValue(io, map.fields.rpm);
  const fuelRaw = firstIoValue(io, map.fields.fuelLevelPct);
  const coolantRaw = firstIoValue(io, map.fields.coolantTemp);
  const voltageMvRaw = firstIoValue(io, map.fields.voltageMv);
  const odometerMetersRaw = firstIoValue(io, map.fields.odometerMeters);

  const overspeedFlag = firstIoValue(io, map.events.overspeed);
  const harshAccelFlag = firstIoValue(io, map.events.harshAccel);
  const harshBrakeFlag = firstIoValue(io, map.events.harshBrake);
  const harshCornerFlag = firstIoValue(io, map.events.harshCorner);

  const events: NormalizedTelemetryEvents = [];

  if ((overspeedFlag ?? 0) > 0 || speedKph > map.thresholds.overspeedKph) {
    events.push({
      type: 'speeding',
      value: Number(speedKph.toFixed(2)),
      threshold: map.thresholds.overspeedKph,
    });
  }

  if (harshAccelFlag !== undefined && harshAccelFlag > 0) {
    events.push({
      type: 'harsh_accel',
      value: harshAccelFlag,
      threshold: map.thresholds.harshAccel,
    });
  }

  if (harshBrakeFlag !== undefined && harshBrakeFlag > 0) {
    events.push({
      type: 'harsh_brake',
      value: harshBrakeFlag,
      threshold: map.thresholds.harshBrake,
    });
  }

  if (harshCornerFlag !== undefined && harshCornerFlag > 0) {
    events.push({
      type: 'harsh_corner',
      value: harshCornerFlag,
      threshold: map.thresholds.harshCorner,
    });
  }

  const dtc: NormalizedTelemetryDtc = [];
  let dtcPresent = false;
  let dtcUnreadable = false;

  if (map.dtc.mode === 'bitmask') {
    const dtcRaw = firstIoValue(io, map.dtc.ids);
    dtcPresent = map.dtc.ids.some((id) => io.values.has(id));

    if (dtcRaw !== undefined && dtcRaw > 0) {
      for (let bit = 0; bit < 16; bit += 1) {
        const mask = 1 << bit;
        if ((dtcRaw & mask) === 0) {
          continue;
        }
        dtc.push({
          code: `TELTONIKA-${mask.toString(16).toUpperCase()}`,
          description: 'DTC code from Teltonika IO element',
          severity: mask >= 0x8000 ? 'critical' : 'medium',
        });
      }
    }
  } else {
    const count = io.values.get(map.dtc.countId);
    const countNumber = count === undefined ? undefined : Number(count);

    if (countNumber !== undefined) {
      const codes = parseObdDtcCodes(io.rawValues?.get(map.dtc.codesId));

      for (const code of codes) {
        dtc.push({ code, description: 'OBD-II fault code', severity: 'medium' });
      }

      // Sayac "ariza var" diyor ama kod cozulemediyse listeyi BOS gondermeyiz:
      // bos liste mevcut ariza kayitlarini kapatilmis sayardi.
      dtcUnreadable = countNumber > 0 && codes.length === 0;
      dtcPresent = !dtcUnreadable;
    }
  }

  const ignition = ignitionRaw === undefined ? undefined : ignitionRaw > 0;
  const rpm = rpmRaw === undefined ? undefined : Math.round(Math.max(0, rpmRaw));
  const fuelLevelPct =
    fuelRaw === undefined
      ? undefined
      : Number(Math.min(100, Math.max(0, fuelRaw)).toFixed(2));
  const coolantTemp =
    coolantRaw === undefined
      ? undefined
      : Number(coolantRaw.toFixed(1));

  const voltage =
    voltageMvRaw === undefined
      ? undefined
      : Number((voltageMvRaw >= 100 ? voltageMvRaw / 1000 : voltageMvRaw).toFixed(1));

  const odometerKm =
    odometerMetersRaw === undefined
      ? undefined
      : Number((odometerMetersRaw > 100_000 ? odometerMetersRaw / 1000 : odometerMetersRaw).toFixed(3));

  return {
    ignition,
    rpm,
    fuelLevelPct,
    coolantTemp,
    voltage,
    odometerKm,
    events,
    dtc,
    dtcPresent,
    dtcUnreadable,
  };
}
