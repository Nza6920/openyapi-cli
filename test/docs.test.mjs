import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Chinese and English READMEs expose equivalent stable quick starts', () => {
  const chinese = read('README.md');
  const english = read('README.en.md');
  assert.match(chinese, /\*\*简体中文\*\* \| \[English\]\(README\.en\.md\)/);
  assert.match(english, /\[简体中文\]\(README\.md\) \| \*\*English\*\*/);
  for (const [document, headings] of [
    [chinese, ['## 版本信息', '## 快速开始', '## 命令参考', '## 兼容性与验收状态']],
    [english, ['## Version information', '## Quick Start', '## Command reference', '## Compatibility and acceptance status']],
  ]) {
    for (const heading of headings) assert.match(document, new RegExp(heading));
    assert.match(document, /npm install --global openyapi-cli@0\.1\.1/);
    assert.match(document, /npx --package openyapi-cli@0\.1\.1 openyapi/);
    assert.match(document, /npx openyapi-cli@latest install/);
    assert.match(document, /openyapi --version/);
    assert.match(document, /openyapi info/);
    assert.match(document, /openyapi config token set default --stdin/);
    assert.match(document, /openyapi project get/);
    assert.match(document, /Node(?:\.js)? 22/);
    assert.match(document, /Node(?:\.js)? 24/);
    assert.match(document, /docs\/acceptance\/sprint3\.md/);
    assert.match(document, /docs\/releasing\.md/);
    assert.match(document, /published publicly|publicly available|已公开发布/);
    assert.doesNotMatch(document, /0\.1\.0-alpha\.0|stage.*sprint2/i);
  }
});

test('release documentation keeps publication and acceptance as explicit human gates', () => {
  const release = read('docs/releasing.md');
  assert.match(release, /npm-production/);
  assert.match(release, /required reviewer/i);
  assert.match(release, /Actions.*Publish 0\.1\.0 to npm next/s);
  assert.match(release, /does not authorize\s+publication/i);
  assert.match(release, /do not\s+retry/i);
  assert.match(release, /Trusted Publishing/);
  assert.match(release, /latest/);

  const acceptance = read('docs/acceptance/sprint3.md');
  assert.match(acceptance, /Linux.*passed remotely/i);
  assert.match(acceptance, /Windows.*passed remotely/i);
  assert.match(acceptance, /macOS.*passed remotely/i);
  assert.match(acceptance, /Public registry.*passed/i);
  assert.match(acceptance, /real YApi.*read-only CLI checks passed/i);
  assert.match(acceptance, /frontend version `1\.10\.2`/i);
});
