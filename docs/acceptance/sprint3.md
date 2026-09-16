# Sprint 3 compatibility and acceptance record

This document is the status ledger for the `0.1.0` release candidate. Evidence
layers are independent: fixture success does not prove package installation,
package installation does not prove registry publication, and registry success
does not prove compatibility with a deployed YApi instance.

## Compatibility matrix

| Layer | Runtime or target | Status | Evidence boundary |
| --- | --- | --- | --- |
| Local fixture | Node 24.13.1 | passed locally (2026-09-16) | `npm run check`: 62/62 tests, 0 skipped; includes typecheck and compiled CLI tests. |
| Real local tarball | Node 24.13.1 | passed locally (2026-09-16) | `npm run test:package`: `openyapi-cli-0.1.0.tgz`, 30 files, production-only isolated install. `npm pack --json --dry-run` confirmed name/version/files with an isolated writable cache. |
| Linux CI | Node 22 and Node 24 | passed remotely (2026-09-16) | Both jobs passed `check` and `test:package` for release source SHA `7337b79835ff26f2e5387a081aa3d9ea15296602` in [run 35058772546](https://github.com/Nza6920/openyapi-cli/actions/runs/35058772546). |
| Windows CI | Node 22 and Node 24 | passed remotely (2026-09-16) | Both jobs passed `check`, `test:package`, PowerShell 5.1, and PowerShell 7 for the same release source SHA in run 35058772546. |
| macOS CI | Node 22 and Node 24 | passed remotely (2026-09-16) | Both jobs passed `check` and `test:package` for the same release source SHA in run 35058772546. |
| Public registry | `openyapi-cli@0.1.0` under `next`; local Node 24.13.1 | passed (2026-09-16) | Clean `--prefer-online --omit=dev` install resolved `https://registry.npmjs.org/openyapi-cli/-/openyapi-cli-0.1.0.tgz` with `sha512-szWpThZUsnkoVVxcIgcRlzcrSXrGxS0sEV8CbdsEz1314HAUEHWdzoQXZnzMwa3/kFHHWiR1wUn36f2iuqTSkg==`; 30 installed package files, CLI/config/fixture and failure-contract checks passed. |
| Real YApi | approved read-only instance; Linux / Node 24.13.1 | read-only CLI checks passed (2026-09-16) | A fresh public-registry `openyapi-cli@0.1.0` install matched the configured project identity. Project, category, interface list, category-filtered list, all-pages traversal, tree, and interface detail returned exit 0 with JSON stdout, empty stderr, and no configured token in output. The maintainer reported that the current page displays frontend version `1.10.2`; backend version was not established. |

The package declares Node `>=22`, but only Node 22 and 24 are in the verified
matrix. No result for those versions implies support for every later Node major
or every operating-system variant.

## First public publication result

- The protected publish run [35060694115](https://github.com/Nza6920/openyapi-cli/actions/runs/35060694115) printed `+ openyapi-cli@0.1.0` and signed a SLSA provenance statement. Its immediate read-back ran before registry propagation and marked the job failed; an independent fresh read confirmed the version, 30-file tarball, integrity, repository metadata, and npm attestation endpoint. The protected read-only [recovery run 35061977777](https://github.com/Nza6920/openyapi-cli/actions/runs/35061977777) then passed tag/source, rebuilt tarball integrity, `next`, and provenance checks. Issue #20 is closed with both run URLs and no second publish.
- The workflow requested only dist-tag `next`, but public registry read-back returns both `next` and `latest` as `0.1.0`. No repository `npm dist-tag` command was run. Issue #22 recorded that the desired final state already existed and made no redundant tag mutation or tarball republication.
- #21 registry acceptance used a fresh temporary cache and directory, `npm install --prefer-online --omit=dev openyapi-cli@0.1.0`, an isolated `XDG_CONFIG_HOME`, and a local HTTP fixture. It verified package name/version, the resolved registry URL/integrity, all 30 installed files and bin, version/info/help, profile/token set/show/list/unset/delete with redaction, JSON/table read output, and a fixture-only category POST mapping. Missing credentials returned `CONFIG_ERROR` (exit 1), invalid configuration returned `USAGE_ERROR` (exit 2), and a closed local fixture returned `NETWORK_ERROR` (exit 1); every failure left stdout empty and did not expose the fixed test token. It did not contact a real YApi service, use a local tarball or checkout package, or leave temporary files behind.
- #22 real-instance read-only check used Linux / Node 24.13.1, release source SHA `7337b79835ff26f2e5387a081aa3d9ea15296602`, the public-registry `openyapi-cli@0.1.0` tarball at the same resolved URL and integrity recorded above, and an existing local profile. All seven commands succeeded: `project get`, `category list`, `interface list`, `interface list --category-id`, `interface list --all --limit 2`, `interface tree`, and `interface get --id`. The returned project ID matched the approved configured project; the category list contained 2 entries, the first interface page contained 4 of 4 entries, the category-filtered page contained 2 of 2, the all-pages query retrieved 4 entries over 2 pages, the tree contained 2 categories, and the detail belonged to the approved project and category. Each command had exit code 0, JSON stdout, empty stderr, and no literal or URL-encoded configured token in its output. No real-instance POST was run. The frontend build asset was reachable but did not expose a version in this CLI check; the maintainer separately observed `1.10.2` on the current YApi page. That is a frontend display version, not a backend version claim.
- A final clean, untagged public-registry install after the account changes and GitHub Release on Linux / Node 24.13.1 resolved to `openyapi-cli@0.1.0`, the same registry tarball URL and integrity recorded above. Its installed `openyapi` bin printed `0.1.0` and `info` returned only `name` and `version`. npm `dist-tag ls` and package metadata both confirmed `next=latest=0.1.0`; temporary install directories and caches were removed.
- The maintainer confirmed the saved npm Trusted Publisher entry matches `Nza6920/openyapi-cli`, workflow filename `publish-next.yml`, GitHub Environment `npm-production`, and direct `npm publish` permission. The npm CLI could not independently read the entry because that account action required an interactive 2FA challenge; no new publication was attempted as a proxy for verification. The maintainer revoked the named first-publish npm access token through the interactive account flow; a subsequent `npm token list --json` returned `[]`. The GitHub `npm-production` Environment secret `NPM_TOKEN` was deleted and a subsequent secrets-list read returned zero entries. The one-time workflow remains fixed to `0.1.0`; a future publish workflow must use OIDC without the removed token.
- The public [GitHub Release `v0.1.0`](https://github.com/Nza6920/openyapi-cli/releases/tag/v0.1.0) was created from the existing annotated tag using the `0.1.0` changelog entry; read-back showed neither draft nor prerelease. The remote tag peels to source SHA `7337b79835ff26f2e5387a081aa3d9ea15296602`. The npm SLSA provenance statement names the same Git commit and publish run 35060694115. Final registry metadata retained the original tarball integrity, repository URL, provenance URL, and `next/latest` tags.

## Existing upstream and Sprint 2 evidence

- The source contract is pinned to official YMFE/yapi tag `v1.12.0`, commit
  `f856193ded851326a9aea19ff28d1c20c653bbab`; that tag reports package version
  1.11.0.
- Sprint 2 separately passed fixture, tarball, Linux/Windows Node 22/24 CI,
  Windows PowerShell 5.1/7, and dedicated-project write/read-back acceptance.
  Those results are historical inputs, not substitutes for the final Sprint 3
  release-candidate matrix.
- The tested deployment identified its frontend as `1.10.2`. Its Swagger
  importer ignored the fixture `basePath` and mapped the tested imports to
  `/items`; this is a deployment observation, not a general YApi guarantee.

## Evidence to record

For every completed row record the date, exact source SHA, OS/runtime, command or
workflow job, result, and any redacted limitation. Registry acceptance must also
record the resolved URL/integrity and prove the source was neither a local path
nor a checkout tarball. Real-instance evidence must remain read-only and must
not contain credentials or reusable token material.
