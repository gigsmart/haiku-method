---
title: >-
  unit-06: audit-lighthouse.mjs serves HTML for /assets/*.js → NO_FCP on every
  URL, exits 1
status: fixing
origin: adversarial-review
author: agent
author_type: agent
created_at: '2026-04-21T13:49:54Z'
iteration: 0
visit: 0
source_ref: unit-06-shell-and-routing/reviewer/bolt-2
closed_by: null
bolt: 2
upstream_stage: null
---

## Finding (confidence: high)

The unit spec's final completion criterion is:

> `node packages/haiku-ui/scripts/audit-lighthouse.mjs` exits 0 with a11y score ≥ 0.95 on each pinned URL.

Running that command in the unit worktree exits **1**, with `runtimeError.code: NO_FCP` on every one of the four pinned URLs (`/review/demo`, `/review/current`, `/question/demo`, `/direction/demo`). Lighthouse cannot compute an accessibility score because the SPA never paints content — no JS ever runs in the headless browser. The hard gate is not met; there is no accessibility signal for the pinned pages.

Root cause is a one-line static-asset routing bug in `packages/haiku-ui/scripts/audit-lighthouse.mjs`:

```js
const distEntries = new Set(await readdir(DIST)) // only top-level entries: ['assets', 'index.html']
// ...
if (pathname !== "/" && distEntries.has(pathname.slice(1))) {
  const body = await readFile(join(DIST, pathname.slice(1)))
  // ...
}
// SPA fallback — serves indexHtml
```

Vite emits the hashed JS/CSS into `dist/assets/*`, and the built `dist/index.html` references them as `src="/assets/index-<hash>.js"` / `href="/assets/style-<hash>.css"`. When the browser requests `/assets/index-BjBqG0oW.js`, `distEntries.has("assets/index-BjBqG0oW.js")` is `false` (the Set only contains the top-level names `"assets"` and `"index.html"`), so the request falls through to the SPA fallback and returns HTML. The browser fails to parse the "JS", no script runs, and the page stays blank — which is exactly what Lighthouse reports.

This is the **regression guard the spec designed to prevent** — the harness ships pinned and green, but actually exercises nothing. As the anti-patterns for this hat say: the reviewer MUST check all three artifact levels: existence, substance, and wiring. The harness exists, but the wiring (static asset routing) is broken, so the substance (a11y score) is unobservable.

## Evidence

- `packages/haiku-ui/scripts/audit-lighthouse.mjs:108-155` — the server only checks top-level `distEntries`, no recursion into `dist/assets/`.
- `packages/haiku-ui/dist/assets/` actually contains `index-BjBqG0oW.js`, `index-BjBqG0oW.js.map`, `style-CiA2BGO_.css` — none reachable via the audit server.
- `packages/haiku-ui/dist/index.html` references `/assets/index-BjBqG0oW.js` and `/assets/style-CiA2BGO_.css`.
- `node packages/haiku-ui/scripts/audit-lighthouse.mjs --skip-build` exits 1 with:
  - `"runtimeError": { "code": "NO_FCP", "message": "The page did not paint any content..." }`
  - `"scoreDisplayMode": "error"` on every accessibility audit.
  - `"Run #1...failed! Error: Lighthouse failed with exit code 1"` repeated for each pinned URL.
- Reproduced standalone: a minimal `readdir(DIST)` returns `['assets', 'index.html']`; `distEntries.has("assets/index-<hash>.js")` is `false`.

Separately, the accessibility audits that DO produce signal (e.g. `button-name`, `bypass`, `skip-link`, `landmark-one-main`) would be the exact checks this unit's scope is meant to protect — the icon-only `<ThemeToggle>` label regression guard, the skip-link-first-in-tab-order guard, the landmark composition. Losing all of them to a server-routing typo is the worst-case outcome for a "regression guard" gate.

## Suggested fix

Replace the shallow `distEntries` check with a real static-file resolver that walks into `dist/` and guards against path escape. Minimum viable patch (inline in `bootServer`):

```js
async function bootServer() {
  const indexHtml = await readFile(join(DIST, "index.html"))

  return await new Promise((resolveBoot, rejectBoot) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost")
        const pathname = url.pathname

        // ... /api/* handlers unchanged ...

        // Static asset from dist/ — any path that resolves inside DIST.
        if (pathname !== "/") {
          const candidate = resolve(DIST, "." + pathname) // leading "." + path prevents absolute hijack
          if (candidate.startsWith(DIST + "/") || candidate === DIST) {
            try {
              const body = await readFile(candidate)
              res.writeHead(200, { "content-type": contentType(pathname) })
              res.end(body)
              return
            } catch (err) {
              if (err.code !== "ENOENT" && err.code !== "EISDIR") throw err
              // fall through to SPA fallback
            }
          }
        }

        // SPA fallback — /review/demo, /question/demo, etc.
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        res.end(indexHtml)
      } catch (err) { /* unchanged 500 handler */ }
    })
    // ... unchanged ...
  })
}
```

`resolve` is already imported. Any request for `/assets/index-<hash>.js` resolves to `DIST/assets/index-<hash>.js`, which `readFile` serves; any SPA route like `/review/demo` resolves to `DIST/review/demo`, `readFile` throws `ENOENT`, and the fallback serves `indexHtml`. Path-escape guard (`startsWith(DIST + "/")`) mirrors the `..`-in-path defense already in `parseRoute.ts`.

After the fix, re-run:

```
node packages/haiku-ui/scripts/audit-lighthouse.mjs
```

and confirm:

1. Exit code is 0.
2. The stdout log shows `✓ assertion categories:accessibility >= 0.95` for all four URLs (not `"scoreDisplayMode": "error"`).
3. `.lighthouseci/` artifacts contain real audit data per URL, not `runtimeError: NO_FCP` stubs.

If Chrome can't launch in the current environment (and only then), set `LIGHTHOUSE_SKIP=1` in CI as a last resort — but the criterion explicitly requires a green run, so document the skip path in the unit spec if you take that route. Do not ship the harness passing a gate it never actually ran.

## Blast radius

Everything else in the unit passes review on its own merits — `App.tsx` is 76 lines with no page-specific JSX, `parseRoute` covers all four page types plus 404 plus path traversal, `ThemeToggle` has `aria-label="Toggle theme"` + `touchTargetClass` + persistence (all asserted by `ThemeToggle.test.tsx`), `SkipLink` is verified first-focusable by `tests/skip-link.spec.tsx`, `tsc --noEmit` is clean, and the parity spec re-runs green on the new shell. This single finding is the only blocker.

Confidence: **high** — the failure reproduces deterministically on every invocation and the root cause is a file-resolution check that demonstrably cannot succeed for any asset under `dist/assets/`.
