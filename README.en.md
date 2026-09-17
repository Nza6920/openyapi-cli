# openyapi-cli

[简体中文](README.md) | **English**

A YApi OpenAPI command-line client for developers, AI agents, and CI. It covers the agreed six read endpoints and five write/import endpoints, emits stable JSON by default, and makes write safety boundaries explicit.

## Version information

- Current version: `0.1.1` (first stable release: `0.1.0`)
- npm package: `openyapi-cli`
- Executable: `openyapi`
- Minimum runtime: Node 22
- Verified runtime matrix: Node 22 and Node 24; `engines.node >=22` does not claim that every future Node major has been tested

`0.1.1` adds the Agent Skill installer. `0.1.0` is published publicly; see the [Sprint 3 acceptance record](docs/acceptance/sprint3.md) for its real YApi read-only acceptance evidence.

## Quick Start

Install from the registry or run the exact version temporarily:

```sh
npm install --global openyapi-cli@0.1.1
openyapi --version
openyapi info

npx --package openyapi-cli@0.1.1 openyapi --version
```

Create a profile, store its token through stdin, and run a read-only query:

```sh
openyapi config set default \
  --base-url https://yapi.example.com \
  --project-id 123
printf '%s\n' "$YAPI_TOKEN" | openyapi config token set default --stdin
openyapi project get --profile default
```

The URL and project ID are placeholders. Never put a token in command arguments, a repository, or logs.

The repository also provides an [openyapi Agent Skill](.agents/skills/openyapi/SKILL.md) for agents using the CLI. It is included in `0.1.1`; run:

```sh
npx openyapi-cli@latest install
```

The installer first prompts for project or user scope, then lets you select Codex, OpenCode, General, or several of them. Project paths are `.codex/skills`, `.opencode/skills`, and `.agents/skills`; user paths are `~/.codex/skills`, `~/.config/opencode/skills`, and `~/.agents/skills`. When run interactively from the npx cache, it also asks whether to install the same CLI version globally for persistent use. For non-interactive use, pass `--agent codex,general --scope project`, and add `--install-cli` to request a global CLI installation; project scope uses the current directory unless `--project-dir <path>` is given. An identical skill is left alone; replacing different content requires `--force`. A global CLI installation can also run `openyapi install` or `openyapi skill install`. Skill installation does not connect to YApi. Ordinary npm installation does not prompt.

## Command reference

Global options are `--format json|table` (default `json`) and `--version`. Remote options such as `--profile`, `--base-url`, `--project-id`, and `--timeout-ms` follow the relevant subcommand.

| Area | Commands |
| --- | --- |
| Local metadata | `openyapi info` |
| Profiles | `config set/show/list/delete` |
| Tokens | `config token set --stdin`, `config token unset` |
| Reads | `project get`, `category list`, `interface get/list/tree` |
| Writes | `category create`, `interface create/save/update` |
| Imports | `import --file|--stdin|--url --type TYPE [--merge normal|good|merge]` |

Interface lists default to `--page 1 --limit 10`. `--all` validates totals, page counts, and duplicate IDs before emitting one complete result. See the [API scope](docs/api-scope.md) for the exact mapping to all 11 YApi endpoints.

## Configuration, output, and errors

Non-secret configuration precedence is command option, then environment variable, then profile. Select a profile with `--profile` or `OPENYAPI_PROFILE`. CI normally uses `OPENYAPI_BASE_URL`, `OPENYAPI_PROJECT_ID`, and `OPENYAPI_TOKEN` without storing a token on disk.

An explicit `XDG_CONFIG_HOME` wins. Otherwise Linux uses `~/.config`, Windows uses `APPDATA`, and macOS uses `~/Library/Application Support`. Local token storage is an explicit stdin-only action; `show` and `list` never expose it, and current-token values are recursively redacted from business output and errors. The [configuration and authentication contract](docs/design.md#配置与认证迭代-1-实现) is authoritative.

Success writes one JSON value to stdout; `--format table` provides a human summary. Failure leaves stdout empty and writes stable JSON to stderr:

```json
{"error":{"code":"CONFIG_ERROR","message":"Missing token configuration."}}
```

Usage errors exit 2, execution failures exit 1, and success exits 0. Stable `error.code` values are `USAGE_ERROR`, `CONFIG_ERROR`, `PROJECT_MISMATCH`, `NETWORK_ERROR`, `TIMEOUT_ERROR`, `HTTP_ERROR`, `YAPI_ERROR`, `RESPONSE_ERROR`, and `INTERNAL_ERROR`; see the authoritative [output and exit-code contract](docs/design.md#输出与退出码).

## Writes, imports, and safety boundaries

JSON writes require exactly one of `--file` and `--stdin`; imports require exactly one of `--file`, `--stdin`, and `--url`. Local input supports UTF-8 with or without a BOM and BOM-marked UTF-16LE.

```sh
openyapi category create --file "./inputs/category.json"
openyapi interface create --file interface.json
openyapi interface save --stdin < interface.json
openyapi interface update --file update.json
openyapi import --file openapi.json --type swagger --merge normal
openyapi import --url https://internal.example/openapi.json --type swagger --merge good
openyapi import --file openapi.json --type swagger --merge merge --allow-overwrite
```

Every write verifies the project first, and update also verifies interface ownership. A top-level `token` is rejected, and an input `project_id` must match configuration. POST requests are never retried. A timeout or disconnection has an unknown result, so read server state before deciding what to do next. Merge mode requires `--allow-overwrite`, but does not mean that omitted interfaces are deleted.

`--type` identifies a plugin on the target YApi server; the CLI cannot guarantee its availability. This release does not claim complete OpenAPI 3 support. See the [Sprint 2 acceptance record](docs/acceptance/sprint2.md) for PowerShell 5.1/7 UTF-8 stdin setup and fixed fixtures.

## Compatibility and acceptance status

The contract baseline is official YMFE/yapi tag `v1.12.0`, commit `f856193ded851326a9aea19ff28d1c20c653bbab`; that tag's package version remains 1.11.0. The dedicated Sprint 2 deployment identified its frontend as `1.10.2`, and its Swagger plugin ignored `basePath`. Neither evidence layer establishes support for every YApi fork.

Linux, Windows, and macOS on Node 22/24, fixtures, the real tarball, the public registry, and a real YApi instance are separate evidence layers. The [Sprint 3 compatibility and acceptance record](docs/acceptance/sprint3.md) keeps incomplete layers marked `pending` instead of treating one passing layer as a substitute for another.

## Development, packaging, and release

```sh
npm ci
npm run check
npm run test:package
npm pack --json
```

`check` type-checks, builds, and runs compiled-CLI black-box tests. `test:package` installs the real tarball with production dependencies only in a temporary directory, then verifies package contents, entry points, configuration/redaction, fixture requests, and failure contracts. The [release runbook](docs/releasing.md) covers the manual workflow, approval gate, unknown publish results, and post-publication steps. Implementing the workflow or passing local checks does not authorize publication.

More: [CHANGELOG](CHANGELOG.md) · [technical choices and behavior contracts](docs/design.md) · [roadmap](docs/roadmap.md)

MIT License. This independent client is not affiliated with the official YApi project.
