import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * TACHO DEMO SEED — PARA BIRIMI SOZLESMESI.
 *
 * NEDEN KAYNAK METNI OKUYORUZ: bu bir `.mjs` script'i; kendi Prisma
 * istemcisini kuruyor ve `main()` calistirinca CANLI VERITABANINA yaziyor.
 * Testin icinde calistirmak, birim testini bir veritabani kurulumuna bagimli
 * kilardi. Olculmesi gereken sey zaten davranis degil SOZLESME: "her iki
 * yazma yolu da `currency` yaziyor mu ve deger KIRACIDAN mi geliyor".
 *
 * Bu dosya gercek bir hatanin karsiligi: script `Assignment.currency`
 * alanini hic gondermiyordu ve `Argument \`currency\` is missing` ile
 * duşuyordu — codec8/tacho dogrulamasi bu yuzden hic calismadi.
 */

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/seed-tacho-demo.mjs');
const SOURCE = readFileSync(SCRIPT_PATH, 'utf8');

/** Yorumlar cikarilmis kaynak — iddialar GERCEK KOD uzerinde olculsun. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function blockAfter(marker: string, length = 900): string {
  const index = CODE.indexOf(marker);
  assert.notEqual(index, -1, `kaynakta bulunamadi: ${marker}`);
  return CODE.slice(index, index + length);
}

describe('seed-tacho-demo — para birimi', () => {
  it('SOZDIZIMI gecerli', () => {
    // Script calistirilmadan once en azindan ayristirilabilmeli.
    execFileSync(process.execPath, ['--check', SCRIPT_PATH], { stdio: 'pipe' });
  });

  it('OLUSTURMA yolu `currency` yaziyor', () => {
    const block = blockAfter('prisma.assignment.create(');
    assert.match(block, /currency:\s*tenantBaseCurrency/);
  });

  it('GUNCELLEME yolu da `currency` yaziyor', () => {
    // Yalnizca `create`e yazsaydik, ilk kosuda acilmis gorev eski birimde
    // kalir ve maliyet toplamlarindan sessizce duserdi.
    const block = blockAfter('prisma.assignment.update(');
    assert.match(block, /currency:\s*tenantBaseCurrency/);
  });

  it('deger KIRACI KAYDINDAN okunuyor', () => {
    assert.match(CODE, /const\s+tenantBaseCurrency\s*=\s*await\s+resolveTenantBaseCurrency\(/);
    const resolver = blockAfter('async function resolveTenantBaseCurrency');
    assert.match(resolver, /prisma\.tenant\.findUnique/);
    assert.match(resolver, /select:\s*\{\s*baseCurrency:\s*true\s*\}/);
  });

  it('kiraci UPSERT EDILDIKTEN SONRA okunuyor', () => {
    // Yeni olusturulan bir kiracida deger ancak upsert'ten sonra kesinlesir.
    const upsertIndex = CODE.indexOf('prisma.tenant.upsert(');
    const resolveIndex = CODE.indexOf('await resolveTenantBaseCurrency(');
    assert.notEqual(upsertIndex, -1);
    assert.notEqual(resolveIndex, -1);
    assert.ok(resolveIndex > upsertIndex, 'para birimi upsert`ten ONCE okunuyor');
  });

  it('SABIT para birimi ya da fallback YOK', () => {
    // Ne `'EUR'` sabiti, ne `?? '...'`, ne `|| '...'` bicimli bir fallback.
    assert.doesNotMatch(CODE, /currency:\s*['"][A-Za-z]{3}['"]/);
    assert.doesNotMatch(CODE, /baseCurrency[^\n]*\?\?\s*['"][A-Za-z]{3}['"]/);
    assert.doesNotMatch(CODE, /tenantBaseCurrency[^\n]*\|\|\s*['"][A-Za-z]{3}['"]/);
    assert.doesNotMatch(CODE, /['"]EUR['"]/);
  });

  it('gecersiz `baseCurrency` FAIL-FAST — sessizce duzeltilmiyor', () => {
    const resolver = blockAfter('async function resolveTenantBaseCurrency');
    assert.match(resolver, /trim\(\)\.toUpperCase\(\)/);
    assert.match(resolver, /\^\[A-Z\]\{3\}\$/);
    assert.match(resolver, /throw new Error/);
  });

  it('kiracinin mevcut `baseCurrency` degeri seed sirasinda DEGISTIRILMIYOR', () => {
    // `tenant.upsert` govdesinde `baseCurrency` yazan bir satir olmamali.
    const block = blockAfter('prisma.tenant.upsert(', 400);
    assert.doesNotMatch(block, /baseCurrency\s*:/);
  });
});
