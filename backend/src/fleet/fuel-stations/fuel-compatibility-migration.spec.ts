import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { FuelCompatibilitySource, FuelProductType, FuelProductUsage } from '@prisma/client';

/**
 * Migration'in GUVENLI olmasi.
 *
 * Iddia sunlar: yalnizca yeni nesne yaratiliyor, mevcut veriye dokunulmuyor ve
 * eski bir kolondan tahmin yurutulerek backfill YAPILMIYOR. Bu son madde
 * onemli — "kamyon herhalde dizeldir" diye doldurulmus bir tablo, yanlis yakit
 * alinmasina yol acan sessiz bir hataya donusur.
 */

const MIGRATION_DIR = '20260812090000_vehicle_fuel_compatibility';
const migrationSql = readFileSync(
  path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', MIGRATION_DIR, 'migration.sql'),
  'utf8',
);

/** Yorum satirlarini atar — yorumlarda gecen kelimeler iddiayi bozmasin. */
const statements = migrationSql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('vehicle fuel compatibility migration', () => {
  it('creates the table, the three enums and the unique index', () => {
    assert.match(statements, /CREATE TABLE "vehicle_fuel_compatibility"/);
    assert.match(statements, /CREATE TYPE "FuelProductType"/);
    assert.match(statements, /CREATE TYPE "FuelProductUsage"/);
    assert.match(statements, /CREATE TYPE "FuelCompatibilitySource"/);
    assert.match(
      statements,
      /CREATE UNIQUE INDEX[\s\S]*"tenantId", "vehicleId", "productType", "usageType"/,
    );
  });

  it('touches no existing data — no UPDATE, DELETE, DROP, INSERT or TRUNCATE statement', () => {
    // Ifade bazli kontrol: `ON UPDATE CASCADE` bir FK kurali, veri degistiren
    // bir ifade DEGIL — kaba metin aramasi onu yanlislikla yakaliyordu.
    const dataMutating = [
      /\bUPDATE\s+"/i,
      /\bDELETE\s+FROM\b/i,
      /\bINSERT\s+INTO\b/i,
      /\bTRUNCATE\b/i,
      /\bDROP\s+(TABLE|TYPE|COLUMN|INDEX|CONSTRAINT|SCHEMA)\b/i,
      /\bALTER\s+TABLE\s+"(Vehicle|Tenant)"/i,
    ];

    for (const pattern of dataMutating) {
      assert.equal(
        pattern.test(statements),
        false,
        `migration must not contain a statement matching ${pattern}`,
      );
    }
  });

  it('does not backfill from any legacy fuel column', () => {
    // Repo'da `fuelType` diye bir alan hic yok; migration da boyle bir kolondan
    // deger turetmeye CALISMAMALI.
    assert.equal(statements.includes('fuelType'), false);
    assert.equal(statements.includes('fuel_type'), false);
    assert.equal(statements.toUpperCase().includes('SELECT'), false);
  });

  it('targets the unmapped Tenant and Vehicle tables (repo FK rule)', () => {
    assert.match(statements, /REFERENCES "Tenant"\("id"\)/);
    assert.match(statements, /REFERENCES "Vehicle"\("id"\)/);
  });

  it('keeps every enum value the application relies on', () => {
    // Prisma istemcisi ile SQL arasinda kayma olursa burada yakalanir.
    for (const value of Object.values(FuelProductType)) {
      assert.equal(statements.includes(`'${value}'`), true, `${value} missing from SQL enum`);
    }
    for (const value of Object.values(FuelProductUsage)) {
      assert.equal(statements.includes(`'${value}'`), true, `${value} missing from SQL enum`);
    }
    for (const value of Object.values(FuelCompatibilitySource)) {
      assert.equal(statements.includes(`'${value}'`), true, `${value} missing from SQL enum`);
    }
  });

  it('models AdBlue as a product plus an ADDITIVE usage, not a primary fuel', () => {
    assert.equal(Object.values(FuelProductType).includes(FuelProductType.ADBLUE), true);
    assert.equal(Object.values(FuelProductUsage).includes(FuelProductUsage.ADDITIVE), true);
  });
});
