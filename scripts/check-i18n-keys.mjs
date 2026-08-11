#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const frontendRoot = path.join(repoRoot, 'frontend');
const localesRoot = path.join(frontendRoot, 'src', 'locales');
const sourceRoots = [path.join(frontendRoot, 'components'), path.join(frontendRoot, 'app')];

// const { t } = useTranslation()            -> t reads the default namespace
// const { t: tCommon } = useTranslation('common') -> tCommon reads 'common'
const BINDING = /const\s*\{\s*t(?:\s*:\s*(\w+))?\s*(?:,[^}]*)?\}\s*=\s*useTranslation\(\s*(?:'(\w+)')?\s*\)/g;
const DEFAULT_NS = 'common';

function log(message) {
  console.log(`[check-i18n] ${message}`);
}

async function collectSourceFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(absolutePath);
        if (entry.isFile() && /\.tsx?$/.test(entry.name)) return [absolutePath];
        return [];
      }),
  );

  return nested.flat();
}

async function loadLocales() {
  const languages = (await readdir(localesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const keys = {};
  for (const language of languages) {
    keys[language] = {};
    const files = (await readdir(path.join(localesRoot, language))).filter((name) => name.endsWith('.json'));
    for (const file of files) {
      const namespace = path.basename(file, '.json');
      const parsed = JSON.parse(await readFile(path.join(localesRoot, language, file), 'utf8'));
      keys[language][namespace] = new Set(Object.keys(parsed));
    }
  }

  return { languages, keys };
}

function findNamespacesHolding(keys, language, key) {
  return Object.entries(keys[language])
    .filter(([, set]) => set.has(key))
    .map(([namespace]) => namespace);
}

async function main() {
  const { languages, keys } = await loadLocales();
  if (languages.length === 0) {
    console.error('[check-i18n] no locale directories found');
    process.exit(1);
  }

  const problems = [];

  // 1. Every language must define exactly the same keys, namespace by namespace.
  const [reference, ...others] = languages;
  for (const namespace of Object.keys(keys[reference])) {
    for (const language of others) {
      const theirs = keys[language][namespace];
      if (!theirs) {
        problems.push(`locale ${language} is missing the namespace "${namespace}"`);
        continue;
      }
      for (const key of keys[reference][namespace]) {
        if (!theirs.has(key)) problems.push(`${language}/${namespace}.json is missing "${key}" (present in ${reference})`);
      }
      for (const key of theirs) {
        if (!keys[reference][namespace].has(key)) problems.push(`${reference}/${namespace}.json is missing "${key}" (present in ${language})`);
      }
    }
  }

  // 2. Every t('literal') call must resolve in the namespace its binding actually reads from.
  const files = (await Promise.all(sourceRoots.map(collectSourceFiles))).flat().sort();
  let checkedCalls = 0;
  let dynamicCalls = 0;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const relativePath = path.relative(repoRoot, file);

    const bindings = new Map();
    for (const match of source.matchAll(BINDING)) {
      bindings.set(match[1] ?? 't', match[2] ?? DEFAULT_NS);
    }
    if (bindings.size === 0) continue;

    for (const [variable, namespace] of bindings) {
      dynamicCalls += [...source.matchAll(new RegExp(`\\b${variable}\\(\\s*\``, 'g'))].length;

      for (const match of source.matchAll(new RegExp(`\\b${variable}\\(\\s*'([A-Za-z0-9_.]+)'`, 'g'))) {
        const key = match[1];
        const line = source.slice(0, match.index).split('\n').length;
        checkedCalls += 1;

        for (const language of languages) {
          if (keys[language][namespace]?.has(key)) continue;
          const elsewhere = findNamespacesHolding(keys, language, key);
          problems.push(
            elsewhere.length > 0
              ? `${relativePath}:${line} [${language}] reads "${key}" from namespace "${namespace}", but it is defined in ${elsewhere.join(', ')}`
              : `${relativePath}:${line} [${language}] uses "${key}", which is defined in no namespace`,
          );
        }
      }
    }
  }

  log(
    `languages=${languages.join(',')} files=${files.length} literal_calls=${checkedCalls} template_calls_skipped=${dynamicCalls}`,
  );

  if (problems.length > 0) {
    for (const problem of problems.sort()) console.error(`[check-i18n] ${problem}`);
    console.error(`[check-i18n] FAILED problems=${problems.length}`);
    process.exit(1);
  }

  log('OK — every literal key resolves in its own namespace and all languages match');
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[check-i18n] failed ${message}`);
  process.exit(1);
});
