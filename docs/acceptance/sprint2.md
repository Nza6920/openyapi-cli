# Sprint 2 acceptance

The compatibility baseline is official YApi `v1.12.0`, commit `f856193ded851326a9aea19ff28d1c20c653bbab` (package version `1.11.0`). Source inspection confirms the five POST paths, body-token authentication, `save` matching by project/path/method, serialized import `json`, server-fetched `url`, and server-side import modes. These source findings are not deployment evidence.

## Automated evidence

- Linux compiled-process fixtures cover all five writes, request order/body/count, local input failures, project and target identity checks, success output, redaction, HTTP/business/protocol failures, redirects, disconnection, timeout, and no retry.
- The tarball check installs production dependencies in isolation and exercises all five write commands through the installed entry point.
- CI is configured for Node.js 22/24 on Linux and Windows. The Windows jobs also run the installed `.cmd` entry under Windows PowerShell 5.1 and PowerShell 7 with Chinese JSON, spaced paths, UTF-8 with/without BOM, BOM-marked UTF-16LE, files, stdin, and an isolated usage failure that asserts exit code 2, empty stdout, and structured stderr.

Record local results, remote CI results, Windows results, and real-instance results separately. Configuration alone is not a passing remote or Windows run.

## Recorded results (2026-09-15)

- Local WSL Ubuntu with Node.js 24.13.1 and npm 11.19.1 passed `npm run check` with 58 tests and passed `npm run test:package`; the isolated tarball contained 27 files. No local PowerShell executable was available in that environment.
- GitHub Actions run [34921136369](https://github.com/Nza6920/openyapi-cli/actions/runs/34921136369) for commit `d068f30` passed Node.js 22/24 checks and package tests on Linux and Windows. Both Windows matrix jobs passed the installed-package workflow under Windows PowerShell 5.1 and PowerShell 7, including the failure exit contract.
- A separate user-run Windows check against the installed `openyapi.cmd` confirmed a missing-input failure returned exit code 2, left stdout empty, and emitted `USAGE_ERROR` on stderr. The PowerShell-redirection log was UTF-16LE and added its native-command diagnostic wrapper; no credential or machine path is retained here.
- Dedicated-project YApi write/read-back acceptance remains pending under issue #14. This does not reduce the completed Windows and remote-CI evidence for issue #13.

## Dedicated-project procedure

Use only a dedicated disposable test project and keep its URL, project ID, token, and returned interface IDs outside the repository. The fixed inputs are under `docs/fixtures/sprint2/`; replace the sample `catid` in the interface inputs with the ID created during this run, without committing that generated file.

```sh
openyapi category create --file docs/fixtures/sprint2/category.json
openyapi interface create --file /tmp/openyapi-interface-create.json
openyapi interface save --file /tmp/openyapi-interface-save.json
openyapi import --file docs/fixtures/sprint2/import-normal.json --type swagger --merge normal
openyapi import --file docs/fixtures/sprint2/import-good.json --type swagger --merge good
openyapi import --file docs/fixtures/sprint2/import-merge.json --type swagger --merge merge --allow-overwrite
```

Create the update input from the returned dedicated-project interface ID, then run `interface update`. Read back the category, created/saved/updated interfaces, and each imported path with the query commands. Record the deployed YApi version, supported server plugin type, redacted outputs, and eventual `save` result. Do not infer persistence from the POST response or infer plugin support from the web UI or filename.

Real-instance Sprint 2 acceptance has not been run because no dedicated project credentials are available in the repository. Follow issue #14 for that separate acceptance boundary.
