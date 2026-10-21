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
    assert.equal(first.stderr, '');
    assert.equal(JSON.parse(first.stdout).cli, 'unchanged');
    assert.deepEqual(JSON.parse(first.stdout).results.map(({ status }) => status), ['installed', 'installed']);
    assert.equal(existsSync(target), true);
    assert.equal(existsSync(generalTarget), true);
    assert.match(readFileSync(target, 'utf8'), /^---\r?\nname: openyapi\r?\n/);
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
    assert.match(readFileSync(target, 'utf8'), /^---\r?\nname: openyapi\r?\n/);
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

test('multi-agent preflight leaves every target untouched and skips npm on conflict', () => {
  const project = mkdtempSync(join(tmpdir(), 'openyapi-skill-conflict-'));
  try {
    const general = join(project, '.agents', 'skills', 'openyapi', 'SKILL.md');
    mkdirSync(join(project, '.agents', 'skills', 'openyapi'), { recursive: true });
    writeFileSync(general, 'custom skill\n');
    const fakeNpm = join(project, 'fake-npm.cjs');
    const npmCalled = join(project, 'npm-called');
    writeFileSync(fakeNpm, 'require("node:fs").writeFileSync(process.env.MOCK_NPM_CALLED, "called");\n');
    const result = spawnSync(process.execPath, [entry, 'install', '--agent', 'codex,general', '--scope', 'project', '--project-dir', project, '--install-cli'], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: fakeNpm, MOCK_NPM_CALLED: npmCalled },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'CONFIG_ERROR');
    assert.equal(existsSync(npmCalled), false);
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
    const target = join(project, '.agents', 'skills', 'openyapi', 'SKILL.md');
    writeFileSync(fakeNpm, `
      const fs = require('node:fs');
      fs.appendFileSync(process.env.MOCK_NPM_ARGS, JSON.stringify({
        args: process.argv.slice(2),
        skillExists: fs.existsSync(process.env.MOCK_SKILL_TARGET),
      }) + '\\n');
    `);
    const result = spawnSync(process.execPath, [entry, 'install', '--agent', 'general', '--scope', 'project', '--project-dir', project, '--install-cli'], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: fakeNpm, MOCK_NPM_ARGS: argumentsFile, MOCK_SKILL_TARGET: target },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const calls = readFileSync(argumentsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(calls, [{ args: ['install', '--global', `openyapi-cli@${version}`], skillExists: false }]);
    assert.equal(JSON.parse(result.stdout).cli, 'globally-installed');
    assert.equal(existsSync(target), true);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('failed global CLI installation copies no skills and reports the existing failure contract', () => {
  const project = mkdtempSync(join(tmpdir(), 'openyapi-npm-failure-'));
  try {
    const fakeNpm = join(project, 'fake-npm.cjs');
    const npmCalled = join(project, 'npm-called');
    writeFileSync(fakeNpm, `
      require('node:fs').appendFileSync(process.env.MOCK_NPM_CALLED, 'called\\n');
      console.log('npm output');
      console.error('npm failure');
      process.exit(1);
    `);
    const result = spawnSync(process.execPath, [entry, 'skill', 'install', '--agent', 'codex,general', '--scope', 'project', '--project-dir', project, '--install-cli'], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: fakeNpm, MOCK_NPM_CALLED: npmCalled },
    });
    assert.equal(readFileSync(npmCalled, 'utf8'), 'called\n');
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), {
      error: { code: 'CONFIG_ERROR', message: 'Global CLI installation failed; no skill was installed.' },
    });
    assert.equal(existsSync(join(project, '.codex')), false);
    assert.equal(existsSync(join(project, '.agents')), false);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('a conflict introduced during npm execution prevents every skill copy', () => {
  const project = mkdtempSync(join(tmpdir(), 'openyapi-npm-conflict-'));
  try {
    const fakeNpm = join(project, 'fake-npm.cjs');
    const general = join(project, '.agents', 'skills', 'openyapi', 'SKILL.md');
    const npmCompleted = join(project, 'npm-completed');
    writeFileSync(fakeNpm, `
      const fs = require('node:fs');
      const target = process.env.MOCK_SKILL_TARGET;
      fs.mkdirSync(require('node:path').dirname(target), { recursive: true });
      fs.writeFileSync(target, 'concurrent skill\\n');
      fs.appendFileSync(process.env.MOCK_NPM_COMPLETED, 'completed\\n');
    `);
    const result = spawnSync(process.execPath, [entry, 'install', '--agent', 'codex,general', '--scope', 'project', '--project-dir', project, '--install-cli'], {
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: fakeNpm, MOCK_SKILL_TARGET: general, MOCK_NPM_COMPLETED: npmCompleted },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'CONFIG_ERROR');
    assert.equal(readFileSync(npmCompleted, 'utf8'), 'completed\n');
    assert.equal(existsSync(join(project, '.codex')), false);
    assert.equal(readFileSync(general, 'utf8'), 'concurrent skill\n');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('a later skill copy failure preserves earlier completed copies', () => {
  const project = mkdtempSync(join(tmpdir(), 'openyapi-copy-failure-'));
  try {
    // A file where a parent directory is needed makes copying fail after target preflight.
    writeFileSync(join(project, '.agents'), 'blocked parent\n');
    const result = invoke('install', '--agent', 'codex,general', '--scope', 'project', '--project-dir', project);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'CONFIG_ERROR');
    assert.equal(readFileSync(join(project, '.codex', 'skills', 'openyapi', 'SKILL.md'), 'utf8'),
      readFileSync(new URL('../.agents/skills/openyapi/SKILL.md', import.meta.url), 'utf8'));
    assert.equal(readFileSync(join(project, '.agents'), 'utf8'), 'blocked parent\n');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
