#!/usr/bin/env node
/**
 * Runs our generated e-invoice samples through the official validators.
 *
 *   Mustang CLI  → PDF/A conformance (bundled veraPDF) + EN 16931 CII schematron
 *   KoSIT        → XRechnung: UBL 2.1 XSD + EN 16931 schematron + XRechnung CIUS
 *
 * The point is to be judged by the reference implementations rather than by our own
 * reading of the specs. Deliberately NOT part of `npm test`: it needs a JDK and pulls
 * ~78 MB of jars, which would make the normal battery slow and flaky.
 *
 * Usage:
 *   node scripts/validate-einvoice.mjs                 validate, report, exit 1 on error
 *   node scripts/validate-einvoice.mjs --expect-valid  also use Mustang's own gate action
 *   node scripts/validate-einvoice.mjs --skip-generate reuse existing samples
 *
 * Tool downloads are cached in tmp/einvoice-tools (override with EINVOICE_TOOLS_DIR)
 * and checksum-verified, so CI can cache the directory and stay reproducible.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { generateSamples } from './generate-einvoice-samples.mjs';

/* ------------------------------------------------------------------ pinned tools */

const MUSTANG_VERSION = '2.17.0';
const KOSIT_VALIDATOR_VERSION = '1.6.2';
/** Release tag of the XRechnung scenario configuration (the engine ships no rules). */
const KOSIT_CONFIG_TAG = 'v2026-01-31';
const KOSIT_CONFIG_FILE = 'xrechnung-3.0.2-validator-configuration-2026-01-31.zip';

const TOOLS = [
  {
    id: 'mustang',
    fileName: `Mustang-CLI-${MUSTANG_VERSION}.jar`,
    url: `https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/${MUSTANG_VERSION}/Mustang-CLI-${MUSTANG_VERSION}.jar`,
    sha256: 'c4d5379b6209fe4a52878d634237e16d6ef1442d2a8bedbcec0b4eb7e3240507',
  },
  {
    id: 'kosit',
    fileName: `validator-${KOSIT_VALIDATOR_VERSION}-standalone.jar`,
    url: `https://github.com/itplr-kosit/validator/releases/download/v${KOSIT_VALIDATOR_VERSION}/validator-${KOSIT_VALIDATOR_VERSION}-standalone.jar`,
    sha256: '244978514ad48f67c7573acfffc8f4fd73d81feda6f276710033f9913579857e',
  },
  {
    id: 'kosit-config',
    fileName: 'xrechnung-config.zip',
    url: `https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/${KOSIT_CONFIG_TAG}/${KOSIT_CONFIG_FILE}`,
    sha256: '6a5a5911a421b25fbc423f62f93f894df7b236f5d73ca4f84bb222a945082704',
    unpackTo: 'xrechnung-config',
  },
];

const TOOLS_DIR = resolve(process.env.EINVOICE_TOOLS_DIR ?? join(process.cwd(), 'tmp', 'einvoice-tools'));
const SAMPLES_DIR = resolve(join(process.cwd(), 'tmp', 'einvoice-samples'));
const REPORTS_DIR = resolve(join(process.cwd(), 'tmp', 'einvoice-reports'));

/* ------------------------------------------------------------------- tool setup */

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options });
}

function ensureJava() {
  const probe = run('java', ['-version']);
  if (probe.error || probe.status !== 0) {
    console.error('[validate] a Java runtime is required (JDK 17+). Install one or set JAVA_HOME.');
    process.exit(2);
  }
  const version = (probe.stderr ?? '').split('\n')[0].trim();
  console.log(`[validate] using ${version}`);
}

function download(tool) {
  const target = join(TOOLS_DIR, tool.fileName);
  if (existsSync(target) && sha256(target) === tool.sha256) {
    console.log(`[validate] cached ${tool.fileName}`);
    return target;
  }

  console.log(`[validate] downloading ${tool.fileName} …`);
  const result = run('curl', ['-sSL', '--fail', '--max-time', '600', '-o', target, tool.url]);
  if (result.status !== 0) {
    throw new Error(`download failed for ${tool.url}: ${result.stderr ?? ''}`);
  }

  const actual = sha256(target);
  if (actual !== tool.sha256) {
    rmSync(target, { force: true });
    throw new Error(
      `checksum mismatch for ${tool.fileName}\n  expected ${tool.sha256}\n  actual   ${actual}`,
    );
  }
  return target;
}

function prepareTools() {
  mkdirSync(TOOLS_DIR, { recursive: true });
  const paths = {};
  for (const tool of TOOLS) {
    const file = download(tool);
    paths[tool.id] = file;
    if (tool.unpackTo) {
      const dir = join(TOOLS_DIR, tool.unpackTo);
      if (!existsSync(join(dir, 'scenarios.xml'))) {
        mkdirSync(dir, { recursive: true });
        const unzip = run('unzip', ['-oq', file, '-d', dir]);
        if (unzip.status !== 0) throw new Error(`unzip failed: ${unzip.stderr ?? ''}`);
      }
      paths[`${tool.id}-dir`] = dir;
    }
  }
  return paths;
}

/* ---------------------------------------------------------------- report parsing */

function stripTags(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mustang prints log noise before the XML report; keep everything from the root element. */
function isolateXml(output) {
  const index = output.indexOf('<?xml');
  return index >= 0 ? output.slice(index) : output;
}

function parseMustangReport(xml) {
  const findings = [];

  const pdfSection = /<pdf>([\s\S]*?)<\/pdf>/.exec(xml);
  if (pdfSection) {
    const seen = new Map();
    const pattern =
      /ruleId=RuleId \[specification=([^,]+), clause=([^,]+), testNumber=(\d+)\], status=failed, message=([\s\S]*?)(?=\], TestAssertion|\]\]|$)/g;
    for (const match of pdfSection[1].matchAll(pattern)) {
      const key = `${match[2]}#${match[3]}`;
      if (!seen.has(key)) {
        seen.set(key, {
          level: 'error',
          code: `PDF/A ${match[2]} test ${match[3]}`,
          message: match[4].replace(/\s+/g, ' ').split(', location=')[0].trim(),
        });
      }
    }
    findings.push(...seen.values());
  }

  for (const match of xml.matchAll(/<(error|notice|warning)[^>]*>([\s\S]*?)<\/\1>/g)) {
    findings.push({
      level: match[1] === 'error' ? 'error' : match[1],
      code: 'CII',
      message: stripTags(match[2]),
    });
  }

  const summaries = [...xml.matchAll(/<summary status="([^"]+)"\/>/g)].map((match) => match[1]);
  return { findings, valid: summaries.length > 0 && summaries[summaries.length - 1] === 'valid' };
}

function parseKositReport(xml) {
  const findings = [];
  for (const match of xml.matchAll(
    /<rep:message[^>]*level="([^"]*)"[^>]*code="([^"]*)"[^>]*>([\s\S]*?)<\/rep:message>/g,
  )) {
    findings.push({ level: match[1], code: match[2], message: stripTags(match[3]) });
  }
  if (/<rep:noScenarioMatched/.test(xml)) {
    findings.push({
      level: 'error',
      code: 'no-scenario',
      message:
        'No KoSIT scenario matched — check cbc:CustomizationID against the configured XRechnung version',
    });
  }
  return { findings, valid: !/<rep:reject>/.test(xml) };
}

/* -------------------------------------------------------------------- validation */

function validatePdf(mustangJar, file, expectValid) {
  const action = expectValid ? 'validateExpectValid' : 'validate';
  const result = run('java', [
    '-jar',
    mustangJar,
    '--action',
    action,
    '--source',
    file,
    '--disable-file-logging',
  ]);
  const xml = isolateXml(result.stdout ?? '');
  writeFileSync(join(REPORTS_DIR, `${fileStem(file)}-mustang.xml`), xml || (result.stderr ?? ''));

  const parsed = parseMustangReport(xml);
  // validateExpectValid signals the verdict through the exit code; validate uses 255.
  const valid = expectValid ? result.status === 0 : parsed.valid;
  return { ...parsed, valid };
}

function validateUbl(kositJar, configDir, files) {
  if (files.length === 0) return [];
  const outDir = join(REPORTS_DIR, 'kosit');
  mkdirSync(outDir, { recursive: true });

  const result = run('java', [
    '-jar',
    kositJar,
    '-s',
    join(configDir, 'scenarios.xml'),
    '-r',
    configDir,
    '-o',
    outDir,
    ...files,
  ]);
  if (result.error) throw result.error;

  return files.map((file) => {
    const reportPath = join(outDir, `${fileStem(file)}-report.xml`);
    if (!existsSync(reportPath)) {
      return {
        file,
        valid: false,
        findings: [{ level: 'error', code: 'no-report', message: 'KoSIT produced no report' }],
      };
    }
    return { file, ...parseKositReport(readFileSync(reportPath, 'utf8')) };
  });
}

function fileStem(file) {
  return file.split('/').pop().replace(/\.[^.]+$/, '');
}

/* -------------------------------------------------------------------------- main */

async function main() {
  const expectValid = process.argv.includes('--expect-valid');
  const skipGenerate = process.argv.includes('--skip-generate');

  ensureJava();
  const tools = prepareTools();

  mkdirSync(REPORTS_DIR, { recursive: true });
  if (!skipGenerate) {
    const written = await generateSamples(SAMPLES_DIR);
    console.log(`[validate] generated ${written.length} sample files`);
  }

  const samples = readdirSync(SAMPLES_DIR).sort();
  const pdfs = samples.filter((name) => name.endsWith('.pdf')).map((name) => join(SAMPLES_DIR, name));
  const ubls = samples
    .filter((name) => name.endsWith('-xrechnung.xml'))
    .map((name) => join(SAMPLES_DIR, name));

  let errorCount = 0;
  let warningCount = 0;

  console.log(`\n=== Mustang ${MUSTANG_VERSION}: PDF/A-3 + EN 16931 CII ===`);
  for (const pdf of pdfs) {
    const result = validatePdf(tools.mustang, pdf, expectValid);
    console.log(`\n  ${fileStem(pdf)}: ${result.valid ? 'VALID' : 'INVALID'}`);
    for (const finding of result.findings) {
      console.log(`    [${finding.level}] ${finding.code}: ${finding.message.slice(0, 180)}`);
      if (finding.level === 'error') errorCount += 1;
      else warningCount += 1;
    }
    if (!result.valid && result.findings.length === 0) errorCount += 1;
  }

  console.log(
    `\n=== KoSIT ${KOSIT_VALIDATOR_VERSION} + XRechnung config ${KOSIT_CONFIG_TAG}: XRechnung UBL ===`,
  );
  for (const result of validateUbl(tools.kosit, tools['kosit-config-dir'], ubls)) {
    console.log(`\n  ${fileStem(result.file)}: ${result.valid ? 'ACCEPTED' : 'REJECTED'}`);
    for (const finding of result.findings) {
      console.log(`    [${finding.level}] ${finding.code}: ${finding.message.slice(0, 180)}`);
      if (finding.level === 'error') errorCount += 1;
      else warningCount += 1;
    }
    if (!result.valid && result.findings.length === 0) errorCount += 1;
  }

  console.log(`\n[validate] errors=${errorCount} warnings=${warningCount}`);
  console.log(`[validate] reports written to ${REPORTS_DIR}`);
  if (errorCount > 0) {
    console.error('[validate] FAILED — the generated documents are not accepted by the validators');
    process.exitCode = 1;
  } else {
    console.log('[validate] OK — all samples accepted');
  }
}

main().catch((error) => {
  console.error(`[validate] failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 2;
});
