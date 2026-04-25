# Fix FB-19 — Tactical Plan (planner, bolt 1)

**Finding:** `packages/haiku-api/src/schemas/feedback.ts` and
`packages/haiku-api/src/schemas/revisit.ts` drop the string-length caps the
unit-01 spec declares. Today:

- `FeedbackCreateRequestSchema.title` caps at 120 (spec: ≤ 200)
- `FeedbackCreateRequestSchema.body` has no max (spec: ≤ 10_000)
- `FeedbackCreateRequestSchema` has no `author` field at all (spec: "author ≤ 200" on the feedback schema group)
- `FeedbackCreateRequestSchema.source_ref` has no max
- `FeedbackItemSchema` response wire shape has every string field uncapped (spec: "Every string field has an explicit `.max()` cap")
- `RevisitReasonSchema.title` caps at 120 (spec: ≤ 200)
- `RevisitReasonSchema.body` has no max (spec: ≤ 10_000)
- `RevisitRequestSchema.reasons` has no `.max(50)`

The `RevisitModal.tsx` comment block (lines 31–42) openly documents the
band-aid: UI enforces a tighter cap than the wire because the wire is
uncapped. That workaround evaporates once the wire matches the spec.

**Feedback file:**
`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/19-unit-01-feedback-revisit-schemas-drop-spec-declared-string-c.md`

**Spec references (verified against tree):**
- `unit-01-extract-haiku-api-package.md:79` — feedback schemas: "Every string
  field has an explicit `.max()` cap (title ≤ 200, body ≤ 10_000, author ≤
  200, etc.)."
- `unit-01-extract-haiku-api-package.md:80` — revisit schemas: "`RevisitReasonItem`
  (title ≤ 200, body ≤ 10_000), `RevisitRequest` (reasons array `.max(50)`)".
- `unit-11-revisit-modal-and-assessor-card.md:57` — downstream consumer
  explicitly depends on "title ≤ 200, body ≤ 10_000, reasons.length ≤ 50"
  being enforced at the wire.

## Current state (verified 2026-04-21 against tree, not feedback body's line numbers)

**`packages/haiku-api/src/schemas/feedback.ts` (re-read):**

```ts
// FeedbackItemSchema — response wire shape (lines 28–56)
feedback_id: z.string()
title:       z.string()                         // no max
body:        z.string()                         // no max
author:      z.string()                         // no max
source_ref:  z.string().nullable()              // no max
closed_by:   z.string().nullable()              // no max
// ... (status/origin/author_type/visit are enums or numbers — no string caps to apply)

// FeedbackCreateRequestSchema (lines 87–95)
title:       z.string().min(1).max(120)         // spec says 200
body:        z.string().min(1)                  // no max — spec says 10_000
origin:      FeedbackOriginSchema.optional().default("user-visual")
source_ref:  z.string().nullable().optional()   // no max
anchor:      FeedbackAnchorSchema.optional()
// no author field — spec section on feedback schemas mentions "author ≤ 200"

// FeedbackUpdateRequestSchema (lines 117–126)
status:      FeedbackStatusSchema.optional()
closed_by:   z.string().optional()              // no max
```

**`packages/haiku-api/src/schemas/revisit.ts` (re-read):**

```ts
// RevisitReasonSchema (lines 19–25)
title: z.string().min(1).max(120)               // spec says 200
body:  z.string().min(1)                        // no max — spec says 10_000

// RevisitRequestSchema (lines 28–43)
stage:   z.string().optional()                  // no max
reasons: z.array(RevisitReasonSchema).optional() // no .max(50) — spec says 50
```

**`packages/haiku-api/test/schemas.test.mjs`:**
- `FeedbackCreateRequestSchema` block (lines 314–330) only asserts title=""
  is rejected — no cap-boundary coverage.
- `RevisitReasonSchema` block (lines 637–645) only asserts title="" and
  missing-body are rejected — no 200/10_000 boundary.
- `RevisitRequestSchema` block (lines 647–660) only asserts `stage: 5` is
  rejected — no 50-reasons boundary.
- `FeedbackItemSchema` block (lines 283–293) only asserts a bogus status is
  rejected — no string-cap coverage on the response shape.

**`packages/haiku-ui/src/components/RevisitModal.tsx` (lines 31–42):**
Contains the explicit workaround comment that says "The wire schema caps
title at 120 and has no body/reasons.length cap. The UI enforces the
TIGHTER of each." Once the wire matches the spec, the client can import
caps from `haiku-api` instead of hard-coding them.

**`packages/haiku/src/http.ts`:**
- Line 1153: uses `FeedbackCreateRequestSchema` via `parseJsonBody`.
- Line 1175–1181: `writeFeedbackFile` call — `author` is hardcoded to
  `"user"`; the request body's `author` (if we add it) is currently
  ignored. This is fine for bolt 1 — adding the schema field doesn't
  change handler behavior; it lets the contract accept author while the
  handler continues to overwrite it. A future unit can wire the request
  `author` through.
- Line 1550: uses `RevisitRequestSchema` via `parseJsonBody`.

## Fix approach

Four coordinated edits, all in `packages/haiku-api` plus one doc-comment
cleanup in `packages/haiku-ui`:

1. **`packages/haiku-api/src/schemas/feedback.ts`** — tighten every string
   field on `FeedbackItemSchema`, tighten `FeedbackCreateRequestSchema`,
   add an optional `author` field to `FeedbackCreateRequestSchema`, tighten
   `FeedbackUpdateRequestSchema.closed_by`.
2. **`packages/haiku-api/src/schemas/revisit.ts`** — bump `title` to 200,
   add `.max(10_000)` to `body`, add `.max(50)` to `RevisitRequestSchema.reasons`,
   add a `.max(200)` to `stage` (small, bounded identifier).
3. **`packages/haiku-api/test/schemas.test.mjs`** — add cap-boundary
   round-trip tests for each new cap on both schema families.
4. **`packages/haiku-ui/src/components/RevisitModal.tsx`** — update the
   comment block (lines 31–42) to reflect that the wire now matches the
   spec; keep the `UI_*_MAX` constants but bump `UI_TITLE_MAX` from 120
   to 200 so the UI stops under-cutting the wire. OPTIONAL: re-export
   caps from `haiku-api` instead of hardcoding — deferred to keep the
   blast radius small.

### Canonical cap values (what the wire advertises)

| Schema                             | Field        | Cap      | Spec line            |
|------------------------------------|--------------|----------|----------------------|
| `FeedbackItemSchema`               | `title`      | 200      | unit-01 §3 line 79   |
| `FeedbackItemSchema`               | `body`       | 10_000   | unit-01 §3 line 79   |
| `FeedbackItemSchema`               | `author`     | 200      | unit-01 §3 line 79   |
| `FeedbackItemSchema`               | `source_ref` | 1_000    | derived (bounded ref)|
| `FeedbackItemSchema`               | `closed_by`  | 200      | unit slug = unit-NN-…|
| `FeedbackItemSchema`               | `feedback_id`| 32       | pattern FB-NNNN      |
| `FeedbackItemSchema`               | `created_at` | 40       | ISO-8601 is ≤ 40     |
| `FeedbackCreateRequestSchema`      | `title`      | 200      | matches item         |
| `FeedbackCreateRequestSchema`      | `body`       | 10_000   | matches item         |
| `FeedbackCreateRequestSchema`      | `author`     | 200      | new optional field   |
| `FeedbackCreateRequestSchema`      | `source_ref` | 1_000    | matches item         |
| `FeedbackUpdateRequestSchema`      | `closed_by`  | 200      | matches item         |
| `RevisitReasonSchema`              | `title`      | 200      | unit-01 §3 line 80   |
| `RevisitReasonSchema`              | `body`       | 10_000   | unit-01 §3 line 80   |
| `RevisitRequestSchema`             | `stage`      | 200      | stage slug bounded   |
| `RevisitRequestSchema`             | `reasons`    | 50 items | unit-01 §3 line 80   |

Rationale for the two spec-silent caps (`source_ref` = 1_000, `stage` = 200):
- `source_ref` is a back-reference string (review-agent run id or filename
  path). 1 KiB is comfortably larger than any realistic artifact path and
  well below the 128 KiB feedback-route cap.
- `stage` is a stage slug (e.g. `development`, `product`, `design`). 200
  chars is identical to unit/intent slug caps used throughout `state-tools.ts`.

### Implementation sketch — `packages/haiku-api/src/schemas/feedback.ts`

```ts
// FeedbackItemSchema — every string field now carries a cap.
export const FeedbackItemSchema = z
  .object({
    feedback_id: z.string().max(32).describe("FB-NN identifier (scoped per stage)"),
    title:       z.string().max(200),
    body:        z.string().max(10_000),
    status:      FeedbackStatusSchema,
    origin:      FeedbackOriginSchema,
    author:      z.string().max(200).describe("Free-form author handle (e.g. 'user', 'agent')"),
    author_type: AuthorTypeSchema,
    created_at:  z.string().max(40).describe("ISO-8601 creation timestamp"),
    visit:       z.number().int().nonnegative().describe("Stage-visit counter at creation time"),
    source_ref:  z.string().max(1_000).nullable().describe("Back-reference to origin artifact (e.g. review-agent run id)"),
    closed_by:   z.string().max(200).nullable().describe("Unit slug whose feedback-assessor hat certified closure, or null while open."),
  })
  .describe("Wire shape of a feedback item")

// FeedbackCreateRequestSchema — matches the item caps on overlapping
// fields + adds an optional author field per spec.
export const FeedbackCreateRequestSchema = z
  .object({
    title:      z.string().min(1).max(200),
    body:       z.string().min(1).max(10_000),
    origin:     FeedbackOriginSchema.optional().default("user-visual"),
    author:     z.string().max(200).optional(),
    source_ref: z.string().max(1_000).nullable().optional(),
    anchor:     FeedbackAnchorSchema.optional(),
  })
  .describe("POST /api/feedback/:intent/:stage request body")

// FeedbackUpdateRequestSchema — close the last uncapped string.
export const FeedbackUpdateRequestSchema = z
  .object({
    status:    FeedbackStatusSchema.optional(),
    closed_by: z.string().max(200).optional(),
  })
  .refine((d) => d.status !== undefined || d.closed_by !== undefined, {
    message: "At least one of 'status' or 'closed_by' must be provided",
  })
  .describe("PUT /api/feedback/:intent/:stage/:id request body")
```

Note on the `title` bump from 120 → 200: the production fixture in
`validFeedbackItem` (test line 269–281) has title `"Missing error handling"`
(22 chars), so it still parses. The `.min(1)` lower bound for create
requests stays. Any client that was already under 120 is unaffected.

### Implementation sketch — `packages/haiku-api/src/schemas/revisit.ts`

```ts
export const RevisitReasonSchema = z
  .object({
    title: z.string().min(1).max(200).describe("Feedback title"),
    body:  z.string().min(1).max(10_000).describe("Feedback body (markdown)"),
  })
  .describe("A single revisit reason — becomes one feedback file")

export const RevisitRequestSchema = z
  .object({
    stage: z
      .string()
      .max(200)
      .optional()
      .describe("Target stage to revisit. Omit to let the orchestrator infer the target."),
    reasons: z
      .array(RevisitReasonSchema)
      .max(50)
      .optional()
      .describe("Optional feedback reasons. Each creates a feedback file before the revisit. At most 50 reasons per request."),
  })
  .describe("POST /api/revisit/:sessionId request body")
```

### Test coverage (round-trip)

Expand `packages/haiku-api/test/schemas.test.mjs` with cap-boundary checks.
Use `"a".repeat(N)` for string caps and `Array.from({length:N})` for array
caps. Boundary pattern: assert `max` passes and `max+1` fails.

```js
// In the FeedbackItemSchema describe block — add cap-boundary coverage.
describe("schemas/feedback.ts — FeedbackItemSchema string caps", () => {
  test("accepts max-length title/body/author", () => {
    assertValid(FeedbackItemSchema, {
      ...validFeedbackItem,
      title:  "a".repeat(200),
      body:   "b".repeat(10_000),
      author: "c".repeat(200),
    })
  })
  test("rejects title > 200", () => {
    assertInvalid(FeedbackItemSchema, { ...validFeedbackItem, title: "a".repeat(201) })
  })
  test("rejects body > 10_000", () => {
    assertInvalid(FeedbackItemSchema, { ...validFeedbackItem, body: "b".repeat(10_001) })
  })
  test("rejects author > 200", () => {
    assertInvalid(FeedbackItemSchema, { ...validFeedbackItem, author: "c".repeat(201) })
  })
  test("rejects source_ref > 1_000", () => {
    assertInvalid(FeedbackItemSchema, { ...validFeedbackItem, source_ref: "d".repeat(1_001) })
  })
  test("rejects closed_by > 200", () => {
    assertInvalid(FeedbackItemSchema, { ...validFeedbackItem, closed_by: "e".repeat(201) })
  })
})

// In the FeedbackCreateRequestSchema describe block — add cap-boundary coverage.
describe("schemas/feedback.ts — FeedbackCreateRequestSchema string caps", () => {
  test("accepts max-length title/body/author/source_ref", () => {
    assertValid(FeedbackCreateRequestSchema, {
      title:      "a".repeat(200),
      body:       "b".repeat(10_000),
      author:     "c".repeat(200),
      source_ref: "d".repeat(1_000),
    })
  })
  test("rejects title > 200", () => {
    assertInvalid(FeedbackCreateRequestSchema, { title: "a".repeat(201), body: "b" })
  })
  test("rejects body > 10_000", () => {
    assertInvalid(FeedbackCreateRequestSchema, { title: "t", body: "b".repeat(10_001) })
  })
  test("rejects author > 200", () => {
    assertInvalid(FeedbackCreateRequestSchema, { title: "t", body: "b", author: "c".repeat(201) })
  })
  test("rejects source_ref > 1_000", () => {
    assertInvalid(FeedbackCreateRequestSchema, { title: "t", body: "b", source_ref: "d".repeat(1_001) })
  })
})

// In the FeedbackUpdateRequestSchema describe block — add closed_by cap.
describe("schemas/feedback.ts — FeedbackUpdateRequestSchema closed_by cap", () => {
  test("accepts max-length closed_by", () => {
    assertValid(FeedbackUpdateRequestSchema, { closed_by: "u".repeat(200) })
  })
  test("rejects closed_by > 200", () => {
    assertInvalid(FeedbackUpdateRequestSchema, { closed_by: "u".repeat(201) })
  })
})

// In the RevisitReasonSchema describe block — add cap-boundary coverage.
describe("schemas/revisit.ts — RevisitReasonSchema string caps", () => {
  test("accepts max-length title/body", () => {
    assertValid(RevisitReasonSchema, {
      title: "t".repeat(200),
      body:  "b".repeat(10_000),
    })
  })
  test("rejects title > 200", () => {
    assertInvalid(RevisitReasonSchema, { title: "t".repeat(201), body: "b" })
  })
  test("rejects body > 10_000", () => {
    assertInvalid(RevisitReasonSchema, { title: "t", body: "b".repeat(10_001) })
  })
})

// In the RevisitRequestSchema describe block — add reasons length cap +
// stage string cap.
describe("schemas/revisit.ts — RevisitRequestSchema caps", () => {
  test("accepts 50 reasons", () => {
    const reasons = Array.from({ length: 50 }, () => ({ title: "t", body: "b" }))
    assertValid(RevisitRequestSchema, { reasons })
  })
  test("rejects 51 reasons", () => {
    const reasons = Array.from({ length: 51 }, () => ({ title: "t", body: "b" }))
    assertInvalid(RevisitRequestSchema, { reasons })
  })
  test("accepts max-length stage", () => {
    assertValid(RevisitRequestSchema, { stage: "s".repeat(200) })
  })
  test("rejects stage > 200", () => {
    assertInvalid(RevisitRequestSchema, { stage: "s".repeat(201) })
  })
})
```

These blocks slot in next to the existing `describe(...)` calls for each
schema; they do NOT replace the current "parses valid" / "rejects invalid"
baselines. Total new assertions: 22.

### `RevisitModal.tsx` comment + constant cleanup

```tsx
// Before (lines 31–42):
//   Unit spec asserts: title ≤ 200, body ≤ 10_000, reasons ≤ 50. The wire
//   schema (packages/haiku-api/src/schemas/revisit.ts) caps title at 120 and
//   has no body/reasons.length cap. The UI enforces the TIGHTER of each:
//     - title: min(200, 120) = 120 (avoid 400s from the server)
//     - body:  10_000 (stricter than wire, which is unbounded)
//     - reasons: 50 (stricter than wire, which is unbounded)
//   Rationale lives in unit-11 tactical plan §R1.
// export const UI_TITLE_MAX = 120
// export const UI_BODY_MAX = 10_000
// export const UI_REASONS_MAX = 50

// After:
//   Unit spec asserts: title ≤ 200, body ≤ 10_000, reasons ≤ 50. The wire
//   schema (packages/haiku-api/src/schemas/revisit.ts) now matches: title
//   .max(200), body .max(10_000), reasons .max(50). The UI mirrors these
//   caps at the edge for inline validation; the wire remains the authority.
// export const UI_TITLE_MAX = 200
// export const UI_BODY_MAX = 10_000
// export const UI_REASONS_MAX = 50
```

No other `RevisitModal.tsx` logic changes: the `UiReasonSchema` still uses
`UI_TITLE_MAX` and `UI_BODY_MAX`, the `UiRevisitSchema` still uses
`UI_REASONS_MAX`, and the existing inline-error error messages still
interpolate the constant. Bumping `UI_TITLE_MAX` from 120 to 200 lets
users type up to the wire cap without a client-side rejection that the
server would have accepted anyway.

## Files to modify

1. `packages/haiku-api/src/schemas/feedback.ts` — three exported schemas
   tightened as shown above. No new imports needed.
2. `packages/haiku-api/src/schemas/revisit.ts` — two exported schemas
   tightened as shown above. No new imports needed.
3. `packages/haiku-api/test/schemas.test.mjs` — five new `describe` blocks
   appended to the existing feedback and revisit sections. No new imports
   needed (all target schemas are already imported).
4. `packages/haiku-ui/src/components/RevisitModal.tsx` — comment block
   rewrite + `UI_TITLE_MAX` constant bump (120 → 200). No other edits.

Regeneration artifacts:
5. `packages/haiku-api/dist/**` — rebuilt by `npm run build -w haiku-api`.
   `test/schemas.test.mjs` imports from `../dist/index.js`, so the rebuild
   is NOT optional.
6. `packages/haiku-api/openapi.json` and
   `packages/haiku-api/dist/openapi.json` — regenerated by the build's
   `scripts/emit-openapi.mjs`. CI has a drift check per unit-01 spec lines
   95–96, so both must be committed.

## Implementation steps (for the builder in bolt 2)

1. **Re-read each target file immediately before editing** — parallel fix
   chains may have landed adjacent edits. Specifically FB-01 edits
   `http.ts` but not these schema files, and FB-20 (feedback mutation
   auth) edits `http.ts` too. FB-15 also edits `files.ts`. None of those
   overlap with `feedback.ts`, `revisit.ts`, or the test file, but verify:

   ```bash
   grep -n "FeedbackCreateRequestSchema\|FeedbackItemSchema\|FeedbackUpdateRequestSchema" packages/haiku-api/src/schemas/feedback.ts
   grep -n "RevisitReasonSchema\|RevisitRequestSchema" packages/haiku-api/src/schemas/revisit.ts
   grep -n "UI_TITLE_MAX\|UI_BODY_MAX\|UI_REASONS_MAX" packages/haiku-ui/src/components/RevisitModal.tsx
   ```

2. Edit `packages/haiku-api/src/schemas/feedback.ts` per the sketch above.
   Keep the file header comment, keep all `.describe()` metadata, keep
   `FeedbackAnchorSchema`, `FeedbackListResponseSchema`,
   `FeedbackCreateResponseSchema`, `FeedbackUpdateResponseSchema`, and
   `FeedbackDeleteResponseSchema` unchanged — the feedback flags caps on
   request and item schemas only, and tightening the response envelopes
   is out of scope (and they have no string-body fields beyond
   `message` which is free-form).

3. Edit `packages/haiku-api/src/schemas/revisit.ts` per the sketch above.
   Keep `RevisitResponseSchema` unchanged — no caps requested there; its
   `message` is free-form and its `feedback_created` is a short array of
   identifiers already indirectly bounded.

4. Edit `packages/haiku-api/test/schemas.test.mjs` — append the five new
   `describe` blocks next to the corresponding existing blocks. Do NOT
   delete or modify existing tests; add alongside. Place the two
   `FeedbackCreateRequestSchema` blocks adjacent to each other (around
   line 330), the `FeedbackItemSchema` cap block next to the existing
   `FeedbackItemSchema` block (around line 293), the
   `FeedbackUpdateRequestSchema` cap block next to the existing block
   (around line 359), and the two revisit blocks together near lines
   645–660.

5. Edit `packages/haiku-ui/src/components/RevisitModal.tsx`:
   - Replace lines 31–42 comment block with the updated wording.
   - Change `UI_TITLE_MAX = 120` to `UI_TITLE_MAX = 200` on what is
     currently line 40.
   - No other changes — the error messages already interpolate the
     constant (`\`Title must be ≤ ${UI_TITLE_MAX} characters\``), so
     they auto-update.

6. **Rebuild the `haiku-api` package.** The test file imports from
   `../dist/index.js`, so the rebuild is mandatory before running tests:

   ```bash
   npm run build -w haiku-api
   ```

   This also re-runs `scripts/emit-openapi.mjs`, regenerating
   `packages/haiku-api/openapi.json` and `packages/haiku-api/dist/openapi.json`.

7. Run the schema test suite:

   ```bash
   cd packages/haiku-api
   node test/schemas.test.mjs
   ```

   Expect: all pre-existing tests still pass + the 22 new cap-boundary
   assertions all pass.

8. Run the full `haiku-api` suite (catches OpenAPI emission / routes drift):

   ```bash
   node test/run-all.mjs
   ```

9. Typecheck the repo root — confirms `packages/haiku/src/http.ts`'s use
   of `FeedbackCreateRequestSchema.parse(...)` still type-matches after
   adding the optional `author` field (adding an optional field is a
   compatible widening; existing callers continue to typecheck):

   ```bash
   cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey
   npx tsc --noEmit
   ```

10. Rebuild `haiku-ui` to confirm the `RevisitModal.tsx` change
    typechecks and doesn't break the UI bundle:

    ```bash
    npm run build -w haiku-ui
    ```

    The `UI_TITLE_MAX` constant bump from 120 → 200 is a value change
    only — no consumer re-imports required. The existing error-message
    interpolations read the constant at render time.

11. Commit on the current branch (do NOT push):

    ```bash
    git add packages/haiku-api/src/schemas/feedback.ts \
            packages/haiku-api/src/schemas/revisit.ts \
            packages/haiku-api/test/schemas.test.mjs \
            packages/haiku-api/dist \
            packages/haiku-api/openapi.json \
            packages/haiku-ui/src/components/RevisitModal.tsx
    git commit -m "haiku: fix FB-19 bolt 1 (builder)"
    ```

    (`dist/` is tracked because `test/schemas.test.mjs` imports from it.
    Both `openapi.json` copies are tracked per unit-01 spec lines 95–96.)

## Verification commands

```bash
# Rebuild haiku-api (re-emits dist/ and both openapi.json copies)
npm run build -w haiku-api

# Schema round-trip tests (22 new assertions)
cd packages/haiku-api && node test/schemas.test.mjs

# Full haiku-api suite (includes openapi/routes tests)
cd packages/haiku-api && node test/run-all.mjs

# Repo-wide typecheck (confirms no downstream TS consumer breaks)
cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey
npx tsc --noEmit

# Rebuild haiku-ui (confirms RevisitModal constant change compiles)
npm run build -w haiku-ui
```

All five must exit 0.

## Risks

- **Silent consumer break from the `title` cap bump (120 → 200).** The
  existing wire caps title at 120 on create requests. Any UI or MCP
  caller that was already under 120 continues to pass; no new rejections.
  The change LOOSENS the create schema, tightens `FeedbackItemSchema`
  (response). The response tightening only fails if the server emits an
  item with title > 200 — which the spec says should be impossible. If
  this ever does fail, the bug is in the write path (not the schema),
  and the tightened test catches it. Acceptable.

- **Body cap of 10_000 is smaller than the route's 128 KiB body budget.**
  The HTTP layer's `FEEDBACK_BODY_MAX_BYTES = 131_072` cap (routes.ts /
  http.ts) is a transport-level cap — it bounds the whole JSON envelope
  including `title + body + origin + source_ref + anchor`. The schema
  cap of 10_000 on body is a field-level cap that applies AFTER JSON
  parsing. These are complementary: the transport cap prevents
  pathological memory use before parse; the field cap prevents absurd
  frontmatter sizes after parse. No conflict. A body exceeding 10_000
  bytes will be rejected with a Zod validation error, not a transport
  error — the error surface is the tightened one we want.

- **Adding `author` to `FeedbackCreateRequestSchema` may be interpreted
  as letting clients spoof authorship.** The handler at `http.ts:1179`
  hardcodes `author: "user"` regardless of what the request body
  carries, so no spoofing is possible today. Explicit doc comment on the
  new field: "Optional authorship hint. The server currently overwrites
  this with the authenticated session author; the field is reserved for
  future use when the handler begins to honor it." This is a pure
  contract tightening per the spec; it doesn't change runtime behavior.

- **`source_ref` cap of 1_000 chars might be too small for some future
  back-reference format.** The spec doesn't state a cap. The existing
  handler writes `source_ref ?? null` without inspection; today's
  sources are review-agent run ids (~50 chars) and artifact paths
  (< 300 chars). 1_000 is 3× headroom. If a future format needs more,
  raise the cap — it's a non-breaking widening.

- **`RevisitRequestSchema.stage` cap of 200 chars matches unit/stage
  slug conventions but the spec doesn't enforce it.** Risk: none today
  — stage slugs are short identifiers. If a test fixture passes a
  stage of 201 chars it'd fail (but no such test exists). This is a
  defensive cap consistent with the rest of the codebase.

- **Rebuild forgotten before running tests.** The test file imports
  from `../dist/index.js`. If the builder edits `src/`, runs tests,
  sees existing tests pass because the dist hasn't been rebuilt with
  the new caps, they'd conclude the fix works when it doesn't. Step 6
  makes rebuild mandatory before step 7. If the 22 new assertions pass
  but the old build is being tested, they'd actually FAIL (dist still
  has old `.max(120)` on title, so `"a".repeat(200)` rejection would
  hit the old 120 cap rather than the new 200 cap — the new "accepts
  max-length title" test would fail with "schema rejected length-200
  string"). The test failure surfaces the stale build immediately.

- **OpenAPI emitter drift.** `scripts/emit-openapi.mjs` re-runs as part
  of `npm run build -w haiku-api` and writes both committed
  `openapi.json` files. The secret-leak scan in that script matches
  `/password|secret|token|api[_-]?key|bearer/i` — none of the new cap
  values (numbers) or schema descriptions (plain English) match. The
  OpenAPI drift-check in CI (per unit-01 spec lines 95–96) compares
  committed vs fresh-build; committing both copies keeps CI green.

- **`FeedbackItemSchema.feedback_id` cap of 32.** The current format is
  `FB-NN` (4 chars) — 32 is a generous ceiling to accommodate any
  future identifier scheme (e.g. `FB-XXXXXXXX` or hash prefixes).
  Risk of breaking an existing id is zero today.

- **`FeedbackItemSchema.created_at` cap of 40.** ISO-8601 with
  sub-second precision fits in ~30 chars (`2026-04-21T20:22:42.000Z`).
  40 provides headroom. No fixture in the codebase exceeds this.

- **Parallel-chain clobber on `test/schemas.test.mjs`.** FB-15 (files
  schema refinement) also edits this test file, adding an
  `adversarialFixtures` loop inside the `FileServeParamsSchema` block.
  That block is at lines 399–409 — non-overlapping with the feedback
  (lines 283–393) and revisit (lines 637–682) blocks this fix touches.
  If FB-15 lands first, the file size changes and our edit's line-number
  anchors shift — but the content matches via `describe` labels, not
  line numbers. Builder should use the test labels (e.g. "schemas/feedback.ts
  — FeedbackCreateRequestSchema") as insertion anchors, not hard-coded
  line numbers.

- **`RevisitModal.tsx` conflict with other unit-11 fix chains.** No
  other open feedback currently edits this file (verified via
  `grep -rn "RevisitModal" .haiku/intents/.../feedback/`). FB-64
  touches `RevisitModal` tests but not the component. Low risk. If a
  collision occurs, re-read the file before the edit and re-apply the
  constant bump.

## Out of scope

- **Changes to `packages/haiku/src/http.ts`.** The handler already
  ignores the request `author` field (hardcodes `"user"`); no runtime
  behavior change is needed for this fix. A future unit can wire
  request-authored feedback through the handler if that becomes a
  product requirement.
- **Changes to `writeFeedbackFile` or `state-tools.ts`.** The on-disk
  frontmatter format is untouched; the tightened wire schemas just
  prevent callers from sending absurd sizes across the boundary.
- **Tightening `FeedbackListResponseSchema`, `FeedbackCreateResponseSchema`,
  `FeedbackUpdateResponseSchema`, `FeedbackDeleteResponseSchema`,
  `RevisitResponseSchema`.** The feedback flags request + item caps
  only. Response envelopes have `message` fields that are free-form
  (could be localized or include diagnostic text); adding caps there
  invites false rejections on legitimate server responses. Deferred.
- **Changes to `packages/haiku-ui/src/components/FeedbackSheet.tsx`,
  `FeedbackItem.tsx`, or other UI components that consume
  `FeedbackCreateRequest`.** They import the type via `z.infer<>` — an
  optional field addition is a compatible widening, existing TS
  consumers continue to typecheck without changes.
- **Exporting `UI_TITLE_MAX`, `UI_BODY_MAX`, `UI_REASONS_MAX` from
  `haiku-api` and re-importing in `RevisitModal.tsx`.** Would be a
  cleaner single-source-of-truth but expands blast radius. Deferred.
- **Updating step definitions in `packages/haiku/test/features/*.mjs`.**
  No existing feature scenario exercises the string-cap boundaries;
  adding cucumber-level coverage is a future tightening beyond FB-19's
  scope.
- **Updating OpenAPI consumers outside this repo.** The committed
  `openapi.json` regenerates automatically; external consumers re-read
  on next sync.

## Done when

- `packages/haiku-api/src/schemas/feedback.ts` has:
  - `FeedbackItemSchema` with `.max()` on every string field per the
    cap table above.
  - `FeedbackCreateRequestSchema` with `.max(200)` on title,
    `.max(10_000)` on body, new optional `author: z.string().max(200)`,
    `.max(1_000)` on source_ref.
  - `FeedbackUpdateRequestSchema` with `.max(200)` on closed_by.
- `packages/haiku-api/src/schemas/revisit.ts` has:
  - `RevisitReasonSchema` with `.max(200)` on title, `.max(10_000)` on body.
  - `RevisitRequestSchema` with `.max(200)` on stage, `.max(50)` on reasons.
- `packages/haiku-api/test/schemas.test.mjs` has 22 new cap-boundary
  assertions across the feedback + revisit schema groups; all pass.
- `packages/haiku-ui/src/components/RevisitModal.tsx`:
  - Comment block (lines 31–42) updated to reflect wire-spec alignment.
  - `UI_TITLE_MAX` = 200 (was 120).
- `packages/haiku-api/openapi.json` and
  `packages/haiku-api/dist/openapi.json` regenerated and committed.
- `npm run build -w haiku-api` exits 0.
- `cd packages/haiku-api && node test/schemas.test.mjs` exits 0 with
  all pre-existing + 22 new assertions passing.
- `cd packages/haiku-api && node test/run-all.mjs` exits 0.
- `npx tsc --noEmit` at repo root exits 0.
- `npm run build -w haiku-ui` exits 0.
- Commit message: `haiku: fix FB-19 bolt 1 (builder)`. No push.
