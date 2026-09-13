# Working conventions

## Load context by task

- **Implement or adjust a feature:** Read the [roadmap](docs/roadmap.md) first to establish the scope, dependencies, and acceptance criteria. Verify the implemented state in the code; commands in the plan do not imply that the capability is available.
- **Change the architecture, CLI output, configuration or authentication, write behavior, or packaging:** Read the relevant section of the [technical choices and behavior contract](docs/design.md) first. Apply confirmed decisions directly. Align on any unresolved choice that would change external behavior before proceeding.
- **Implement or troubleshoot YApi calls:** Read the [endpoint mapping and compatibility risks](docs/api-scope.md) first, then verify the target server version. Record documentation examples, upstream source findings, and instance validation results separately.
- **Install, run, or validate the project:** Read the [README](README.md). Treat [package.json](package.json) and package-lock.json as authoritative for scripts and dependency versions, and the [CI configuration](.github/workflows/ci.yml) as authoritative for the runtime matrix.
- **Publish to npm:** Complete the [roadmap release acceptance checks](docs/roadmap.md#%E8%BF%AD%E4%BB%A3-3%E5%85%BC%E5%AE%B9%E9%AA%8C%E6%94%B6%E4%B8%8E-npm-%E9%A6%96%E6%AC%A1%E5%8F%91%E5%B8%83). Publish only after the target, version, and authorization are explicit.

## Completion criteria

- For code changes, run the `check` script from package.json. If dependencies, the build, entry points, or published contents change, also run `test:package` to validate the actual package.
- Validate CLI behavior through the compiled process's stdout, stderr, and exit code. Test YApi behavior and perform instance acceptance according to the current iteration's requirements.
- For documentation changes, verify links, commands, and implementation status. Update the corresponding documentation when a feature or contract changes, and keep each convention in one authoritative location.
- On handoff, report the checks that actually passed, the runtime environment, and any incomplete acceptance work. Report local versus remote CI results and mock-service versus real-instance results separately.

<!-- CODEGRAPH_START -->
## CodeGraph

When the repository root contains `.codegraph/`, use CodeGraph before `rg` or direct file reads to understand or locate code:

- Use the `codegraph_explore` MCP tool when available. If it is deferred, discover it by name first.
- From the shell, run `codegraph explore "<symbols, file names, or question>"` to retrieve source and call paths.
- If the result is empty, irrelevant, or missing the target file, fall back to `rg` and the current files. An empty result does not prove that code is absent.

Skip CodeGraph when `.codegraph/` is absent; indexing is the user's decision.
<!-- CODEGRAPH_END -->

<!-- context7 -->
## External technical documentation

Use Context7 to retrieve current documentation for usage, configuration, migration, installation, or behavior-specific debugging involving a library, framework, SDK, API, CLI tool, or cloud service. Do not invoke it for pure refactoring, scripts written from scratch, business-logic debugging, code review, or general programming concepts.

1. Outside the default sandbox, run `npx ctx7@latest library <official name> "<specific query>"`. Use the official spelling and punctuation.
2. Select the relevant ID from the results. Prefer an exact name match, a relevant description, and a trusted source, then compare snippet counts and scores. If nothing matches, adjust the name or query; do not substitute an unrelated project with the same name.
3. Run `npx ctx7@latest docs <libraryId> "<specific query>"`. Focus each query on one concept; combine concepts only when researching their interaction. For version-specific questions, use the versioned ID from the search results.
4. Implement or answer from the retrieved documentation and retain the relevant sources.

If the user provides an ID in `/org/project` format, the library lookup may be skipped; otherwise, resolve the library first. Run at most three Context7 commands per question. Do not include credentials or other sensitive values in queries.

Retry outside the sandbox after DNS, name-resolution, or fetch errors. For quota errors, tell the user and suggest `npx ctx7@latest login` or setting `CONTEXT7_API_KEY`; do not silently fall back to training memory. If the target is not indexed, state the gap, then consult official documentation or source code.
<!-- context7 -->

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository; consume root `CONTEXT.md` and `docs/adr/` when present. See `docs/agents/domain.md`.
