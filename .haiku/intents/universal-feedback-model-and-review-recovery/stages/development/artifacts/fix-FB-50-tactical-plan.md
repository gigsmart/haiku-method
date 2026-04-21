# Fix FB-50 — Tactical Plan (planner, bolt 1)

**Finding:** `markdownToSimpleHtml` pipes raw HTML into `dangerouslySetInnerHTML` without sanitization.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/50-markdowntosimplehtml-pipes-raw-html-into-dangerouslysetinner.md`

## TL;DR

`markdownToSimpleHtml` in `packages/haiku-ui/src/components/ReviewPage.tsx:1610-1614` runs
`remark().use(remarkGfm).use(remarkHtml).processSync(md)` and hands the result to
`<InlineComments htmlContent=... />`, which splats it into
`dangerouslySetInnerHTML` at `packages/haiku-ui/src/components/InlineComments.tsx:243-246`.
`remark-html` preserves raw HTML in the source markdown by default
(`sanitize: false`). Intent/unit/knowledge/artifact docs on disk are
agent-authored — a prompt-injected `<script>` in any of them executes in the
reviewer's browser with access to the session E2E key in `sessionStorage`,
enabling feedback tampering against the already-zero-auth mutation endpoints
flagged by FB-20 / FB-30. The biome-ignore comment at InlineComments.tsx:243
claiming "sanitized markdown-it output from trusted intent docs" is wrong on
both counts (not markdown-it, not sanitized, not trusted in the
prompt-injection threat model).

## Root cause

Three independent errors compound:

1. **Pipeline choice.** `remark-html` is a HTML *stringifier*, not a sanitizer.
   Raw `<script>`, `<iframe>`, `<img onerror>`, `<style>`, `<a href="javascript:…">`
   all pass through unchanged. `remark-gfm` doesn't change this — it just adds
   tables, task-lists, autolinks.
2. **Trust-boundary mis-calibration.** The biome-ignore comment treats on-disk
   markdown as trusted input. Under H·AI·K·U, agents write those files; a
   prompt-injection or a malicious PR lands hostile content in a file that the
   reviewer's browser will execute. The trust boundary is "this process wrote
   this string," not "this file sits on disk."
3. **Stale doc comment.** The comment says "markdown-it output" — the code
   hasn't used markdown-it; it uses `remark` + `remark-html`. Any reader
   auditing the path reads the wrong thing and walks away reassured.

All six call sites of `markdownToSimpleHtml` in `ReviewPage.tsx` (lines 625,
832, 843, 1066, 1248, 1503) route user-displayed markdown through this one
function, so fixing it at the function removes the XSS surface for every
caller.

## Fix approach

Switch the pipeline from `remark → remark-html` (stringify raw HTML) to
`remark → remark-rehype → rehype-sanitize → rehype-stringify` (parse to hast,
whitelist-sanitize, stringify). Rehype-sanitize uses
`hast-util-sanitize` with the GitHub schema by default, which is the same
policy GitHub applies to README rendering — drops `<script>`, `<iframe>`,
`<style>`, event handlers (`onerror`, `onclick`, …), `javascript:` /
`data:text/html` URLs, and `on*` attributes. Keeps `<pre>`/`<code>`/`<table>`
and everything else the prose/table Tailwind classes are already styling.

### Why rehype-sanitize, not DOMPurify

- **Bundle cost.** The SPA already ships `remark`, `remark-gfm`, and pulls
  `remark-rehype` transitively through `react-markdown` (used by
  `MarkdownViewer.tsx`). `rehype-sanitize` + `rehype-stringify` add
  `hast-util-sanitize` (~7kB min+gz) and a stringifier (~4kB min+gz) on top of
  infrastructure already in the bundle. Adding `isomorphic-dompurify` would
  pull a parallel HTML parser (~20kB+ min+gz) that doesn't share a single
  byte with the rest of the SPA.
- **AST-level filtering.** Rehype-sanitize runs at the hast level before
  serialization, so malicious input never materializes as a string that gets
  re-parsed. DOMPurify post-processes an already-stringified HTML blob. Both
  are safe; rehype's ordering is marginally less error-prone because there is
  no "unsanitized HTML string" intermediate.
- **Policy is centralised.** One `rehype-sanitize` call in
  `markdownToSimpleHtml` covers every caller. No call site touches sanitizer
  config.
- **Sync API preserved.** `processSync` continues to work; the current
  signature `(md: string) => string` does not change.

Drop `remark-html` from the pipeline (and from `packages/haiku-ui/package.json`)
since nothing else imports it.

### Files to modify

1. `packages/haiku-ui/package.json`
   - Remove `remark-html`.
   - Add `rehype-sanitize` (`^6.0.0`) and `rehype-stringify` (`^10.0.0`).
     Both are current major versions compatible with `unified` v11 which the
     existing `remark` v15 uses.
   - `remark-rehype` — add as a direct dep (`^11.0.0`) rather than relying on
     the transitive pull via `react-markdown`, so tree-shaking and version
     pinning don't break it silently.

2. `packages/haiku-ui/src/components/ReviewPage.tsx`
   - Replace the three imports at the top:
     ```ts
     import { remark } from "remark"
     import remarkGfm from "remark-gfm"
     import remarkHtml from "remark-html"
     ```
     with:
     ```ts
     import rehypeSanitize from "rehype-sanitize"
     import rehypeStringify from "rehype-stringify"
     import { remark } from "remark"
     import remarkGfm from "remark-gfm"
     import remarkRehype from "remark-rehype"
     ```
   - Rewrite `markdownToSimpleHtml` (lines 1610-1614):
     ```ts
     /** Client-side markdown → sanitised HTML. InlineComments needs raw HTML
      *  (not a React tree) to track ranges for selection-based commenting,
      *  so we can't swap to react-markdown here. We sanitise at the hast
      *  layer via rehype-sanitize (GitHub-compatible allow-list) so raw HTML
      *  embedded in agent-authored markdown (intent/unit/knowledge/artifact
      *  docs) cannot inject <script>, <iframe>, event handlers, or
      *  javascript: URLs into the reviewer's DOM. Related: FB-50, FB-20,
      *  FB-30. */
     function markdownToSimpleHtml(md: string): string {
         return remark()
             .use(remarkGfm)
             .use(remarkRehype)
             .use(rehypeSanitize)
             .use(rehypeStringify)
             .processSync(md)
             .toString()
     }
     ```

3. `packages/haiku-ui/src/components/InlineComments.tsx`
   - Replace the inaccurate biome-ignore + audit-allow comment at lines
     243-245 with an accurate one:
     ```tsx
     // biome-ignore lint/security/noDangerouslySetInnerHtml: htmlContent is markdown rendered through remark + rehype-sanitize (GitHub-compatible allow-list) in markdownToSimpleHtml (ReviewPage.tsx); FB-50
     // audit-allow: sanitised via rehype-sanitize (hast-util-sanitize GitHub schema) in markdownToSimpleHtml; FB-50
     dangerouslySetInnerHTML={{ __html: htmlContent }}
     ```

### Tests

The planner hat **MUST** include a step for implementing test coverage for
every scenario in the product stage's `.feature` files. FB-50 is a security
finding with no direct feature-file scenario (cross-checked:
`.haiku/intents/universal-feedback-model-and-review-recovery/features/` —
review-ui and feedback-lifecycle features do not contain sanitisation
scenarios). The coverage obligation for this fix is therefore a targeted
regression test for the sanitiser itself, not a Cucumber scenario. This mirrors
the precedent set by existing security audit tests in
`packages/haiku-ui/tests/audit-banned-patterns.test.ts` (banned XSS sinks).

4. `packages/haiku-ui/tests/markdown-sanitizer.test.ts` — new file.
   - Export `markdownToSimpleHtml` from `ReviewPage.tsx` if not already
     exported (it's file-local today — add `export function`). The builder
     should make it a named export so the test can reach it without relying
     on the component mount path.
   - Cases (one test each):
     - `<script>alert(1)</script>` in the source markdown is NOT present in
       the output.
     - `<img src=x onerror="alert(1)">` — `<img>` passes, `onerror` attribute
       is stripped.
     - `[bad](javascript:alert(1))` — anchor renders without the
       `javascript:` href (sanitizer rewrites or drops).
     - `<iframe srcdoc="<script>alert(1)</script>">` — `<iframe>` tag is
       dropped.
     - Positive: standard markdown (`**bold**`, ``code``, `# heading`,
       GFM table, task-list) still renders into the expected HTML elements so
       we don't regress legitimate content rendering.
   - Keeps the scope to the single sanitizer entry point. No mounting
     `<InlineComments>` or `<ReviewPage>` — those paths are exercised by
     existing render tests.

## Files to modify

- `packages/haiku-ui/package.json` — swap `remark-html` → `rehype-sanitize` +
  `rehype-stringify` + `remark-rehype`.
- `packages/haiku-ui/src/components/ReviewPage.tsx` — imports + rewrite
  `markdownToSimpleHtml`; export it for the new test.
- `packages/haiku-ui/src/components/InlineComments.tsx` — correct the
  biome-ignore / audit-allow comments.
- `packages/haiku-ui/tests/markdown-sanitizer.test.ts` — new regression test.
- `package-lock.json` (root) — refreshed by `npm install` at the repo root
  (the workspace is npm-workspace managed).

## Verification

Run from repo root:

1. `npm install --workspace=haiku-ui` — resolves the new rehype deps and
   drops `remark-html`.
2. `cd packages/haiku-ui && npx tsc --noEmit` — strict compile clean;
   verifies imports + the unified chain's type parameters line up.
3. `cd packages/haiku-ui && npx vitest run tests/markdown-sanitizer.test.ts`
   — the five regression cases pass.
4. `cd packages/haiku-ui && npx vitest run tests/audit-banned-patterns.test.ts`
   — the existing XSS-sink audit still passes (we did not reintroduce
   `dangerouslySetInnerHTML` anywhere else; we kept the allow-listed one
   and corrected its comment).
5. `cd packages/haiku-ui && npm run audit:stage-wide` — the stage-wide audit
   suite still passes; the rewritten comment keeps the existing
   `audit-allow` token so `banned-xss-sinks-stage-wide` continues to
   whitelist the single intentional sink.
6. `grep -n "remark-html\|remarkHtml" packages/haiku-ui/src` — should return
   zero hits after the swap; confirms the dead dep is gone.
7. `grep -rn "sanitized markdown-it" packages/haiku-ui/src` — zero hits;
   the stale comment is gone.
8. `cd packages/haiku-ui && npm run build` — the SPA bundle builds; compare
   the emitted bundle size against the prior build to confirm we did not
   blow the budget — the swap should be net-neutral or slightly smaller
   because `remark-html` leaves and `remark-rehype`/`rehype-sanitize`/
   `rehype-stringify` arrive (two of which were transitively present).

## Risks

- **AST chain typing.** `processSync` inference with `unified@11` is loose;
  if TypeScript complains about the processor type after composing four
  plugins, the builder can annotate as `.processSync(md).toString()` at the
  call site (current code already does this) or cast the processor via
  `unified()` directly rather than `remark()` for explicit generic params.
- **Workspace deps.** The workspace uses npm workspaces; installing at the
  package level without `--workspace` flag can hoist oddly. Run
  `npm install --workspace=haiku-ui` from repo root — precedent: every
  other `package.json` edit in this intent used that pattern.
- **Default GitHub schema drops `className`.** `hast-util-sanitize`'s
  default schema does not allow arbitrary `class` attributes. If any of
  the agent-authored markdown currently uses inline `<div class="…">` to
  style prose (it doesn't — I grepped the on-disk intent/knowledge/stage
  docs for `<div class=`; zero hits), this would strip them. We accept
  the default schema; if a future need for allowed classes surfaces, we
  add an explicit allow-list via `rehype-sanitize(defaultSchema)` at that
  time.
- **No behavioural change for trusted content.** Standard markdown (bold,
  links to `http://` / `https://`, code, tables, images with http/https
  src, headings) still renders — the schema permits all of these. Only
  raw HTML + dangerous URL schemes get filtered.
- **One bolt.** This fix is a ~15-line source change, one new ~80-line
  test file, and three `package.json` line edits. Well within a bolt.

## Anti-patterns avoided

- No new unit spec created — strict fix-mode.
- No FSM field touched.
- Plan includes verification steps (MUST from hat mandate).
- Plan reads completion criteria (FB-50 body; stage scope).
- No behavioural change for legitimate markdown callers.
- Risk assessment up front (MUST from hat mandate).
- Test coverage step included for the single affected function (MUST from
  hat mandate — feature-file scenarios do not cover this finding directly,
  but the planner still mandates equivalent regression coverage).
