# openyapi-cli

[简体中文](README.md) | **English**

A YApi OpenAPI command-line client for developers, AI agents, and CI.

**This version is a project scaffold**: local help, version information, the `info` command, build scripts, tests, and npm package validation are available. YApi queries, configuration, writes, and imports are not implemented yet. This project has not been published to npm.

## Getting started locally

Requires Node.js >=22. Development defaults to Node 24, and CI is configured to test Node 22 and 24.

```sh
npm ci
npm run build
node dist/main.js --help
node dist/main.js --version
node dist/main.js info
node dist/main.js info --format table
```

Command results use JSON by default. Example output from `info`:

```json
{"name":"openyapi-cli","version":"0.1.0-alpha.0","stage":"scaffold"}
```

`--help` and `--version` use plain text, following CLI conventions. Diagnostics go to stderr. Exit codes are 2 for usage errors, 1 for internal errors, and 0 for success.

## Development and validation

```sh
npm run check
npm run test:package
```

`check` runs type checking, the build, and CLI black-box tests. `test:package` creates a real tarball, installs it with runtime dependencies only in a temporary directory, verifies the installed entry point and package contents, and cleans up temporary files. This command requires network access to the npm registry.

To create and install a local package:

```sh
npm pack
npm install --global ./openyapi-cli-0.1.0-alpha.0.tgz
openyapi info
```

The package name is `openyapi-cli`, and the command name is `openyapi`. Once published, it will be available through `npm install --global openyapi-cli`. For now, use the local tarball.

## Scope and roadmap

The project targets only the 11 endpoints in the [YApi OpenAPI documentation](https://hellosean1025.github.io/yapi/openapi.html), with the official [YMFE/yapi](https://github.com/YMFE/yapi) implementation as the compatibility baseline. This is an independently implemented client. Server deployment, login session management, web administration, and undocumented endpoints are outside its scope.

The following documents are currently available in Simplified Chinese:

- [Technical choices and behavior contracts](docs/design.md)
- [Mapping of the 11 endpoints to CLI commands](docs/api-scope.md)
- [Iteration plan and acceptance criteria](docs/roadmap.md)

MIT License. This is an independent client and is not affiliated with the official YApi project.
