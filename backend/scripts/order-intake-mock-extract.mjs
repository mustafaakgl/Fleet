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
};

/** Kalem alanlarinin etiketleri — GRUPLAMA bunlarin uzerinden yapiliyor. */
const CONSIGNMENT_LABELS = {
  pickupAddress: ['ladestelle', 'beladestelle', 'abholadresse', 'pickup address', 'yukleme adresi'],
  deliveryAddress: ['entladestelle', 'abladestelle', 'lieferadresse', 'delivery address', 'bosaltma adresi'],
  cargoDescription: ['ladung', 'ware', 'gut', 'cargo', 'yuk'],
  weightKg: ['gewicht', 'weight', 'agirlik'],
  palletCount: ['paletten', 'palette', 'pallets', 'palet'],
  quantity: ['menge', 'quantity', 'miktar'],
  volumeM3: ['volumen', 'volume', 'hacim'],
  pickupWindowStart: ['ladezeit', 'abholung am', 'pickup time', 'yukleme zamani'],
  deliveryWindowStart: ['lieferzeit', 'zustellung am', 'delivery time', 'teslim zamani'],
};

/**
 * Etiket satirda KELIME BASINDA mi geciyor. `Entladestelle` icinde
 * `ladestelle` gecer; sinir kontrolu olmadan bosaltma yukleme sanilir.
 */
function labelStartsAtWord(folded, label, index) {
  if (index === 0) return true;
  return !/[a-z0-9]/.test(folded[index - 1] ?? '');
}

function consignmentFieldOf(line) {
  for (const [field, labels] of Object.entries(CONSIGNMENT_LABELS)) {
    for (const label of labels) {
      const index = line.folded.indexOf(label);
      if (index === -1) continue;
      if (!labelStartsAtWord(line.folded, label, index)) continue;
      const after = line.raw.slice(index + label.length);
      const separator = after.search(/[:=]/);
      if (separator === -1) continue;
      const value = (after.slice(separator + 1).trim().split(/\s{2,}|[;|]/)[0] ?? '').trim();
      if (value) return { field, value: value.slice(0, 300) };
    }
  }
  return null;
}

/** Bir satirin ADR bildirimi olup olmadigi. Uc durumlu. */
function adrOf(line) {
  if (!/\badr\b|gefahrgut|tehlikeli madde|dangerous goods/.test(line.folded)) return null;
  if (/\b(nein|no|hayir|kein gefahrgut|keine gefahrgut|not adr|non-adr)\b/.test(line.folded)) {
    return { value: 'no', line };
  }
  if (
    /\b(ja|yes|evet|gefahrgut|tehlikeli madde|dangerous goods)\b/.test(line.folded) ||
    /adr\s*[:=]?\s*(ja|yes|evet)/.test(line.folded)
  ) {
    return { value: 'yes', line };
  }
  return { value: 'unknown', line };
}

/**
 * KALEMLERI GRUPLAR — sunucudaki `extractConsignments` ile AYNI kural:
 * ayni alan ikinci kez gorundugunde yeni kalem baslar.
 */
function extractConsignments(lines, record) {
  const groups = [];
  let current = null;
  let globalAdr = null;
  let globalTimezone = null;

  for (const line of lines) {
    const adr = adrOf(line);
    if (adr) {
      if (current) current.adr = adr;
      else globalAdr = adr;
      continue;
    }

    const timezone = line.raw.match(/\b(?:Europe|Africa|America|Asia)\/[A-Za-z_]+\b/)?.[0];
    if (timezone) {
      const entry = { value: timezone, line };
      if (current) current.timezone = entry;
      else globalTimezone = entry;
      continue;
    }

    const hit = consignmentFieldOf(line);
    if (!hit) continue;

    if (!current || current.values[hit.field] !== undefined) {
      current = { values: {} };
      groups.push(current);
    }
    current.values[hit.field] = { value: hit.value, line };
  }

  if (groups.length === 0) {
    if (!globalAdr) return [];
    groups.push({ values: {} });
  }

  return groups.slice(0, 20).map((group, index) => {
    const consignment = { adr: 'unknown' };
    const key = (field) => `consignments[${index}].${field}`;

    const text = (field) => {
      const entry = group.values[field];
      if (!entry) return;
      consignment[field] = entry.value;
      record(key(field), entry.line, CONFIDENCE_LABELLED);
    };
    text('pickupAddress');
    text('deliveryAddress');
    text('cargoDescription');
    text('pickupWindowStart');
    text('deliveryWindowStart');

    const numeric = (field, integer = false) => {
      const entry = group.values[field];
      if (!entry) return;
      const parsed = integer
        ? Number.parseInt(entry.value.replace(/[^\d]/g, ''), 10)
        : parseAmount(entry.value.replace(/[^\d.,]/g, ''));
      if (parsed === null || !Number.isFinite(parsed)) return;
      consignment[field] = parsed;
      record(key(field), entry.line, CONFIDENCE_LABELLED);
    };
    numeric('weightKg');
    numeric('volumeM3');
    numeric('palletCount', true);
    numeric('quantity');

    const adr = group.adr ?? globalAdr;
    if (adr) {
      consignment.adr = adr.value;
      record(key('adr'), adr.line, adr.value === 'unknown' ? CONFIDENCE_WEAK : CONFIDENCE_LABELLED);
    }

    const timezone = group.timezone ?? globalTimezone;
    if (timezone) {
      consignment.timezone = timezone.value;
      record(key('timezone'), timezone.line, CONFIDENCE_PATTERN);
    }

    return consignment;
  });
}

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

  // --- Kalemler: BIRDEN FAZLA olabilir ---
  const consignments = extractConsignments(lines, record);
  if (consignments.length > 0) {
    payload.consignments = consignments;
  }

  const instructions = readLabelled(lines, LABELS.specialInstructions, 2000);
  if (instructions) {
    payload.specialInstructions = instructions.value;
    record('specialInstructions', instructions.line, CONFIDENCE_LABELLED);
  }

  return { payload, confidence, entries: entries.slice(0, 100) };
}
