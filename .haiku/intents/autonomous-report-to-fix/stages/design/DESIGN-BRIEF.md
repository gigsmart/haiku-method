---
intent: autonomous-report-to-fix
artifact: design-brief
stage: design
created: 2026-05-08
status: active
---

# Design Brief: Autonomous Report-to-Fix Loop

Screen-by-screen design specifications for the user-facing surfaces of the autonomous report-to-fix loop. This is the contract between design and development.

---

## Surface 1: `/haiku:report` Skill — Conversational UI (Claude Code)

### Layout Structure

The skill operates entirely inside the Claude Code chat panel — no new windows, no browser redirects during collection. The conversation flows as a linear sequence:

1. **Problem collection** — Claude asks what broke, what was expected, and any reproduction steps.
2. **Summary confirmation** — Claude presents the synthesized issue report as a fenced block; user approves or revises.
3. **Bundle notification** — Claude narrates what will be collected (session JSONL + subagent JSONLs + `.haiku/intents/{slug}/` tree), lists the scrubbing patterns that will run, and confirms before POST.
4. **Submission result** — Claude displays the returned `fix_id`, the GitHub issue URL, and the `auth_url` as clickable links.

### Component Inventory

| Component | Location | Purpose | Props / Behavior |
|---|---|---|---|
| Problem-collection prompt | Turn 1 of conversation | Elicit structured context | Three questions in one turn: what happened, expected, steps |
| Summary block | Turn N confirmation | Show synthesized issue text in a fenced code block | Editable via user message; re-summarized on request |
| Bundle manifest | Pre-submit disclosure | Inline prose listing file paths and scrub patterns | No UI control — pure informational text |
| Submission result | Final turn | Show fix_id, issue URL, PR URL (when available), auth_url | All three as inline links; auth_url has "(optional — grants issue attribution)" label |
| Error state | Final turn (conditional) | Network error, scrub failure, service unavailable | Plain prose: "Submission failed: [reason]. Your session data was not sent." |

### Interaction States

- **Default**: Claude drives; user types free-form responses.
- **Pending submission**: Claude narrates "Submitting…" then the result — no spinner (text-only medium).
- **Error**: Claude reports the error inline; offers retry or "skip the report" exit.
- **Auth skipped**: User can close after seeing fix_id and issue URL; auth grant is not required to proceed.

### Responsive Behavior

Not applicable — Claude Code chat panel is fixed-width and not responsive in the mobile-web sense. No breakpoint specification needed for this surface.

### Navigation Flows

- User runs `/haiku:report` → enters collection conversation → receives result links → optionally opens `auth_url` in browser → done.
- No back navigation; the conversation is linear. If user wants to retry, they re-run `/haiku:report`.

### Accessibility Requirements

- All links returned by the skill must be plain text URLs that screen readers can read aloud — no emoji-only link labels.
- The bundle manifest (list of files being sent) must be presented in a structured list, not a wall of prose, so a screen reader can enumerate items.

---

## Surface 2: `haikumethod.ai/report/[id]` — Auth Landing Page (Website)

### Layout Structure

**Constraint**: `output: "export"` in production. This page is a client-rendered SPA. The `[id]` is read from `window.location.pathname` at runtime, not from `generateStaticParams`. Pattern follows `/browse` and `/auth/[provider]/callback`.

**Single-column centered layout**, max-width `md` (448px), vertically centered in the viewport with `py-20`. Three content states rendered conditionally based on a `status` state machine:

1. **Loading** — Spinner + "Looking up report…" — rendered while the client fetches report status from the Cloud Run service.
2. **Auth prompt** — Main content state for a user arriving from `auth_url`. Shows report summary, GitHub OAuth button, attribution note, and a "skip — keep as bot-authored" link.
3. **Status / confirmed** — After OAuth grant completes (or skip), shows the GitHub issue link, PR link (if already opened), and a note about the fix loop.
4. **Error** — Fetch or OAuth failure, with "Try again" and "Contact support" links.

**No sidebar, no header mega-menu injection.** The standard site `Header` and `Footer` wrap the content. A breadcrumb (`Home / Report`) appears below the header.

### Component Inventory

**Breadcrumb** — `Home / Report` nav row. `Home` links to `/`. `Report` is non-linked current page. Positioned `mb-8`. Uses `text-sm text-stone-500` with `hover:text-stone-900` on the link.

**Status icon cluster** — 48px SVG icon (spinner, checkmark, GitHub logo, or X) centered above the heading. Same icon set as `CallbackClient.tsx`. Colors: spinner = `text-teal-500 animate-spin`, checkmark = `text-green-500`, X = `text-red-500`, GitHub logo = `text-stone-700 dark:text-stone-300`.

**Report summary card** — Shown in auth-prompt state only. A `rounded-xl border border-stone-200 dark:border-stone-700 p-6` card containing:
- `text-xs uppercase tracking-wider text-stone-400 mb-1` label: "Issue to be opened"
- `text-lg font-semibold text-stone-900 dark:text-white` title from the synthesized report
- `text-sm text-stone-600 dark:text-stone-400 mt-2` body: first 200 chars of the issue body, truncated with "…"
- `text-xs text-stone-400 mt-4` metadata row: "Report ID: {fix_id}" in monospace

**GitHub OAuth button** — `w-full flex items-center justify-center gap-3 rounded-lg bg-stone-900 dark:bg-white text-white dark:text-stone-900 px-4 py-3 text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-100 transition` — GitHub logo SVG (16px) on the left, "Connect GitHub to attribute this issue to you" label. Min touch target 44px (py-3 + text = ~44px). Keyboard: `Enter` and `Space` activate.

**Attribution note** — `text-xs text-stone-500 dark:text-stone-400 text-center mt-3` — "We request issue-write scope only. The issue body will name you as the reporter. The PR is bot-authored."

**Skip link** — `text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 underline underline-offset-2 text-center mt-4 block` — "Skip — open issue as bot-authored". Triggers the same flow as completing OAuth but without the token exchange.

**Issue/PR link row** — Shown in status state. Two pill-style links side by side (or stacked on narrow): `inline-flex items-center gap-2 rounded-full border border-stone-200 dark:border-stone-700 px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:border-teal-400`. GitHub issue icon (14px) + "View Issue". GitHub PR icon (14px) + "View PR" (greyed `text-stone-400` if PR not yet created, with tooltip "PR will appear shortly").

**Fix loop status note** — `text-sm text-stone-500 dark:text-stone-400 text-center mt-6` — "The fix loop will push commits and respond to CI. Check the PR for progress."

**Error state** — Heading `text-xl font-bold mb-2`, body `text-sm text-red-600 dark:text-red-400 mb-4`, two buttons side by side: "Try again" (outlined) and "Back to Home" (teal filled). Matches the button pattern in `CallbackClient.tsx`.

### Interaction States

| Element | Default | Hover | Focus | Active | Error | Loading |
|---|---|---|---|---|---|---|
| GitHub OAuth button | bg-stone-900 text-white | bg-stone-700 | ring-2 ring-teal-500 ring-offset-2 | opacity-75 | hidden (replaced by error state) | spinner inside button, disabled |
| Skip link | text-stone-500 underline | text-stone-700 | ring-2 ring-offset-1 rounded | — | — | hidden (page is in loading state) |
| Issue/PR pill | border-stone-200 | border-teal-400 | ring-2 ring-teal-500 | border-teal-600 | — | skeleton shimmer (bg-stone-100 animate-pulse) |
| Try again button | border-stone-300 | bg-stone-50 | ring-2 ring-teal-500 | — | — | — |

**Loading state**: Full page shows the spinner icon and "Looking up report…" — no other elements rendered yet. Prevents content flash before the fetch resolves.

**OAuth in-flight**: After clicking the GitHub button, the button shows an inline spinner and "Connecting…" label; it is `disabled`. The skip link is hidden. If the OAuth flow opens a popup (or redirects), the page awaits the callback.

**Post-OAuth callback**: The auth callback lands at `/auth/github/callback`. That handler stores the token (via `website/lib/browse/auth.ts` pattern), then redirects back to `/report/{id}`. The page detects the stored token, triggers the attribution POST to the Cloud Run service, and transitions to status state.

### Responsive Behavior

| Breakpoint | Layout |
|---|---|
| Mobile 375px | Single column, full-width card, buttons stack vertically, max-width none (px-4 on container) |
| Tablet 768px | Single column, max-w-md centered (448px), buttons side by side where applicable |
| Desktop 1280px | Same as tablet — this is a narrow, focused flow; no wider expansion needed |

**Touch targets**: GitHub OAuth button is `py-3` + line-height ≈ 44px. Skip link is `text-sm` (20px) — add `py-2` padding to bring it to 44px touch target. Issue/PR pills are `py-2` + text ≈ 36px — add `py-2.5` to reach 44px.

### Navigation Flows

- **Happy path**: User arrives via `auth_url` from `/haiku:report` → sees auth-prompt state → clicks GitHub button → OAuth redirect → `/auth/github/callback` → redirects to `/report/{id}` → status state with issue + PR links.
- **Skip path**: User arrives → clicks "Skip" → Cloud Run creates bot-attributed issue → page transitions to status state.
- **Direct link**: User shares the `/report/{id}` URL with a colleague or pastes it in their browser → page loads in status state (if issue already created) or auth-prompt state (if pending attribution).
- **Expired ID**: `fix_id` not found in Cloud Run state store → error state with "This report link may have expired" message.

### Accessibility Requirements

- Page title: `"Report {fix_id.slice(0,8)}… — H·AI·K·U"` (dynamic, set client-side via `document.title`).
- All state transitions announce to screen readers via `aria-live="polite"` on the status container div.
- GitHub OAuth button: `aria-label="Connect GitHub account to attribute this issue to your name"`.
- Skip link: `aria-label="Skip GitHub connection — issue will be opened under the bot account"`.
- Focus management: After state transition (loading → auth-prompt, auth-prompt → status), focus is moved to the heading via `useEffect` + `ref.current.focus()`.
- Issue/PR pills: each has `aria-label="View GitHub issue #{n}"` and `aria-label="View pull request #{n}"`.
- Keyboard navigation order: breadcrumb Home link → heading (via focus management) → report summary card (non-interactive) → GitHub OAuth button → Skip link → (post-auth) Issue pill → PR pill.

---

## Surface 3: GitHub Issue Body (Bot-Authored)

### Layout Structure

Standard GitHub issue markdown. No custom CSS — must work inside GitHub's issue renderer. Structure:

```
## Report Summary
[synthesized problem statement]

## Environment
- H·AI·K·U version: {plugin version from plugin.json}
- Reported by: {user name} ({user email if provided})
- Report ID: {fix_id}
- Report time: {ISO 8601 timestamp}

## Session Context
[truncated/redacted excerpt from session bundle — key error messages and tool calls only]

## Steps to Reproduce
[synthesized from the session bundle by the Cloud Run agent]

## Expected vs Actual
- **Expected**: [synthesized]
- **Actual**: [synthesized]

---
*This issue was opened automatically by the H·AI·K·U report loop. Full diagnostic bundle is available to authorized maintainers via the report API. [View report status](https://haikumethod.ai/report/{fix_id})*
```

### Component Inventory

- **Report summary**: H2 + plain paragraph. No code blocks unless the error is a code-level exception.
- **Environment table**: Bullet list (GitHub renders `| | |` tables but they're fragile; bullets are more robust).
- **Session context**: H2 + fenced code block with `text` language tag — the scrubbed excerpt. Max 50 lines to stay within GitHub's diff display. Label above: "Scrubbed session excerpt (secrets removed, paths anonymized)".
- **Steps / Expected vs Actual**: H2 sections synthesized by the Cloud Run agent, not copied verbatim from JSONL.
- **Footer attribution**: Horizontal rule + italicized auto-attribution paragraph with `haikumethod.ai/report/{fix_id}` link.

### Interaction States

Not applicable — GitHub issue body is static rendered markdown.

### Responsive Behavior

GitHub issues are responsive by GitHub's own CSS. No design spec required here — the structure above is sufficient for correct rendering at any viewport.

### Navigation Flows

- Issue links to `haikumethod.ai/report/{fix_id}` in the footer.
- Issue references the bot-authored PR via `Fixes #N` syntax in the PR description (not in the issue body — avoids premature close).

### Accessibility Requirements

- All headings must be real ATX headings (`## Heading`), not bold-only lines — GitHub's renderer preserves heading semantics.
- The fenced code block has a language tag (`text`) so it renders as a code block, not a paragraph — screen readers identify it as preformatted content.
- Links have descriptive text (`View report status`, not `click here`).

---

## Surface 4: GitHub PR Description (Bot-Authored)

### Layout Structure

```
## Summary
[1-3 bullet points describing the fix]

Fixes #{issue_number}

## Diagnostic Context
- Report ID: {fix_id}
- Fix iteration: {n} of {max}
- Session bundle: [available to maintainers via report API]

## Test plan
- [ ] CI passes (all checks green)
- [ ] Issue reproducer no longer triggers the bug
- [ ] No regressions in existing test suite

---
*Bot-authored via the H·AI·K·U report loop. [View report](https://haikumethod.ai/report/{fix_id})*
```

### Component Inventory

- **Summary bullets**: 1–3 items describing the code change, not the bug description (that's in the issue).
- **`Fixes #N`**: GitHub auto-close keyword — closes the issue when the PR merges.
- **Diagnostic context**: Links bot's knowledge back to the report for maintainer traceability.
- **Test plan checklist**: Standard GitHub markdown task list — renders as checkboxes.
- **Footer**: Same pattern as issue footer.

### Interaction States

Not applicable — static rendered markdown.

### Responsive Behavior

Inherits GitHub's responsive layout.

### Navigation Flows

- PR description links back to `haikumethod.ai/report/{fix_id}` and references the source issue.
- On CI failure or review comment, the bot pushes a new commit — no new PR is opened; the same PR is updated.

### Accessibility Requirements

- Checklist items are native GitHub task-list syntax — renders with accessible checkbox roles.
- `Fixes #N` is a plain text reference — GitHub linkifies it with proper accessible link text.

---

## Design Gaps

| Gap | Disposition |
|---|---|
| `/haiku:report` consent prompt design — how much disclosure before collection starts | Designed: Claude narrates the bundle manifest and scrub patterns before POST, in the "bundle notification" turn (Surface 1, step 3). Exact consent language is content, not a design gap — belongs in the skill's copy. |
| `auth_url` expiry UX — what happens if the link is opened weeks later | Designed: Error state on Surface 2 handles `fix_id` not found with "This report link may have expired." |
| Large JSONL truncation UI — what the user sees when bundle is chunked or truncated | Deferred: Cloud Run service handles chunking transparently; the plugin surface only reports "bundle collected (N files, Xkb after scrubbing)". Visual indicator of truncation is a V2 concern. |
| Fix-loop iteration count display — how many attempts remain | Deferred: Surface 2 shows "Fix loop running" but not a counter. Exposing the iteration count risks alarming users; the issue/PR timeline is the source of truth. |
| Multiple concurrent reports — user files two reports in one session | Out of scope for V1: each `/haiku:report` invocation produces a unique `fix_id`; the user sees both links. No deduplication UI is designed. |
| Bot-comment UX on PR (review comment responses, CI fix pushes) | Out of scope for design stage: bot comments are plain GitHub markdown authored by the Cloud Run agent, not a designed surface. Style guide for bot comments is an implementation concern. |
| Privacy consent record — where user consent is stored | Depends on consent model — see privacy artifact (cross-boundary: privacy/legal model is out of scope for this brief). |

---

## Context Boundaries

- **Auth model**: The GitHub OAuth scope (issue-write only), token storage in the website's existing `auth.ts` pattern, and the auth-proxy route are out of scope for this brief. See the security discovery artifact for OAuth boundary design.
- **Cloud Run service API contract**: The exact POST payload shape, response envelope (`{fix_id, auth_url}`), and webhook receiver design are implementation decisions for the engineering stage. This brief assumes the contract from the intent goal: `{fix_id, auth_url}` on success.
- **Scrubbing patterns**: What counts as a secret pattern (regex list, known token formats, `/Users/...` path normalization) is an implementation concern. This brief assumes scrubbing happens before POST and that the plugin surfaces a count of scrubbed items to the user.
- **State store choice** (Firestore vs GCS): Does not affect the design of Surface 2 — the page fetches status regardless of the backing store.
- **Privacy policy update**: The DISCOVERY.md notes that `website/content/pages/privacy.md` must be updated before ship ("None of that data is sent to GigSmart servers" is no longer accurate). The copy for the consent disclosure in Surface 1 must align with whatever the updated policy says. This brief does not author the policy; it identifies the dependency.
