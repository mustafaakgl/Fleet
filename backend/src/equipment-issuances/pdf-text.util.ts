const TURKISH_REPLACEMENTS: Record<string, string> = {
  İ: 'I',
  ı: 'i',
  Ğ: 'G',
  ğ: 'g',
  Ş: 'S',
  ş: 's',
};

// WinAnsi (cp1252) printable characters: ASCII, Latin-1 supplement and the
// cp1252-specific extras. Everything else breaks pdf-lib standard fonts.
const WIN_ANSI_SAFE = /[\u0020-\u007e\u00a0-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/;

export function toWinAnsiSafeText(input: string): string {
  let normalized = '';
  for (const char of input) {
    normalized += TURKISH_REPLACEMENTS[char] ?? char;
  }
  let result = '';
  for (const char of normalized) {
    result += WIN_ANSI_SAFE.test(char) ? char : '?';
  }
  return result;
}
