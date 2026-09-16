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
| Linux CI | Node 22 and Node 24 | pending | Both jobs must pass on the exact release SHA. |
| Windows CI | Node 22 and Node 24 | pending | Both jobs plus PowerShell 5.1/7 checks must pass on the exact release SHA. |
| macOS CI | Node 22 and Node 24 | pending | Both jobs must pass on the exact release SHA. |
| Public registry | `openyapi-cli@0.1.0` under `next` | pending | Requires authorized issue #20, then a clean registry installation under issue #21. |
| real YApi | approved read-only instance | pending | Requires the registry-installed binary and authorized issue #22. |

The package declares Node `>=22`, but only Node 22 and 24 are in the verified
matrix. No result for those versions implies support for every later Node major
or every operating-system variant.

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
