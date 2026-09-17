# Changelog

All notable changes to `openyapi-cli` are documented in this file.

## 0.1.1 - 2026-09-17

### Added

- Bundle the `openyapi` Agent Skill in the npm package.
- Add `openyapi install` (also `openyapi skill install`) to select project or user
  scope and install the skill for Codex, OpenCode, or a general agent directory.
- Support multi-agent selection, non-interactive flags, safe repeated installs,
  and an optional durable global CLI install when launched through npx.

### Release

- Publish through a separate, protected GitHub Actions workflow using npm
  Trusted Publishing (OIDC), without a long-lived npm token.

## 0.1.0 - 2026-09-16

First stable release candidate of the unscoped `openyapi-cli` package and the
`openyapi` executable.

### Added

- Named local profiles, environment-variable overrides, stdin-only token
  storage, redacted configuration views, and JSON or table output.
- Six read operations covering projects, categories, interface details,
  paginated interface lists, complete list traversal, and interface trees.
- Five write operations covering category creation, interface creation, save,
  update, and document import from a file, stdin, or a server-accessible URL.
- Stable structured error codes and process exit codes for non-interactive use.

### Safety and packaging

- Project identity and interface ownership checks run before applicable YApi
  operations. Write requests are never retried; a timeout or disconnection has
  an unknown result and must be read back before another attempt.
- Tokens are excluded from command-line options and recursively redacted from
  output. Merge imports require explicit `--allow-overwrite` authorization.
- The real npm tarball is installed with production dependencies only and
  exercised through its installed command entry point. Sprint 2 passed Linux
  and Windows CI on Node 22 and 24; the exact `0.1.0` release-candidate matrix
  for Linux, Windows, and macOS remains a separate gate.

### Compatibility and known limits

- The source contract is pinned to official YMFE/yapi tag `v1.12.0`, commit
  `f856193ded851326a9aea19ff28d1c20c653bbab`. A separately tested deployment
  identified its frontend as `1.10.2`; those results do not establish support
  for every YApi fork.
- Import types are server plugins. The tested deployment's Swagger importer
  ignored `basePath`, and this release does not claim complete OpenAPI 3
  support.
- `engines.node` is `>=22`, while the verified release matrix is specifically
  Node 22 and 24. Registry installation and real-instance read-only acceptance
  remain distinct post-publication checks.
