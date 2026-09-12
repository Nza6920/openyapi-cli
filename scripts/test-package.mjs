import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const staging = mkdtempSync(join(tmpdir(), 'openyapi-package-'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check with npm run test:package');
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function execute(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: join(staging, 'npm-cache') },
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout;
}

try {
  const packed = JSON.parse(execute(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', staging], root))[0];
  const files = packed.files.map(({ path }) => path);
  assert.ok(files.includes('dist/main.js'));
  assert.ok(files.includes('LICENSE'));
  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('README.en.md'));
  assert.ok(files.every((path) => /^(dist\/|docs\/|package\.json$|README(?:\.en)?\.md$|LICENSE$)/.test(path)), files.join('\n'));
  execute(process.execPath, [npmCli, 'install', '--prefix', staging, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(staging, packed.filename)], staging);
  const installed = join(staging, 'node_modules', 'openyapi-cli');
  const entry = join(installed, metadata.bin.openyapi);
  assert.equal(execute(process.execPath, [entry, '--version'], staging), `${metadata.version}\n`);
  assert.equal(JSON.parse(execute(process.execPath, [entry, 'info'], staging)).stage, 'scaffold');
  if (process.platform !== 'win32') {
    const bin = join(dirname(installed), '.bin', 'openyapi');
    assert.equal(execute(bin, ['--version'], staging), `${metadata.version}\n`);
  }
  console.log(`Package smoke check passed: ${packed.filename} (${files.length} files).`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
