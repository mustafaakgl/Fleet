/**
 * DETERMINISTIK ESLESTIRME VE NIYET KURALLARI (Faz 16).
 *
 * SAF MANTIK: veritabani yok, yan etki yok, tamamen test edilebilir. Cagiran
 * taraf adaylari KIRACI KAPSAMINDA yukler; bu modul kiraci sinirini bilmez ve
 * bilmemeli — sinirin tek bir yerde (Prisma kapsami) durmasi, iki yerde
 * durmasindan guvenli.
 *
 * AJAN ESLESTIRME YAPMAZ. Bu modulun girdisi ajanin okudugu METINLERDIR
 * (musteri numarasi, VAT, e-posta, referans); cikti Fleet'in KENDI kayitlarina
 * isaret eder. Ajanin bir `companyId` yazabilmesi, e-posta govdesine kimlik
 * gomen birine baska bir kaydi gosterebilirdi — bu yuzden sema o alani zaten
 * reddediyor (bkz. job-type-registry).
 */

// ---------------------------------------------------------------------------
// Musteri eslestirmesi
// ---------------------------------------------------------------------------

export type CompanyMatchStatus =
  | 'customer_number'
  | 'vat_id'
  | 'contact_email'
  | 'ambiguous'
  | 'unknown';

export interface CompanyCandidate {
  id: string;
  name: string;
  vatId: string | null;
  email: string | null;
  invoiceEmail: string | null;
  /** Repodaki canonical musteri numarasi. */
  datevDebtorNumber: number | null;
}

export interface CompanyMatch {
  status: CompanyMatchStatus;
  /** YALNIZCA kesin eslesmede dolu. `ambiguous`/`unknown` durumunda `null`. */
  companyId: string | null;
  /** Kullaniciya sunulacak adaylar — kesin eslesme DEGIL. */
  candidateIds: string[];
  /** Neden bu sonuc: makine tarafindan okunabilir sinif. */
  reason: string;
}

/** VAT numarasi karsilastirmasi icin: bosluk, nokta ve tire atilir. */
export function normalizeVatId(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').replace(/[\s.\-/]/g, '').toUpperCase();
  return cleaned.length >= 5 ? cleaned : null;
}

/** Musteri numarasi karsilastirmasi icin: yalnizca rakamlar. */
export function normalizeCustomerNumber(value: string | null | undefined): number | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

function domainOf(email: string | null): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  return at > 0 ? email!.slice(at + 1) : null;
}

/**
 * MUSTERI ESLESTIRMESI — sirali ve DAR.
 *
 *   1. Canonical musteri numarasi
 *   2. TAM VAT ID
 *   3. KAYITLI TAM iletisim e-postasi
 *   4. Aksi halde `unknown`
 *
 * Her adimda BIRDEN FAZLA aday cikarsa sonuc `ambiguous` olur ve kullanici
 * secer — "ilkini al" demek, iki benzer musteriden yanlis olanina siparis
 * yazmanin en sessiz yoludur.
 *
 * E-POSTA DOMAINI KESIN ESLESME DEGIL. Bir domain onlarca sirket tarafindan
 * paylasilabilir (ortak grup, tasarim ofisi, serbest posta saglayicisi) ve
 * daha onemlisi gonderen adresi TAKLIT EDILEBILIR. Domain yalnizca ADAY
 * uretiyor; aday, yetki degildir.
 *
 * `senderAddress` de tek basina eslesme SAYILMAZ — ancak kayitli iletisim
 * adresiyle TAM esitse `contact_email` olur ve o zaman bile bu, siparis
 * DEGISTIRME yetkisi degil yalnizca bir musteri isaretidir.
 */
export function matchCompany(
  candidates: readonly CompanyCandidate[],
  extracted: {
    customerNumber?: string | null;
    vatId?: string | null;
    contactEmail?: string | null;
    senderAddress?: string | null;
  },
): CompanyMatch {
  // 1) Musteri numarasi
  const customerNumber = normalizeCustomerNumber(extracted.customerNumber);
  if (customerNumber !== null) {
    const hits = candidates.filter((item) => item.datevDebtorNumber === customerNumber);
    if (hits.length === 1) {
      return {
        status: 'customer_number',
        companyId: hits[0]!.id,
        candidateIds: [hits[0]!.id],
        reason: 'matched_customer_number',
      };
    }
    if (hits.length > 1) {
      return {
        status: 'ambiguous',
        companyId: null,
        candidateIds: hits.map((item) => item.id),
        reason: 'multiple_customer_number_matches',
      };
    }
  }

  // 2) TAM VAT ID
  const vatId = normalizeVatId(extracted.vatId);
  if (vatId !== null) {
    const hits = candidates.filter((item) => normalizeVatId(item.vatId) === vatId);
    if (hits.length === 1) {
      return { status: 'vat_id', companyId: hits[0]!.id, candidateIds: [hits[0]!.id], reason: 'matched_vat_id' };
    }
    if (hits.length > 1) {
      return {
        status: 'ambiguous',
        companyId: null,
        candidateIds: hits.map((item) => item.id),
        reason: 'multiple_vat_id_matches',
      };
    }
  }

  // 3) KAYITLI TAM iletisim e-postasi
  const emails = [normalizeEmail(extracted.contactEmail), normalizeEmail(extracted.senderAddress)].filter(
    (value): value is string => value !== null,
  );
  if (emails.length > 0) {
    const hits = candidates.filter((item) => {
      const registered = [normalizeEmail(item.email), normalizeEmail(item.invoiceEmail)];
      return registered.some((value) => value !== null && emails.includes(value));
    });
    if (hits.length === 1) {
      return {
        status: 'contact_email',
        companyId: hits[0]!.id,
        candidateIds: [hits[0]!.id],
        reason: 'matched_registered_contact_email',
      };
    }
    if (hits.length > 1) {
      return {
        status: 'ambiguous',
        companyId: null,
        candidateIds: hits.map((item) => item.id),
        reason: 'multiple_contact_email_matches',
      };
    }
  }

  // 4) ADAY URETIMI — kesin eslesme DEGIL.
  const domains = emails.map(domainOf).filter((value): value is string => value !== null);
  const domainCandidates = candidates.filter((item) =>
    [domainOf(normalizeEmail(item.email)), domainOf(normalizeEmail(item.invoiceEmail))].some(
      (value) => value !== null && domains.includes(value),
    ),
  );

  if (domainCandidates.length > 0) {
    return {
      status: domainCandidates.length === 1 ? 'unknown' : 'ambiguous',
      // TEK ADAY BILE OLSA `companyId` DOLDURULMAZ: domain bir kanit degil.
      companyId: null,
      candidateIds: domainCandidates.map((item) => item.id),
      reason: 'domain_candidates_only',
    };
  }

  return { status: 'unknown', companyId: null, candidateIds: [], reason: 'no_identifier' };
}

// ---------------------------------------------------------------------------
// Mevcut siparis eslestirmesi
// ---------------------------------------------------------------------------

export type OrderMatchStatus = 'external_reference' | 'order_number' | 'ambiguous' | 'unknown';

export interface OrderCandidate {
  id: string;
  companyId: string;
  orderNumber: string;
  externalReference: string | null;
  status: 'draft' | 'confirmed' | 'cancelled';
}

export interface OrderMatch {
  status: OrderMatchStatus;
  orderId: string | null;
  candidateIds: string[];
  reason: string;
}

/** Referans karsilastirmasi: bosluk/tire farki iki referansi ayirmamali. */
export function normalizeReference(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').replace(/[\s._\-/]/g, '').toUpperCase();
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * MEVCUT SIPARIS ESLESTIRMESI.
 *
 *   1. Kiraci + MUSTERI + dis referans
 *   2. Canonical siparis numarasi
 *   3. Aksi halde manuel secim
 *
 * MUSTERI SARTI ATLANAMAZ: iki farkli musteri ayni referansi (`AUFTRAG-1`)
 * kullanabilir ve kullanir. Musteriyi sabitlemeden referansla eslestirmek,
 * bir musterinin mesajiyla BASKA bir musterinin siparisini degistirmenin yolu
 * olurdu. Bu yuzden musteri KESIN eslesmediyse referans eslestirmesi hic
 * denenmiyor.
 *
 * IPTAL EDILMIS SIPARIS ADAY DEGIL: referansi serbest birakmis sayilir
 * (bkz. `TransportOrder.duplicateKey`), yani ayni referansla gelen yeni bir
 * mesaj eski iptali degil YENI bir siparisi kastediyordur.
 */
export function matchExistingOrder(
  candidates: readonly OrderCandidate[],
  input: { companyId: string | null; externalReference?: string | null },
): OrderMatch {
  const live = candidates.filter((item) => item.status !== 'cancelled');
  const reference = normalizeReference(input.externalReference);

  if (input.companyId && reference) {
    const hits = live.filter(
      (item) => item.companyId === input.companyId && normalizeReference(item.externalReference) === reference,
    );
    if (hits.length === 1) {
      return {
        status: 'external_reference',
        orderId: hits[0]!.id,
        candidateIds: [hits[0]!.id],
        reason: 'matched_customer_and_reference',
      };
    }
    if (hits.length > 1) {
      return {
        status: 'ambiguous',
        orderId: null,
        candidateIds: hits.map((item) => item.id),
        reason: 'multiple_reference_matches',
      };
    }
  }

  // Canonical siparis numarasi: kiraci icinde tekil oldugu icin musteri sarti
  // GEREKMIYOR — numara zaten tek bir siparisi gosterir.
  if (reference) {
    const hits = live.filter((item) => normalizeReference(item.orderNumber) === reference);
    if (hits.length === 1) {
      return {
        status: 'order_number',
        orderId: hits[0]!.id,
        candidateIds: [hits[0]!.id],
        reason: 'matched_order_number',
      };
    }
  }

  // MUSTERI BILINIYOR AMA REFERANS YOK: adaylari gosteriyoruz, secmiyoruz.
  if (input.companyId) {
    const candidatesOfCompany = live.filter((item) => item.companyId === input.companyId);
    if (candidatesOfCompany.length > 0) {
      return {
        status: 'unknown',
        orderId: null,
        candidateIds: candidatesOfCompany.map((item) => item.id).slice(0, 50),
        reason: 'manual_selection_required',
      };
    }
  }

  return { status: 'unknown', orderId: null, candidateIds: [], reason: 'no_candidate' };
}

// ---------------------------------------------------------------------------
// Niyet kurallari
// ---------------------------------------------------------------------------

export type ResolvedIntent = 'new_order' | 'amendment' | 'cancellation' | 'unknown';

export interface IntentDecision {
  /** Incelemeye gidecek niyet. Ajanin onerisinden FARKLI olabilir. */
  intent: ResolvedIntent;
  /** Ayni musteri + referans zaten var mi. */
  possibleDuplicate: boolean;
  duplicateOfOrderId: string | null;
  /**
   * Kullanici mevcut siparisi SECMEDEN ilerleyemez mi.
   *
   * `true` iken arayuz onay dugmesini acmaz ve sunucu da kabul etmez.
   */
  requiresOrderSelection: boolean;
  /** Neden bu sonuc — sayilabilir. */
  reason: string;
}

/**
 * NIYETI KURALLARLA SONUCLANDIRIR.
 *
 * Ajanin onerdigi niyet BURADA SORGULANIR. Kurallar:
 *
 *   - "Yeni siparis" gorunen bir mesaj, ayni musteri + ayni referansta zaten
 *     bir siparis varsa SESSIZCE ikinci siparis ACMAZ: `possible_duplicate`
 *     isaretlenir ve incelemeye gider.
 *   - Degisiklik yalnizca mevcut siparis KESIN eslestiyse ilerleyebilir.
 *     Belirsiz eslesmede kullanici siparisi secmeden hicbir sey olmaz.
 *   - Iptal da ayni sarta tabidir: neyin iptal edilecegi kesin bilinmeden
 *     iptal onerisi bile uretilmez.
 *   - E-posta thread'i ya da gonderen adresi TEK BASINA yetki degildir; bu
 *     modul zaten ikisini de girdi olarak almiyor.
 *
 * HICBIR DURUMDA bu islev bir kaydi degistirmez — yalnizca incelemenin nasil
 * acilacagini soyler.
 */
export function resolveIntentDecision(input: {
  proposedIntent: ResolvedIntent;
  companyMatch: CompanyMatch;
  orderMatch: OrderMatch;
  /** Ayni musteri + referansta bulunan CANLI siparis (varsa). */
  duplicateOrderId?: string | null;
}): IntentDecision {
  const { proposedIntent, companyMatch, orderMatch } = input;
  const exactOrder = orderMatch.orderId !== null;

  if (proposedIntent === 'unknown') {
    return {
      intent: 'unknown',
      possibleDuplicate: false,
      duplicateOfOrderId: null,
      requiresOrderSelection: false,
      reason: 'agent_reported_unknown',
    };
  }

  if (proposedIntent === 'new_order') {
    const duplicateOfOrderId = input.duplicateOrderId ?? null;
    if (duplicateOfOrderId) {
      // SESSIZ IKINCI SIPARIS YOK. Niyet `new_order` KALIYOR — insan
      // "evet, gercekten ikinci bir siparis" diyebilmeli — ama isaretli.
      return {
        intent: 'new_order',
        possibleDuplicate: true,
        duplicateOfOrderId,
        requiresOrderSelection: false,
        reason: 'duplicate_reference_for_customer',
      };
    }
    return {
      intent: 'new_order',
      possibleDuplicate: false,
      duplicateOfOrderId: null,
      requiresOrderSelection: false,
      // Musteri bilinmiyorsa bile niyet yeni siparis; musteriyi insan secer.
      reason: companyMatch.companyId ? 'new_order' : 'new_order_customer_unresolved',
    };
  }

  // --- Degisiklik ve iptal: MEVCUT SIPARIS SART ---
  if (!exactOrder) {
    return {
      intent: proposedIntent,
      possibleDuplicate: false,
      duplicateOfOrderId: null,
      // Kullanici siparisi SECMEDEN islem yapilamaz.
      requiresOrderSelection: true,
      reason:
        orderMatch.status === 'ambiguous'
          ? 'ambiguous_order_match'
          : 'order_not_identified',
    };
  }

  return {
    intent: proposedIntent,
    possibleDuplicate: false,
    duplicateOfOrderId: null,
    requiresOrderSelection: false,
    reason: proposedIntent === 'amendment' ? 'amendment_order_matched' : 'cancellation_order_matched',
  };
}

/**
 * Ayni musteri + referansta CANLI bir siparis var mi.
 *
 * `duplicateKey` ile ayni mantik ama uygulamada: veritabani kisiti yalnizca
 * YAZMA anininda korur; incelemeci karar vermeden ONCE de uyarilmali.
 */
export function findDuplicateOrder(
  candidates: readonly OrderCandidate[],
  input: { companyId: string | null; externalReference?: string | null },
): string | null {
  const reference = normalizeReference(input.externalReference);
  if (!input.companyId || !reference) return null;
  const hit = candidates.find(
    (item) =>
      item.status !== 'cancelled' &&
      item.companyId === input.companyId &&
      normalizeReference(item.externalReference) === reference,
  );
  return hit?.id ?? null;
}
