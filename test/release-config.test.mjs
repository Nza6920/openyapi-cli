import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('CI covers Linux, macOS, and Windows on Node 22 and 24', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /os: \[ubuntu-latest, macos-latest\]/);
  assert.match(workflow, /runs-on: \$\{\{ matrix\.os \}\}/);
  assert.match(workflow, /node: \[22, 24\]/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /shell: powershell/);
  assert.match(workflow, /shell: pwsh/);
});

test('first publish workflow is manual, fixed, protected, and provenance-enabled', () => {
  const nativeWorkflow = read('.github/workflows/publish-next.yml');
  const workflows = [nativeWorkflow, nativeWorkflow.replace(/\r?\n/g, '\r\n')];
  for (const workflow of workflows) {
    assert.match(workflow, /^on:\r?\n  workflow_dispatch:\s*$/m);
    assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|release|schedule):/m);
    assert.doesNotMatch(workflow, /^\s+inputs:/m);
    assert.match(workflow, /contents: read/);
    assert.match(workflow, /id-token: write/);
    assert.match(workflow, /environment: npm-production/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /EXPECTED_NAME: openyapi-cli/);
    assert.match(workflow, /EXPECTED_VERSION: 0\.1\.0/);
    assert.match(workflow, /EXPECTED_TAG: next/);
    assert.match(workflow, /npm ci/);
    assert.match(workflow, /npm run check/);
    assert.match(workflow, /npm run test:package/);
    assert.match(workflow, /npm pack --json/);
    assert.match(workflow, /npm publish --access public --provenance --tag "\$EXPECTED_TAG"/);
    assert.match(workflow, /for attempt in \{1\.\.12\}/);
    assert.match(workflow, /sleep 5/);
    assert.match(workflow, /registry_version="\$\(npm view/);
    assert.match(workflow, /registry_tag="\$\(npm view/);
    assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
    assert.doesNotMatch(workflow, /npm unpublish|npm dist-tag add/);
  }
});

test('post-publication recovery verifies the fixed artifact without writing npm state', () => {
  const workflow = read('.github/workflows/verify-published-0.1.0.yml');
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|release|schedule):/m);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /environment: npm-production/);
  assert.match(workflow, /EXPECTED_COMMIT: 7337b79835ff26f2e5387a081aa3d9ea15296602/);
  assert.match(workflow, /EXPECTED_TAG: v0\.1\.0/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm pack --json/);
  assert.match(workflow, /npm view "\$EXPECTED_NAME@\$EXPECTED_VERSION"/);
  assert.match(workflow, /npm\/v1\/attestations/);
  assert.match(workflow, /gitCommit/);
  assert.doesNotMatch(workflow, /npm publish|npm dist-tag|NODE_AUTH_TOKEN|secrets\./);
});

test('0.1.1 release uses a separate protected OIDC workflow without a token', () => {
  const workflow = read('.github/workflows/publish-0.1.1.yml');
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:\s*$/m);
  assert.match(workflow, /environment: npm-production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /EXPECTED_VERSION: 0\.1\.1/);
  assert.match(workflow, /EXPECTED_TAG: latest/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run test:package/);
  assert.match(workflow, /\.agents\/skills\/openyapi\/SKILL\.md/);
  assert.match(workflow, /npm publish --access public --tag "\$EXPECTED_TAG"/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\.|npm dist-tag|npm unpublish/);
});
