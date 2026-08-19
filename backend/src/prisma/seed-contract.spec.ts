import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * SEED SOZLESMESI — DERLEME VE PARA BIRIMI.
 *
 * NEDEN BU DOSYA VAR: `Assignment.currency` semaya ZORUNLU olarak eklendiginde
 * `prisma/seed.ts` derlenemez hale geldi, ama batarya YESIL kaldi ve bozukluk
 * ancak birisi `npx prisma db seed` calistirinca ortaya cikti.
 *
 * KOR NOKTANIN SEBEBI: `tsconfig.json` yalnizca `src/**` iceriyor. Yani
 * `npx tsc -p tsconfig.json` seed'e HIC BAKMIYOR. Bu testler o bosluğu
 * kapatiyor — seed artik bataryanin bir parcasi.
 *
 * NEDEN `--transpile-only` ILE GECILMEDI: o bayrak tip denetimini kapatir ve
 * hatayi cozmez, GIZLER. Eksik `currency` ile calisan bir seed, veritabanina
 * yanlis para biriminde gorev yazardi — derleme hatasi burada bir engel degil,
 * calisan bir korumaydi.
 */

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const SEED_PATH = path.join(BACKEND_ROOT, 'prisma/seed.ts');
const seedSource = readFileSync(SEED_PATH, 'utf8');

/**
 * Bir cagri govdesini PARANTEZ DENGESIYLE cikarir.
 *
 * Sabit uzunlukta dilim almak (`slice(index, index + 400)`) komsu koda tasar
 * ve testi yanlis yerde dogru/yanlis gosterir — bu yardimci tam olarak onu
 * onlemek icin var.
 */
function callBody(source: string, startIndex: number): string {
  const open = source.indexOf('(', startIndex);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return source.slice(open);
}

/** `prisma.assignment.<op>({ ... })` govdesini cikarir. */
function assignmentWriteBlocks(): Array<{ op: string; body: string }> {
  const blocks: Array<{ op: string; body: string }> = [];
  const pattern = /prisma\.assignment\.(create|update|upsert|createMany)\s*\(/g;

  for (const match of seedSource.matchAll(pattern)) {
    blocks.push({ op: match[1]!, body: callBody(seedSource, match.index!) });
  }

  return blocks;
}

describe('Seed — DERLEME', () => {
  it('`prisma/seed.ts` TAM TIPLE derleniyor', () => {
    // `--transpile-only` YOK: gercek tip denetimi kosuyor.
    const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.seed.json'], {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env: process.env,
    });

    assert.equal(
      result.status,
      0,
      `seed derlenmiyor:\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  });

  it('seed komutu tip denetimini ATLAMIYOR', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'),
    ) as { prisma?: { seed?: string } };

    const command = packageJson.prisma?.seed ?? '';
    assert.match(command, /ts-node/, 'seed komutu ts-node kullanmali');
    // `--transpile-only` hatayi cozmez, GIZLER.
    assert.equal(
      command.includes('--transpile-only'),
      false,
      'seed komutu --transpile-only ile tip denetimini atliyor',
    );
    assert.equal(command.includes('--swc'), false, 'seed komutu tip denetimini atliyor');
  });

  it('seed AYRI bir tsconfig ile denetleniyor — ana yapi bozulmadan', () => {
    const seedConfig = path.join(BACKEND_ROOT, 'tsconfig.seed.json');
    const raw = readFileSync(seedConfig, 'utf8');
    assert.match(raw, /"include"[\s\S]*prisma/);

    // Ana tsconfig `src` disina CIKMAMALI: `rootDir: ./src` ile `prisma`yi
    // include etmek derlemeyi kirardi. Kor noktayi ayri dosya kapatiyor.
    const mainConfig = readFileSync(path.join(BACKEND_ROOT, 'tsconfig.json'), 'utf8');
    assert.equal(mainConfig.includes('prisma/**'), false);
  });
});

describe('Seed — GOREV PARA BIRIMI', () => {
  it('gorev yazan HER yol `currency` aliyor', () => {
    const blocks = assignmentWriteBlocks();
    // En az bir create ve bir update yolu var; sayilari degisebilir ama
    // HICBIRI para birimsiz olamaz.
    assert.ok(blocks.length >= 2, `gorev yazma yolu bulunamadi: ${blocks.length}`);

    for (const block of blocks) {
      assert.match(
        block.body,
        /\bcurrency\s*:/,
        `prisma.assignment.${block.op} para birimi yazmiyor`,
      );
    }
  });

  it('para birimi KIRACIDAN geliyor — sabit deger YOK', () => {
    for (const block of assignmentWriteBlocks()) {
      const currencyLine = block.body
        .split('\n')
        .find((line) => /\bcurrency\s*:/.test(line))!;

      // `currency: 'EUR'` gibi bir sabit, TRY tabanli bir kiracinin
      // gorevlerini sessizce yanlis birimde acardi.
      assert.equal(
        /currency\s*:\s*['"`]/.test(currencyLine),
        false,
        `sabit para birimi: ${currencyLine.trim()}`,
      );
      assert.match(currencyLine, /params\.currency/, `beklenmeyen kaynak: ${currencyLine.trim()}`);
    }
  });

  it('FALLBACK YOK — `?? \'EUR\'` gibi bir kacis yolu yazilmamis', () => {
    const resolver = seedSource.slice(
      seedSource.indexOf('async function resolveTenantBaseCurrency'),
      seedSource.indexOf('async function main'),
    );
    assert.ok(resolver.length > 0, 'resolveTenantBaseCurrency bulunamadi');

    // Deger okunamiyorsa seed DURMALI, varsayilana dusmemeli.
    assert.equal(/\?\?\s*['"`][A-Z]{3}['"`]/.test(resolver), false, 'para birimi fallback`i var');
    assert.match(resolver, /throw new Error/, 'gecersiz para biriminde seed durmuyor');
  });

  it('para birimi KIRACININ kaydindan okunuyor', () => {
    assert.match(seedSource, /prisma\.tenant\.findUnique[\s\S]{0,200}baseCurrency/);
    assert.match(seedSource, /resolveTenantBaseCurrency\(SEED_TENANT_ID\)/);
  });

  it('kiracinin `baseCurrency`si seed tarafindan EZILMIYOR', () => {
    // Upsert `update: {}` olmali: var olan bir kiracinin temel para birimini
    // seed'in degistirmesi, gecmis tutarlarin anlamini sessizce degistirirdi.
    const tenantUpsert = callBody(seedSource, seedSource.indexOf('prisma.tenant.upsert'));
    assert.match(tenantUpsert, /update:\s*\{\s*\}/);
    assert.equal(tenantUpsert.includes('baseCurrency'), false);
  });
});
