# openyapi-cli

[简体中文](README.md) | **English**

A YApi OpenAPI command-line client for developers, AI agents, and CI.

Sprint 1 configuration, authentication, and all six read-only endpoints are implemented and covered by local HTTP-fixture tests. Real-instance compatibility testing and remote CI are still pending, so this remains the unpublished `0.1.0-alpha.0`. Writes and imports belong to later sprints.

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

## Development and validation

```sh
npm run check
npm run test:package
```

`check` runs type checking, the build, and compiled-CLI black-box tests. `test:package` creates a real tarball, installs runtime dependencies only in a temporary directory, and verifies package contents and the installed entry point; it requires npm registry access.

The source contract is pinned to official YMFE/yapi tag `v1.12.0`, commit `f856193ded851326a9aea19ff28d1c20c653bbab` (whose package version is still 1.11.0). Local fixtures do not replace real-instance acceptance testing; deployment version evidence and redacted results for all six GET endpoints remain pending. Sprint 1 does not publish to npm.

## Scope and roadmap

- [Technical choices and behavior contracts](docs/design.md) (Chinese)
- [Mapping of the 11 endpoints to CLI commands](docs/api-scope.md) (Chinese)
- [Sprint plan and acceptance criteria](docs/roadmap.md) (Chinese)

MIT License. This independent client is not affiliated with the official YApi project.
