import { htmlToPlainText, sanitizeIntakeHtml, MAX_PLAIN_TEXT_LENGTH } from './order-intake-html';

/**
 * `.eml` AYRISTIRICISI (Faz 16).
 *
 * HARICI BAGIMLILIK YOK — ve bu bir tercih degil, bu katmanin geregi. Bir
 * mail ayristirma kutuphanesi tanim geregi guvensiz girdinin en genis yuzeyi
 * uzerinde calisir; repoda `intake-file.ts` ayni gerekceyle PDF'i tam bir
 * parser'a acmiyor. Buradaki ayristirici DAR: yalnizca ihtiyac duyulan
 * basliklar ve gövde/ek ayrimi.
 *
 * ZARFIN TAMAMI GUVENSIZ VERIDIR.
 *
 *   - `From`, `Subject`, `Message-ID`, dosya adlari: gonderen bunlari
 *     SERBESTCE yazar. Hicbiri kimlik, yetki ya da talimat degildir.
 *   - `From` bir MUSTERIYE ESIT DEGILDIR: SPF/DKIM dogrulamasi YAPILMIYOR ve
 *     yapilsa bile bir adresin dogrulanmasi, o adresin sahibinin bir siparisi
 *     degistirme YETKISI oldugu anlamina gelmezdi. Eslestirme sunucuda,
 *     deterministik kurallarla.
 *   - `In-Reply-To` bir siparis SECMEZ; en fazla aday uretir.
 *
 * FAIL-CLOSED: bozuk ya da beklenmedik yapida bir mesajda istisna disari
 * sizmaz; alanlar BOS kalir. Bos alan, uydurulmus alandan iyidir.
 */

/** Tek mesajda islenecek en fazla MIME parcasi — ic ice bomba korumasi. */
const MAX_MIME_PARTS = 200;
/** En fazla ic ice `multipart` derinligi. */
const MAX_MIME_DEPTH = 12;
/** Basliktan okunacak en fazla bayt. */
const MAX_HEADER_BYTES = 100_000;

export interface EmlAttachment {
  /** GUVENSIZ dosya adi — cagiran taraf ayrica sanitize eder. */
  fileName: string;
  /** Gonderenin BILDIRDIGI tur. Gercek tur ilk baytlardan okunur. */
  declaredMimeType: string | null;
  content: Buffer;
}

export interface ParsedEml {
  /** Ham baslik degerleri — hepsi GUVENSIZ. */
  messageId: string | null;
  inReplyTo: string | null;
  fromAddress: string | null;
  fromDisplayName: string | null;
  toAddresses: string[];
  subject: string | null;
  sentAt: Date | null;
  /** Duz metin govde. HTML varsa ondan turetilir. */
  bodyText: string;
  /** RENDER EDILEBILIR hale getirilmis HTML. Ham HTML DISARI CIKMAZ. */
  bodyHtml: string;
  attachments: EmlAttachment[];
  /** Ayristirici sinirlari asildiginda dolar — sessizce kirpilmaz. */
  truncated: boolean;
}

interface RawPart {
  headers: Map<string, string>;
  body: Buffer;
}

// ---------------------------------------------------------------------------
// Baslik yardimcilari
// ---------------------------------------------------------------------------

/** RFC 5322 katlanmis (folded) basliklari birlestirir. */
function unfold(headerBlock: string): string {
  return headerBlock.replace(/\r?\n[ \t]+/g, ' ');
}

function parseHeaders(headerBlock: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const line of unfold(headerBlock).split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    // ILK deger kazanir: ayni baslik iki kez gonderildiginde (baslik
    // kacakciligi) ikinci degerin birinciyi EZMESINE izin verilmez.
    if (!headers.has(name)) headers.set(name, value);
  }
  return headers;
}

/** Govdeyi basliktan ayirir: ilk bos satir. */
function splitPart(raw: Buffer): RawPart {
  const text = raw.subarray(0, MAX_HEADER_BYTES).toString('latin1');
  const match = text.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    return { headers: parseHeaders(text), body: Buffer.alloc(0) };
  }
  const headerEnd = match.index + match[0].length;
  return { headers: parseHeaders(text.slice(0, match.index)), body: raw.subarray(headerEnd) };
}

/**
 * RFC 2047 kodlanmis baslik metni (`=?UTF-8?B?...?=`).
 *
 * Almanca ve Turkce konu satirlari neredeyse her zaman kodludur; cozmezsek
 * incelemeci ekranda `=?UTF-8?Q?Transportauftrag?=` gorur.
 */
function decodeWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (match, charset: string, encoding: string, data: string) => {
      try {
        const bytes =
          encoding.toLowerCase() === 'b'
            ? Buffer.from(data, 'base64')
            : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9a-fA-F]{2})/g, (_m, hex: string) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
              ), 'latin1');
        return decodeCharset(bytes, charset);
      } catch {
        // Cozulemeyen kelime OLDUGU GIBI kalir — uydurulmaz.
        return match;
      }
    },
  );
}

/** Bilinen karakter kumeleri. Taninmayan kume `latin1` — veri KAYBOLMAZ. */
function decodeCharset(bytes: Buffer, charset: string | null | undefined): string {
  const name = (charset ?? 'utf-8').toLowerCase().replace(/['"]/g, '');
  if (name.includes('utf-8') || name.includes('utf8')) return bytes.toString('utf8');
  if (name.includes('utf-16')) return bytes.toString('utf16le');
  if (name.includes('ascii')) return bytes.toString('ascii');
  return bytes.toString('latin1');
}

/** `Content-Type` gibi parametreli basliklardan bir parametre okur. */
function param(headerValue: string | undefined, key: string): string | null {
  if (!headerValue) return null;
  const quoted = headerValue.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'));
  if (quoted?.[1] !== undefined) return quoted[1];
  const bare = headerValue.match(new RegExp(`${key}\\s*=\\s*([^;\\s]+)`, 'i'));
  return bare?.[1] ?? null;
}

function mimeTypeOf(headers: Map<string, string>): string {
  const value = headers.get('content-type') ?? 'text/plain';
  return (value.split(';')[0] ?? 'text/plain').trim().toLowerCase();
}

/** Transfer kodlamasini cozer. Taninmayan kodlama = ham baytlar. */
function decodeBody(body: Buffer, headers: Map<string, string>): Buffer {
  const encoding = (headers.get('content-transfer-encoding') ?? '7bit').trim().toLowerCase();
  if (encoding === 'base64') {
    return Buffer.from(body.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  }
  if (encoding === 'quoted-printable') {
    const text = body
      .toString('latin1')
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9a-fA-F]{2})/g, (_m, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    return Buffer.from(text, 'latin1');
  }
  return body;
}

// ---------------------------------------------------------------------------
// Adres ve tarih
// ---------------------------------------------------------------------------

/**
 * `From` basligindan adres ve gorunen ad.
 *
 * GORUNEN AD BIR IDDIADIR: `"Spedition Muster GmbH" <angreifer@example.org>`
 * tamamen gecerli bir basliktir. Bu yuzden ad ve adres AYRI donuyor ve
 * eslestirme YALNIZCA adresi kullaniyor — o da tek basina kesin eslesme degil.
 */
export function parseAddress(value: string | null | undefined): {
  address: string | null;
  displayName: string | null;
} {
  if (!value) return { address: null, displayName: null };
  const decoded = decodeWords(value).trim();

  const angled = decoded.match(/<([^<>]+)>/);
  if (angled?.[1]) {
    const displayName = decoded.slice(0, decoded.indexOf('<')).trim().replace(/^"|"$/g, '');
    return {
      address: normalizeAddress(angled[1]),
      displayName: displayName ? displayName.slice(0, 200) : null,
    };
  }
  return { address: normalizeAddress(decoded), displayName: null };
}

/** Adres NORMALIZE edilir: kirpilir ve kucuk harfe cevrilir. */
export function normalizeAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (!trimmed || trimmed.length > 254) return null;
  // Cok kaba bir bicim kontrolu: tam RFC uyumu ARANMIYOR cunku adres burada
  // yalnizca bir ADAY; kesin eslesme kayitli adresle TAM esitlik gerektiriyor.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(decodeWords(value).trim());
  if (Number.isNaN(parsed.getTime())) return null;
  // Makul aralik: 2000..+2 yil. Uydurma bir tarih siralama ve raporlari bozar.
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > new Date().getUTCFullYear() + 2) return null;
  return parsed;
}

/** `<...>` sarmalini soyar; kalan metin OLDUGU GIBI, guvensiz kalir. */
function cleanMessageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const inner = trimmed.match(/<([^<>]+)>/)?.[1] ?? trimmed;
  return inner.slice(0, 200) || null;
}

// ---------------------------------------------------------------------------
// MIME agaci
// ---------------------------------------------------------------------------

interface WalkState {
  textParts: string[];
  htmlParts: string[];
  attachments: EmlAttachment[];
  partCount: number;
  truncated: boolean;
}

function isAttachment(headers: Map<string, string>): boolean {
  const disposition = (headers.get('content-disposition') ?? '').toLowerCase();
  if (disposition.startsWith('attachment')) return true;
  // Adi olan `inline` parcalar da EK sayilir: bir PDF'i `inline` gondermek
  // onu gövde metnine cevirmez.
  return Boolean(param(headers.get('content-disposition'), 'filename') || param(headers.get('content-type'), 'name'));
}

function walk(part: RawPart, state: WalkState, depth: number): void {
  if (state.partCount >= MAX_MIME_PARTS || depth > MAX_MIME_DEPTH) {
    state.truncated = true;
    return;
  }
  state.partCount += 1;

  const contentType = mimeTypeOf(part.headers);

  if (contentType.startsWith('multipart/')) {
    const boundary = param(part.headers.get('content-type'), 'boundary');
    if (!boundary) {
      state.truncated = true;
      return;
    }
    for (const child of splitMultipart(part.body, boundary)) {
      walk(splitPart(child), state, depth + 1);
      if (state.partCount >= MAX_MIME_PARTS) {
        state.truncated = true;
        return;
      }
    }
    return;
  }

  const decoded = decodeBody(part.body, part.headers);

  if (isAttachment(part.headers)) {
    const rawName =
      param(part.headers.get('content-disposition'), 'filename') ??
      param(part.headers.get('content-type'), 'name') ??
      'anhang';
    state.attachments.push({
      fileName: decodeWords(rawName).slice(0, 255),
      declaredMimeType: contentType || null,
      content: decoded,
    });
    return;
  }

  const charset = param(part.headers.get('content-type'), 'charset');
  if (contentType === 'text/html') {
    state.htmlParts.push(decodeCharset(decoded, charset));
    return;
  }
  if (contentType === 'text/plain' || contentType === '') {
    state.textParts.push(decodeCharset(decoded, charset));
    return;
  }
  // Adi olmayan ama metin de olmayan parca (ornegin `application/pdf`
  // `Content-Disposition`siz): EK sayilir. Sessizce dusurmek, gercek bir
  // tasima emrini gorunmez kilardi.
  state.attachments.push({
    fileName: 'anhang',
    declaredMimeType: contentType || null,
    content: decoded,
  });
}

/** `multipart` govdesini sinir dizgisine gore parcalara ayirir. */
function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const marker = `--${boundary}`;
  const text = body.toString('latin1');
  const parts: Buffer[] = [];

  let cursor = text.indexOf(marker);
  if (cursor === -1) return parts;

  while (cursor !== -1) {
    const afterMarker = cursor + marker.length;
    // Kapanis siniri: `--boundary--`
    if (text.startsWith('--', afterMarker)) break;
    const bodyStart = text.indexOf('\n', afterMarker);
    if (bodyStart === -1) break;
    const next = text.indexOf(marker, bodyStart);
    const end = next === -1 ? text.length : next;
    // Sinirdan onceki CRLF parcaya ait DEGILDIR.
    const slice = text.slice(bodyStart + 1, end).replace(/\r?\n$/, '');
    parts.push(Buffer.from(slice, 'latin1'));
    cursor = next;
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Genel giris
// ---------------------------------------------------------------------------

/**
 * Ham `.eml` baytlarini ayristirir.
 *
 * ISTISNA FIRLATMAZ: bozuk mesajda alanlar bos kalir ve `truncated` isaretlenir.
 * Gonderenin bozuk bir mesajla intake hattini durdurabilmesi, en ucuz servis
 * disi birakma yontemi olurdu.
 */
export function parseEml(raw: Buffer): ParsedEml {
  const empty: ParsedEml = {
    messageId: null,
    inReplyTo: null,
    fromAddress: null,
    fromDisplayName: null,
    toAddresses: [],
    subject: null,
    sentAt: null,
    bodyText: '',
    bodyHtml: '',
    attachments: [],
    truncated: false,
  };

  try {
    const root = splitPart(raw);
    const state: WalkState = {
      textParts: [],
      htmlParts: [],
      attachments: [],
      partCount: 0,
      truncated: false,
    };
    walk(root, state, 0);

    const from = parseAddress(root.headers.get('from'));
    const html = state.htmlParts.join('\n');
    // METIN TERCIHI: duz metin parcasi varsa o kullaniliyor; yoksa HTML
    // AYNI token yolundan gecirilip metne cevriliyor — yani `<script>`
    // govdesi cikarima da girmiyor.
    const text = state.textParts.join('\n').trim() || htmlToPlainText(html);

    return {
      messageId: cleanMessageId(root.headers.get('message-id')),
      inReplyTo: cleanMessageId(root.headers.get('in-reply-to')),
      fromAddress: from.address,
      fromDisplayName: from.displayName,
      toAddresses: (root.headers.get('to') ?? '')
        .split(',')
        .map((entry) => parseAddress(entry).address)
        .filter((address): address is string => address !== null)
        .slice(0, 20),
      subject: root.headers.has('subject')
        ? decodeWords(root.headers.get('subject')!).slice(0, 500)
        : null,
      sentAt: parseDate(root.headers.get('date')),
      bodyText: text.slice(0, MAX_PLAIN_TEXT_LENGTH),
      bodyHtml: sanitizeIntakeHtml(html),
      attachments: state.attachments,
      truncated: state.truncated,
    };
  } catch {
    // FAIL-CLOSED: bozuk mesaj hatti DURDURMAZ, bos zarf uretir.
    return { ...empty, truncated: true };
  }
}
