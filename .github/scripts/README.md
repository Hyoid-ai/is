# [TEST] lodash-regression (Hyoid verifier demo)

[TEST] Test-only fixture for the Hyoid verifier demo. Not part of upstream `is`.

`lodash-regression.mjs` fails if any **resolved** `lodash` below 4.17.21 (CVE-2021-23337) is present. Prereleases count as below. It looks at what npm resolved, not at declared ranges:

- a committed `package-lock.json` is required (missing = fail); `npm-shrinkwrap.json` is also read;
- every lockfile entry, nested and aliased (`npm:lodash@…`, or `name: "lodash"`), with a registry source;
- `npm ls lodash --all --json` after `npm ci --ignore-scripts` (non-zero exit is tolerated; its JSON is still parsed);
- every installed `node_modules/**/lodash` (by package name, so aliases count).

`lodash-regression.selftest.mjs` runs the fixture set (QA2's 15 bypasses, the earlier 7 cases, edge cases) and runs in CI before the real check.

## Out of scope

- `lodash.*` split packages (e.g. `lodash.template`) are not checked.
- npm workspaces: a `workspaces` field makes the check fail as unsupported.
- `pnpm-lock.yaml` / `yarn.lock`: their presence makes the check fail as unsupported.
