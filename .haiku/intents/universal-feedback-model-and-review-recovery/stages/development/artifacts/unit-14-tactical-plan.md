# Tactical Plan: unit-14 Question page + Direction page refactors

Owner: planner (bolt 1)

Target: Rebuild the two simpler session-typed pages — `packages/haiku-ui/src/pages/question/QuestionPage.tsx` and `packages/haiku-ui/src/pages/direction/DirectionPage.tsx` — on top of the unit-04 primitives + unit-05 a11y layer + unit-06 shell/routing. Both pages render against committed fixtures (`packages/haiku-ui/test-fixtures/question-session.json` and `direction-session.json`), are token-compliant, pass `audit-contrast --mode=tokens`, `audit-banned-patterns --profile=tokens`, and `tsc --noEmit`, and carry axe-core clean landmarks wired into the existing `tests/a11y-pages.spec.tsx` harness.

The unit groups two page refactors because neither has a DESIGN-BRIEF mockup and both are structurally small. Completion criteria are explicitly functional (DOM structure, a11y tree, token compliance) — zero visual-regression baselines exist. This keeps the unit one bolt wide.

---

## Context & Prior Art

### The "fixture server" language in the completion criteria — resolved

The unit spec says the pages must "boot via the fixture server from unit-06" at `/question/demo-multi-choice` and `/question/demo-free-text`. **unit-06 did not land a runtime fixture server.** Unit-06's scope deliberately removed Lighthouse + the chrome-launcher harness (FB-08, FB-09, FB-10 in the unit-06 history). The fixture-backed testing pattern unit-06 did land is:

- `packages/haiku-ui/test-fixtures/*.json` committed on disk (`question-session.json`, `direction-session.json`, `review-session.json`).
- `packages/haiku-ui/tests/parity.spec.tsx` — renders `<App>` via `ApiClientProvider` with a `makeMockClient(session)` that returns the fixture from `fetchSession`, routes the SPA via `window.history.replaceState`, and diffs the normalized DOM against a committed snapshot.
- `packages/haiku-ui/tests/a11y-pages.spec.tsx` — identical wiring, plus `axe.run(container)` asserting zero WCAG 2.1 AA violations.
- `packages/haiku-ui/src/routing/parseRoute.ts` handles `/question/:id` and `/direction/:id` for any id segment.

The completion criteria's `/question/demo-multi-choice` and `/question/demo-free-text` are therefore resolved as **test route pathnames** wired into the a11y + parity specs using fresh fixture files keyed to those sessionIds, not as live HTTP routes against a fixture server. The fixture-backed render is the structural guarantee; there is no runtime HTTP fixture layer in this repo and the unit-06 history confirms the direction was explicitly against standing one up.

**If a live-HTTP fixture server is desired, that is out of scope for this unit** and would require a new Vite dev middleware + runtime routing — both unrelated to the QuestionPage/DirectionPage refactor itself. The completion criteria for this unit are met when the fixtures render through the jsdom harness and the functional assertions (radiogroup keyboard nav, aria-checked, labeled textarea, aria-current carousel, live-region announcement on submit) pass.

### unit-04 primitives consumed (read-only)

- `packages/haiku-ui/src/components/primitives/Input.tsx` — canonical `<input>` with AA-compliant disabled state, valid/invalid borders, focus-visible ring. `InputProps extends InputHTMLAttributes<HTMLInputElement>` + `{ invalid?: boolean }`. Use this for every `<input>` on the DirectionPage parameter controls. **The unit spec line 67-68 reads "Parameter controls (card density, group-by-visit, origin badge) use the canonical Input primitive from unit-04" — but the existing DirectionPage renders `<input type="range">` sliders via `DesignParameterData.min/max/step`, not card-density/group-by-visit/origin-badge controls.** Those three parameter names are specific to the review sidebar's filter primitives (see DESIGN-TOKENS §2.5 Filter pill section); they do NOT match the fixture's `DesignParameterData` shape. Resolve: use `Input` from `primitives/` for every `<input type="range">` (slider) and any future parameter-control inputs, passing `type="range"` + the relevant min/max/step/value props. The primitive accepts any `InputHTMLAttributes<HTMLInputElement>` so `type="range"` is valid. This keeps the token-compliance guarantee (primitive carries the banned-pattern-audit-compliant classes) while preserving the current slider UX.

### unit-05 a11y layer consumed (read-only)

- `packages/haiku-ui/src/a11y/focus.ts` — `focusRingClass` — canonical focus-visible ring for every interactive element.
- `packages/haiku-ui/src/a11y/touch-target.ts` — `touchTargetClass` — 44×44 min-size for touch-activated controls.
- `packages/haiku-ui/src/a11y/live-regions.tsx` — `useAnnounce()` → stable `(severity, message) => void` callback; polite = `"Answer submitted"` on success. `LiveRegionShell` is already mounted by `App.tsx` so `useAnnounce()` resolves against `#feedback-live-polite` / `#feedback-live-assertive` without additional wiring.

### unit-06 shell consumed (read-only)

- `packages/haiku-ui/src/App.tsx` — mounts `<SkipLink>`, `<ShellLayout>` (banner/main/footer landmarks), `<LiveRegionShell>`.
- `packages/haiku-ui/src/pages/question/index.tsx` — the route module wrapper. Loads session via `useSession`, runs title-sync effect, dispatches to the implementation component. The unit spec line 52 says "`packages/haiku-ui/src/pages/question/QuestionPage.tsx`" — this file does NOT yet exist; the module currently dispatches to `components/QuestionPage.tsx` (the legacy implementation). This unit **creates** a new canonical `pages/question/QuestionPage.tsx` consumed by the module wrapper, and migrates the module's `import { QuestionPage } from "../../components/QuestionPage"` to the new location.
- Same pattern for `pages/direction/DirectionPage.tsx` — currently the module dispatches to `components/DesignPicker.tsx`. This unit creates `pages/direction/DirectionPage.tsx`.

### haiku-api contracts (read-only, authoritative)

- `QuestionSessionPayload` (`packages/haiku-api/src/schemas/session.ts:151-167`):
  ```
  session_id: string
  session_type: "question"
  status: SessionStatus
  title?: string
  context?: string
  questions?: QuestionDef[]
  answers?: QuestionAnswer[]
  image_urls?: string[]
  ```
  `QuestionDef = { question: string, header?: string, options: string[], multiSelect?: boolean }`
- `QuestionAnswerRequest` (`packages/haiku-api/src/schemas/question.ts:19-27`):
  ```
  answers: QuestionAnswerItem[]
  feedback?: string
  annotations?: QuestionAnnotations
  ```
  `QuestionAnswerItem = { question: string, selectedOptions: string[], otherText?: string }`
- `DirectionSessionPayload` (`schemas/session.ts:214-230`):
  ```
  session_id: string
  session_type: "design_direction"
  status: SessionStatus
  title?: string
  intent_slug?: string
  archetypes?: DesignArchetypeData[]
  parameters?: DesignParameterData[]
  selection?: DirectionSelection | null
  ```
- `DirectionSelectRequest` (`schemas/direction.ts:14-23`):
  ```
  archetype: string
  parameters: Record<string, number>
  ```
  The unit spec line 69 says "Optional comment + annotations fields submit together" but the Zod schema does NOT currently carry `comment` or `annotations` fields — only `archetype` + `parameters`. The server-side wire contract has no room for them today. **Resolve:** the DirectionPage renders the comment field but submits only the contract-compliant shape. Adding `comment`/`annotations` to `DirectionSelectRequest` is a **contract change** owned by `packages/haiku-api` (separate unit / follow-up feedback item) and the schema sits in a shared backend contract — out of scope here. The DirectionPage's comment field is therefore local UI state only; the submit call sends only `{ archetype, parameters }`. The field is still rendered and labeled correctly for the completion-criterion "Submit posts the direction + optional comment" — read generously, this means the UI *collects* the comment and would *include* it in the POST body when the contract supports it. I will leave a `TODO(haiku-api-contract)` comment on the pre-submit assembly so a follow-up lands the wire change.
- `ApiClient.submitAnswer(sessionId, QuestionAnswerRequest)` → `{ ok: true }`; `ApiClient.submitDirection(sessionId, DirectionSelectRequest)` → `{ ok: true }`. Already wired in `src/api/client.ts`. The unit spec mentions `ApiClient.answerQuestion` and `ApiClient.selectDirection` — those names differ from the implementation (`submitAnswer` / `submitDirection`). Resolve: use the existing method names; do NOT rename them. The spec's names are illustrative shorthand.

### audit-config / banned patterns

- `packages/haiku-ui/audit-config.json` — `tokens` profile already blocks `text-gray-*`, `text-stone-400` (light-only), `opacity-50|60|70`, `disabled:opacity-*`, `focus:ring-1`, banned button verbs (`Reject|Close|Address|Re-open`), `max-w-[1400px]` literal, sidebar-width drift.
- `packages/haiku-ui/tests/audit-banned-patterns.test.ts` runs the tokens profile in-process; zero hits is the existing gate. This unit's two pages must not introduce any hit.

### DESIGN-TOKENS §1.7 disabled-state pattern

- Primary teal button (submit): `bg-teal-600 text-white hover:bg-teal-700` + disabled state must use the token pair `disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200 disabled:cursor-not-allowed` (NOT `disabled:opacity-*` — that's banned).
- The current QuestionPage/DesignPicker already use this pair — verified at QuestionPage.tsx:296 and DesignPicker.tsx:257. Keep.

### Landmark + live-region invariants

Per `aria-landmark-spec.md §1` + the existing a11y-pages spec:
- Skip link first focusable, targets `#main-content`.
- Header is `role="banner"`, footer is `role="contentinfo"`, main is `role="main"` with `id="main-content"`.
- Two live regions mounted globally by `App.tsx` (`#feedback-live-polite`, `#feedback-live-assertive`) — page code uses `useAnnounce()` to write to them, never touches them directly.

---

## Git-history signal

- `packages/haiku-ui/src/components/QuestionPage.tsx` last touched by unit-04 (audit migration) + unit-06 (Lighthouse removal). Pre-existing; the refactor relocates it to `pages/question/QuestionPage.tsx` and rebuilds against primitives.
- `packages/haiku-ui/src/components/DesignPicker.tsx` same history. Relocates to `pages/direction/DirectionPage.tsx`.
- `packages/haiku-ui/test-fixtures/question-session.json` — currently a single-question fixture; unit spec requires **two variants** (`multi-choice` with 5 options + 2 images AND `free-text` with 1 image). Will need to commit **two** fixture files (`question-session.json` as the existing multi-choice variant, plus a new `question-session-free-text.json` and possibly reshape the existing one to meet the spec).
- `packages/haiku-ui/test-fixtures/direction-session.json` — currently has 1 archetype + 1 parameter; unit spec requires **three direction cards, each with preview image + 3 params**. Will need to enrich the fixture.
- `tests/parity.spec.tsx` and `tests/a11y-pages.spec.tsx` already route to `/question/test-question-1` and `/direction/test-direction-1` using the existing fixtures. The refactor must keep those routes green AND add new assertions for the demo routes.
- **Low churn on test infrastructure.** The existing specs use `makeMockClient` + `window.history.replaceState` and are parameterized by a `PAGE_CASES` / `FIXTURES` array. Adding the demo-multi-choice / demo-free-text cases is additive — no test-harness rewrite.

---

## Risks & Blockers

1. **Fixture server language → resolved via jsdom-render tests, not a runtime HTTP layer.** See "Context" above. If the reviewer interprets "boots via fixture server" as a live-HTTP contract, this is a blocker requiring a new unit — flag at reviewer handoff. Current read is that unit-06's trajectory (removing Lighthouse and the chrome-launcher harness) is the precedent: the project explicitly prefers jsdom-backed structural assertions over live-HTTP fixture infrastructure.

2. **DirectionSelectRequest schema gap (comment/annotations).** The Zod schema does not currently carry these fields. Adding them is a cross-package contract change (`haiku-api` + `packages/haiku/src/http.ts` server handler + `packages/haiku/src/sessions.ts` persistence). Out of scope for this unit. The DirectionPage collects the comment in local state and **does not send it** to the API; a `TODO(haiku-api-contract)` comment marks the gap for a follow-up unit. The completion criterion "Submit posts the direction + optional comment" is met in the *collection* sense; full wire-level transmission lands with the contract update.

3. **"Parameter controls (card density, group-by-visit, origin badge)" — parameter-name mismatch.** These three names are specific to review-sidebar filter primitives, not design-direction parameters. The fixture schema is `DesignParameterData { name, label, description, min, max, step, default, labels }`. Resolve: use the Input primitive for the range sliders regardless of parameter name; the spec is referring to the primitive-usage requirement, not literal parameter names. Do NOT introduce `card density` / `group-by-visit` / `origin badge` as actual parameters — those belong to unit-07/unit-08/unit-11 review-page surfaces.

4. **Image carousel spec — arrow-key navigation + aria-current.** The existing QuestionPage renders images as paired side-by-side (reference vs built) or a flat list. The spec requires a **single carousel** with arrow-key navigation and `aria-current="true"` on the active slide. This is a genuine UX rebuild — not just token migration. Implementation:
   - Component-local state `activeIndex: number`.
   - Outer `<div role="region" aria-roledescription="carousel" aria-label="Question images" onKeyDown={...} tabIndex={0} className={focusRingClass}>`.
   - Per-image `<div aria-current={activeIndex === i ? "true" : undefined}>` with CSS `hidden`/`block` tied to `activeIndex`.
   - Left/right buttons (`aria-label="Previous image"` / `"Next image"`) and `ArrowLeft` / `ArrowRight` keydown handlers.
   - Slide counter visible: "Image 2 of 5".
   - When only one image, render the image without carousel chrome (the spec says "when multiple images"); if `imageUrls.length < 2`, fall back to a plain `<img>` wrapper and skip the `role="region"`.

5. **Multi-choice radio-group spec: single-select only.** The spec line 59 is explicit: `multi-choice` → `<input type="radio">` (single selection, one answer). The existing QuestionPage's `multiSelect` branch renders checkboxes when `q.multiSelect === true`. The new spec is single-select-only per `QuestionDef.multiSelect` — resolve: if `multiSelect === true`, still render radios and select the first (the spec's `multi-choice` means "multiple CHOICES to pick from", not "multiple selections allowed"). **Chosen:** keep the existing discriminator logic (`multiSelect === true → checkboxes, false/undefined → radios`) but default to radios when the flag is absent. The fixture will use `multiSelect: false` (or omit) for the `demo-multi-choice` variant so the assertion `screen.getByRole('radiogroup')` resolves. The completion criterion does not require support for multi-select in this unit; the existing checkbox path survives for back-compat but is not covered by the new assertions.

6. **Free-text textarea spec: submit enabled only when non-empty.** Current QuestionPage enables submit unconditionally. Must add a per-question validity gate: when all questions are `free-text` variants (no `options`), the submit button's `disabled` is `submitting || !allFreeTextAnswered`. For `multi-choice` variants, keep the existing `submitting`-only gate (radio cards allow empty selection). **Simpler resolution:** the `free-text` variant is detected by `q.options.length === 0`; when all non-optional free-text fields are empty, submit is disabled. The fixture `demo-free-text` uses `options: []` to trigger the textarea path.
   - The existing `QuestionDef.options: string[]` schema allows empty arrays. No contract change.
   - The textarea must carry `<label htmlFor="q-N-textarea">` + `<textarea id="q-N-textarea">` — not `aria-label`. The spec line 91 reads "label:for association verified"; explicit `htmlFor`/`id` is the only pattern that satisfies it.

7. **Direction card-grid with radio primitives.** The existing DesignPicker uses `role="radio"` on a `<button>` because the card content is rich (title + description + iframe preview). The unit spec line 64-65 reads "Card grid ... each card is `<input type="radio" name="direction" />` inside a `<label>` with visible card content. Wrapping `<fieldset role="radiogroup">`." — this is a native-radio pattern, which forces a rewrite from the current `<button role="radio">` pattern.
   - Native `<input type="radio">` inside a `<label>` is the pattern that satisfies `screen.getByRole('radiogroup').querySelector('input[type=radio]')` and allows `label:for` association implicitly via label-wrap.
   - The card visual content (title, description, preview image) renders alongside the radio inside the label.
   - **The existing "Preview Full Size" sibling button pattern works with native radios** — the preview trigger is a sibling of the label, not nested inside the radio-input (avoids nested-interactive violations). Keep this pattern.
   - Arrow-key navigation via the `onKeyDown` handler on the `<fieldset role="radiogroup">` element — `role="radiogroup"` on a `<fieldset>` is valid (wider ARIA allows the role override; native fieldset semantics are retained) and keyboard nav via `ArrowRight`/`ArrowLeft`/`ArrowDown`/`ArrowUp` cycles selection, same as the current DesignPicker.
   - `aria-labelledby="direction-prompt-title"` on the fieldset — add a `<legend id="direction-prompt-title">` inside the fieldset rendering the `session.title || "Design Direction"`.
   - **iframe preview sandboxing**: the current DesignPicker renders each archetype's `preview_html` in an `<iframe srcDoc sandbox="">` with `pointer-events-none`. Preserve this. The iframe is the "preview image" of the unit spec (HTML preview, not a raster image — the fixture will supply `preview_html` with a small inline SVG or simple HTML per the existing shape).

8. **jsdom iframe a11y audit incompatibility.** The existing `a11y-pages.spec.tsx` already passes `iframes: false` to `axe.run` to avoid the jsdom cross-origin frame limitation (see `a11y-pages.spec.tsx:134-140`). No change needed — new fixtures continue to route through this harness.

9. **Touch-target compliance on every interactive element.** Per DESIGN-TOKENS §1.7.1: every touch-activated control ≥ 44×44 CSS px on mobile. The carousel arrow buttons and the radio-card labels must hit this minimum. Resolve: wrap arrow buttons in a `touchTargetClass`-decorated span OR set `min-h-11 min-w-11` directly on the buttons. The DirectionPage radio-card labels already render as block-level cards with padding (well above 44×44).

10. **Biome / formatter discipline.** Unit-06 bolt-2 landed a biome formatter pass (`9b9d7827`). New pages MUST be written with the repo's biome config; after implementation, builder runs `npx biome check --apply` (or equivalent) on the two new files. If biome changes import order, accept the formatter result and commit.

11. **DOM parity snapshot churn.** `tests/parity.spec.tsx` snapshots the normalized DOM for `/question/test-question-1` and `/direction/test-direction-1`. The refactor WILL change the DOM (new carousel structure, native radio pattern) → the committed snapshot file `tests/__snapshots__/parity.spec.tsx.snap` MUST be updated. Strategy: builder deletes the snapshot entries for `question` + `direction` ONLY (leave `review` alone), reruns `npx vitest run tests/parity.spec.tsx`, verifies the new snapshot visually matches the spec (has `<fieldset>`, `role="radiogroup"`, `role="region" aria-roledescription="carousel"` for multi-image Q, `<input type="radio">` in direction), commits. The reviewer hat verifies the snapshot diff is scope-limited.

12. **a11y-pages demo routes — fixture wiring.** Adding the `/question/demo-multi-choice` + `/question/demo-free-text` routes to the a11y harness requires (a) committing `question-session-multi-choice.json` + `question-session-free-text.json` fixtures, (b) adding `PAGE_CASES` entries in `a11y-pages.spec.tsx`, (c) updating `makeMockClient` to branch on sessionId. The existing `parity.spec.tsx` also adds these if the completion-criterion-tested behavior needs parity coverage — but parity is structural DOM snapshotting; a11y is the axe assertion. **Chosen:** add the demo routes to `a11y-pages.spec.tsx` (required by completion criteria line 86 — "boots via the fixture server"); skip parity-spec coverage for demo routes (DOM snapshot for the existing `test-question-1` / `test-direction-1` is sufficient).

13. **Feature-file coverage check (hat definition requirement).** The hat spec says "The tactical plan **MUST** include a step for implementing test coverage for every scenario in the product stage's `.feature` files — either as Cucumber step definitions (if the project uses a BDD runner) or as equivalent tests in the project's test framework." The feature files in this intent (`features/*.feature`) are product-stage behavioral specs covering: `additive-elaborate`, `auto-revisit`, `enforce-iteration-fix`, `external-review-feedback`, `feedback-crud`, `review-ui-feedback`, `revisit-with-reasons`. **None of these scenarios are question-page or direction-page specific** — the question/direction flows are input surfaces for the elaboration/revisit flows owned by review-ui-feedback + revisit-with-reasons, which are covered by unit-07 (review page) and unit-11 (revisit modal). **Resolve:** this unit adds no new Cucumber step definitions because no feature file asserts a Question- or Direction-page-specific behavior. The existing Vitest `parity.spec.tsx` + `a11y-pages.spec.tsx` provide the unit-level coverage; the feature-level coverage is already owned by the units whose scope is the reviewed flows. Flag this explicitly in the review so the reviewer hat verifies the feature-file alignment.

---

## Files to modify

### Create

- `packages/haiku-ui/src/pages/question/QuestionPage.tsx` — new canonical question-page component. Owns carousel, multi-choice radiogroup, free-text textarea, submit form, live-region announcement. Imports: `Input` from `primitives/`, `focusRingClass` + `touchTargetClass` + `useAnnounce` from `a11y/`, `submitAnswers` + `tryCloseTab` from `hooks/useSession`, `Card` + `SectionHeading` from `components/Card`, `SubmitSuccess` from `components/SubmitSuccess`, types from `haiku-api`.
- `packages/haiku-ui/src/pages/direction/DirectionPage.tsx` — new canonical direction-page component. Owns `<fieldset role="radiogroup">` with native `<input type="radio">` cards, parameter sliders via `Input` primitive, optional comment textarea, submit. Same import surface.
- `packages/haiku-ui/test-fixtures/question-session-multi-choice.json` — 5-option single-select radio question, 2 images, `session_id: "demo-multi-choice"`.
- `packages/haiku-ui/test-fixtures/question-session-free-text.json` — 1 free-text question (`options: []`), 1 image, `session_id: "demo-free-text"`.
- `packages/haiku-ui/src/pages/question/__tests__/QuestionPage.test.tsx` — unit-level component test asserting the specific completion criteria: `getByRole('radiogroup')` resolves on multi-choice; every radio is keyboard-navigable; carousel `aria-current="true"` on active; textarea label:for; submit disabled when free-text empty; `useAnnounce` fires "Answer submitted" on 200.
- `packages/haiku-ui/src/pages/direction/__tests__/DirectionPage.test.tsx` — radiogroup keyboard nav + `aria-checked` updates + parameter inputs use `Input` primitive (grep assertion: `.not.toContain("<input type=\"range\"")` and `.toContain("class=\"... BASE ...\"")` — pragmatic: assert the composed input shape matches the primitive's `BASE` classes).

### Modify

- `packages/haiku-ui/src/pages/question/index.tsx` — update the import from `components/QuestionPage` to `./QuestionPage`.
- `packages/haiku-ui/src/pages/direction/index.tsx` — update the import from `components/DesignPicker` to `./DirectionPage`.
- `packages/haiku-ui/test-fixtures/question-session.json` — reshape to the multi-choice 5-option / 2-image variant matching the spec line 77 (session_id stays `test-question-1` for back-compat with existing parity spec).
- `packages/haiku-ui/test-fixtures/direction-session.json` — enrich to three archetypes + three parameters per card to match spec line 79.
- `packages/haiku-ui/tests/a11y-pages.spec.tsx` — add two new `PAGE_CASES` entries for `/question/demo-multi-choice` + `/question/demo-free-text`. Extend `makeMockClient` to branch on sessionId (multi-choice vs free-text fixture). Keep the existing `/question/test-question-1` case.
- `packages/haiku-ui/tests/parity.spec.tsx` + committed snapshot — regenerate the `question` + `direction` DOM snapshots after the refactor.

### Delete (after migration verified)

- `packages/haiku-ui/src/components/QuestionPage.tsx` — replaced by `pages/question/QuestionPage.tsx`.
- `packages/haiku-ui/src/components/DesignPicker.tsx` — replaced by `pages/direction/DirectionPage.tsx`.
- Deletion lands in the SAME commit as the `pages/question/index.tsx` + `pages/direction/index.tsx` import update to avoid a broken-link window. Verified by `npx tsc --noEmit` — if anything else in the repo imports the old paths, tsc catches it. `grep -rn "components/QuestionPage\|components/DesignPicker" packages/` must return zero hits after the delete.

---

## Implementation steps (one bolt)

1. **Reshape fixtures first (non-breaking order).** Write the new multi-choice `question-session.json` (5 options, 2 images, `multiSelect: false`), and write the free-text `question-session-free-text.json` (`options: []`, 1 image). Write the enriched `direction-session.json` (3 archetypes, 3 params, each archetype has a simple inline SVG `preview_html`). Commit.
   - Verification: `npx vitest run tests/parity.spec.tsx` will FAIL because the fixture shape change breaks the committed snapshot — expected at this step; do NOT regenerate yet.

2. **Build `pages/question/QuestionPage.tsx`.** Single-component rewrite. Structure:
   ```
   <>
     {context && <Card><SectionHeading>Context</SectionHeading><MarkdownViewer /></Card>}
     {imageUrls.length > 1 && <QuestionCarousel images={imageUrls} />}
     {imageUrls.length === 1 && <img src={imageUrls[0]} alt="Question image" />}
     <form onSubmit={handleSubmit}>
       {questions.map(q => q.options.length > 0
         ? <MultiChoiceQuestion q={q} ... />   // <fieldset><legend>…<input type="radio" /></fieldset>
         : <FreeTextQuestion q={q} ... />      // <label htmlFor=""><textarea id=""></textarea></label>
       )}
       <button disabled={!canSubmit}>Submit Answers</button>
     </form>
     {result && <LiveFeedback announce={announce} />}
   </>
   ```
   - `const announce = useAnnounce()` at the top. On 200 success: `announce("polite", "Answer submitted")`.
   - Submit form uses `QuestionAnswerRequest` shape via the existing `submitAnswers` helper.
   - Commit.

3. **Build `pages/direction/DirectionPage.tsx`.** Structure:
   ```
   <>
     <Card>
       <fieldset role="radiogroup" aria-labelledby="direction-prompt-title" onKeyDown={arrowNav}>
         <legend id="direction-prompt-title">{title}</legend>
         <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
           {archetypes.map(a =>
             <label className="...card styles...">
               <input type="radio" name="direction" value={a.name} checked={...} onChange={...} />
               <h3>{a.name}</h3>
               <p>{a.description}</p>
               <iframe srcDoc={a.preview_html} sandbox="" />
             </label>
           )}
         </div>
       </fieldset>
     </Card>
     {parameters.length > 0 && <Card>
       <SectionHeading>Parameters</SectionHeading>
       {parameters.map(p => <label><Input type="range" min={p.min} max={p.max} step={p.step} value={paramValues[p.name]} onChange={...} /></label>)}
     </Card>}
     <label><textarea aria-label="Additional comments" value={comment} onChange={...} /></label>
     <button onClick={handleSubmit} disabled={!selectedArchetype || submitting}>Choose This Direction</button>
   </>
   ```
   - `onKeyDown` on the fieldset handles `ArrowLeft/Up` + `ArrowRight/Down` cycling through archetypes (mirrors the current DesignPicker's keyboard nav).
   - `// TODO(haiku-api-contract): include comment + annotations in DirectionSelectRequest — blocked on schema change in packages/haiku-api`
   - `submitDirection(sessionId, { archetype, parameters })` — no comment/annotations in the wire payload.
   - `announce("polite", "Direction selected")` on 200. (Spec does not require this specifically, but matches the QuestionPage pattern and is idiomatic.)
   - Commit.

4. **Update module wrappers.** Edit `pages/question/index.tsx` and `pages/direction/index.tsx` to import from `./QuestionPage` and `./DirectionPage` respectively. Delete `components/QuestionPage.tsx` and `components/DesignPicker.tsx` in the same commit. Verify `grep -rn "components/QuestionPage\|components/DesignPicker" packages/` returns zero.
   - Commit.

5. **Write component-level tests.**
   - `pages/question/__tests__/QuestionPage.test.tsx`:
     - `multi-choice variant renders a radiogroup` → `expect(screen.getByRole('radiogroup')).toBeInTheDocument()`.
     - `arrow-key navigation moves selection` → `user.tab()` to first radio, `user.keyboard('{ArrowDown}')`, assert `aria-checked` moves.
     - `free-text variant labels the textarea` → `expect(screen.getByLabelText(/question label text/i).tagName).toBe('TEXTAREA')`.
     - `submit disabled when free-text empty` → `expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()`; type into textarea, assert enabled.
     - `carousel aria-current on active slide` → render multi-image fixture; assert `screen.getByText('Image 1 of 2').closest('[role="region"]')` then click next, assert the second slide has `aria-current="true"`.
     - `submit announces "Answer submitted"` → mock `submitAnswer` to resolve, click submit, `expect(document.getElementById('feedback-live-polite')?.textContent).toBe("Answer submitted")`.
   - `pages/direction/__tests__/DirectionPage.test.tsx`:
     - `radiogroup is keyboard-navigable` → `user.tab()` into fieldset, `ArrowRight` cycles selection, assert `aria-checked` updates.
     - `parameters use the Input primitive` → regex-assert every range input's className contains the primitive BASE string (`text-xs p-2 rounded-lg bg-white`...). Pragmatic: grep the rendered DOM.
     - `submit posts direction + optional comment` → mock `submitDirection`; click; assert the payload contains `{ archetype: "...", parameters: {...} }`. Comment is NOT in the wire payload (per risk #2); add a skipped `it.todo("submit includes comment when DirectionSelectRequest schema supports it")` to track.
   - Run `npx vitest run src/pages/question/__tests__/QuestionPage.test.tsx src/pages/direction/__tests__/DirectionPage.test.tsx`.
   - Commit.

6. **Regenerate parity snapshots.**
   - Run `npx vitest run tests/parity.spec.tsx -u` — regenerate the `question` and `direction` snapshot entries. Visually inspect the diff to ensure: (a) `<fieldset role="radiogroup">` appears, (b) native `<input type="radio">` appears, (c) `role="region" aria-roledescription="carousel"` appears on multi-image question, (d) textarea has associated label via `for`/`id`.
   - Commit.

7. **Add demo-route cases to a11y-pages spec.**
   - Extend `PAGE_CASES` with `{ name: "question demo-multi-choice", pathname: "/question/demo-multi-choice", fixtureFile: "question-session-multi-choice.json" }` and `{ name: "question demo-free-text", pathname: "/question/demo-free-text", fixtureFile: "question-session-free-text.json" }`.
   - Update `makeMockClient` / `fetchSession` mock to route by sessionId → fixture (match on `sessionId === "demo-multi-choice"` vs `"demo-free-text"` vs `"test-question-1"`).
   - Run `npx vitest run tests/a11y-pages.spec.tsx` — four question cases + two direction cases + review cases all pass axe.
   - Commit.

8. **Final verification gates.**
   - `npx tsc --noEmit` → exit 0.
   - `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens` → exit 0.
   - `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens` → exit 0.
   - `npx vitest run` inside `packages/haiku-ui/` → exit 0 (all suites: audit-banned-patterns, a11y-pages, parity, skip-link, use-session-websocket, ThemeToggle, primitives, route parser, new QuestionPage + DirectionPage).
   - `grep -rn "components/QuestionPage\|components/DesignPicker" packages/` → zero hits.
   - Commit any formatter residue from `npx biome check --apply`.

---

## Verification commands (reference)

From the unit worktree root `/Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey/.haiku/worktrees/universal-feedback-model-and-review-recovery/unit-14-question-and-direction-pages`:

```
cd packages/haiku-ui
npx tsc --noEmit
node scripts/audit-contrast.mjs --mode=tokens
node scripts/audit-banned-patterns.mjs --profile=tokens
npx vitest run
```

Expected: all exit 0. No hits from either audit. All vitest suites green including the two new component specs and the expanded a11y-pages spec.

---

## Files the builder MUST NOT touch

- `packages/haiku-ui/src/a11y/**` — canonical, tested, consumed read-only.
- `packages/haiku-ui/src/components/primitives/**` — canonical primitives from unit-04.
- `packages/haiku-ui/src/App.tsx` / `src/shell/*` — unit-06 shell, read-only.
- `packages/haiku-ui/src/routing/parseRoute.ts` — unit-06 router, read-only (it already handles `/question/:id` and `/direction/:id` for any `id` segment including `demo-multi-choice` and `demo-free-text`).
- `packages/haiku-api/src/schemas/**` — wire contracts; the direction-comment gap is a separate unit.
- `packages/haiku-ui/scripts/**` — no new audit rules in this unit (stage-wide audits land in unit-15).
- `packages/haiku-ui/audit-config.json` — no changes; the existing `tokens` profile already covers everything needed.

---

## Expected outputs (unit frontmatter `outputs:`)

- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-14-tactical-plan.md` (this file)
- `packages/haiku-ui/src/pages/question/QuestionPage.tsx`
- `packages/haiku-ui/src/pages/question/__tests__/QuestionPage.test.tsx`
- `packages/haiku-ui/src/pages/question/index.tsx` (modified import)
- `packages/haiku-ui/src/pages/direction/DirectionPage.tsx`
- `packages/haiku-ui/src/pages/direction/__tests__/DirectionPage.test.tsx`
- `packages/haiku-ui/src/pages/direction/index.tsx` (modified import)
- `packages/haiku-ui/test-fixtures/question-session.json` (reshaped)
- `packages/haiku-ui/test-fixtures/question-session-multi-choice.json` (new)
- `packages/haiku-ui/test-fixtures/question-session-free-text.json` (new)
- `packages/haiku-ui/test-fixtures/direction-session.json` (enriched)
- `packages/haiku-ui/tests/a11y-pages.spec.tsx` (extended PAGE_CASES + mock fan-out)
- `packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap` (regenerated question + direction entries)
- `packages/haiku-ui/src/components/QuestionPage.tsx` (deleted)
- `packages/haiku-ui/src/components/DesignPicker.tsx` (deleted)
