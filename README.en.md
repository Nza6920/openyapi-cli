# openyapi-cli

[简体中文](README.md) | **English**

A YApi OpenAPI command-line client for developers, AI agents, and CI.

Sprint 2 configuration, all six read endpoints, and all five write/import endpoints are implemented and covered by local HTTP fixtures and isolated real-tarball tests. The user confirmed Sprint 1 real-instance acceptance passed; Sprint 2 real-instance, Windows, and remote CI results still need separate evidence. This remains the unpublished `0.1.0-alpha.0`.

## Getting started locally

Requires Node.js >=22. Development defaults to Node 24; CI is configured for Node 22 and 24.

```sh
npm ci
npm run build
node dist/main.js --help
node dist/main.js info
```

## Configuration and authentication

Create a profile, then explicitly store its token through stdin:

```sh
node dist/main.js config set default \
  --base-url https://yapi.example.com \
  --project-id 123
printf '%s\n' "$YAPI_TOKEN" | node dist/main.js config token set default --stdin

node dist/main.js config show default
node dist/main.js config list
node dist/main.js config token unset default
node dist/main.js config delete default
```

Profile and token commands never print the token, and `config set` preserves a stored token. The authoritative [configuration contract](docs/design.md#配置与认证迭代-1-实现) documents OS-specific paths, Unix permissions, and precedence. CI can use `OPENYAPI_BASE_URL`, `OPENYAPI_PROJECT_ID`, and `OPENYAPI_TOKEN` without a profile file. There is no persistent active profile and no token command-line option.

## Query commands

```sh
node dist/main.js project get [--profile NAME]
node dist/main.js category list [--profile NAME]
node dist/main.js interface get --id ID [--profile NAME]
node dist/main.js interface list [--category-id ID] [--page PAGE] [--limit LIMIT]
node dist/main.js interface list [--category-id ID] --all [--limit LIMIT]
node dist/main.js interface tree [--profile NAME]
```

Queries also accept `--base-url`, `--project-id`, and `--timeout-ms`; each request defaults to 30000ms. Only `interface get` and category-filtered `interface list` can run without a project ID. When a project ID is configured, the client first calls `project get` to verify the token's project identity and stops before the target query on a mismatch.

The default output is one JSON value; `--format table` gives concise summaries, while JSON retains full schemas. See the authoritative [output contract](docs/design.md#输出与退出码) and [query/pagination contract](docs/design.md#配置与认证迭代-1-实现) for response shapes, defaults, full-read validation, and concurrency limits.

## Errors and exit codes

Failures leave stdout empty and write structured JSON to stderr. The authoritative [error contract](docs/design.md#输出与退出码) defines stable codes, exit statuses, redirects, retries, and credential redaction.

## Writes and imports

JSON write commands require exactly one of `--file` and `--stdin`; import requires exactly one of `--file`, `--stdin`, and `--url`. File and stdin input support UTF-8 with or without a BOM and BOM-marked UTF-16LE.

```sh
openyapi category create --file "./inputs/Chinese category.json"
openyapi interface create --file interface.json
openyapi interface save --stdin < interface.json
openyapi interface update --file update.json
openyapi import --file openapi.json --type swagger --merge normal
openyapi import --url https://internal.example/openapi.json --type swagger --merge good
openyapi import --file openapi.json --type swagger --merge merge --allow-overwrite
```

Category create requires `name`. Interface create/save require `title`, `path`, `method`, and `catid`, and reject `id`. Interface update requires `id` and passes through only the supplied business fields. A top-level `token` is rejected and a supplied `project_id` must match configuration; fields inside an imported document are document data, not credential overrides. Every write verifies the configured project first, and update also verifies target ownership. POST requests are never retried; after a timeout or disconnection, the write result is unknown.

`--type` names a server import plugin (`swagger` in the examples), so support depends on the target YApi server. Merge mode does not delete every interface omitted from the input, and the CLI does not claim complete OpenAPI 3 compatibility.

For Windows PowerShell 5.1, explicitly configure UTF-8 before piping text to a native command:

```powershell
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
Get-Content -Raw -Encoding UTF8 '.\inputs\Chinese api.json' | openyapi interface save --stdin
```

For PowerShell 7:

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Get-Content -Raw -Encoding utf8 '.\inputs\Chinese api.json' | openyapi interface save --stdin
```

These settings affect the current process and do not change machine execution policy. The CLI cannot recover characters the shell already lost. See the [Sprint 2 acceptance record](docs/acceptance/sprint2.md) for fixed inputs and separated evidence status.

## Development and validation

```sh
npm run check
npm run test:package
```

`check` runs type checking, the build, and compiled-CLI black-box tests. `test:package` creates a real tarball, installs runtime dependencies only in a temporary directory, and exercises all five write commands through the installed entry point.

The source contract is pinned to official YMFE/yapi tag `v1.12.0`, commit `f856193ded851326a9aea19ff28d1c20c653bbab` (whose package version is still 1.11.0). The user confirmed Sprint 1 real-instance acceptance passed, though its version and redacted evidence are not stored here. Sprint 2 real-instance write acceptance, executed Windows jobs, and remote CI results remain pending. The package has not been published to npm.

## Scope and roadmap

- [Technical choices and behavior contracts](docs/design.md) (Chinese)
- [Mapping of the 11 endpoints to CLI commands](docs/api-scope.md) (Chinese)
- [Sprint plan and acceptance criteria](docs/roadmap.md) (Chinese)

MIT License. This independent client is not affiliated with the official YApi project.
