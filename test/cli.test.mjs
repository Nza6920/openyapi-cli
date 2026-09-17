import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  assert.equal(version, '0.1.1');
  const result = invoke('--version');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${version}\n`);
  assert.equal(result.stderr, '');
});

test('info emits a single JSON value by default', () => {
  const result = invoke('info');
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { name: 'openyapi-cli', version: '0.1.1' });
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

test('skill install targets the selected project and preserves existing content', () => {
  const project = mkdtempSync(join(tmpdir(), 'openyapi-skill-'));
  try {
    const args = ['install', '--agent', 'codex,general', '--scope', 'project', '--project-dir', project];
    const target = join(project, '.codex', 'skills', 'openyapi', 'SKILL.md');
    const generalTarget = join(project, '.agents', 'skills', 'openyapi', 'SKILL.md');
    const first = invoke(...args);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout).results.map(({ status }) => status), ['installed', 'installed']);
    assert.equal(existsSync(target), true);
    assert.equal(existsSync(generalTarget), true);
    assert.match(readFileSync(target, 'utf8'), /^---\nname: openyapi\n/);
    assert.deepEqual(JSON.parse(invoke(...args).stdout).results.map(({ status }) => status), ['unchanged', 'unchanged']);

    writeFileSync(target, 'local version\n');
    const conflict = invoke(...args);
    assert.equal(conflict.status, 1);
    assert.equal(conflict.stdout, '');
    assert.equal(JSON.parse(conflict.stderr).error.code, 'CONFIG_ERROR');
    assert.equal(readFileSync(target, 'utf8'), 'local version\n');
    const replaced = invoke(...args, '--force');
    assert.equal(replaced.status, 0, replaced.stderr);
    assert.deepEqual(JSON.parse(replaced.stdout).results.map(({ status }) => status), ['replaced', 'unchanged']);
    assert.match(readFileSync(target, 'utf8'), /^---\nname: openyapi\n/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('skill install requires explicit choices without a terminal', () => {
  const result = invoke('install');
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'USAGE_ERROR');
  assert.match(invoke('skill', 'install', '--help').stdout, /Install the openyapi skill/);
});

test('multi-agent preflight leaves every target untouched on conflict', () => {
  const project = mkdtempSync(join(tmpdir(), 'openyapi-skill-conflict-'));
  try {
    const general = join(project, '.agents', 'skills', 'openyapi', 'SKILL.md');
    mkdirSync(join(project, '.agents', 'skills', 'openyapi'), { recursive: true });
    writeFileSync(general, 'custom skill\n');
    const result = invoke('install', '--agent', 'codex,general', '--scope', 'project', '--project-dir', project);
    assert.equal(result.status, 1);
    assert.equal(existsSync(join(project, '.codex', 'skills', 'openyapi', 'SKILL.md')), false);
    assert.equal(readFileSync(general, 'utf8'), 'custom skill\n');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('user-scoped OpenCode skill uses its documented global directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'openyapi-skill-home-'));
  try {
    const result = spawnSync(process.execPath, [entry, 'install', '--agent', 'opencode', '--scope', 'user'], {
      encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).results[0].path,
      join(home, '.config', 'opencode', 'skills', 'openyapi', 'SKILL.md'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('explicit global CLI setup invokes npm once before copying a skill', () => {
  const project = mkdtempSync(join(tmpdir(), 'openyapi-global-check-'));
  try {
    const fakeNpm = join(project, 'fake-npm.cjs');
    const argumentsFile = join(project, 'npm-args.json');
    writeFileSync(fakeNpm, 'require("node:fs").writeFileSync(process.env.MOCK_NPM_ARGS, JSON.stringify(process.argv.slice(2)));\n');
    const result = spawnSync(process.execPath, [entry, 'install', '--agent', 'general', '--scope', 'project', '--project-dir', project, '--install-cli'], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: fakeNpm, MOCK_NPM_ARGS: argumentsFile },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(argumentsFile, 'utf8')), ['install', '--global', `openyapi-cli@${version}`]);
    assert.equal(JSON.parse(result.stdout).cli, 'globally-installed');
    assert.equal(existsSync(join(project, '.agents', 'skills', 'openyapi', 'SKILL.md')), true);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
