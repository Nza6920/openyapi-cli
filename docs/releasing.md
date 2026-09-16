# Release runbook

This runbook separates repository preparation from external publication. Merging
the workflow, passing checks, or implementing an issue does not authorize
publication. Issues #20 and #22 are explicit human gates.

## Repository gate

The release candidate is fixed to package `openyapi-cli`, version `0.1.0`, the
`main` branch, and initial dist-tag `next`. Before requesting publication:

1. Run `npm ci`, `npm run check`, `npm run test:package`, and inspect
   `npm pack --json`.
2. Require Linux, Windows, and macOS jobs on Node 22 and 24 to pass on the exact
   candidate SHA. A skipped, cancelled, or older run is not evidence.
3. Confirm `package.json`, `package-lock.json`, `CHANGELOG.md`, and the tarball
   all describe `0.1.0`.
4. Recheck npm identity, 2FA/access requirements, package-name ownership, and
   exact version state immediately before publishing. A historic E404 is not a
   reservation of the name.

## Protected first publish

Create the `npm-production` GitHub Environment and configure at least one
required reviewer. Store the one-time, least-privilege npm publication token as
the Environment secret `NPM_TOKEN`; never put its value in source, an Issue,
workflow output, artifacts, or command arguments.

After the authorized maintainer has created annotated tag `v0.1.0` at the exact
accepted commit, open GitHub Actions, choose **Publish 0.1.0 to npm next**, and
run the workflow from `main`. An authorized reviewer must approve the protected
job. The workflow has no package/version/tag/ref inputs and publishes exactly
once with public access, provenance, and dist-tag `next`.

If publish times out, disconnects, or reports failure, treat the outcome as
unknown. Read the exact package version and dist-tag from the registry. Do not
retry and do not unpublish merely because the transport result was unclear.

The first `0.1.0` publish printed npm success, but its immediate in-workflow
read-back ran before registry propagation and marked the run failed. A later
independent read confirmed `openyapi-cli@0.1.0`, its tarball/integrity, and its
provenance. The workflow therefore polls boundedly after a successful publish;
it still invokes `npm publish` exactly once. A workflow failure after a publish
attempt is a registry-read task, not authorization to republish.

Because the original run ended in failure, issue #20 remains open. After merging
the read-back fix, manually run **Verify published 0.1.0 recovery** from `main`
and approve its `npm-production` job. It checks the immutable `v0.1.0` source,
registry integrity, `next`, and provenance source identity without a token,
`npm publish`, or a dist-tag mutation. Close #20 only after that recovery run
succeeds and its URL is recorded.

## Separated acceptance and finalization

After `next` exists, issue #21 installs `openyapi-cli@0.1.0` from the public
registry in a clean directory and records registry URL/integrity, installed
metadata, CLI/config behavior, local-fixture reads and a safe fixture write. A
local tarball is not registry evidence.

Only after registry acceptance may the authorized maintainer complete issue
#22: run read-only checks against the approved real YApi instance, configure npm
Trusted Publishing for this exact repository/workflow, revoke and remove the
one-time token, move the already-published `0.1.0` artifact to `latest`, and
create the GitHub Release from the matching changelog entry. Do not rebuild or
republish the tarball during promotion.

For this first package the registry currently resolves both `next` and `latest`
to `0.1.0`, despite the workflow requesting only `next` and containing no
`npm dist-tag` command. Treat that as an observed state: do not blindly move or
remove tags. Issue #22 must explicitly record the final intended dist-tag state
before any authorized tag change.

Record fixture, tarball, remote CI, registry, and real-instance results
separately in [the Sprint 3 acceptance record](acceptance/sprint3.md). A failure
in one layer stops later gates; a public defect is fixed forward as `0.1.1`
unless a current security policy requires a separately authorized response.
