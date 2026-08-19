/**
 * MOCK WORKER'IN TASIMA EMRI CIKARIMI (Faz 16).
 *
 * NEDEN AYRI BIR DOSYA VE NEDEN KOPYA:
 *
 * Worker, Fleet'in DISINDA calisan bir surectir — gercekte orada bir model
 * olacak. Bu yuzden sunucunun TypeScript modulunu import ETMIYOR: etseydi,
 * "connector kendi kararini veriyor" iddiasi bir yalan olurdu ve protokol
 * testleri aslinda sunucunun kendi kodunu test ederdi.
 *
 * KOPYA SESSIZCE AYRISAMAZ: `order-intake-extract-drift.spec.ts` bu islevi
 * sunucudaki `extractTransportOrder` ile AYNI fixture'lar uzerinde kosturup
 * ciktilarini karsilastiriyor. Biri degisip digeri degismezse test kirilir —
 * repodaki `contract-drift.spec.ts` ile ayni desen.
 *
 * GUVENLIK: bu islev de metni yalnizca KAPALI etiket listelerine karsi
 * esliyor. Ciktisi ne olursa olsun sunucu onu semaya karsi dogruluyor ve
 * KONTROLLERI kendisi uretiyor — worker "enjeksiyon yok" diyemez.
 */

const LABELS = {
  customerName: ['kunde', 'auftraggeber', 'firma', 'customer', 'musteri'],
  customerNumber: ['kundennummer', 'kunden-nr', 'kundennr', 'customer number', 'customer no', 'musteri no'],
  vatId: ['ust-idnr', 'ustidnr', 'umsatzsteuer', 'vat id', 'vat-id', 'vergi no'],
  externalReference: [
    'referenz', 'ihre zeichen', 'ihr zeichen', 'auftragsnummer', 'bestellnummer',
    'reference', 'order reference', 'po number', 'referans', 'siparis no',
  ],
  orderDate: ['auftragsdatum', 'bestelldatum', 'order date', 'siparis tarihi'],
  specialInstructions: ['hinweise', 'bemerkung', 'anmerkung', 'special instructions', 'aciklama'],
  pickupAddress: ['ladestelle', 'beladestelle', 'abholadresse', 'pickup address', 'yukleme adresi'],
  deliveryAddress: ['entladestelle', 'abladestelle', 'lieferadresse', 'delivery address', 'bosaltma adresi'],
  cargoDescription: ['ladung', 'ware', 'gut', 'cargo', 'yuk'],
  weightKg: ['gewicht', 'weight', 'agirlik'],
  palletCount: ['paletten', 'palette', 'pallets', 'palet'],
};

const INTENT_TERMS = {
  cancellation: [
    'stornierung', 'stornieren', 'storno', 'annullierung', 'annulliert',
    'absage', 'absagen', 'auftrag zuruckziehen', 'auftrag zurueckziehen', 'widerruf',
    'cancellation', 'cancel the order', 'cancelled', 'please cancel',
    'iptal', 'iptal ediyoruz', 'siparisi iptal',
  ],
  amendment: [
    'anderung', 'aenderung', 'geandert', 'geaendert',
    'korrektur', 'korrigiert', 'aktualisierung',
    'verschiebung', 'verschoben', 'nachtrag', 'berichtigung', 'neuer termin',
    'amendment', 'amend', 'change request', 'please update', 'revised', 'correction',
    'degisiklik', 'guncelleme', 'revize', 'duzeltme',
  ],
  new_order: [
    'transportauftrag', 'frachtauftrag', 'speditionsauftrag', 'neuer auftrag',
    'auftragserteilung', 'wir beauftragen', 'bitte abholen', 'ladestelle',
    'transport order', 'shipment order', 'new order', 'please collect', 'pickup address',
    'tasima emri', 'yeni siparis', 'yukleme adresi',
  ],
};

const PRICE_LABELS = [
  'frachtpreis', 'fracht', 'preis', 'betrag', 'entgelt', 'pauschale', 'tarif',
  'price', 'amount', 'freight', 'rate', 'total',
  'fiyat', 'tutar', 'navlun', 'bedel',
];

const CURRENCY_BY_TOKEN = {
  eur: 'EUR', '€': 'EUR',
  usd: 'USD', $: 'USD',
  chf: 'CHF',
  gbp: 'GBP', '£': 'GBP',
  try: 'TRY', '₺': 'TRY',
  pln: 'PLN',
};

const AMOUNT = String.raw`\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MONEY_LINE = new RegExp(
  String.raw`(${AMOUNT})\s*(eur|usd|chf|gbp|try|pln|€|₺|£|\$)|(eur|usd|chf|gbp|try|€|₺|£|\$)\s*(${AMOUNT})`,
  'i',
);

const CONFIDENCE_LABELLED = 0.9;
const CONFIDENCE_PATTERN = 0.6;
const CONFIDENCE_WEAK = 0.4;

export function foldText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

function toLines(content) {
  const lines = [];
  const push = (text, source) => {
    if (!text) return;
    for (const raw of String(text).split('\n')) {
      const trimmed = raw.trim();
      if (trimmed) lines.push({ raw: trimmed.slice(0, 300), folded: foldText(trimmed), source });
    }
  };
  push(content.subject, 'subject');
  push(content.bodyText, 'body');
  (content.attachmentTexts ?? []).forEach((text, index) => push(text, `attachment:${index + 1}`));
  return lines;
}

function readLabelled(lines, labels, maxLength = 200, pattern = null) {
  for (const line of lines) {
    for (const label of labels) {
      const index = line.folded.indexOf(label);
      if (index === -1) continue;
      const after = line.raw.slice(index + label.length);
      const separator = after.search(/[:=]/);
      if (separator === -1) continue;
      const value = (after.slice(separator + 1).trim().split(/\s{2,}|[;|]/)[0] ?? '').trim();
      if (!value) continue;
      if (pattern && !pattern.test(value)) continue;
      return { value: value.slice(0, maxLength), line };
    }
  }
  return null;
}

function readPattern(lines, pattern) {
  for (const line of lines) {
    const match = line.raw.match(pattern);
    if (match?.[0]) return { value: match[0], line };
  }
  return null;
}

export function parseAmount(raw) {
  const cleaned = String(raw).trim();
  const lastSeparator = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  if (lastSeparator === -1) {
    const plain = Number(cleaned);
    return Number.isFinite(plain) ? plain : null;
  }
  const decimals = cleaned.length - lastSeparator - 1;
  const value =
    decimals === 3
      ? Number(cleaned.replace(/[.,]/g, ''))
      : Number(
          `${cleaned.slice(0, lastSeparator).replace(/[.,]/g, '')}.${cleaned.slice(lastSeparator + 1)}`,
        );
  return Number.isFinite(value) ? value : null;
}

function toIsoDate(value) {
  const german = String(value).match(/(\d{1,2})[.](\d{1,2})[.](\d{4})/);
  if (german) {
    return `${german[3]}-${german[2].padStart(2, '0')}-${german[1].padStart(2, '0')}`;
  }
  const iso = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

/**
 * Mesaj icerigini `transport_order.extraction@v1` govdesine cevirir.
 *
 * KONTROL URETMIYOR: kontroller sunucuda, saklanan icerikten uretiliyor.
 */
export function extractOrderPayload(content) {
  const lines = toLines(content);
  const payload = {};
  const confidence = {};
  const entries = [];

  const record = (field, line, score) => {
    confidence[field] = score;
    entries.push({
      field,
      source: line.source,
      snippet: line.raw,
      financial: MONEY_LINE.test(line.folded),
    });
  };

  // --- Niyet: iptal > degisiklik > yeni siparis ---
  let intent = 'unknown';
  let intentLine = null;
  let intentConfidence = CONFIDENCE_WEAK;
  for (const candidate of ['cancellation', 'amendment', 'new_order']) {
    const hit = lines.find((line) => INTENT_TERMS[candidate].some((term) => line.folded.includes(term)));
    if (hit) {
      intent = candidate;
      intentLine = hit;
      intentConfidence = hit.source === 'subject' ? CONFIDENCE_LABELLED : CONFIDENCE_PATTERN;
      break;
    }
  }
  payload.intent = intent;
  confidence.intent = intent === 'unknown' ? CONFIDENCE_WEAK : intentConfidence;
  if (intentLine) {
    entries.push({
      field: 'intent',
      source: intentLine.source,
      snippet: intentLine.raw,
      financial: MONEY_LINE.test(intentLine.folded),
    });
  }

  // SIRA SUNUCUDAKIYLE AYNI OLMAK ZORUNDA: kanit listesi sirali karsilastiriliyor
  // (`order-intake-extract-drift.spec.ts`). Sira, arayuzde alanlarin gorunme
  // duzenidir; iki tarafta farkli olmasi incelemeciye farkli bir ekran gosterirdi.
  for (const [field, labels, maxLength, pattern] of [
    ['customerName', LABELS.customerName, 200, null],
    ['customerNumber', LABELS.customerNumber, 40, /\d/],
  ]) {
    const hit = readLabelled(lines, labels, maxLength, pattern);
    if (hit) {
      payload[field] = hit.value;
      record(field, hit.line, CONFIDENCE_LABELLED);
    }
  }

  const vatLabelled = readLabelled(lines, LABELS.vatId, 30);
  const vat = vatLabelled ?? readPattern(lines, /\b(?:DE|AT|NL|BE|FR|IT|ES|PL|CZ|HU|RO|BG|TR)[A-Z]?\d{8,11}\b/);
  if (vat) {
    payload.vatId = vat.value.replace(/\s+/g, '').slice(0, 30);
    record('vatId', vat.line, vatLabelled ? CONFIDENCE_LABELLED : CONFIDENCE_PATTERN);
  }

  const email = readPattern(lines, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) {
    payload.contactEmail = email.value.toLowerCase().slice(0, 254);
    record('contactEmail', email.line, CONFIDENCE_PATTERN);
  }

  const reference = readLabelled(lines, LABELS.externalReference, 80);
  if (reference) {
    payload.externalReference = reference.value;
    record('externalReference', reference.line, CONFIDENCE_LABELLED);
  }

  const orderDate = readLabelled(lines, LABELS.orderDate, 40);
  const dateIso = orderDate ? toIsoDate(orderDate.value) : null;
  if (orderDate && dateIso) {
    payload.orderDate = dateIso;
    record('orderDate', orderDate.line, CONFIDENCE_LABELLED);
  }

  // --- Finans: para birimi UYDURULMAZ ---
  const moneyLine =
    lines.find((line) => MONEY_LINE.test(line.folded)) ??
    lines.find(
      (line) => PRICE_LABELS.some((label) => line.folded.includes(label)) && new RegExp(AMOUNT).test(line.folded),
    );
  if (moneyLine) {
    const match = moneyLine.raw.match(new RegExp(MONEY_LINE.source, 'i'));
    const rawAmount = match?.[1] ?? match?.[4] ?? moneyLine.raw.match(new RegExp(AMOUNT))?.[0] ?? null;
    const rawCurrency = (match?.[2] ?? match?.[3] ?? '').toLowerCase();
    const amount = rawAmount === null ? null : parseAmount(rawAmount);
    if (amount !== null) {
      payload.revenueAmount = amount;
      record('revenueAmount', moneyLine, CONFIDENCE_PATTERN);
    }
    const currency = CURRENCY_BY_TOKEN[rawCurrency];
    if (currency) {
      payload.currency = currency;
      record('currency', moneyLine, CONFIDENCE_PATTERN);
    }
  }

  // --- Kalem ---
  const pickup = readLabelled(lines, LABELS.pickupAddress, 300);
  const delivery = readLabelled(lines, LABELS.deliveryAddress, 300);
  const cargo = readLabelled(lines, LABELS.cargoDescription, 500);
  const weight = readLabelled(lines, LABELS.weightKg, 40, /\d/);
  const pallets = readLabelled(lines, LABELS.palletCount, 20, /\d/);
  const adrLine = lines.find((line) => /\badr\b|gefahrgut|tehlikeli madde|dangerous goods/.test(line.folded));

  if (pickup || delivery || cargo || adrLine) {
    // ADR DAIMA yaziliyor ve varsayilani `unknown`.
    const consignment = { adr: 'unknown' };
    if (pickup) {
      consignment.pickupAddress = pickup.value;
      record('consignments[0].pickupAddress', pickup.line, CONFIDENCE_LABELLED);
    }
    if (delivery) {
      consignment.deliveryAddress = delivery.value;
      record('consignments[0].deliveryAddress', delivery.line, CONFIDENCE_LABELLED);
    }
    if (cargo) {
      consignment.cargoDescription = cargo.value;
      record('consignments[0].cargoDescription', cargo.line, CONFIDENCE_LABELLED);
    }
    if (weight) {
      const kilograms = parseAmount(weight.value.replace(/[^\d.,]/g, ''));
      if (kilograms !== null) {
        consignment.weightKg = kilograms;
        record('consignments[0].weightKg', weight.line, CONFIDENCE_LABELLED);
      }
    }
    if (pallets) {
      const count = Number.parseInt(pallets.value.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(count)) {
        consignment.palletCount = count;
        record('consignments[0].palletCount', pallets.line, CONFIDENCE_LABELLED);
      }
    }
    if (adrLine) {
      if (/\b(nein|no|hayir|kein gefahrgut|keine gefahrgut|not adr|non-adr)\b/.test(adrLine.folded)) {
        consignment.adr = 'no';
      } else if (
        /\b(ja|yes|evet|gefahrgut|tehlikeli madde|dangerous goods|adr\s*[:=]?\s*(ja|yes|evet))\b/.test(adrLine.folded)
      ) {
        consignment.adr = 'yes';
      }
      record('consignments[0].adr', adrLine, consignment.adr === 'unknown' ? CONFIDENCE_WEAK : CONFIDENCE_LABELLED);
    }
    const timezone = readPattern(lines, /\b(?:Europe|Africa|America|Asia)\/[A-Za-z_]+\b/);
    if (timezone) {
      consignment.timezone = timezone.value;
      record('consignments[0].timezone', timezone.line, CONFIDENCE_PATTERN);
    }
    payload.consignments = [consignment];
  }

  const instructions = readLabelled(lines, LABELS.specialInstructions, 2000);
  if (instructions) {
    payload.specialInstructions = instructions.value;
    record('specialInstructions', instructions.line, CONFIDENCE_LABELLED);
  }

  return { payload, confidence, entries: entries.slice(0, 100) };
}
