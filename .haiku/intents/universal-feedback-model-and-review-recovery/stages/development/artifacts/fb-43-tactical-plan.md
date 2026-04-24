# Tactical Fix Plan: FB-43 — Mermaid CDN SRI + version pin + explicit strict

Owner: planner (fix-mode bolt 1/3)
Finding: FB-43 — _Mermaid CDN script loaded without Subresource Integrity — supply-chain XSS vector_
Scope: minimal hardening of `packages/haiku-ui/src/components/MermaidDiagram.tsx`. Do **not** re-architect away from CDN loading in this fix — the reviewer marked bundling as a "consider" (not a required fix). The required fixes are pin + SRI + crossOrigin + explicit `securityLevel: "strict"`.

---

## Target file

- `packages/haiku-ui/src/components/MermaidDiagram.tsx` — lines 30–33 (script creation) and lines 42–53 (`mermaid.initialize` call).

Only one file changes for the core fix. No other callsite loads Mermaid from a CDN (grep confirmed: `cdn.jsdelivr` only appears in this file).

## Context already gathered (no re-discovery needed)

- Mermaid is **not** a first-party dep in `packages/haiku-ui/package.json` — it is lazy-loaded from jsDelivr on first render of `<MermaidDiagram>`. Two consumers: `ReviewPage.tsx:738` and `ReviewPage.tsx:771`. Both pass `definition={mermaid}` strings rendered from review artifacts — not user input, but rendered-as-HTML via `ref.current.innerHTML = svg` on line 58 (gated on Mermaid's own sanitizer).
- The component already routes graph-compatible definitions to `MermaidFlow` (React Flow + ELK) via `canRenderAsFlow`. The CDN script only runs for non-flow (sequence, class, etc.) definitions — still a live path, still exploitable.
- File churn: two commits touch this file (`80dfc4c8` move from `review-app`, `8a984bff` allow-list audit annotations). Low churn — safe to edit surgically.
- Mermaid npm `latest` today (2026-04-21) is **`11.14.0`**. jsDelivr serves `https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js` with HTTP 200 and CORS `access-control-allow-origin: *` (verified via `curl -sI`). The `anonymous` CORS mode requires this header — it's present, so SRI enforcement will work without breaking the load.
- Computed SRI digest (sha384, base64) for `mermaid@11.14.0/dist/mermaid.min.js`:

  ```
  sha384-1CMXl090wj8Dd6YfnzSQUOgWbE6suWCaenYG7pox5AX7apTpY3PmJMeS2oPql4Gk
  ```

  Computed with:
  ```sh
  curl -s "https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js" \
    | openssl dgst -sha384 -binary | openssl base64 -A
  ```
  The builder MUST NOT skip recomputing this hash if they bump the pinned version — any version drift without a matching integrity hash will hard-fail the script load.

## Scope — what to change (exactly)

### 1. Pin an exact version + SRI + crossOrigin

Replace the three-line block at `MermaidDiagram.tsx:30-33`:

```ts
// Load mermaid from CDN dynamically — too large to bundle
const script = document.createElement("script")
script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"
script.onload = () => {
```

with the SRI-hardened equivalent:

```ts
// Load mermaid from CDN dynamically — too large to bundle.
// Version is pinned and guarded by SRI. See docs/security/mermaid-sri.md
// for the rotation process; bumping MERMAID_VERSION requires recomputing
// MERMAID_SRI via the command documented there. A mismatched hash will
// hard-fail the script load (caught by script.onerror below).
const MERMAID_VERSION = "11.14.0"
const MERMAID_SRI =
  "sha384-1CMXl090wj8Dd6YfnzSQUOgWbE6suWCaenYG7pox5AX7apTpY3PmJMeS2oPql4Gk"
const script = document.createElement("script")
script.src = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`
script.integrity = MERMAID_SRI
script.crossOrigin = "anonymous"
script.onload = () => {
```

Both constants MUST be declared at the top of the `useEffect` body (not at module scope) so the existing cleanup path (`script.remove()` on unmount) still tears down a single deterministic `<script>` element per render. Do not promote them to module constants — keeping them inside the hook matches the existing pattern and avoids a spurious diff blast radius.

### 2. Explicit `securityLevel: "strict"` in `mermaid.initialize`

Within the `mermaid.initialize({...})` object at `MermaidDiagram.tsx:42-53`, add `securityLevel: "strict"` as the first key (ordering preference — easy to spot in review; not functionally significant). The block becomes:

```ts
mermaid.initialize({
  securityLevel: "strict",
  startOnLoad: false,
  theme: "dark",
  themeVariables: { /* unchanged */ },
})
```

Rationale: Mermaid v11's default IS `"strict"` (confirmed by the reviewer in FB-43), but the defaults are a moving target across majors. Being explicit pins behaviour to what we intend, and makes the security posture auditable via grep (`securityLevel:` is now searchable across the codebase).

### 3. Document the rotation process

Create `docs/security/mermaid-sri.md` (new file, project root — **not** a website doc, not a `website/content/docs/` entry; this is an internal engineering runbook). Content:

```markdown
# Mermaid CDN pin — SRI rotation

The review UI at `packages/haiku-ui/src/components/MermaidDiagram.tsx` loads
Mermaid from jsDelivr with a pinned version and a Subresource Integrity
(SRI) digest. This document is the rotation runbook.

## Why we pin + SRI

Mermaid is loaded from `cdn.jsdelivr.net`. Without a pin, a compromised npm
publish or CDN cache poisoning yields arbitrary JavaScript in the review
UI with access to the session JWT and annotation draft data. SRI forces
the browser to reject any script whose SHA-384 doesn't match the
committed digest.

## Bumping the version

1. Pick the target version (verify it still publishes a `dist/mermaid.min.js` artifact on jsDelivr):
   ```sh
   curl -sI "https://cdn.jsdelivr.net/npm/mermaid@<NEW_VERSION>/dist/mermaid.min.js"
   ```
2. Compute the SRI digest:
   ```sh
   curl -s "https://cdn.jsdelivr.net/npm/mermaid@<NEW_VERSION>/dist/mermaid.min.js" \
     | openssl dgst -sha384 -binary | openssl base64 -A
   ```
3. Update both `MERMAID_VERSION` and `MERMAID_SRI` in
   `packages/haiku-ui/src/components/MermaidDiagram.tsx`. Both MUST change
   in the same commit — a version bump without a matching integrity hash
   is a hard-failure load.
4. Smoke-test locally: `npm run dev` in `packages/haiku-ui`, open the
   review page, confirm the Mermaid diagrams still render.
5. Run the stage-wide audit to confirm no regression:
   ```sh
   cd packages/haiku-ui && npm run audit:stage-wide
   ```
6. Commit with message `haiku-ui: bump mermaid CDN pin to <NEW_VERSION>`.

## Why not bundle?

The component comment historically said "too large to bundle". This is
still true for an eager bundle: Mermaid weighs ~3 MB uncompressed. A
proper fix is Vite code-splitting + a dynamic `import("mermaid")` chunk
that the browser fetches on first render. That would eliminate the CDN
trust dependency entirely but is out of scope for this security fix. See
FB-43's "Consider bundling" note. Track as follow-up.
```

### 4. No test changes required

Rationale: the CDN load path is environment-dependent (jsdom does not execute `<script>` inject-load). The existing component has no test in the haiku-ui test suite (grep `MermaidDiagram.test` → 0 hits). Adding a jsdom integration test that stubs `document.head.appendChild` and asserts the `integrity`/`crossOrigin` attributes is low-value (the builder would test that the builder wrote the attributes, not that they work) and out of scope for this planner bolt. The security posture is grep-verifiable:

```sh
grep -n 'script.integrity' packages/haiku-ui/src/components/MermaidDiagram.tsx
grep -n 'securityLevel: "strict"' packages/haiku-ui/src/components/MermaidDiagram.tsx
```

If the assessor later requires a regression test, open a follow-up — this bolt is already at the ceiling of what planner + builder should land under the `fix_hats` sequence for one finding.

## Out of scope (do NOT do)

- Bundling Mermaid via Vite dynamic import. The reviewer marked this "consider", not required. It is a non-trivial refactor (vite config, chunk split, CSP compatibility) and will exceed the 3-bolt cap for FB-43. Tracked in the SRI runbook's "Why not bundle?" section for follow-up.
- Touching `MermaidFlow.tsx` or `mermaid-flow/parser.ts`. Those consume neither the CDN nor the `mermaid` global — they use `@xyflow/react` + `elkjs` which are bundled deps. Unrelated surface.
- Adding a CSP header on the surrounding app. That is a server/harness concern, not a haiku-ui component concern. Worth a separate finding if the reviewer wants CSP coverage; FB-43 explicitly scopes the fix to this component.
- Changing consumers in `ReviewPage.tsx`. No API change — both callsites keep passing `definition={mermaid}`.

## Builder steps (ordered)

1. Edit `packages/haiku-ui/src/components/MermaidDiagram.tsx`:
   - Replace lines 30–33 with the SRI-hardened block from §1 above.
   - Add `securityLevel: "strict"` as the first key in `mermaid.initialize({...})` at lines 42–53.
2. Create `docs/security/mermaid-sri.md` with the runbook content from §3.
3. Run the grep-verifiable smoke check:
   ```sh
   grep -n 'script.integrity\|script.crossOrigin\|MERMAID_VERSION\|MERMAID_SRI\|securityLevel: "strict"' \
     packages/haiku-ui/src/components/MermaidDiagram.tsx
   ```
   Expect 5+ hits.
4. Run `cd packages/haiku-ui && npm run typecheck` — expect exit 0. The type change is additive-only; no shape of the `window.mermaid` cast changes.
5. Run `cd packages/haiku-ui && npm run test` — expect exit 0. No test touches this component; they should all still pass unchanged.
6. Stage the diff:
   ```sh
   git add packages/haiku-ui/src/components/MermaidDiagram.tsx docs/security/mermaid-sri.md
   ```
7. Commit on the current branch (`haiku/universal-feedback-model-and-review-recovery/development`) with message:
   ```
   haiku: fix FB-43 bolt 1 (builder)
   ```
   Do NOT push. Do NOT amend — always a new commit.

## Risks (R1–R3)

- **R1 — jsDelivr stops serving `mermaid@11.14.0`.** jsDelivr keeps historical versions indefinitely for npm packages (npm itself is append-only), so this is effectively impossible barring a package unpublish (which npm heavily restricts for 72+ hour old versions). Accepted.
- **R2 — The SRI hash in this plan is wrong.** The builder MUST re-compute it with the `curl … | openssl dgst -sha384 -binary | openssl base64 -A` command from §3 and compare. If the hash in the committed code does not match what the CDN serves, the browser will block the load and `script.onerror` will trigger — surfaced as a loud "Failed to load Mermaid renderer" banner in the UI, caught by smoke test in step 3 of the rotation runbook. Mitigation: recompute at build time in the runbook.
- **R3 — Parallel chain clobber.** FB-43 is the only finding flagging `MermaidDiagram.tsx`. A grep of the open-feedback directory (`stages/development/feedback/`) for "mermaid" or "MermaidDiagram" shows only FB-43. Low collision risk; builder should still `git diff` the file before staging to confirm nobody else has touched it.

## Verification (for assessor)

- `grep -n 'script.integrity' packages/haiku-ui/src/components/MermaidDiagram.tsx` returns 1 hit.
- `grep -n 'script.crossOrigin' packages/haiku-ui/src/components/MermaidDiagram.tsx` returns 1 hit.
- `grep -n 'MERMAID_VERSION = "11.14.0"' packages/haiku-ui/src/components/MermaidDiagram.tsx` returns 1 hit.
- `grep -n 'securityLevel: "strict"' packages/haiku-ui/src/components/MermaidDiagram.tsx` returns 1 hit.
- `docs/security/mermaid-sri.md` exists and documents the rotation command.
- `grep -rn 'mermaid@11/dist' packages/haiku-ui/src/` returns 0 hits (the unpinned URL is gone).
- `npm run typecheck` and `npm run test` (inside `packages/haiku-ui`) exit 0.
