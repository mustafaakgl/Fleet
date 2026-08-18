import { inflateSync } from 'node:zlib';
import { detectReceiptFileKind, type ReceiptFileKind } from '../../fleet/fuel-receipts/core/receipt-file.util';

/**
 * GELEN BELGENIN GUVENLIK INCELEMESI (Faz 14).
 *
 * Buradaki her sinir bir SALDIRI YUZEYINI kapatiyor, bir "kullanim kolayligi"
 * tercihi degil:
 *   - MIME + magic byte: uzanti ve istemcinin bildirdigi tur serbestce
 *     yazilir. Gercek tur ilk baytlardan okunur (Faz 7'deki util yeniden
 *     kullaniliyor; ikinci bir tur tespiti YAZILMADI).
 *   - Sayfa siniri: 2000 sayfalik bir PDF'i sayfa sayfa isleme sokmak, tek
 *     istekle butun kuyrugu tuketmenin en ucuz yolu.
 *   - Piksel siniri: 200 MP'lik bir "decompression bomb" JPEG diskte 2 MB'dir
 *     ama bellekte gigabaytlarca yer kaplar.
 *
 * BELGE METNI VE PDF METADATA'SI DAIMA GUVENSIZ VERIDIR. Bu modul onlari
 * yalnizca DONDURUR; hicbir yerde talimat olarak yorumlanmaz, denetime ve
 * loglara yazilmaz.
 */

/** Gelen kutusunun kabul ettigi turler. */
export type IntakeFileKind = ReceiptFileKind;

export const MAX_INTAKE_FILE_BYTES = Number(
  process.env.DOCUMENT_INTAKE_MAX_BYTES ?? 25 * 1024 * 1024,
);

/** Tek yuklemede islenecek en fazla sayfa. */
export const MAX_INTAKE_PAGE_COUNT = Number(process.env.DOCUMENT_INTAKE_MAX_PAGES ?? 60);

/**
 * Goruntu icin en fazla toplam piksel (genislik x yukseklik).
 *
 * 50 MP: 8000x6000'lik bir tarama rahatca gecer, "decompression bomb" gecmez.
 */
export const MAX_INTAKE_IMAGE_PIXELS = Number(
  process.env.DOCUMENT_INTAKE_MAX_PIXELS ?? 50_000_000,
);

export type IntakeFileErrorCode =
  | 'intake_file_missing'
  | 'intake_file_too_large'
  | 'intake_file_unsupported_type'
  /** HEIC/HEIF: ACIKCA desteklenmiyor — "destekleniyormus gibi" davranilmiyor. */
  | 'intake_file_heic_unsupported'
  | 'intake_file_encrypted'
  | 'intake_file_corrupt'
  | 'intake_file_too_many_pages'
  | 'intake_file_image_too_large';

export class IntakeFileError extends Error {
  constructor(readonly code: IntakeFileErrorCode, readonly detail?: Record<string, unknown>) {
    super(code);
    this.name = 'IntakeFileError';
  }
}

/**
 * HEIC/HEIF tespiti.
 *
 * NEDEN DESTEKLENMIYOR: bu repoda HEIC'i acabilecek DOGRULANMIS bir decoder
 * yok — `sharp`in libheif destegi derleme secenegine bagli ve garanti degil.
 * "Belki calisir" diye kabul etmek, iPhone'dan fis yollayan kullaniciya
 * ANLAMSIZ bir hata gostermek demektir. Turu taniyip ACIK bir mesaj vermek,
 * sessizce "desteklenmeyen dosya" demekten durust.
 *
 * ISO-BMFF kutusu: 4 bayt boyut + 'ftyp' + marka.
 */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

export function isHeifFile(head: Buffer): boolean {
  if (head.length < 12) return false;
  if (head.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
  return HEIF_BRANDS.has(head.subarray(8, 12).toString('latin1'));
}

export interface InspectedFile {
  kind: IntakeFileKind;
  /** Sunucunun DOSYADAN saydigi sayfa sayisi. Istemcinin bildirdigi degil. */
  pageCount: number;
}

/**
 * PDF sayfa sayisi — HAM bayt taramasiyla.
 *
 * NEDEN TAM PARSER DEGIL: sayfa saymak icin butun belgeyi nesne grafina
 * acmak, bozuk/kotu niyetli dosyada cok daha genis bir saldiri yuzeyi acar.
 * `/Type /Page` sayimi bu is icin yeterli ve ucuz.
 */
export function countPdfPages(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  // `/Type /Pages` (agac dugumu) SAYILMAMALI — yalnizca yaprak sayfalar.
  const matches = text.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  return matches ? matches.length : 0;
}

/** Sifreli PDF: `/Encrypt` sozlugu var demektir. Icerigi okumaya CALISILMAZ. */
export function isEncryptedPdf(buffer: Buffer): boolean {
  return /\/Encrypt[\s/<]/.test(buffer.toString('latin1'));
}

/**
 * JPEG/PNG boyutlari — basliktan.
 *
 * Goruntuyu DECODE ETMEDEN olcup reddediyoruz: bomba dosyanin zarari zaten
 * decode aninda olusur.
 */
export function readImageDimensions(
  buffer: Buffer,
  kind: IntakeFileKind,
): { width: number; height: number } | null {
  if (kind === 'image/png') {
    if (buffer.length < 24) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (kind === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1]!;
      // SOF0..SOF15 (DHT/DAC/RST haric) boyutlari tasir.
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) return null;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

/**
 * Dosyayi kabul edilebilir mi diye inceler.
 *
 * BOZUK/SIFRELI/ISLENEMEYEN dosyada GUVENLI hata: istisna disari sizmaz,
 * saglayici mesaji ya da yol bilgisi tasimayan bir HATA SINIFI doner.
 */
export function inspectIntakeFile(buffer: Buffer | undefined, size?: number): InspectedFile {
  if (!buffer || buffer.length === 0) {
    throw new IntakeFileError('intake_file_missing');
  }
  const byteLength = size ?? buffer.length;
  if (byteLength > MAX_INTAKE_FILE_BYTES) {
    throw new IntakeFileError('intake_file_too_large');
  }

  const head = buffer.subarray(0, 16);

  // HEIC once: magic byte tablosunda YOK ve "taninmayan tur" demek yaniltici olurdu.
  if (isHeifFile(Buffer.from(head))) {
    throw new IntakeFileError('intake_file_heic_unsupported');
  }

  const kind = detectReceiptFileKind(head);
  if (!kind) {
    throw new IntakeFileError('intake_file_unsupported_type');
  }

  if (kind === 'application/pdf') {
    if (isEncryptedPdf(buffer)) {
      throw new IntakeFileError('intake_file_encrypted');
    }
    const pageCount = countPdfPages(buffer);
    if (pageCount === 0) {
      // Sayfa bulunamadi: bozuk ya da bu parser'in anlamadigi bir yapi.
      throw new IntakeFileError('intake_file_corrupt');
    }
    if (pageCount > MAX_INTAKE_PAGE_COUNT) {
      throw new IntakeFileError('intake_file_too_many_pages', { pageCount });
    }
    return { kind, pageCount };
  }

  const dimensions = readImageDimensions(buffer, kind);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new IntakeFileError('intake_file_corrupt');
  }
  if (dimensions.width * dimensions.height > MAX_INTAKE_IMAGE_PIXELS) {
    throw new IntakeFileError('intake_file_image_too_large');
  }

  // Fotograf = TEK mantiksal sayfa.
  return { kind, pageCount: 1 };
}

/**
 * GUVENSIZ metin: belgenin icindeki yazi ve PDF metadata'si.
 *
 * Bu tip bilincli olarak "unsafe" adini tasiyor. Cagiran taraf bunu
 * ANAHTAR EslESTIRMESI disinda hicbir sey icin kullanmamali: talimat olarak
 * yorumlanmaz, prompt'a konmaz, denetime ve loglara YAZILMAZ.
 */
export interface UnsafeDocumentText {
  /** Sayfa sirasina gore metin. Icerik GUVENSIZ. */
  pages: string[];
  /** PDF metadata alanlari (Title/Author/Subject/Keywords). GUVENSIZ. */
  metadata: string;
}

const TEXT_OPERATOR = /\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\][]|\\.)*\]\s*TJ/g;

function decodePdfStrings(chunk: string): string {
  const out: string[] = [];
  for (const match of chunk.matchAll(TEXT_OPERATOR)) {
    for (const literal of match[0].matchAll(/\((?:\\.|[^\\()])*\)/g)) {
      out.push(
        literal[0]
          .slice(1, -1)
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\n/g, ' '),
      );
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * PDF'ten sayfa metni ve metadata cikarir — EN IYI CABA.
 *
 * Cikarilamamasi bir HATA DEGIL: taranmis bir PDF'te gomulu metin olmayabilir.
 * Bos metin, siniflandiricinin `unknown` demesine yol acar — uydurmasina degil.
 */
export function extractUnsafeText(buffer: Buffer, pageCount: number): UnsafeDocumentText {
  const pages: string[] = [];

  try {
    const raw = buffer.toString('latin1');

    // Sikistirilmis icerik akislari.
    for (const match of raw.matchAll(/stream\r?\n?([\s\S]*?)endstream/g)) {
      const body = match[1] ?? '';
      let decoded = '';
      try {
        decoded = inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
      } catch {
        // Sikistirilmamis akis olabilir; oldugu gibi denenir.
        decoded = body;
      }
      const text = decodePdfStrings(decoded);
      if (text) {
        pages.push(text);
      }
    }

    // Metadata: dogrudan sozluk girdileri.
    const metadataParts: string[] = [];
    for (const key of ['Title', 'Author', 'Subject', 'Keywords', 'Producer', 'Creator']) {
      const found = raw.match(new RegExp(`/${key}\\s*\\((?:\\\\.|[^\\\\()])*\\)`));
      if (found) {
        metadataParts.push(found[0].replace(new RegExp(`^/${key}\\s*\\(`), '').slice(0, -1));
      }
    }

    // Sayfa sayisina hizala: eksikse bos, fazlaysa kirp.
    while (pages.length < pageCount) pages.push('');
    return { pages: pages.slice(0, pageCount), metadata: metadataParts.join(' ').slice(0, 2_000) };
  } catch {
    // Cikarim BASARISIZ OLABILIR ve bu bir hata degil. Bos metin dondurulur.
    return { pages: Array.from({ length: pageCount }, () => ''), metadata: '' };
  }
}
