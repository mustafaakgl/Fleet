import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * P0 fixture'ini KOSU BASINA BIR KEZ kurar.
 *
 * NEDEN GEREKLI: birden fazla spec dosyasi ayni QA kiracisini kullaniyor ve
 * Playwright bunlari AYRI WORKER SURECLERINDE paralel calistiriyor. Her dosya
 * kendi `beforeAll`inde seed calistirinca, biri veriyi yeniden kurarken digeri
 * testin ortasinda kaliyordu — sonuc, sirasina gore bazen gecen bazen dusen
 * bir suite. Modul seviyesinde bir bayrak yetmez: worker'lar ayri surec,
 * bellegi paylasmiyorlar.
 *
 * COZUM DOSYA SISTEMI UZERINDEN: manifest yeterince taze ise yeniden seed
 * EDILMEZ. Boylece hangi worker once baslarsa baslasin, veri tek bir kez
 * kurulur ve kimse calisan bir testin altindan veriyi cekmez.
 */

const E2E_ROOT = path.resolve(__dirname, '../..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');

/**
 * Manifest bu sureden yeniyse yeniden kurulmaz.
 *
 * Tek bir Playwright kosusunu rahatca kapsayacak kadar uzun; bir sonraki
 * kosuda bayat veriyle calismayacak kadar kisa.
 */
const FRESH_ENOUGH_MS = 10 * 60 * 1000;

export type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';

export interface FixtureManifest {
  tenantA: { tenantId: string; users: Record<Role, { id: string; email: string; role: Role }> };
  tenantB?: { tenantId: string; users: Record<Role, { id: string; email: string; role: Role }> };
  accessTokens: Record<string, Record<Role, string>>;
}

function isFreshEnough(): boolean {
  if (!existsSync(FIXTURE_PATH)) return false;
  return Date.now() - statSync(FIXTURE_PATH).mtimeMs < FRESH_ENOUGH_MS;
}

export function ensureP0Fixture(): FixtureManifest {
  if (!isFreshEnough()) {
    try {
      execFileSync('npm', ['run', 'seed:p0-qa'], {
        cwd: BACKEND_ROOT,
        env: process.env,
        stdio: 'pipe',
      });
    } catch (error) {
      // Baska bir worker tam bu anda seed etmis olabilir: seed script'i
      // tekil kisita takilir. Manifest varsa bu bir hata degil.
      if (!existsSync(FIXTURE_PATH)) throw error;
    }
  }

  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
}

/** Rolun erisim jetonu; fixture o kiraciyi tasimiyorsa null. */
export function fixtureToken(
  fixture: FixtureManifest,
  role: Role,
  tenant: 'tenantA' | 'tenantB' = 'tenantA',
): string | null {
  const scope = fixture[tenant];
  if (!scope) return null;
  return fixture.accessTokens[scope.tenantId]?.[role] ?? null;
}
