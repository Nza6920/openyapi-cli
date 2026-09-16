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
| Linux CI | Node 22 and Node 24 | passed remotely (2026-09-16) | Both jobs passed `check` and `test:package` for SHA `c07a387` in [run 35058593062](https://github.com/Nza6920/openyapi-cli/actions/runs/35058593062). |
| Windows CI | Node 22 and Node 24 | passed remotely (2026-09-16) | Both jobs passed `check`, `test:package`, PowerShell 5.1, and PowerShell 7 for SHA `c07a387` in run 35058593062. |
| macOS CI | Node 22 and Node 24 | passed remotely (2026-09-16) | Both jobs passed `check` and `test:package` for SHA `c07a387` in run 35058593062. |
| Public registry | `openyapi-cli@0.1.0` under `next` | passed (2026-09-16) | Clean `--prefer-online` install resolved `https://registry.npmjs.org/openyapi-cli/-/openyapi-cli-0.1.0.tgz` with `sha512-szWpThZUsnkoVVxcIgcRlzcrSXrGxS0sEV8CbdsEz1314HAUEHWdzoQXZnzMwa3/kFHHWiR1wUn36f2iuqTSkg==`; installed CLI/config/fixture acceptance passed. |
| real YApi | approved read-only instance | pending | Requires the registry-installed binary and authorized issue #22. |

The package declares Node `>=22`, but only Node 22 and 24 are in the verified
matrix. No result for those versions implies support for every later Node major
or every operating-system variant.

## First public publication result

- The protected publish run [35060694115](https://github.com/Nza6920/openyapi-cli/actions/runs/35060694115) printed `+ openyapi-cli@0.1.0` and signed a SLSA provenance statement. Its immediate read-back ran before registry propagation and marked the job failed; an independent fresh read confirmed the version, 30-file tarball, integrity, repository metadata, and npm attestation endpoint. The protected read-only [recovery run 35061977777](https://github.com/Nza6920/openyapi-cli/actions/runs/35061977777) then passed tag/source, rebuilt tarball integrity, `next`, and provenance checks. Issue #20 is closed with both run URLs and no second publish.
- The workflow requested only dist-tag `next`; current public registry read-back returns both `next` and `latest` as `0.1.0`. No repository `npm dist-tag` command was run. This is an observed registry state, not evidence that the planned #22 promotion was executed; do not change dist-tags without the explicit #22 human decision.
- #21 registry acceptance used a fresh temporary cache and directory, `npm install --prefer-online --omit=dev openyapi-cli@0.1.0`, an isolated `XDG_CONFIG_HOME`, and a local HTTP fixture. It verified version/info/help, profile/token set/show/list/unset/delete with redaction, JSON/table read output, a fixture-only category POST mapping, and usage-error stdout/stderr/exit code. It did not contact a real YApi service or leave a test token on disk.

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
