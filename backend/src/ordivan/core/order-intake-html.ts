/**
 * HTML E-POSTA SANITIZASYONU (Faz 16).
 *
 * NEDEN ELDE YAZILMIS BIR SANITIZER — `schema-validation.ts` ile AYNI GEREKCE:
 * bu katmanin girdisi tamamen guvensizdir ve guvenlik siniri uzerinde calisan
 * kodun davranisi tam olarak okunabilir olmali. Bir kutuphanenin "allowed
 * tags" varsayilani surum atladiginda sessizce genisler; burada genislemek
 * icin bu dosyanin degismesi gerekir.
 *
 * TEMEL KURAL: SUZMEK DEGIL, YENIDEN INSA ETMEK.
 *
 * Ham HTML'i "tehlikeli parcalari silerek" temizlemek, saldirganin bulmasi
 * gereken tek bir kacik birakir: ic ice yazilmis etiketler, yorum kaciran
 * oznitelikler, `svg`/`animate` gibi ad alani numaralari. Bunun yerine girdi TOKEN'LARINA ayriliyor
 * ve cikti SIFIRDAN kuruluyor: cikista yalnizca izin listesindeki etiketler
 * ve HICBIR OZNITELIK var. Dolayisiyla `onerror`, `style`, `src`, `href`
 * ciktida VAR OLAMAZ — silinmedikleri icin degil, hic yazilmadiklari icin.
 *
 * UZAK ICERIK YOK: `<img>` tamamen dusuyor. Bir e-postadaki uzak gorsel, ne
 * zaman ve kac kez okundugunu gonderene bildiren bir TAKIP PIKSELIDIR; onu
 * gostermek, incelemeciyi farkinda olmadan gondericiye sinyal verdirmek olur.
 * Ayni sebeple `style` de yok — CSS `url()` ile uzak istek atabilir.
 *
 * LINK TIKLANMAZ: `<a>` etiketi ACILIP metnine cevriliyor, adres ise DUZ
 * METIN olarak yaninda gosteriliyor. Incelemeci nereye gittigini GORUR ama
 * yanlislikla tiklayamaz; oltalama baglantisi bir kaza uzakliginda durmaz.
 *
 * ICERIK HALA GUVENSIZDIR: bu modul yalnizca RENDER etmeyi guvenli kilar.
 * Cikti metni hicbir yerde talimat olarak yorumlanmaz.
 */

/** Ciktida gorunebilecek etiketler. OZNITELIK YOK — hicbiri, hicbir zaman. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code', 'hr',
]);

/**
 * ICERIGIYLE BIRLIKTE DUSEN etiketler.
 *
 * Bunlarin govdesi "metin" degil KOD ya da UZAK KAYNAKTIR. Etiketi atip
 * icerigini birakmak, `<script>alert(1)</script>` girdisini ekrana
 * `alert(1)` diye yazdirmak olurdu — zararsiz ama anlamsiz; daha kotusu
 * `<style>` icerigi sayfayi kaplayan bir katmana donusebilirdi.
 *
 * `svg` ve `math` LISTEDE: bu iki ad alaninda tarayicinin ayristirma kurallari
 * HTML'den farklidir ve tam da bu fark mXSS'in kaynagidir.
 */
const KILLED_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'noscript', 'template', 'svg', 'math', 'textarea', 'title', 'head',
  'form', 'input', 'button', 'select', 'option', 'optgroup', 'label', 'fieldset',
  'audio', 'video', 'source', 'track', 'canvas', 'map', 'area', 'portal',
]);

/** Kendi kendine kapanan (void) etiketler — kapanis aranmaz. */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'base', 'source', 'track', 'area', 'col', 'wbr',
]);

/** Cikti uzunlugu siniri — tek bir mesaj bellegi doldurmamali. */
export const MAX_SANITIZED_HTML_LENGTH = 200_000;
export const MAX_PLAIN_TEXT_LENGTH = 100_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ntilde: 'ñ',
  euro: '€', pound: '£', deg: '°', copy: '©', reg: '®', trade: '™',
  hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»',
  bull: '•', middot: '·', shy: '', zwnj: '', zwj: '',
};

/**
 * Varlik cozumu — ESCAPE'TEN ONCE.
 *
 * NEDEN GEREKLI: cozmeden escape edersek Almanca bir mailde `&auml;` ekranda
 * `&auml;` olarak gorunur. NEDEN GUVENLI: cozulen metin hemen ardindan
 * yeniden escape ediliyor ve cikti hicbir zaman oznitelik icine girmiyor.
 * `&#106;avascript&#58;` gibi kacisli sozdizimi bir `href`e donusemez, cunku
 * ciktida `href` DIYE BIR SEY YOK.
 *
 * TANINMAYAN varlik OLDUGU GIBI birakilir — uydurulmaz.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      // Vekil (surrogate) araligi tek basina gecerli bir karakter degildir.
      if (code >= 0xd800 && code <= 0xdfff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? match : named;
  });
}

/** Metin kacisi. Tirnak da kaciriliyor — cikti hicbir zaman oznitelige girmese de. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface TagToken {
  kind: 'tag';
  name: string;
  closing: boolean;
  selfClosing: boolean;
  raw: string;
}
interface TextToken {
  kind: 'text';
  value: string;
}
type Token = TagToken | TextToken;

/**
 * Ham HTML'i token'lara ayirir.
 *
 * Yorumlar, `<!DOCTYPE>`, CDATA ve isleme talimatlari TAMAMEN atilir: hicbiri
 * gorunur icerik degil, hepsi ayristirici kacamaklarinin klasik tasiyicisi.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < html.length) {
    const next = html.indexOf('<', index);
    if (next === -1) {
      tokens.push({ kind: 'text', value: html.slice(index) });
      break;
    }
    if (next > index) {
      tokens.push({ kind: 'text', value: html.slice(index, next) });
    }

    // Yorum / DOCTYPE / CDATA — sessizce atilir.
    if (html.startsWith('<!--', next)) {
      const end = html.indexOf('-->', next + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', next) || html.startsWith('<?', next)) {
      const end = html.indexOf('>', next + 2);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    // GECERLI BIR ETIKET BASLANGICI MI: `<` ardindan (istege bagli `/`) bir
    // harf gelmiyorsa bu bir etiket DEGIL, metindeki `<` karakteridir.
    // Buna bakmadan `>` aramak, `5 < 7 & 8</p>` girdisinde mesru `</p>`
    // kapanisini metnin icine yutar ve belgeyi bozardi.
    const afterAngle = html[next + 1] === '/' ? next + 2 : next + 1;
    if (!/[a-zA-Z]/.test(html[afterAngle] ?? '')) {
      tokens.push({ kind: 'text', value: '<' });
      index = next + 1;
      continue;
    }

    const end = html.indexOf('>', next + 1);
    if (end === -1) {
      // Kapanmamis etiket: geri kalani METIN say. Etiket olarak yorumlamak,
      // kirpilmis bir girdiyi ayristiriciyi sasirtma araci yapardi.
      tokens.push({ kind: 'text', value: html.slice(next) });
      break;
    }

    const raw = html.slice(next + 1, end);
    const closing = raw.startsWith('/');
    const body = closing ? raw.slice(1) : raw;
    const nameMatch = body.match(/^[a-zA-Z][a-zA-Z0-9:-]*/);
    if (!nameMatch) {
      // `< 5` gibi bir sey: etiket degil, metin.
      tokens.push({ kind: 'text', value: html.slice(next, end + 1) });
      index = end + 1;
      continue;
    }

    tokens.push({
      kind: 'tag',
      name: nameMatch[0].toLowerCase(),
      closing,
      selfClosing: raw.trimEnd().endsWith('/'),
      raw: body,
    });
    index = end + 1;
  }

  return tokens;
}

/** `<a>` icin — YALNIZCA `href` okunur ve YALNIZCA duz metne cevrilir. */
function readHref(raw: string): string | null {
  const match = raw.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  const value = match?.[2] ?? match?.[3] ?? match?.[4];
  if (!value) return null;
  const decoded = decodeEntities(value).trim();
  // YALNIZCA http/https/mailto GOSTERILIR. `javascript:`, `data:`, `vbscript:`
  // ve semasi belirsiz olan her sey GOSTERILMEZ BILE — duz metin olarak bile
  // yazmak, kopyalayip yapistirmayi kolaylastirir.
  if (!/^(https?:|mailto:)/i.test(decoded)) return null;
  return decoded.slice(0, 300);
}

/**
 * HTML e-posta govdesini GUVENLE RENDER EDILEBILIR hale getirir.
 *
 * Cikti: yalnizca izin listesindeki etiketler, HICBIR oznitelik, uzak kaynak
 * yok, tiklanabilir link yok.
 */
export function sanitizeIntakeHtml(input: string | null | undefined): string {
  if (!input) return '';

  const tokens = tokenize(input.slice(0, MAX_SANITIZED_HTML_LENGTH * 4));
  const out: string[] = [];
  const openStack: string[] = [];
  /** `>0` iken hicbir sey yazilmaz — oldurulen bir elemanin icindeyiz. */
  let killDepth = 0;
  /** Acik `<a>` sayisi: kapanisinda adresi duz metin olarak eklemek icin. */
  const anchorHrefs: (string | null)[] = [];

  for (const token of tokens) {
    if (token.kind === 'text') {
      if (killDepth > 0) continue;
      const decoded = decodeEntities(token.value);
      if (decoded) out.push(escapeText(decoded));
      continue;
    }

    const { name, closing, selfClosing } = token;

    if (KILLED_TAGS.has(name)) {
      if (closing) {
        if (killDepth > 0) killDepth -= 1;
      } else if (!selfClosing && !VOID_TAGS.has(name)) {
        killDepth += 1;
      }
      continue;
    }

    if (killDepth > 0) continue;

    // `<img>`: sessizce dusuyor. Takip pikseli de, gercek gorsel de uzak
    // istektir; ikisini ayirt edecek bir yol YOK.
    if (name === 'img' || name === 'picture' || name === 'meta' || name === 'link' || name === 'base') {
      continue;
    }

    if (name === 'a') {
      if (closing) {
        const href = anchorHrefs.pop() ?? null;
        // Adres DUZ METIN: gorunur ama tiklanamaz.
        if (href) out.push(escapeText(` [${href}] `));
      } else if (!selfClosing) {
        anchorHrefs.push(readHref(token.raw));
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      // Bilinmeyen etiket ACILIYOR: etiket dusuyor, METNI kaliyor.
      continue;
    }

    if (closing) {
      if (VOID_TAGS.has(name)) continue;
      const openIndex = openStack.lastIndexOf(name);
      if (openIndex === -1) continue; // Eslesmeyen kapanis — atilir.
      // Ara etiketleri de kapat: cikti DAIMA dengeli olmali.
      for (let i = openStack.length - 1; i >= openIndex; i -= 1) {
        out.push(`</${openStack[i]}>`);
      }
      openStack.length = openIndex;
      continue;
    }

    if (VOID_TAGS.has(name) || selfClosing) {
      out.push(`<${name}>`);
      continue;
    }

    out.push(`<${name}>`);
    openStack.push(name);
  }

  // Kapanmamis etiketleri kapat — kirpik cikti sayfanin kalanini bozmamali.
  for (let i = openStack.length - 1; i >= 0; i -= 1) {
    out.push(`</${openStack[i]}>`);
  }

  return out.join('').slice(0, MAX_SANITIZED_HTML_LENGTH);
}

/**
 * HTML'den DUZ METIN — arama, cikarim ve ozet icin.
 *
 * Ayni token yolundan geciyor: `<script>` govdesi metne de girmez. Cikarim
 * bu metni okuyacagi icin bu onemli — oldurulen bir elemanin icindeki
 * "talimat" metni, sanki gorunur govdeymis gibi cikarima girmemeli.
 */
export function htmlToPlainText(input: string | null | undefined): string {
  if (!input) return '';

  const tokens = tokenize(input.slice(0, MAX_SANITIZED_HTML_LENGTH * 4));
  const out: string[] = [];
  let killDepth = 0;

  for (const token of tokens) {
    if (token.kind === 'text') {
      if (killDepth > 0) continue;
      out.push(decodeEntities(token.value));
      continue;
    }
    const { name, closing, selfClosing } = token;
    if (KILLED_TAGS.has(name)) {
      if (closing) {
        if (killDepth > 0) killDepth -= 1;
      } else if (!selfClosing && !VOID_TAGS.has(name)) {
        killDepth += 1;
      }
      continue;
    }
    if (killDepth > 0) continue;
    // Blok siniri: satir sonu. Aksi halde iki hucre birlesip tek kelime olur.
    if (['br', 'p', 'div', 'tr', 'li', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(name)) {
      out.push('\n');
    } else if (['td', 'th'].includes(name)) {
      out.push(' ');
    }
  }

  return out
    .join('')
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
    .slice(0, MAX_PLAIN_TEXT_LENGTH);
}
