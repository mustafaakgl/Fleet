/**
 * Binary assets PDF/A-3b conformance requires, loaded once and cached.
 *
 * Fonts — Liberation Sans (Regular + Bold), SIL Open Font License 1.1.
 *   PDF/A forbids relying on the standard-14 fonts because their programs are not
 *   embedded. Liberation Sans is metric-compatible with Helvetica/Arial, so the invoice
 *   layout is unchanged, and it covers Latin including German and Turkish characters.
 *   Source: liberationfonts/liberation-fonts 2.1.5.
 *   License text: assets/fonts/LICENSE-LiberationSans.txt
 *
 * Colour profile — sRGB v2 "micro", CC0-1.0 (public domain dedication).
 *   PDF/A-3b needs an OutputIntent whenever device colour spaces are used. This is a
 *   456-byte minimal but valid sRGB profile, which keeps the invoice PDFs small.
 *   Source: saucecontrol/Compact-ICC-Profiles.
 *   License text: assets/icc/LICENSE-sRGB-CC0.txt
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Assets live next to the compiled sources, so resolve from this file rather than from
 * the process working directory — the app is started from several different places.
 */
const ASSETS_DIR = join(__dirname, '..', '..', '..', 'assets');

export const LIBERATION_SANS_LICENSE = 'SIL Open Font License 1.1';
export const SRGB_PROFILE_LICENSE = 'CC0-1.0';

/** Written into the PDF's OutputIntent as the profile's human-readable identifier. */
export const SRGB_OUTPUT_CONDITION = 'sRGB IEC61966-2.1';

let regularFont: Buffer | null = null;
let boldFont: Buffer | null = null;
let srgbProfile: Buffer | null = null;

export function loadRegularFont(): Buffer {
  regularFont ??= readFileSync(join(ASSETS_DIR, 'fonts', 'LiberationSans-Regular.ttf'));
  return regularFont;
}

export function loadBoldFont(): Buffer {
  boldFont ??= readFileSync(join(ASSETS_DIR, 'fonts', 'LiberationSans-Bold.ttf'));
  return boldFont;
}

export function loadSrgbProfile(): Buffer {
  srgbProfile ??= readFileSync(join(ASSETS_DIR, 'icc', 'sRGB-v2-micro.icc'));
  return srgbProfile;
}
