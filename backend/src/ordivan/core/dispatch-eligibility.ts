/**
 * UYGUNLUK MOTORU (Faz 17) — SAF ve DETERMINISTIK.
 *
 * BURASI KARARIN VERILDIGI YER. Model adaylari SIRALAR; hangisinin
 * kullanilabilecegi burada, veriye bakarak belirlenir. Bir modelin "bu arac
 * uygun" demesi, o aracin bakimda olmadigi anlamina gelmez.
 *
 * UC DURUM VE `unknown`IN ANLAMI:
 *
 *   - `verified`      — kontrol calisti ve GECTI.
 *   - `incompatible`  — kontrol calisti ve DUSTU; gerekcesi var.
 *   - `unknown`       — kontrol CALISTIRILAMADI (veri yok).
 *
 * `unknown` HICBIR ZAMAN "uygun" ya da "guvenli" SAYILMAZ. Bir aracin
 * kapasitesi girilmemisse "sigar" diyemeyiz; takograf verisi yoksa "suresi
 * var" diyemeyiz. Sessizce gecmek, kontrol edilmis izlenimi verir ve
 * dispatcher'i olmayan bir guvenceye yaslandirir — bu fazdaki en tehlikeli
 * basarisizlik bicimi bu olurdu.
 *
 * VERI YUKLEME BURADA DEGIL: bu modul yalnizca OLGULARI alir ve karar verir.
 * Saf olmasi, her kuralin tek basina test edilebilmesi demek.
 */

export type DispatchCheckStatus = 'verified' | 'incompatible' | 'unknown';

/**
 * PLANLAMA KARARI — KONTROL SONUCUNDAN AYRI.
 *
 * NEDEN IKI AYRI KAVRAM: kontrol sonucu VERININ ne soyledigidir; karar ise o
 * veriyle NE YAPILABILECEGIDIR. Ikisini tek alanda birlestirmek, "bilmiyorum"
 * ile "yapma" arasindaki farki kaybettirir ve daha kotusu, birinin digerine
 * cevrilmesini kolaylastirir.
 *
 * ESLEME TEK YONLU VE SABIT:
 *   verified     -> eligible
 *   incompatible -> blocked
 *   unknown      -> review_required
 *
 * `unknown` HICBIR KOSULDA `verified`a CEVRILMEZ. Dispatcher bir eksigi
 * "harici kontrol ettim" diyerek gecebilir, ama kontrol sonucu YINE `unknown`
 * kalir ve kararin `manual_override` oldugu kaydedilir. Ozetle: insan riski
 * ustlenebilir, veriyi degistiremez.
 */
export type DispatchDecision = 'eligible' | 'blocked' | 'review_required';

/**
 * BIR `unknown` NASIL ASILABILIR.
 *
 *   - `none`                  — asilamaz. Eksik VERI doldurulmali (arac
 *                               kapasitesi, yuk agirligi, belge tarihi).
 *                               Burada bir beyan kabul etmek, veri girisini
 *                               kalici olarak ertelemenin yolu olurdu.
 *   - `external_verification` — yetkili dispatcher "harici kontrol ettim"
 *                               beyani + ZORUNLU aciklama ile ilerleyebilir.
 *                               Takograf icin: kanonik veri yok ama surucunun
 *                               kartina bakilmis olabilir.
 *   - `explicit_choice`       — kullanici belirsiz olani ACIKCA cevaplamali
 *                               (yukun ADR olup olmadigi gibi). Beyan degil,
 *                               bir SECIM isteniyor.
 */
export type OverridePolicy = 'none' | 'external_verification' | 'explicit_choice';

export interface DispatchCheck {
  /** Makine tarafindan okunabilir kod. */
  code: string;
  status: DispatchCheckStatus;
  /**
   * Ceviri anahtari — sunucu kullanici diline METIN URETMEZ.
   * Faz 12'nin `AutomationCheckResult` sozlesmesiyle ayni ilke.
   */
  reasonKey: string;
  /** Sayilabilir kanit: karsilastirilan degerler. Serbest metin YOK. */
  evidence?: Record<string, string | number | boolean | null>;
  /**
   * Bu kontrol `unknown` ise nasil asilabilecegi.
   *
   * YALNIZCA `unknown` DURUMUNDA ANLAMLI. `incompatible` bir kontrol
   * ASILAMAZ ve bu alan onun icin okunmaz — yasal engeller (ehliyet, aktiflik,
   * bakim) bir beyanla gecilemez.
   */
  override?: OverridePolicy;
}

/** Planlanacak isin talebi — siparis(ler)den turetilir. */
export interface DispatchDemand {
  /** Toplam agirlik (kg). `null` = kalemlerde belirtilmemis. */
  totalWeightKg: number | null;
  totalVolumeM3: number | null;
  totalPallets: number | null;
  /**
   * Yuk tehlikeli madde mi.
   *
   * `unknown` GUVENLI SAYILMAZ: ADR olup olmadigini bilmiyorsak, ADR
   * yetkisi olmayan bir araci "uygun" ilan edemeyiz.
   */
  adr: 'yes' | 'no' | 'unknown';
  /** Yukleme/bosaltma pencereleri. Bos liste = pencere belirtilmemis. */
  windows: Array<{
    kind: 'pickup' | 'delivery';
    start: string | null;
    end: string | null;
    /** IANA adi. `null` ise saat KULLANILAMAZ (bkz. Faz 16). */
    timezone: string | null;
  }>;
}

export interface VehicleFacts {
  id: string;
  status: 'active' | 'maintenance' | 'broken' | 'inactive';
  /** Kapasite alanlari — `null` = BILINMIYOR, "sinirsiz" DEGIL. */
  payloadCapacityKg: number | null;
  cargoVolumeM3: number | null;
  palletCapacity: number | null;
  /** UC DURUMLU: `null` = bilinmiyor. */
  adrCertified: boolean | null;
  /** O gun cakisan gorev/tur sayisi. */
  conflictingAssignments: number;
  conflictingTours: number;
  /** Zorunlu belge son tarihleri — `null` = girilmemis. */
  tuvExpiryDate: string | null;
  insuranceExpiryDate: string | null;
}

export interface DriverFacts {
  id: string;
  status: 'active' | 'on_leave' | 'sick' | 'inactive' | 'terminated';
  /**
   * O gune ait takvim kodu (izin/hastalik vb.). `null` = kayit yok.
   *
   * `AT` (gorev) burada ENGEL SAYILMAZ — cakisma zaten gorev sayisiyla
   * olculuyor ve ayni engeli iki kez raporlamak dispatcher'i yanlis yonlendirir.
   */
  calendarCode: string | null;
  licenseExpiresAt: string | null;
  conflictingAssignments: number;
  conflictingTours: number;
  /**
   * KANONIK takograf verisinden hesaplanan kalan surus suresi (dakika).
   *
   * `null` = kanonik veri YOK. Bu durumda kontrol DAIMA `unknown` olur;
   * bir sure UYDURULMAZ. Takograf verisi olmayan bir filoda "9 saat vardir"
   * demek, yasal bir siniri tahmine dayandirmak olurdu.
   */
  remainingDriveMinutes: number | null;
}

/** Surucuyu o gun calisamaz kilan takvim kodlari. */
const BLOCKING_CALENDAR_CODES = new Set([
  'UT', // Urlaub / izin
  'KT', // Krank / hastalik
  'FT', // Feiertag / resmi tatil
  'SCH', // Schulung / egitim
  'GR', // Gleitzeit-Ruhe
  'US', // Unbezahlter Sonderurlaub
  'AB', // Abwesend
  'MT', // Mutterschutz
]);

/** Surucu durumundan gelen kesin engeller. */
const BLOCKING_DRIVER_STATUS: Record<string, string> = {
  on_leave: 'dispatch.reason.driverOnLeave',
  sick: 'dispatch.reason.driverSick',
  inactive: 'dispatch.reason.driverInactive',
  terminated: 'dispatch.reason.driverTerminated',
};

/** Arac durumundan gelen kesin engeller. */
const BLOCKING_VEHICLE_STATUS: Record<string, string> = {
  maintenance: 'dispatch.reason.vehicleMaintenance',
  broken: 'dispatch.reason.vehicleBroken',
  inactive: 'dispatch.reason.vehicleInactive',
};

function check(
  code: string,
  status: DispatchCheckStatus,
  reasonKey: string,
  evidence?: Record<string, string | number | boolean | null>,
  override?: OverridePolicy,
): DispatchCheck {
  const base: DispatchCheck = { code, status, reasonKey };
  if (evidence) base.evidence = evidence;
  // Politika YALNIZCA `unknown`a yaziliyor: `verified` asilacak bir sey degil,
  // `incompatible` ise asilamaz.
  if (override && status === 'unknown') base.override = override;
  return base;
}

/**
 * Kapasite karsilastirmasi — UC DURUMLU.
 *
 * IKISI DE GEREKLI: kapasite bilinmiyorsa "sigar" diyemeyiz; talep
 * bilinmiyorsa da diyemeyiz. Yalnizca ikisi de varken kesin bir cevap cikar.
 * Eksik tarafi 0 ya da sonsuz saymak, bilinmeyeni kesin bir cevaba cevirirdi.
 */
function compareCapacity(
  code: string,
  demand: number | null,
  capacity: number | null,
  reasonPrefix: string,
): DispatchCheck {
  // KAPASITEDE GENEL OVERRIDE YOK: bir beyan, eksik kapasite verisini
  // doldurmaz. "Sigar herhalde" diyerek gonderilen bir arac, asilmis bir
  // tonajla yola cikar. Eksik olan ARAC KAPASITESI ya da YUK BILGISI
  // doldurulmali.
  if (demand === null && capacity === null) {
    return check(code, 'unknown', `${reasonPrefix}Unknown`, { demand: null, capacity: null }, 'none');
  }
  if (capacity === null) {
    return check(code, 'unknown', `${reasonPrefix}CapacityUnknown`, { demand, capacity: null }, 'none');
  }
  if (demand === null) {
    return check(code, 'unknown', `${reasonPrefix}DemandUnknown`, { demand: null, capacity }, 'none');
  }
  return demand <= capacity
    ? check(code, 'verified', `${reasonPrefix}Fits`, { demand, capacity })
    : check(code, 'incompatible', `${reasonPrefix}Exceeded`, { demand, capacity });
}

/** Son kullanma tarihi kontrolu — UC DURUMLU. */
function checkExpiry(code: string, expiry: string | null, at: Date, reasonPrefix: string): DispatchCheck {
  if (!expiry) {
    // Girilmemis belge "gecerli" SAYILMAZ ve bir beyanla gecilemez: belge
    // tarihi bilinmiyorsa girilmeli.
    return check(code, 'unknown', `${reasonPrefix}Missing`, { expiresAt: null }, 'none');
  }
  const parsed = new Date(expiry);
  if (Number.isNaN(parsed.getTime())) {
    return check(code, 'unknown', `${reasonPrefix}Unreadable`, { expiresAt: expiry }, 'none');
  }
  return parsed.getTime() >= at.getTime()
    ? check(code, 'verified', `${reasonPrefix}Valid`, { expiresAt: expiry })
    : check(code, 'incompatible', `${reasonPrefix}Expired`, { expiresAt: expiry });
}

// ---------------------------------------------------------------------------
// Arac
// ---------------------------------------------------------------------------

export function evaluateVehicle(
  vehicle: VehicleFacts,
  demand: DispatchDemand,
  at: Date,
): DispatchCheck[] {
  const checks: DispatchCheck[] = [];

  // --- Musaitlik ve bakim ---
  const statusReason = BLOCKING_VEHICLE_STATUS[vehicle.status];
  checks.push(
    statusReason
      ? check('vehicle_available', 'incompatible', statusReason, { status: vehicle.status })
      : check('vehicle_available', 'verified', 'dispatch.reason.vehicleActive', {
          status: vehicle.status,
        }),
  );

  // --- Cakisma ---
  const vehicleBusy = vehicle.conflictingAssignments + vehicle.conflictingTours;
  checks.push(
    vehicleBusy > 0
      ? check('vehicle_no_conflict', 'incompatible', 'dispatch.reason.vehicleBusy', {
          assignments: vehicle.conflictingAssignments,
          tours: vehicle.conflictingTours,
        })
      : check('vehicle_no_conflict', 'verified', 'dispatch.reason.vehicleFree'),
  );

  // --- Zorunlu belgeler ---
  checks.push(checkExpiry('vehicle_inspection', vehicle.tuvExpiryDate, at, 'dispatch.reason.inspection'));
  checks.push(checkExpiry('vehicle_insurance', vehicle.insuranceExpiryDate, at, 'dispatch.reason.insurance'));

  // --- Kapasite ---
  checks.push(
    compareCapacity('vehicle_capacity_weight', demand.totalWeightKg, vehicle.payloadCapacityKg, 'dispatch.reason.weight'),
  );
  checks.push(
    compareCapacity('vehicle_capacity_volume', demand.totalVolumeM3, vehicle.cargoVolumeM3, 'dispatch.reason.volume'),
  );
  checks.push(
    compareCapacity('vehicle_capacity_pallets', demand.totalPallets, vehicle.palletCapacity, 'dispatch.reason.pallets'),
  );

  // --- ADR ---
  checks.push(evaluateAdr(vehicle.adrCertified, demand.adr));

  return checks;
}

/**
 * ADR — IKI TARAFLI BELIRSIZLIK.
 *
 * Yuk tehlikeli DEGILSE her arac uygundur; aracin belgesi olmasa da fark
 * etmez. Ama yuk tehlikeliyse ya da tehlikeli OLUP OLMADIGI bilinmiyorsa,
 * belgesi bilinmeyen bir araci "uygun" ilan edemeyiz.
 *
 * `unknown` yuke `no` muamelesi yapmak, tam da bu kontrolun engellemesi
 * gereken senaryoyu acardi.
 */
export function evaluateAdr(
  certified: boolean | null,
  demandAdr: 'yes' | 'no' | 'unknown',
): DispatchCheck {
  // 1) Yuk tehlikeli DEGILSE her arac uygundur; belgesi olmasa da fark etmez.
  if (demandAdr === 'no') {
    return check('vehicle_adr', 'verified', 'dispatch.reason.adrNotRequired', {
      required: false,
      certified,
    });
  }

  // 2) ARAC ACIKCA YETKISIZ ise, yuk ADR de olsa ADR OLABILIR de olsa GECEMEZ.
  //
  //    Bu dal, "yuk belirsiz" dalindan ONCE gelmek ZORUNDA. Once secim
  //    sorsaydik, kullanici "evet, ADR" dedigi anda kapi bir beyanla asilmis
  //    olurdu — oysa arac zaten yetkisiz. Belirsizligi cozmek, yetkisiz araci
  //    yetkili yapmaz.
  if (certified === false) {
    return check('vehicle_adr', 'incompatible', 'dispatch.reason.adrNotCertified', {
      required: demandAdr === 'yes',
      certified: false,
    });
  }

  // 3) Yuk kesin ADR ve arac belgeli: uygun.
  if (certified === true && demandAdr === 'yes') {
    return check('vehicle_adr', 'verified', 'dispatch.reason.adrCertified', {
      required: true,
      certified: true,
    });
  }

  // 4) Arac BELGELI ama yukun ADR olup olmadigi bilinmiyor: ACIK SECIM.
  //
  //    Secim yalnizca BURADA isteniyor, cunku iki cevap da guvenli: yuk ADR
  //    ise arac zaten yetkili, degilse sorun yok. Tehlikeli madde yine de
  //    surucu egitimini, evraki ve rota kisitlarini bagladigi icin soruyu
  //    atlamiyoruz.
  if (certified === true) {
    return check(
      'vehicle_adr',
      'unknown',
      'dispatch.reason.adrDemandUnknown',
      { required: null, certified: true },
      'explicit_choice',
    );
  }

  // 5) ARAC BELGESI BILINMIYOR: secim degil VERI isteniyor.
  //
  //    Burada secim sorsaydik, "evet ADR" cevabi belgesi bilinmeyen bir araci
  //    gecirirdi. Eksik olan arac kaydi; once o doldurulmali.
  return check(
    'vehicle_adr',
    'unknown',
    'dispatch.reason.adrUnknown',
    { required: demandAdr === 'yes' ? true : null, certified: null },
    'none',
  );
}

// ---------------------------------------------------------------------------
// Surucu
// ---------------------------------------------------------------------------

export function evaluateDriver(driver: DriverFacts, at: Date): DispatchCheck[] {
  const checks: DispatchCheck[] = [];

  // --- Durum: izin / hastalik / pasiflik ---
  const statusReason = BLOCKING_DRIVER_STATUS[driver.status];
  checks.push(
    statusReason
      ? check('driver_available', 'incompatible', statusReason, { status: driver.status })
      : check('driver_available', 'verified', 'dispatch.reason.driverActive', {
          status: driver.status,
        }),
  );

  // --- Takvim: o gune ozel engel ---
  const blocked = driver.calendarCode !== null && BLOCKING_CALENDAR_CODES.has(driver.calendarCode);
  checks.push(
    blocked
      ? check('driver_calendar', 'incompatible', 'dispatch.reason.driverCalendarBlocked', {
          code: driver.calendarCode,
        })
      : check('driver_calendar', 'verified', 'dispatch.reason.driverCalendarFree', {
          code: driver.calendarCode,
        }),
  );

  // --- Cakisma ---
  const driverBusy = driver.conflictingAssignments + driver.conflictingTours;
  checks.push(
    driverBusy > 0
      ? check('driver_no_conflict', 'incompatible', 'dispatch.reason.driverBusy', {
          assignments: driver.conflictingAssignments,
          tours: driver.conflictingTours,
        })
      : check('driver_no_conflict', 'verified', 'dispatch.reason.driverFree'),
  );

  // --- Ehliyet ---
  checks.push(checkExpiry('driver_license', driver.licenseExpiresAt, at, 'dispatch.reason.license'));

  // --- Takograf ---
  checks.push(evaluateDriveTime(driver.remainingDriveMinutes));

  return checks;
}

/**
 * KALAN SURUS SURESI — KANONIK VERI YOKSA DAIMA `unknown`.
 *
 * Repoda `TachoActivity` ham aktivite tutuyor ama kanonik bir "kalan sure"
 * alani YOK. Veri yoksa bir sure TAHMIN ETMEK, yasal bir siniri uydurmaya
 * cevirmek olurdu; bu fazda acikca yasak.
 */
export function evaluateDriveTime(remainingMinutes: number | null): DispatchCheck {
  if (remainingMinutes === null) {
    // KANONIK VERI YOK ama surucunun kartina bakilmis OLABILIR. Yetkili
    // dispatcher "harici kontrol ettim" beyani ve ZORUNLU aciklamayla
    // ilerleyebilir; kontrol sonucu YINE `unknown` kalir.
    return check(
      'driver_drive_time',
      'unknown',
      'dispatch.reason.driveTimeNoData',
      { remainingMinutes: null },
      'external_verification',
    );
  }
  return remainingMinutes > 0
    ? check('driver_drive_time', 'verified', 'dispatch.reason.driveTimeAvailable', {
        remainingMinutes,
      })
    : check('driver_drive_time', 'incompatible', 'dispatch.reason.driveTimeExhausted', {
        remainingMinutes,
      });
}

// ---------------------------------------------------------------------------
// Zaman pencereleri
// ---------------------------------------------------------------------------

/**
 * ZAMAN PENCERELERI.
 *
 * Faz 16'nin kurali burada da gecerli: ZAMAN DILIMSIZ bir saat KULLANILAMAZ.
 * `08:00` hangi dilimde? Rotterdam'dan gelen bir siparis Berlin saatiyle
 * planlanirsa arac bir saat yanlis gider.
 */
export function evaluateWindows(demand: DispatchDemand): DispatchCheck {
  // PENCERE YOKLUGU "kisit yok" DEMEK DEGILDIR: musteri saatini bildirmemis
  // de olabilir. `verified` yazmak bir bilinmeyeni kesin cevaba cevirirdi;
  // bunun yerine dispatcher "zaman kisiti yok" diye ACIKCA secer.
  if (demand.windows.length === 0) {
    return check('time_windows', 'unknown', 'dispatch.reason.windowsMissing', { count: 0 }, 'explicit_choice');
  }

  const withTime = demand.windows.filter((window) => window.start !== null || window.end !== null);
  if (withTime.length === 0) {
    return check(
      'time_windows',
      'unknown',
      'dispatch.reason.windowsMissing',
      { count: demand.windows.length },
      'explicit_choice',
    );
  }

  const withoutZone = withTime.filter((window) => !window.timezone);
  if (withoutZone.length > 0) {
    // Saat VAR ama dilim YOK: kullanilamaz durumda, "bilmiyorum" DEGIL.
    return check('time_windows', 'incompatible', 'dispatch.reason.windowsTimezoneMissing', {
      count: withoutZone.length,
    });
  }

  const invalid = withTime.filter(
    (window) => window.start !== null && window.end !== null && window.start > window.end,
  );
  if (invalid.length > 0) {
    return check('time_windows', 'incompatible', 'dispatch.reason.windowsInverted', {
      count: invalid.length,
    });
  }

  return check('time_windows', 'verified', 'dispatch.reason.windowsUsable', { count: withTime.length });
}

// ---------------------------------------------------------------------------
// Toplama
// ---------------------------------------------------------------------------

/**
 * ADAYIN GENEL DURUMU — EN KOTU KONTROLDEN.
 *
 * Bir `incompatible` varsa aday `incompatible`. Hic `incompatible` yok ama en
 * az bir `unknown` varsa aday `unknown`. "Cogunluk uygun" ya da "onemli olan
 * kontroller gecti" diye `verified` YAZILMAZ — hangi kontrolun onemli
 * oldugunu belirlemek, dispatcher'in isi.
 */
export function overallStatus(checks: readonly DispatchCheck[]): DispatchCheckStatus {
  if (checks.length === 0) {
    // Hic kontrol yoksa "uygun" DIYEMEYIZ.
    return 'unknown';
  }
  if (checks.some((item) => item.status === 'incompatible')) return 'incompatible';
  if (checks.some((item) => item.status === 'unknown')) return 'unknown';
  return 'verified';
}

export interface CandidateEvaluation {
  checks: DispatchCheck[];
  /** Kontrollerin toplami — VERI ne diyor. */
  overall: DispatchCheckStatus;
  /** O veriyle ne yapilabilecegi — KARAR. */
  decision: DispatchDecision;
}

/** Bir arac + surucu ciftini butun kurallara karsi degerlendirir. */
export function evaluateCandidate(input: {
  vehicle: VehicleFacts;
  driver: DriverFacts;
  demand: DispatchDemand;
  at: Date;
}): CandidateEvaluation {
  const checks = [
    ...evaluateVehicle(input.vehicle, input.demand, input.at),
    ...evaluateDriver(input.driver, input.at),
    evaluateWindows(input.demand),
  ];
  const overall = overallStatus(checks);
  return { checks, overall, decision: decisionOf(overall) };
}

/**
 * KONTROL SONUCUNU PLANLAMA KARARINA CEVIRIR.
 *
 * TEK YONLU VE SABIT ESLEME. Bu islev bilincli olarak hicbir kosul
 * icermiyor: `unknown`i belirli durumlarda `eligible` yapan bir "kestirme"
 * eklenirse, motorun butun garantisi o kestirmenin dogrulugu kadar olur.
 * Insanin riski ustlenmesi AYRI bir adim (bkz. `resolveApplyGate`) ve orada
 * bile kontrol sonucu `unknown` KALIR.
 */
export function decisionOf(overall: DispatchCheckStatus): DispatchDecision {
  switch (overall) {
    case 'verified':
      return 'eligible';
    case 'incompatible':
      return 'blocked';
    default:
      return 'review_required';
  }
}

/** Bir adayin AJAN TARAFINDAN "onerilen" gosterilip gosterilemeyecegi. */
export function isRecommendable(overall: DispatchCheckStatus): boolean {
  // AJAN YALNIZCA `eligible` adayi one cikarabilir. `review_required` bir
  // adayi "uygun" ya da "onerilen" diye sunmak, dogrulanmamis bir seyi
  // dogrulanmis gibi gostermek olurdu.
  return decisionOf(overall) === 'eligible';
}

/**
 * INSANIN BEYANI.
 *
 * `note` YALNIZCA `external_verification` icin zorunlu: "harici kontrol
 * ettim" diyen kisi NEYI kontrol ettigini yazmali, yoksa beyan bir tiklamaya
 * indirgenir ve denetimde hicbir sey ifade etmez.
 *
 * `answer` ise `explicit_choice` icin: bir SECIM isteniyor, aciklama degil.
 */
export interface OverrideDeclaration {
  code: string;
  note?: string;
  answer?: 'yes' | 'no';
}

/** Aciklamanin anlamli sayilmasi icin gereken en az uzunluk. */
export const MIN_OVERRIDE_NOTE_LENGTH = 10;

export type ApplyMode = 'direct' | 'manual_override';

export interface ApplyGate {
  applicable: boolean;
  /** Uygulanabiliyorsa nasil: dogrudan mi, insan beyaniyla mi. */
  mode: ApplyMode;
  decision: DispatchDecision;
  /** Asilamayan `incompatible` kontroller. */
  blocking: DispatchCheck[];
  /** Veri doldurulmadan asilamayan `unknown` kontroller. */
  needsData: DispatchCheck[];
  /** Beyan/secim bekleyen ve HENUZ verilmemis `unknown` kontroller. */
  needsDeclaration: DispatchCheck[];
  /** Kabul edilen beyanlarin kodlari — denetime yazilir. */
  acceptedOverrides: string[];
}

/**
 * UYGULAMA KAPISI.
 *
 * SIRA ONEMLI:
 *   1. `incompatible` varsa HICBIR SEY asamaz. Yasal engeller (ehliyet,
 *      surucu aktifligi, arac bakimi, asilmis tonaj) bir beyanla gecilemez —
 *      gecilebilseydi kontrolun var olmasinin anlami kalmazdi.
 *   2. Politikasi `none` olan `unknown` varsa VERI doldurulmali. Kapasite ve
 *      belge tarihleri buraya girer.
 *   3. Kalan `unknown`lar icin beyan/secim aranir. Eksik olan varsa
 *      uygulanamaz.
 *
 * BEYAN VERILSE BILE kontrol sonucu `unknown` KALIR ve karar
 * `manual_override` olarak isaretlenir. Insan riski ustlenir, veriyi
 * degistirmez.
 */
export function resolveApplyGate(
  checks: readonly DispatchCheck[],
  declarations: readonly OverrideDeclaration[] = [],
): ApplyGate {
  const overall = overallStatus(checks);
  const decision = decisionOf(overall);

  const blocking = checks.filter((item) => item.status === 'incompatible');
  const unknowns = checks.filter((item) => item.status === 'unknown');
  const needsData = unknowns.filter((item) => (item.override ?? 'none') === 'none');

  const overridable = unknowns.filter((item) => (item.override ?? 'none') !== 'none');
  const accepted: string[] = [];
  const needsDeclaration: DispatchCheck[] = [];

  for (const item of overridable) {
    const declaration = declarations.find((entry) => entry.code === item.code);
    if (!declaration) {
      needsDeclaration.push(item);
      continue;
    }
    if (item.override === 'external_verification') {
      // ZORUNLU ACIKLAMA: bos ya da "ok" gibi bir metin beyan sayilmaz.
      if ((declaration.note ?? '').trim().length < MIN_OVERRIDE_NOTE_LENGTH) {
        needsDeclaration.push(item);
        continue;
      }
    } else if (item.override === 'explicit_choice') {
      // ACIK SECIM: "bilmiyorum" bir cevap DEGIL.
      if (declaration.answer !== 'yes' && declaration.answer !== 'no') {
        needsDeclaration.push(item);
        continue;
      }
    }
    accepted.push(item.code);
  }

  const applicable =
    blocking.length === 0 && needsData.length === 0 && needsDeclaration.length === 0;

  return {
    applicable,
    mode: accepted.length > 0 ? 'manual_override' : 'direct',
    decision,
    blocking,
    needsData,
    needsDeclaration,
    acceptedOverrides: accepted,
  };
}

/**
 * UYGULANABILIR MI — beyansiz kisa yol.
 *
 * YALNIZCA `verified` dogrudan uygulanabilir. `unknown` bir adayi beyansiz
 * uygulamak, tam da bu motorun engellemek icin var oldugu sey.
 */
export function isApplicable(overall: DispatchCheckStatus): boolean {
  return overall === 'verified';
}
