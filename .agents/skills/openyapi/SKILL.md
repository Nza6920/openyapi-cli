---
name: openyapi
description: Use the openyapi CLI to inspect a YApi project, categories, or interfaces, or to create, update, or import API documentation in YApi.
---

# Use openyapi

Use the installed `openyapi` command for YApi OpenAPI work. If it is unavailable, run the same commands through `npx openyapi-cli@latest` after confirming that the registry version supports the needed operation. Check `openyapi --help` and the target subcommand's `--help` against the installed version before constructing a command. For further detail, consult the README and `docs/api-scope.md` / `docs/design.md` in the installed `openyapi-cli` package or source checkout.

## Select the target

Identify the intended YApi server, project, and profile from the user's request or existing local configuration. Use `openyapi config show <name>` to inspect a profile without exposing its token. For remote operations, pass `--profile <name>` explicitly when several profiles could apply. If the target remains ambiguous, ask for the missing server or project before a write. Check the target deployment's YApi version when compatibility matters; the repository's upstream baseline and prior instance acceptance are separate evidence.

Use `OPENYAPI_TOKEN` for an ephemeral token. Store one with `openyapi config token set <name> --stdin` only when the user asks to save it locally. Keep tokens out of command arguments, committed files, logs, and replies. The CLI reads non-sensitive overrides from arguments, then environment, then profile; `OPENYAPI_TOKEN` overrides a saved token.

## Query

Prefer JSON output for inspection and automation. Use `project get`, `category list`, `interface get --id <id>`, `interface list`, or `interface tree` according to the requested data. Use `interface list --all` when the full result is needed; an ordinary list is paginated. Check stdout, stderr, and exit code; a failed command does not provide a partial result to report as complete. Report the server and project actually queried, and distinguish an instance observation from documentation or source expectations.

## Write or import

Prepare the exact JSON payload or import source, target project, and operation. User requests to create, update, or import authorize that scoped write; resolve any ambiguity about the target, interface, or import mode first. `category create` and `interface create/save/update` take exactly one of `--file` or `--stdin`. `import` takes exactly one of `--file`, `--stdin`, or `--url`, plus the target server's plugin `--type`. `--merge merge` requires `--allow-overwrite`. Review the selected payload and mode before running a command that could overwrite existing documentation.

The CLI checks project identity before POST and checks interface ownership for update, but a successful POST response alone does not prove the final server state. Read back the affected category or interface and compare the requested fields. If a POST times out or disconnects, treat its outcome as unknown: inspect server state before deciding whether another write is needed. Do not blindly retry.

## Report

Give the command's result, the read-back evidence for writes, and any uncertainty or compatibility gap. Keep local fixture tests, published package checks, and real YApi observations distinct. Consult the installed package README for exit codes and stable error codes when diagnosing failures.
