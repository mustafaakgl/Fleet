/// <reference types="node" />
/**
 * Sozlesme dosyalarini URETIR.
 *
 * Kaynak calisan koddur; bu script yalnizca onu diske yazar. Elle duzenlenen
 * bir kopya birakmamanin yolu bu.
 *
 * Calistir: npm --prefix backend run ordivan:contract
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  exportContractIndex,
  exportJsonSchemas,
  renderOpenApiYaml,
} from '../src/ordivan/core/contract-export';

const repoRoot = path.resolve(__dirname, '../..');
const schemaDir = path.join(repoRoot, 'contracts', 'ordivan');
const openApiPath = path.join(repoRoot, 'docs', 'ordivan-connector.openapi.yaml');

mkdirSync(schemaDir, { recursive: true });

for (const exported of exportJsonSchemas()) {
  writeFileSync(
    path.join(schemaDir, exported.fileName),
    `${JSON.stringify(exported.schema, null, 2)}\n`,
    'utf8',
  );
}

writeFileSync(
  path.join(schemaDir, 'index.json'),
  `${JSON.stringify(exportContractIndex(), null, 2)}\n`,
  'utf8',
);

writeFileSync(openApiPath, renderOpenApiYaml(), 'utf8');

console.log(`[ordivan-contract] wrote ${exportJsonSchemas().length} schemas + index + openapi`);
