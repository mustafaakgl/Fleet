#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const localesRoot = path.join(rootDir, 'src', 'locales');
const langs = ['de', 'en', 'tr'];
const scanRoots = ['app', 'components', 'lib', 'src', 'hooks', 'context'];
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function flattenKeys(value, prefix = '', out = new Set()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flattenKeys(v, next, out);
    }
    return out;
  }

  if (prefix) out.add(prefix);
  return out;
}

function listJsonFiles(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

function setDiff(a, b) {
  const missing = [];
  for (const item of a) {
    if (!b.has(item)) missing.push(item);
  }
  return missing;
}

function walkFiles(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
        continue;
      }
      walkFiles(fullPath, out);
      continue;
    }

    if (entry.isFile() && codeExtensions.has(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }

  return out;
}

function collectTranslationKeysFromCode(files) {
  const keys = new Map();
  const regexes = [
    /(?:^|[^\w])t\s*\(\s*(['"`])([^'"`]+)\1/g,
    /i18n\.t\s*\(\s*(['"`])([^'"`]+)\1/g,
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');

    for (const regex of regexes) {
      for (const match of content.matchAll(regex)) {
        const key = match[2]?.trim();
        if (!key) continue;
        if (key.includes('${')) continue;

        if (!keys.has(key)) {
          keys.set(key, []);
        }
        keys.get(key).push(path.relative(rootDir, filePath));
      }
    }
  }

  return keys;
}

function main() {
  const errors = [];
  const warnings = [];

  // 1) JSON syntax check for each locale file.
  const baseFiles = listJsonFiles(path.join(localesRoot, 'de'));
  const fileKeysByLang = new Map();

  for (const lang of langs) {
    const langDir = path.join(localesRoot, lang);
    if (!fs.existsSync(langDir)) {
      errors.push(`[missing-locale-dir] ${langDir}`);
      continue;
    }

    const langFiles = listJsonFiles(langDir);
    const missingFiles = baseFiles.filter((name) => !langFiles.includes(name));
    if (missingFiles.length > 0) {
      errors.push(`[missing-locale-files:${lang}] ${missingFiles.join(', ')}`);
    }

    fileKeysByLang.set(lang, new Map());

    for (const fileName of langFiles) {
      const filePath = path.join(langDir, fileName);
      let parsed;
      try {
        parsed = readJson(filePath);
      } catch (error) {
        errors.push(`[invalid-json:${lang}/${fileName}] ${error.message}`);
        continue;
      }

      fileKeysByLang.get(lang).set(fileName, flattenKeys(parsed));
    }
  }

  // 2) Key set equality across de/en/tr for each locale namespace file.
  for (const fileName of baseFiles) {
    const deKeys = fileKeysByLang.get('de')?.get(fileName);
    const enKeys = fileKeysByLang.get('en')?.get(fileName);
    const trKeys = fileKeysByLang.get('tr')?.get(fileName);

    if (!deKeys || !enKeys || !trKeys) continue;

    const enMissingVsDe = setDiff(deKeys, enKeys);
    const trMissingVsDe = setDiff(deKeys, trKeys);
    const deExtraVsEn = setDiff(enKeys, deKeys);
    const deExtraVsTr = setDiff(trKeys, deKeys);

    if (enMissingVsDe.length > 0) {
      errors.push(`[missing-keys:${fileName}:en] ${enMissingVsDe.join(', ')}`);
    }
    if (trMissingVsDe.length > 0) {
      errors.push(`[missing-keys:${fileName}:tr] ${trMissingVsDe.join(', ')}`);
    }
    if (deExtraVsEn.length > 0) {
      errors.push(`[extra-keys:${fileName}:en] ${deExtraVsEn.join(', ')}`);
    }
    if (deExtraVsTr.length > 0) {
      errors.push(`[extra-keys:${fileName}:tr] ${deExtraVsTr.join(', ')}`);
    }
  }

  // 3) t('...') references in code must exist in locale keys.
  const deAllKeys = new Set();
  for (const keysByFile of fileKeysByLang.get('de')?.values() ?? []) {
    for (const key of keysByFile) deAllKeys.add(key);
  }

  const codeFiles = scanRoots.flatMap((rel) => walkFiles(path.join(rootDir, rel)));
  const referencedKeys = collectTranslationKeysFromCode(codeFiles);

  const missingInLocales = [];
  for (const [key, usedIn] of referencedKeys.entries()) {
    if (!deAllKeys.has(key)) {
      missingInLocales.push({ key, usedIn: usedIn[0] });
    }
  }

  if (missingInLocales.length > 0) {
    for (const item of missingInLocales) {
      warnings.push(`[missing-ref-key] ${item.key} (used in ${item.usedIn})`);
    }
  }

  if (warnings.length > 0) {
    console.warn('i18n-check warnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error('i18n-check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('i18n-check passed');
}

main();
