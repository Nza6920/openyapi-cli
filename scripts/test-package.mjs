import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const staging = mkdtempSync(join(tmpdir(), 'openyapi-package-'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check with npm run test:package');
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function execute(command, args, cwd, options = {}) {
  const result = executeResult(command, args, cwd, options);
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout;
}

function executeResult(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(staging, 'npm-cache'),
      ...options.env,
    },
    input: options.input,
  });
}

function executeAsync(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      if (status === 0) resolve(stdout);
      else reject(new Error(stderr || `Installed CLI exited with ${status}`));
    });
    child.stdin.end(options.input);
  });
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
  assert.equal(JSON.parse(execute(process.execPath, [entry, 'info'], staging)).stage, 'sprint1');
  const configHome = join(staging, 'config');
  const cleanEnvironment = {
    XDG_CONFIG_HOME: configHome,
    OPENYAPI_BASE_URL: '',
    OPENYAPI_PROFILE: '',
    OPENYAPI_PROJECT_ID: '',
    OPENYAPI_TOKEN: '',
  };
  execute(process.execPath, [
    entry,
    'config',
    'set',
    'packaged',
    '--base-url',
    'http://127.0.0.1',
    '--project-id',
    '41',
  ], staging, { env: cleanEnvironment });
  execute(process.execPath, [entry, 'config', 'token', 'set', 'packaged', '--stdin'], staging, {
    env: cleanEnvironment,
    input: 'package-secret\n',
  });
  const shown = execute(process.execPath, [entry, 'config', 'show', 'packaged'], staging, {
    env: cleanEnvironment,
  });
  assert.equal(JSON.parse(shown).token, 'configured');
  assert.doesNotMatch(shown, /package-secret/);

  const fixture = createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.invalid');
    assert.equal(request.method, 'GET');
    assert.equal(url.pathname, '/api/project/get');
    assert.equal(url.searchParams.has('id'), false);
    assert.equal(url.searchParams.get('token'), 'package-secret');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ errcode: 0, data: { _id: 41, name: 'Packaged CLI' } }));
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  try {
    const address = fixture.address();
    assert.ok(address && typeof address === 'object');
    const queried = await executeAsync(process.execPath, [
      entry,
      'project',
      'get',
      '--profile',
      'packaged',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
    ], staging, { env: cleanEnvironment });
    assert.deepEqual(JSON.parse(queried), { data: { _id: 41, name: 'Packaged CLI' } });
    assert.doesNotMatch(queried, /package-secret/);
    const table = await executeAsync(process.execPath, [
      entry,
      'project',
      'get',
      '--profile',
      'packaged',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
      '--format',
      'table',
    ], staging, { env: cleanEnvironment });
    assert.match(table, /ID\s+NAME\s+BASE PATH\s+TYPE/);
    assert.match(table, /41\s+Packaged CLI/);
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
  const usageFailure = executeResult(process.execPath, [entry, 'project', 'get', '--project-id', '0'], staging, {
    env: cleanEnvironment,
  });
  assert.equal(usageFailure.status, 2);
  assert.equal(usageFailure.stdout, '');
  assert.equal(JSON.parse(usageFailure.stderr).error.code, 'USAGE_ERROR');
  const executionFailure = executeResult(process.execPath, [entry, 'config', 'show', 'missing'], staging, {
    env: cleanEnvironment,
  });
  assert.equal(executionFailure.status, 1);
  assert.equal(executionFailure.stdout, '');
  assert.equal(JSON.parse(executionFailure.stderr).error.code, 'CONFIG_ERROR');
  if (process.platform !== 'win32') {
    const bin = join(dirname(installed), '.bin', 'openyapi');
    assert.equal(execute(bin, ['--version'], staging), `${metadata.version}\n`);
  }
  console.log(`Package smoke check passed: ${packed.filename} (${files.length} files).`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
