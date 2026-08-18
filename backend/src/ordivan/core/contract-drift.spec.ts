import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  CONTRACT_VERSION,
  exportContractIndex,
  exportJsonSchemas,
  renderOpenApiYaml,
} from './contract-export';
import { JOB_TYPES, PROPOSAL_TYPES } from './job-type-registry';
import { validateObject } from './schema-validation';

/**
 * PROTOKOL DRIFT TESTI (Faz 12 ek sartname).
 *
 * Diskteki sozlesme dosyalari, calisan kodun URETTIGIYLE birebir ayni olmali.
 * Registry ya da DTO degisip dosyalar guncellenmezse bu test KIRILIR —
 * "yaziyla anlatilan protokol" ile "gercekte konusulan protokol" arasinda
 * sessiz bir fark kalamaz.
 *
 * Duzeltme yolu tek: `npm --prefix backend run ordivan:contract`.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SCHEMA_DIR = path.join(REPO_ROOT, 'contracts', 'ordivan');
const OPENAPI_PATH = path.join(REPO_ROOT, 'docs', 'ordivan-connector.openapi.yaml');

const REGENERATE = 'npm --prefix backend run ordivan:contract';

describe('ordivan sozlesmesi — drift', () => {
  it('OpenAPI dosyasi uretilenle BIREBIR ayni', () => {
    const onDisk = readFileSync(OPENAPI_PATH, 'utf8');
    assert.equal(
      onDisk,
      renderOpenApiYaml(),
      `OpenAPI dosyasi kodla ayrismis — calistir: ${REGENERATE}`,
    );
  });

  it('JSON Schema dosyalari uretilenle BIREBIR ayni', () => {
    for (const exported of exportJsonSchemas()) {
      const onDisk = readFileSync(path.join(SCHEMA_DIR, exported.fileName), 'utf8');
      assert.equal(
        onDisk,
        `${JSON.stringify(exported.schema, null, 2)}\n`,
        `${exported.fileName} kodla ayrismis — calistir: ${REGENERATE}`,
      );
    }
  });

  it('fazladan ya da eksik sema dosyasi yok', () => {
    const onDisk = readdirSync(SCHEMA_DIR)
      .filter((name) => name.endsWith('.schema.json'))
      .sort();
    const generated = exportJsonSchemas().map((item) => item.fileName).sort();

    assert.deepEqual(onDisk, generated, `sema dosyalari ayrismis — calistir: ${REGENERATE}`);
  });

  it('index her is ve oneri turunu surumleriyle tasir', () => {
    const onDisk = JSON.parse(
      readFileSync(path.join(SCHEMA_DIR, 'index.json'), 'utf8'),
    ) as {
      contractVersion: string;
      jobTypes: Array<{ jobType: string }>;
      proposalTypes: Array<{ proposalType: string }>;
    };
    assert.deepEqual(onDisk, exportContractIndex(), `index ayrismis — calistir: ${REGENERATE}`);

    assert.equal(onDisk.contractVersion, CONTRACT_VERSION);
    assert.deepEqual(
      onDisk.jobTypes.map((item) => item.jobType).sort(),
      [...JOB_TYPES].sort(),
    );
    assert.deepEqual(
      onDisk.proposalTypes.map((item) => item.proposalType).sort(),
      [...PROPOSAL_TYPES].sort(),
    );
  });

  it('uretilen sema, dogrulayicinin "fazla alan reddedilir" kuralini yansitir', () => {
    // Sozlesme, calisan davranistan DAHA GEVSEK gorunmemeli: disaridan bakan
    // biri fazladan alan gonderebilecegini sanmamali.
    for (const exported of exportJsonSchemas()) {
      assert.equal(
        exported.schema.additionalProperties,
        false,
        `${exported.fileName}: additionalProperties acik birakilmis`,
      );
    }
  });

  it('sema surumleri dosya ADINDA tasiniyor — eski surum silinmeden yenisi eklenir', () => {
    for (const exported of exportJsonSchemas()) {
      assert.match(exported.fileName, /\.v\d+\.schema\.json$/);
    }
  });

  it('sozlesme ile dogrulayici AYNI kaynagi kullaniyor', () => {
    // Ayni girdi hem sema uretiminde hem calisma zamani dogrulamasinda ayni
    // sonucu vermeli: bagimsiz iki kopya olsaydi burasi kacardi.
    const echo = exportJsonSchemas().find((item) =>
      item.fileName.startsWith('proposal.system.echo_result'),
    )!;
    const properties = echo.schema.properties as Record<string, { maxLength?: number }>;

    assert.equal(properties.echoed.maxLength, 500);
    assert.throws(() =>
      validateObject({ echoed: 'x'.repeat(501) }, { echoed: { type: 'string', maxLength: 500 } }),
    );
  });
});
