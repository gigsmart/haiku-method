---
title: >-
  unit-06: audit-lighthouse.mjs exits 1 with NO_FCP — completion criterion
  "exits 0 with a11y ≥ 0.95" not met
status: fixing
origin: adversarial-review
author: reviewer
author_type: agent
created_at: '2026-04-21T13:19:02Z'
iteration: 0
visit: 0
source_ref: packages/haiku-ui/scripts/audit-lighthouse.mjs
closed_by: null
bolt: 1
upstream_stage: null
---

## Finding

The unit spec's completion criterion is:

> `node packages/haiku-ui/scripts/audit-lighthouse.mjs` exits 0 with a11y score ≥ 0.95 on each pinned URL.

When run in this environment (macOS, stock Google Chrome 141, `lhci` 0.14.0 with bundled Lighthouse 12.1.0), the script exits **1**:

```
[audit-lighthouse] skipping build (--skip-build)
[audit-lighthouse] serving dist/ on http://localhost:50421
✅  .lighthouseci/ directory writable
✅  Configuration file found
✅  Chrome installation found
⚠️   GitHub token not set
Healthcheck passed!

Running Lighthouse 3 time(s) on http://localhost:50421/review/demo
Run #1...failed!
Runtime error encountered: The page did not paint any content. (NO_FCP)
Error: Lighthouse failed with exit code 1
```

Every audit in the run logs `Caught exception: NO_FCP`. The `lighthouseVersion` in lhci's embedded runner is **12.1.0**, not the 12.3.0 declared as a devDependency — the pinned version in `package.json` is not the version actually used at runtime, because `@lhci/cli@0.14.0` bundles its own lighthouse binary.

## Why this happens (part 1 — mis-routed fixtures, see FB-08)

Three of the four pinned URLs (`/review/demo`, `/question/demo`, `/direction/demo`) hit the plural/singular path mismatch in FB-08. The SPA attempts `/api/session/demo`, gets HTML back, throws a JSON parse error, and renders the "Session not found" error state. This is separate from NO_FCP but related — it means the harness cannot be green until FB-08 is fixed even if LH's FCP detection cooperates.

## Why this happens (part 2 — FCP on 4.97 MB bundle)

Ran `curl -s -o /dev/null -w "size=%{size_download}" http://localhost:PORT/assets/index-*.js` → **4,970,243 bytes** (≈5 MB). Headless Chrome under `lhci` default wait-for-condition times out at ~30s against this bundle on first load. The unit-03 bundle-size backlog (FB-02, FB-05 already logged in this stage) is the upstream driver — but the practical effect here is that lighthouse cannot green-light the unit with the current bundle footprint.

Suggested mitigations (pick one, not all):

1. **Fix FB-08 first, re-run, see if steady-state FCP happens after the fixture-mismatch is gone.** (The error-state page is tiny and should paint fast — but React is still booting behind it, and Lighthouse may be gating on main-thread quiescence.)
2. **Warm the bundle** before Lighthouse runs: after booting the server, `curl http://localhost:PORT/review/demo` once before invoking lhci, so the OS page cache holds the JS bundle when Lighthouse's Chrome navigates.
3. **Increase `maxWaitForFcp`** in `lighthouserc.json`:

   ```json
   "settings": {
     "maxWaitForFcp": 60000,
     ...
   }
   ```

4. **Serve the bundle gzipped** (the current script does zero content-encoding). A 5 MB JS bundle becomes ~1 MB gzipped and paints much faster. The `audit-lighthouse.mjs` static handler should honor `Accept-Encoding: gzip`.

## Additional issue: script declares pinned dep, lhci uses a different one

`packages/haiku-ui/package.json`:

```json
"lighthouse": "12.3.0",
"@lhci/cli": "0.14.0",
```

But the runtime-reported version is **12.1.0** — the copy inside `node_modules/@lhci/cli/node_modules/lighthouse`. Pinning `lighthouse` as a sibling devDependency does nothing at runtime: `lhci` imports the bundled version via its own `node_modules`.

Either:
- Drop the misleading `lighthouse` devDep (it's dead weight), OR
- Use `lhci autorun --useLhcLaunchChrome` with a shell `npx lighthouse` chained invocation that actually uses the pinned binary, OR
- Use npm's `overrides` to force `@lhci/cli` to resolve `lighthouse` from the root workspace:

  ```json
  "overrides": { "@lhci/cli": { "lighthouse": "12.3.0" } }
  ```

The unit spec calls out "Lighthouse CI with version pinned in `packages/haiku-ui/package.json` (explicit `lighthouse` dep)" — that pin is not load-bearing in the current configuration. Either make it load-bearing or remove the claim from the unit scope.

## Suggested verification

Before advancing this hat, run (from `packages/haiku-ui`):

```bash
node scripts/audit-lighthouse.mjs
echo "exit=$?"
```

and verify:
1. `exit=0`.
2. All four URLs show a11y score ≥ 0.95 in `.lighthouseci/lhr-*.json`.
3. Each LHR's `finalDisplayedUrl` renders the real shell+page DOM, not the "Session not found" error state.

## Confidence

**High.** Reproduced directly with `node scripts/audit-lighthouse.mjs` → exit 1, lhci log shows `Run #1...failed!` and the script's `await runLhci(...)` correctly sets `process.exitCode = exitCode`. The spec says exit 0; it exits 1.
