import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const invoke = (...args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });

test('help and no arguments exit successfully without diagnostics', () => {
  for (const args of [[], ['--help'], ['info', '--help']]) {
    const result = invoke(...args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: openyapi/);
    assert.equal(result.stderr, '');
  }
});

test('version comes from package metadata', () => {
  const result = invoke('--version');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${version}\n`);
  assert.equal(result.stderr, '');
});

test('info emits a single JSON value by default', () => {
  const result = invoke('info');
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { name: 'openyapi-cli', version, stage: 'sprint1' });
  assert.equal(result.stderr, '');
});

test('global format works before and after the subcommand', () => {
  for (const args of [['--format', 'table', 'info'], ['info', '--format', 'table']]) {
    const result = invoke(...args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /FIELD\s+VALUE/);
    assert.match(result.stdout, /name\s+openyapi-cli/);
    assert.equal(result.stderr, '');
  }
});

test('usage errors leave stdout empty and return structured stderr with exit 2', () => {
  for (const args of [['missing'], ['info', '--unknown'], ['info', 'extra'], ['info', '--format', 'xml'], ['info', '--format']]) {
    const result = invoke(...args);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'USAGE_ERROR');
  }
});
