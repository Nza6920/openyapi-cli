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
  const workflow = read('.github/workflows/publish-next.yml');
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
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
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /npm unpublish|npm dist-tag add/);
});
