/**
 * Ensure every locale has all keys from the reference (de) tree.
 * Missing values are copied from de (placeholder until translated).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

type Tree = Record<string, unknown>;

function deepMergeMissing(target: Tree, source: Tree): Tree {
  const out: Tree = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child = (out[key] && typeof out[key] === 'object' ? out[key] : {}) as Tree;
      out[key] = deepMergeMissing(child, value as Tree);
    } else if (!(key in out)) {
      out[key] = value;
    }
  }
  return out;
}

const localesDir = path.join(__dirname, '..', 'src', 'locales');
const refLang = 'de';
const ref = JSON.parse(
  fs.readFileSync(path.join(localesDir, refLang, 'common.json'), 'utf8'),
) as Tree;

const langs = fs.readdirSync(localesDir).filter((name) => {
  return fs.existsSync(path.join(localesDir, name, 'common.json'));
});

for (const lang of langs) {
  if (lang === refLang) continue;
  const file = path.join(localesDir, lang, 'common.json');
  const current = JSON.parse(fs.readFileSync(file, 'utf8')) as Tree;
  const merged = deepMergeMissing(current, ref);
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Synced ${lang}`);
}
