# Design Brief: Feedback Panel and Review-App Integration

## Scope

This brief covers the review-app UI changes for the universal feedback model (Implementation Map Group 12). It defines the layout, component inventory, interaction states, responsive behavior, accessibility requirements, and the migration path from the current batch-comment model to per-item feedback file persistence.

The review app lives in `packages/haiku/review-app/src/`. It is a React SPA using Tailwind CSS v4, `@tailwindcss/typography`, and a stone/teal/amber design language with full dark-mode support. All existing components use the `dark:` variant strategy with `.dark` class on `<html>`.

---

## Design Language Reference (Extracted from Codebase)

These patterns are non-negotiable -- every new component must match them exactly.

### Color Palette

| Role | Light | Dark |
|---|---|---|
| Surface | `bg-white` | `bg-stone-900` |
| Surface raised | `bg-stone-50/50` | `bg-stone-800/50` |
| Border | `border-stone-200` | `border-stone-700` |
| Text primary | `text-stone-900` | `text-stone-100` |
| Text secondary | `text-stone-500` | `text-stone-400` |
| Text muted | `text-stone-400` | `text-stone-500` |
| Accent primary | `text-teal-600` / `bg-teal-600` | `text-teal-400` / `bg-teal-600` |
| Accent hover | `hover:bg-teal-700` | `hover:bg-teal-700` |
| Warning | `text-amber-600` / `bg-amber-600` | `text-amber-400` / `bg-amber-600` |
| Error | `text-red-600` | `text-red-400` |

### Component Patterns

- **Card**: `bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6 mb-6`
- **SectionHeading**: `text-lg font-semibold mb-3 text-stone-900 dark:text-stone-100` (h2) or `text-base` (h3)
- **Badge (status)**: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold` + color class
- **Button primary**: `px-4 py-2.5 text-sm font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors`
- **Button secondary**: `px-4 py-2.5 text-sm font-semibold rounded-lg bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200`
- **Input/Textarea**: `text-xs p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-1 focus:ring-teal-500`
- **Sidebar layout**: `w-80 lg:w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col`
- **Tab active**: `border-b-2 border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400`
- **Tab inactive**: `border-transparent text-stone-500 dark:text-stone-400`
- **Hover highlight on list items**: `hover:border-teal-400 dark:hover:border-teal-500 transition-colors`
- **Confirm dialog**: `fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm` wrapping `bg-white dark:bg-stone-900 rounded-xl border shadow-2xl p-6 max-w-sm`

### Icon/Emoji Convention

The existing sidebar uses emoji for comment type icons: pushpin for pins, pencil for inline, speech bubble for general. New feedback-source icons should follow this same lightweight pattern rather than importing an icon library.

---

## 1. Layout Structure

### Current Layout

```
+------------------------------------------------------+
|  Header (sticky top-0)                               |
+------------------------------------------------------+
|  Main Content (flex-1)       |  ReviewSidebar (w-80)  |
|  - Tabs (sticky top-[53px]) |  - "Review" header     |
|  - Tab panels               |  - Comments list       |
|  - Cards with InlineComments|  - General input       |
|  - AnnotationCanvas         |  - Decision buttons    |
+------------------------------------------------------+
```

### Proposed Layout

The sidebar splits into two vertical regions: a **feedback panel** (top, scrollable) and the **action footer** (bottom, pinned). The feedback panel replaces and extends the current comments list.

```
+------------------------------------------------------+
|  Header (sticky top-0)                               |
+------------------------------------------------------+
|  Main Content (flex-1)       |  Sidebar (w-80/w-96)   |
|  - Tabs (sticky top-[53px]) |  +--------------------+ |
|  - Tab panels               |  | Comments  [·Agent] | |
|  - Cards with InlineComments|  +--------------------+ |
|  - AnnotationCanvas         |  | Filter pills:       | |
|                              |  | [Pending·Addressed· | |
|                              |  |  All] (status only) | |
|                              |  +--------------------+ |
|                              |  | Unified Comments   | |
|                              |  | list (scrollable)  | |
|                              |  |                    | |
|                              |  | - User-origin:     | |
|                              |  |   user-chat,       | |
|                              |  |   user-visual,     | |
|                              |  |   external-pr/mr   | |
|                              |  |                    | |
|                              |  | - Agent-origin:    | |
|                              |  |   shown only when  | |
|                              |  |   AgentFeedback-   | |
|                              |  |   Toggle is ON;    | |
|                              |  |   interleaved with | |
|                              |  |   origin badges    | |
|                              |  +--------------------+ |
|                              |  | General Input      | |
|                              |  | Decision Buttons   | |
|                              |  +--------------------+ |
+------------------------------------------------------+
```

### Sidebar — Unified Comments + AgentFeedbackToggle

The sidebar header is a single **"Comments"** heading with an adjacent **AgentFeedbackToggle** (default OFF). There is **no identity-based segmented control** — H·AI·K·U has no concept of user identity (no login, no per-user state), so any per-user partition is undefined.

- **Comments list (always)**: unified stream of every user-origin item (`user-chat`, `user-visual`, `external-pr`, `external-mr`) plus the current session's in-progress annotations (inline, pin, general). Origin badges differentiate, so nothing is hidden.
- **AgentFeedbackToggle (default OFF)**: when ON, agent-origin items (`adversarial-review`, `agent`) are revealed **inline**, interleaved with user items in the same list. Each agent item carries a visible origin badge so the reviewer can tell them apart without hiding. When OFF, a muted count chip (`agent · N`) next to the toggle indicates how many agent items are suppressed.
- **Status filter pills** (`Pending` / `Addressed` / `All`, per unit-01) sit below the header and filter the unified list by **status only** — they are *not* identity filters. "All" is the default. Pills apply regardless of the AgentFeedbackToggle state.

**Rationale**: a single list mirrors the file-system truth (there is no per-user partition on disk); the toggle lets the reviewer focus on user-origin work during active annotation without pretending agent items don't exist. This supersedes the earlier identity-based segmented design — see unit-05 (`comments-list-with-agent-toggle.html`).

---

## 2. Component Inventory

> **State-coverage requirement (added in unit-15 / FB-25).** Every new component in this intent — and every new component introduced in downstream stages — **MUST** ship with a six-state grid (default / hover / focus / active / disabled / error) rendered alongside its component spec. Use `stages/design/artifacts/state-coverage-grid.md` as the template. Components whose element cannot reach a given state (e.g. a non-focusable label) **MUST** mark the state `N/A` with a one-line rationale; silently omitting a state is not acceptable. The design-reviewer hat walks this grid row-by-row before approval.

### Typography Floor (unit-11)

Hard rules, enforced by grep across `stages/design/artifacts/`:

- `text-xs` (12px) is the absolute floor for any user-facing information (titles, metadata, labels, button text).
- `text-[11px]` is permitted ONLY when paired with `font-semibold` or `font-bold` (the weight compensates for the size reduction). This is reserved for compact badges, filter pills, and small stat labels where 12px would overflow the container.
- `text-[10px]` and `text-[9px]` are BANNED for user-facing content. They fail WCAG 1.4.4 Resize Text in practice and are unreadable for users over 40 or with low vision. Decorative aria-hidden glyphs inside 16px status-signal circles use `text-xs font-bold` at the same floor.
- Zoom test: at 200% browser zoom (required by WCAG 1.4.4), every text span must remain on one line or wrap cleanly — no clipping.

### Banned Text-on-Surface Pairs (unit-11)

These foreground-on-background pairs MUST NOT appear anywhere in the feedback UI:

| Foreground | Forbidden backgrounds | Reason | Remediation |
|---|---|---|---|
| `text-stone-400` / `text-gray-400` | white, stone-50, stone-100, amber-50/50, blue-50/50, green-50/30, sky-50 | < 4.5:1 on any light card surface | Use `text-stone-600` (≥ 6.85:1) |
| `text-stone-500` (dark mode) | stone-800, stone-900, stone-950 | < 4.5:1 on dark card surfaces | Use `dark:text-stone-300` (≥ 10:1) |
| `bg-green-600/50 text-white/80` (disabled) | any | α-composite opacity collapses text contrast | Use `bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200` |
| `opacity-70` on closed card root | any | α-composite over already-muted metadata text drops to ~2:1 | Replace with `bg-green-50/60` + checkmark glyph + "Closed ·" prefix |
| `opacity-50` on rejected card root | any | α-composite makes strikethrough + metadata text unreadable | Replace with `bg-stone-100` + × glyph + "Rejected ·" prefix + full-opacity strikethrough |

### Disabled Control Tokens (unit-11)

WCAG 2.2 1.4.11 Non-Text Contrast requires ≥ 3:1 for disabled-state indicators to be perceivable, and text inside disabled buttons MUST still meet 4.5:1 where text is visible.

| Component | Disabled tokens | Text contrast | UI contrast (border) |
|---|---|---|---|
| Button (secondary, disabled) | `bg-stone-100 text-stone-600 border border-stone-400 cursor-not-allowed` | 6.85:1 | 3.4:1 |
| Button (secondary, disabled, dark) | `dark:bg-stone-800 dark:text-stone-300 dark:border-stone-500` | 10.2:1 | 3.2:1 |
| Button (primary green, disabled) | `bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200` | 5.1:1 light / 7.8:1 dark | — |
| Every disabled control MUST carry `aria-disabled="true"` alongside the native `disabled` attribute so screen readers announce the state explicitly. | | | |


### New Components

#### `FeedbackStatusBadge`

A specialized badge for feedback status values. Extends the existing `StatusBadge` pattern with feedback-specific colors.

**Props:**
```typescript
interface FeedbackStatusBadgeProps {
  status: "pending" | "addressed" | "closed" | "rejected";
}
```

**Color mapping:**

| Status | Light | Dark | Rationale |
|---|---|---|---|
| `pending` | `bg-amber-100 text-amber-700` | `bg-amber-900/30 text-amber-300` | Amber = needs attention, consistent with existing warning color |
| `addressed` | `bg-blue-100 text-blue-700` | `bg-blue-900/30 text-blue-400` | Blue = in-progress/claimed, distinct from final states |
| `closed` | `bg-green-100 text-green-700` | `bg-green-900/30 text-green-400` | Green = resolved, consistent with `completed` status |
| `rejected` | `bg-stone-100 text-stone-500` | `bg-stone-800 text-stone-400` | Gray = dismissed, deliberately low-contrast |

**Implementation:**
```tsx
const feedbackColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  addressed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  closed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
};
```

Uses the same `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold` base classes as the shared `StatusBadge`.

**Accessibility:** The badge includes a visible text label ("pending", "addressed", etc.) so it does not rely on color alone. The `aria-label` includes the status value. All color combinations meet WCAG 2.1 AA contrast ratios:
- amber-700 on amber-100: 4.9:1 (passes AA)
- blue-700 on blue-100: 4.8:1 (passes AA)
- green-700 on green-100: 4.5:1 (passes AA)
- stone-500 on stone-100: 4.6:1 (passes AA)
- Dark mode equivalents also pass AA at minimum.

---

#### `FeedbackOriginIcon`

A small icon/label showing where the feedback came from. Uses emoji consistent with the existing sidebar's type-icon pattern.

**Props:**
```typescript
interface FeedbackOriginIconProps {
  origin: "adversarial-review" | "external-pr" | "external-mr" | "user-visual" | "user-chat" | "agent";
}
```

**Icon mapping (canonical — single source of truth; see `artifacts/aria-landmark-spec.md §6`):**

| Origin | Icon | Code point | Label |
|---|---|---|---|
| `adversarial-review` | `🔍` | `U+1F50D` | "Review Agent" |
| `external-pr` | `🔗` | `U+1F517` | "PR Comment" |
| `external-mr` | `🔗` | `U+1F517` | "MR Comment" |
| `user-visual` | `✎` | `U+270E` | "Annotation" |
| `user-chat` | `💬` | `U+1F4AC` | "Comment" |
| `agent` | `🤖` | `U+1F916` | "Agent" |

Every artifact and every React/SSR render **MUST** use the code points above. Cross-platform emoji rendering (Apple Color Emoji / Segoe UI Emoji / Noto Color Emoji) must be verified in QA; see `artifacts/aria-landmark-spec.md §6`.

**Origin legend:** A small "?"-icon button in the sidebar header opens a popover legend listing all six origins with their emoji + label, so users who don't immediately recognize a pictograph can reference the mapping.

**ARIA policy for emoji:** When paired with a visible text label, the emoji span uses `aria-hidden="true"`. When rendered alone (no visible label), it uses `role="img" aria-label="{Label}"`.

Rendered as: `<span className="text-xs text-stone-500 dark:text-stone-400" aria-hidden="true">{icon}</span> {label}` when the label is visible.`

---

#### `FeedbackItem`

A single feedback item in the feedback list. Two visual variants: **compact** (in the sidebar list) and **expanded** (when clicked).

**Props:**
```typescript
interface FeedbackItemProps {
  item: FeedbackItemData;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange?: (newStatus: string) => void;
  isReadOnly?: boolean;
}
```

**Compact state (default):**

```
+---------------------------------------------+
| 🔍 Review Agent          [pending] badge    |
| "Missing null check in handleSubmit"         |
| FB-03 · Visit 1 · adversarial-review        |
+---------------------------------------------+
```

- Container: `p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-transparent hover:border-teal-400 dark:hover:border-teal-500 transition-colors cursor-pointer` (matches existing `SidebarComment` styling).
- First row: origin icon + label left-aligned, status badge right-aligned.
- Second row: feedback title, `text-xs font-medium text-stone-700 dark:text-stone-300`, single line with `truncate`.
- Third row: `text-[10px] text-stone-400 dark:text-stone-500` metadata line: feedback ID, visit number, origin.

**Expanded state (clicked):**

The item expands in-place to show:
- Full title (no truncation).
- Full markdown body rendered as prose (`prose prose-xs prose-stone dark:prose-invert`).
- If `addressed_by` is set: link/label showing which unit claims to address it.
- If `status === "pending"`: a single **"Dismiss"** button (small, secondary style). Copy does NOT split by `author_type` — the verb covers both human and agent origins. See `footer-button-copy-spec.md` for the canonical status × origin matrix.
- If `status === "addressed"`: a **"Verify & Close"** primary button plus a **"Reopen"** secondary button.
- If `status === "closed"` or `status === "rejected"`: a single **"Reopen"** button (one word, no hyphen).

**Interaction states:**
- **Default**: compact, clickable.
- **Hover**: border highlight (teal).
- **Expanded**: body visible, action buttons visible.
- **Status: pending**: amber left border + amber badge + `⏱` clock glyph in a 16px amber-500 solid circle before the origin badge.
- **Status: addressed**: blue left border + blue badge + `↗` arrow glyph + "Addressed by ..." meta line (3-signal).
- **Status: closed**: green left border + `bg-green-50/60` muted background + green badge + `✓` checkmark glyph in a 16px green-600 solid circle + **"Closed ·" text prefix** on the title. **Do NOT apply `opacity-70`** — the opacity composite collapses metadata-text contrast below AA.
- **Status: rejected**: stone-400 left border + `bg-stone-100` muted background + stone badge + `×` cross glyph in a 16px stone-500 solid circle + **"Rejected ·" text prefix** + `line-through decoration-stone-500` on the title span at full opacity. **Do NOT apply `opacity-50`** — the strikethrough itself becomes invisible under 50% opacity.

**Status-signaling rule (WCAG 1.4.1 "Use of Color"):** every feedback card MUST convey status via at least TWO signals — the colored left border + a non-color second signal (shape glyph OR text prefix). The status badge text label is a third signal but alone is not sufficient at list-scan scale (the badge is 11px and sits at the card's top-right, where scanning users rarely land). See `state-signaling-inventory.html` for the full rendered matrix across compact + expanded + light + dark.

---

#### `FeedbackList`

The scrollable list of feedback items within the sidebar.

**Props:**
```typescript
interface FeedbackListProps {
  items: FeedbackItemData[];
  currentVisit: number;
  onStatusChange: (feedbackId: string, newStatus: string) => void;
}
```

**Grouping:** Items are grouped by visit number, with the current visit's items on top. Each group has a small header:

```
── Current Visit ──────────────────────────
[FeedbackItem]
[FeedbackItem]
[FeedbackItem]

── Visit 1 ────────────────────────────────
[FeedbackItem] (addressed)
[FeedbackItem] (closed)
```

Group header: `text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500` with a horizontal rule using `border-t border-stone-200 dark:border-stone-700`.

**Empty state:** When no feedback items exist: `"No feedback yet. Select text or drop pins to add annotations."` in `text-xs text-stone-400 dark:text-stone-500 italic p-2 text-center` (matches existing empty state).

**Sorting within group:**
1. `pending` items first
2. `addressed` items second
3. `rejected` and `closed` items last
4. Within same status: newest first (by `created_at` descending)

---

#### `FeedbackSummaryBar`

A compact summary strip at the top of the feedback list showing aggregate counts by status. Appears only when feedback items exist.

```
+---------------------------------------------+
| 3 pending · 2 addressed · 1 closed          |
+---------------------------------------------+
```

- Container: `px-3 py-2 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-700`
- Each count: `text-xs font-medium` with the corresponding status color.
- Counts that are zero are omitted.
- Clickable counts filter the list to that status (toggle behavior -- click again to clear filter).

---

#### `AgentFeedbackToggle`

A single switch (default **OFF**) that reveals agent-origin feedback (`adversarial-review`, `agent`) inline within the unified **Comments** list. Replaces the earlier `SidebarSegmentedControl` design — H·AI·K·U has no user identity, so an identity-based split is undefined. See unit-05 rationale and `comments-list-with-agent-toggle.html`.

```
+---------------------------------------------+
| Comments                [agent ·2] [  ○  ]  |
+---------------------------------------------+
```

**Props:**
```typescript
interface AgentFeedbackToggleProps {
  /** Current toggle state — when true, agent-origin items render inline. */
  showAgent: boolean;
  /** Handler invoked when the toggle flips. */
  onToggle: (next: boolean) => void;
  /** Count of agent-origin items currently suppressed (shown as muted chip when OFF). */
  agentCount: number;
}
```

**Visual spec:**

- Container: `flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-700`
- Label ("Comments"): `text-sm font-semibold text-stone-900 dark:text-stone-100`
- Muted count chip (when toggle is OFF and `agentCount > 0`): `text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800` — e.g. `agent · 2`
- Switch track (OFF): `w-8 h-4 rounded-full bg-stone-300 dark:bg-stone-600 transition-colors`
- Switch track (ON): `w-8 h-4 rounded-full bg-teal-600 dark:bg-teal-500 transition-colors`
- Switch thumb: `w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform` — translates right when ON

**State:**

| `showAgent` | Comments list contents | Muted chip |
|---|---|---|
| `false` (default) | user-origin items only (`user-chat`, `user-visual`, `external-pr`, `external-mr`) | Visible when `agentCount > 0` — e.g. `agent · 3` |
| `true` | all items interleaved by `created_at` with origin badges | Hidden |

**Behavior:**

- Clicking the switch flips `showAgent` and triggers `onToggle(!showAgent)`.
- When `showAgent` becomes `true`, agent-origin items animate into the list (opacity 0→1 over 150ms).
- The unified Comments list always renders one list; the toggle only changes the population, not the container.
- Status filter pills (`Pending` / `Addressed` / `All` per unit-01) sit below this row and filter the list by **status**, independent of the toggle.

**ARIA contract (ties into unit-13's switch role spec):**

- The switch root element uses `role="switch"` with `aria-checked={showAgent}`.
- `aria-label="Show agent feedback inline"` (the visible "Comments" label sits outside the switch, so the switch needs its own label).
- When the toggle flips, a `role="status" aria-live="polite"` region announces `"Agent feedback shown (N items)"` or `"Agent feedback hidden"`.
- Keyboard: `Space` or `Enter` toggles; focus ring uses the shared focus-ring spec (`ring-2 ring-teal-500 ring-offset-2 ring-offset-white dark:ring-offset-stone-900`).

**Rationale:** agent-origin feedback is usually secondary during active review; surfacing it by default would overwhelm the list with assessor / consistency-agent output. The toggle is an opt-in overlay, and the muted count keeps the reviewer aware that agent items exist without making them visible.

---

### Modified Components

#### `ReviewSidebar.tsx` -- Changes

The sidebar's internal structure changes from a flat comments list to a **unified Comments list** with an `AgentFeedbackToggle` overlay. The footer (general comment input + decision buttons) remains unchanged.

**State additions:**
```typescript
// Unified Comments list backing — merges user-origin feedback with the current
// session's in-progress annotations. Agent-origin items are filtered in or out
// based on `showAgent`.
const [feedbackItems, setFeedbackItems] = useState<FeedbackItemData[]>([]);
const [feedbackLoading, setFeedbackLoading] = useState(true);
// AgentFeedbackToggle state — default OFF. When true, agent-origin items
// (`adversarial-review`, `agent`) are interleaved into the list.
const [showAgent, setShowAgent] = useState(false);
// Status filter pill state — "All" by default. Pills are status filters,
// NOT identity filters.
const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "addressed">("all");
```

**New props:**
```typescript
interface Props {
  // ...existing props...
  intentSlug: string;   // needed for CRUD API calls
  stageName: string;    // needed for CRUD API calls
  currentVisit: number; // from state.json visits field, default 0
}
```

**Data flow:**
1. On mount, fetch feedback items via `GET /api/feedback/{intent}/{stage}`.
2. Store in `feedbackItems` state.
3. The unified Comments list renders `FeedbackList` with: all user-origin items, plus agent-origin items only when `showAgent` is true, filtered by the active status pill.
4. The current session's in-progress annotations (from `InlineComments`, `AnnotationCanvas`, general textarea) appear in the same list, styled with a "draft" variant until the user clicks "Request Changes" and they're persisted as feedback files.
5. The footer (general input + decision buttons) stays visible below the list.

**Submission flow change ("Request Changes"):**

Current flow:
1. Collect all comments from state.
2. Serialize into a `feedback` string and `annotations` object.
3. Call `submitDecision(sessionId, "changes_requested", feedback, annotations)`.

New flow:
1. For each comment (inline, pin, general), call `POST /api/feedback/{intent}/{stage}` to create a feedback file.
2. Collect the returned feedback IDs.
3. Call `submitDecision(sessionId, "changes_requested", feedbackSummary, annotations)` where `feedbackSummary` references the created feedback files.
4. Clear the in-progress annotation buffers (`InlineComments`, `AnnotationCanvas`, general textarea).
5. Refresh the unified Comments list to show the newly-created items.

The individual CRUD calls happen sequentially (not in parallel) to avoid numbering collisions on the server. A loading spinner replaces the "Request Changes" button text during submission.

**"Approve" flow (unchanged):** If the user approves with no pending feedback, the flow is identical to today. If pending feedback exists, the approve confirmation dialog text changes to: "There are N pending feedback items. Approving will close all remaining items. Continue?"

---

#### `ReviewPage.tsx` -- Changes

**Minimal changes.** The ReviewPage passes `intentSlug` and `stageName` down to `ReviewSidebar` as new props. These values are derived from `session.intent_slug` and the current stage (which needs to be added to `SessionData` or derived from context).

The main content area tabs do NOT gain a dedicated "Feedback" tab. The feedback panel lives in the sidebar, not the main content area. Rationale: feedback is an annotation layer that accompanies the review content, not a separate content section. The sidebar's sticky positioning means feedback is always visible alongside whatever tab the user is viewing.

---

#### `InlineComments.tsx` -- Changes

**No structural changes to the component itself.** The `onCommentsChange` callback continues to work as-is, bubbling comments up to `ReviewPage`, which passes them to the sidebar.

**New behavior at the submission layer (in ReviewSidebar):** Each inline comment that the user creates is persisted as a feedback file when the user clicks "Request Changes." The `InlineComments` component does not need to know about feedback files -- it remains a pure UI component that tracks highlights and text selections.

**Future enhancement (v2, not in this brief):** Debounced auto-persistence of comments as the user types, creating draft feedback files that are finalized on submission. For v1, comments persist only on explicit submission.

---

#### `AnnotationCanvas.tsx` -- Changes

**No structural changes.** Same rationale as InlineComments -- the canvas remains a pure annotation UI. Pin data flows through `onPinsChange` to ReviewPage, then to the sidebar. Feedback file creation happens at the sidebar submission layer.

---

#### `useSession.ts` -- Additions

New hook and helper functions:

```typescript
/** Fetch feedback items for a stage */
export function useFeedback(intentSlug: string, stageName: string): {
  items: FeedbackItemData[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Create a feedback item via the CRUD API */
export async function createFeedback(
  intentSlug: string,
  stageName: string,
  data: { title: string; body: string; origin: string },
): Promise<FeedbackItemData>

/** Update a feedback item's status */
export async function updateFeedbackStatus(
  intentSlug: string,
  stageName: string,
  feedbackId: string,
  status: string,
): Promise<void>

/** Delete a feedback item */
export async function deleteFeedback(
  intentSlug: string,
  stageName: string,
  feedbackId: string,
): Promise<void>
```

All functions follow the existing fetch pattern: `fetch()` with `"bypass-tunnel-reminder": "1"` header, JSON content type, and error handling that throws on non-OK responses.

---

#### `types.ts` -- Additions

```typescript
export interface FeedbackItemData {
  id: string;           // e.g., "01" (the NN prefix)
  slug: string;         // e.g., "missing-null-check"
  title: string;
  body: string;
  status: "pending" | "addressed" | "closed" | "rejected";
  origin: "adversarial-review" | "external-pr" | "external-mr" | "user-visual" | "user-chat" | "agent";
  author: string;
  author_type: "human" | "agent";
  created_at: string;
  visit: number;
  source_ref?: string;
  addressed_by?: string;
}
```

---

## 3. Interaction States

### Sidebar -- Unified Comments List

| State | Visual | Behavior |
|---|---|---|
| Loading | Spinner (same as session loading: `animate-spin rounded-full border-2 border-stone-300 border-t-teal-500`) | Fetch in progress |
| Empty (visit 0, no drafts) | Italic muted text: "No comments yet. Select text or drop pins to add feedback." | No items exist |
| Empty (visit > 0, all resolved) | Italic muted text: "All feedback addressed!" with a green checkmark | All items resolved |
| Populated | `FeedbackList` with user-origin items (plus agent-origin when AgentFeedbackToggle is ON), grouped by visit | Scrollable list |
| Agent toggle OFF with agent items | Muted chip in header: `agent · N` | Indicates N agent items are suppressed |
| Agent toggle ON | Agent items animate into the list (opacity 150ms) with origin badges | Interleaved with user items by `created_at` |
| Status filter pill active | Pill has `bg-teal-600 text-white`; list filtered by that status | Click again to toggle back to "All" |
| Item hover | Border highlight (teal) | Click to expand |
| Item expanded | Body visible, action buttons visible | In-place expansion |
| Status change | Badge animates (opacity transition 150ms) | Optimistic update, revert on API error |
| API error | Red toast at bottom of sidebar: `text-xs text-red-600` | 3-second auto-dismiss |

### Sidebar -- In-Progress Annotations (Drafts)

Current-session annotations live in the **same** unified Comments list as persisted feedback. They render with a "draft" variant until the user submits.

| State | Visual | Behavior |
|---|---|---|
| Empty | Italic muted text: "No comments yet. Select text or drop pins to add feedback." | Same as current |
| Draft populated | Items rendered with `border-dashed border-stone-300 dark:border-stone-700` | Styled to signal "not yet persisted" |
| Editing | Inline textarea with Save/Cancel (unchanged) | Same as current |
| On "Request Changes" | Drafts persist as feedback files and shed the draft styling | See Submission Flow |

### Submission Flow

| State | Visual | Behavior |
|---|---|---|
| Pre-submit | "Request Changes" button in amber (when drafts exist) or secondary style (when empty) | Same as current conditional styling |
| Submitting | Button text: "Saving feedback..." with disabled state | Sequential CRUD calls |
| Per-item progress | Optional: small progress indicator next to each draft showing "Saving... N/M" | Nice-to-have, not required for v1 |
| Success | SubmitSuccess component (existing): "Decision submitted!" | Same as current |
| Partial failure | Error toast identifying which feedback items failed to save | Retry button for failed items |

### Feedback Status Transitions (User Actions in Review UI)

Canonical copy per `footer-button-copy-spec.md`. Verbs do NOT split by `author_type`.

| Current Status | User Action | New Status | Guard |
|---|---|---|---|
| `pending` | Click "Dismiss" | `rejected` | Any pending item the user can see; single verb for both human and agent origins |
| `addressed` | Click "Verify & Close" | `closed` | Any addressed item the user can see |
| `addressed` | Click "Reopen" | `pending` | Any addressed item the user can see |
| `closed` | Click "Reopen" | `pending` | Any closed item the user can see |
| `rejected` | Click "Reopen" | `pending` | Any rejected item the user can see |

The UI shows only the actions valid for the item's current status. Invalid actions are not rendered (not disabled -- absent entirely). Copy hyphenation is canonical: **"Reopen"** is always written as one word (no hyphen). See `footer-button-copy-spec.md` for the full canonical matrix.

---

## 4. Responsive Behavior

### Desktop (>= 1024px, `lg:`)

- Sidebar width: `w-96` (384px).
- Main content and sidebar side by side (`flex gap-6`).
- Feedback list has generous padding and spacing.
- FeedbackItem shows full metadata line.

### Tablet (768px -- 1023px, `md:`)

- Sidebar width: `w-80` (320px).
- Feedback list compresses: metadata line truncates, body preview limited to 2 lines (`line-clamp-2`).
- FeedbackItem compact mode uses smaller padding (`p-2` instead of `p-2.5`).

### Mobile (< 768px)

- Sidebar is hidden entirely (`hidden md:flex` -- existing behavior on `ReviewSidebar`).
- **Mobile feedback access:** The sidebar content becomes accessible via a `FeedbackFloatingButton` in the bottom-right corner that opens a full-screen `FeedbackSheet` overlay.
- `FeedbackFloatingButton`: `fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center text-lg` -- shows the comment count badge when > 0. (Full-word name replaces the earlier `FeedbackFAB` abbreviation; matches the review-app PascalCase full-word convention, e.g. `AnnotationCanvas`, not `AnnotCanv`.)
- `FeedbackSheet`: `fixed inset-0 z-50 bg-white dark:bg-stone-900` with a close button at top-right. Contains the same sidebar content (AgentFeedbackToggle, unified Comments list, status filter pills, general input, decision buttons). Responsive behavior is baked into the single `FeedbackSheet` component — no `Mobile` prefix is needed since the sheet only renders on mobile breakpoints anyway.
- Both components are canonicalized in `component-inventory.md` and §9.

**Note:** The current sidebar is already `hidden md:flex`, so mobile users currently have NO access to review actions. The `FeedbackFloatingButton` + `FeedbackSheet` pattern is a new addition that unblocks mobile review entirely.

---

## 5. Comment-to-Feedback Migration

### Current Model

```
User action (select text / drop pin / type general)
  → React state (InlineCommentEntry[] / AnnotationPin[] / SidebarComment[])
    → Batch serialize on "Request Changes"
      → POST /review/{sessionId}/decide { decision, feedback: string, annotations }
        → Orchestrator receives { feedback: "...", annotations: {...} }
```

### New Model

```
User action (select text / drop pin / type general)
  → React state (unchanged -- same InlineCommentEntry[] / AnnotationPin[] / SidebarComment[])
    → On "Request Changes":
      → For each comment, sequentially:
        → POST /api/feedback/{intent}/{stage} { title, body, origin: "user-visual" }
          → Server creates feedback file on disk
          → Returns { id, slug, ... }
      → After all feedback files created:
        → POST /review/{sessionId}/decide { decision: "changes_requested", feedback: summaryRef }
          → Orchestrator receives decision, knows feedback files exist on disk
```

### Mapping Rules

| Comment Type | Feedback File Fields |
|---|---|
| Inline comment (text selection) | `title`: truncated selected text (first 60 chars). `body`: `> {selectedText}\n\n{comment}`. `origin`: `user-visual`. `author`: `user`. `author_type`: `human`. |
| Pin annotation (image) | `title`: `Pin at ({x}%, {y}%): {first 40 chars of comment}`. `body`: `Pin annotation at coordinates ({x}%, {y}%) on the reviewed image.\n\n{comment}`. `origin`: `user-visual`. `author`: `user`. `author_type`: `human`. |
| General comment (sidebar textarea) | `title`: first 60 chars of comment text. `body`: full comment text. `origin`: `user-chat`. `author`: `user`. `author_type`: `human`. |

### Backward Compatibility

The `submitDecision` function signature does not change. It still accepts `feedback` and `annotations` parameters. The difference is that `feedback` becomes a summary reference (e.g., "Created 4 feedback items: FB-01, FB-02, FB-03, FB-04") rather than the full comment text. The orchestrator already handles the feedback-file-based flow per the architectural changes in Groups 5/6 of the implementation map.

---

## 6. Accessibility

### Contrast Ratios

All feedback status badge colors meet WCAG 2.1 AA (4.5:1 minimum for text):

| Badge | Foreground | Background | Ratio | Passes |
|---|---|---|---|---|
| Pending (light) | `amber-700` (#b45309) | `amber-100` (#fef3c7) | 4.9:1 | AA |
| Pending (dark) | `amber-300` (#fcd34d) | `amber-900/30` | 5.2:1 | AA |
| Addressed (light) | `blue-700` (#1d4ed8) | `blue-100` (#dbeafe) | 5.1:1 | AA |
| Addressed (dark) | `blue-400` (#60a5fa) | `blue-900/30` | 5.6:1 | AA |
| Closed (light) | `green-700` (#15803d) | `green-100` (#dcfce7) | 4.5:1 | AA |
| Closed (dark) | `green-400` (#4ade80) | `green-900/30` | 5.3:1 | AA |
| Rejected (light) | `stone-700` (#44403c) | `stone-200` (#e7e5e4) | 8.3:1 | AAA |
| Rejected (dark) | `stone-200` (#e7e5e4) | `stone-700` (#44403c) | 8.3:1 | AAA |

### Metadata, Title, and Disabled-Control Contrast (unit-11)

Additional pairs audited and locked:

| Role | Pair (light) | Ratio | Pair (dark) | Ratio |
|---|---|---|---|---|
| Card metadata (FB-id, Visit, origin) | `text-stone-600` on white | 7.14:1 | `dark:text-stone-300` on `dark:bg-stone-900` | 12.6:1 |
| Card title (pending / addressed / closed) | `text-stone-700` on card bg | ≥ 9:1 | `dark:text-stone-200` on card bg | ≥ 10:1 |
| Card title (rejected, struck-through) | `text-stone-500 line-through decoration-stone-500` on `bg-stone-100` | 4.61:1 (full opacity) | `text-stone-400 line-through decoration-stone-400` on `bg-stone-800/50` | 5.0:1 |
| Disabled button — secondary | `bg-stone-100 text-stone-600 border-stone-400` | 6.85:1 text / 3.4:1 border | `dark:bg-stone-800 dark:text-stone-300 dark:border-stone-500` | 10.2:1 text / 3.2:1 border |
| Disabled button — primary green | `bg-green-300 text-green-800` | 5.1:1 | `dark:bg-green-900/40 dark:text-green-200` | 7.8:1 |
| Status glyph circle — closed | white on `bg-green-600` | 4.5:1 | white on `bg-green-500` | 3.9:1 |
| Status glyph circle — rejected | white on `bg-stone-500` | 4.86:1 | `text-stone-900` on `bg-stone-400` | 8.2:1 |

See `stages/design/artifacts/contrast-and-type-audit.md` for the full measured audit including sample swatches for every (fg, bg) pair used across all feedback-UI artifacts.

### Focus Order

The sidebar focus order follows the DOM order, which matches the visual top-to-bottom flow:

1. `AgentFeedbackToggle` switch (role=switch, aria-checked=showAgent)
2. Status filter pills (`Pending` / `Addressed` / `All`)
3. `FeedbackSummaryBar` filter buttons (if present)
4. Feedback items in list order (each item is focusable via `tabIndex={0}`)
5. Expanded item action buttons (`Dismiss` / `Verify & Close` / `Reopen`)
6. General comment textarea
7. "Add" button
8. Decision buttons (Approve, External Review, Request Changes)

### Keyboard Navigation

| Key | Context | Action |
|---|---|---|
| `Tab` | Sidebar | Move focus through the focus order above |
| `Space` / `Enter` | `AgentFeedbackToggle` switch | Flip switch (show/hide agent feedback inline) |
| `Enter` / `Space` | Status filter pill | Activate or clear status filter |
| `Enter` / `Space` | Feedback item (compact) | Expand item |
| `Escape` | Feedback item (expanded) | Collapse item |
| `Enter` / `Space` | Action button (`Dismiss` / `Verify & Close` / `Reopen`) | Trigger status change |
| `Cmd+Enter` / `Ctrl+Enter` | General comment textarea | Add comment |
| `Escape` | General comment textarea | Blur textarea |
| `Tab` | Within expanded item | Move through action buttons |

### Screen Reader Announcements

- Feedback items use `role="listitem"` within a `role="list" aria-label="Feedback items"` container.
- Status badges have `aria-label` including the status text (e.g., `aria-label="Status: pending"`).
- Status changes trigger a three-phase aria-live sequence (in-flight → success OR failure). Two live-region nodes per page: `#feedback-live-polite` (`role="status" aria-live="polite"`) for in-flight + success, `#feedback-live-assertive` (`role="alert" aria-live="assertive"`) for failure + rollback. Canonical copy: "marked as rejected" (Dismiss), "marked as closed" (Verify & Close), "marked as pending" (Reopen). See `artifacts/aria-live-sequencing-spec.md` for the exact template per transition.
- The `AgentFeedbackToggle` uses `role="switch"` with `aria-checked={showAgent}` and `aria-label="Show agent feedback inline"`. Flipping announces `"Agent feedback shown (N items)"` or `"Agent feedback hidden"` via the polite live region.
- Status filter pills (`Pending` / `Addressed` / `All`) use `role="group" aria-label="Filter feedback by status"` with `aria-pressed` on each filter chip. Colored status dots are `aria-hidden="true"` (label conveys status).
- The summary bar counts have `aria-label` (e.g., `aria-label="3 pending feedback items"`).
- Expanded feedback item body is announced when the item gains focus and is expanded.
- Skip link (`<a href="#main-content">Skip to main content</a>`) is the first focusable element on every page — bypasses header/nav for keyboard users (see `artifacts/aria-landmark-spec.md §7`).
- Every page declares the full landmark set: `<header role="banner">`, `<nav aria-label="Stage progress">`, `<main id="main-content" role="main">`, `<aside role="complementary" aria-label="Review sidebar">` (desktop). See `artifacts/aria-landmark-spec.md §1-2`.
- Every modal declares `role="dialog" aria-modal="true" aria-labelledby="{titleId}"` with a focus-trap; see §3.
- The assessor-summary-card root is `role="status" aria-live="polite"` so AT announces "assessor run complete" when the gate unlocks.

### Mobile Sheet Overlay

- The `FeedbackFloatingButton` has `aria-label="Open feedback panel"` with the count (e.g., `aria-label="Open feedback panel, 3 comments"`).
- The `FeedbackSheet` overlay is a proper dialog: `role="dialog" aria-modal="true" aria-labelledby="sheet-title"` on the container, `id="sheet-title"` on the h2 "Feedback" heading.
- **Focus-trap strategy:** use `focus-trap-react` (https://github.com/focus-trap/focus-trap-react) — the same library already used by the annotation-popover. Wrap the sheet in `<FocusTrap active returnFocusOnDeactivate>`. The library moves focus to the first tabbable (`AgentFeedbackToggle`) on mount and restores focus to the `FeedbackFloatingButton` on unmount. No manual `focus()` calls from component code.
- While the sheet is open, main content and header receive `aria-hidden="true"` + the `inert` attribute so assistive tech does not traverse background content.
- `Escape` closes the sheet.
- The close button has `aria-label="Close feedback panel"`.
- When the sheet opens, focus moves to the first interactive element (`AgentFeedbackToggle`).
- When the sheet closes (close button, Escape, backdrop tap, or Approve/Request-Changes submit), `returnFocusOnDeactivate` automatically restores focus to the `FeedbackFloatingButton`.
- See `artifacts/aria-landmark-spec.md §3` for the full dialog contract and `artifacts/aria-live-sequencing-spec.md` for the live-region sequencing on status-change announcements.

---

## 7. CSS Additions

New styles to add to `packages/haiku/review-app/src/index.css`:

```css
/* Feedback item status indicators -- left border */
.feedback-item-addressed {
  border-left: 2px solid #60a5fa; /* blue-400 */
}
.feedback-item-closed {
  border-left: 2px solid #4ade80; /* green-400 */
  opacity: 0.7;
}
.feedback-item-rejected {
  opacity: 0.5;
}
.feedback-item-rejected .feedback-title {
  text-decoration: line-through;
}

/* FeedbackFloatingButton pulse animation for new items (mobile only) */
@keyframes feedback-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(13, 148, 136, 0); }
}
.feedback-floating-button-pulse {
  animation: feedback-pulse 2s ease-in-out 3;
}
@media (prefers-reduced-motion: reduce) {
  .feedback-floating-button-pulse { animation: none; }
}
```

Most styling uses Tailwind utility classes directly on components. The CSS additions are only for states that require descendant selectors or animations that are cumbersome in inline Tailwind.

---

## 8. Data Flow Summary

```
┌──────────────────────────────────────────────────────────────┐
│ SessionData (from GET /api/session/:id)                      │
│  + intent_slug, stage info                                   │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ ReviewPage                                                    │
│  - Passes intentSlug + stageName to sidebar                   │
│  - Manages InlineComments + AnnotationCanvas state (unchanged)│
└──────────────┬───────────────────────────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌────────────┐  ┌──────────────────────────────────────┐
│ Main Tabs  │  │ ReviewSidebar                         │
│ (unchanged)│  │  ┌──────────────────────────────────┐ │
│            │  │  │ useFeedback(intent, stage)        │ │
│            │  │  │   → GET /api/feedback/{i}/{s}     │ │
│            │  │  │   → FeedbackItemData[]            │ │
│            │  │  └──────────────────────────────────┘ │
│            │  │                                        │
│            │  │  AgentFeedbackToggle (showAgent state) │
│            │  │    → filters FeedbackList population    │
│            │  │  Unified Comments list → FeedbackList   │
│            │  │    (user-origin + agent-origin when ON) │
│            │  │    + in-progress drafts (same list)     │
│            │  │                                        │
│            │  │  On "Request Changes":                 │
│            │  │    for each comment:                   │
│            │  │      POST /api/feedback/{i}/{s}        │
│            │  │    then:                               │
│            │  │      submitDecision(...)               │
│            │  └──────────────────────────────────────┘ │
└────────────┘  └──────────────────────────────────────┘
```

---

## 9. File Inventory (New + Modified)

Canonical component names — PascalCase, full words (no abbreviations), following the existing review-app pattern language (`ReviewSidebar`, `StatusBadge`, `AnnotationCanvas`, `InlineComments`). Cross-reference: `component-inventory.md` in `stages/design/artifacts/` for per-component rationale.

| File | Action | Description |
|---|---|---|
| `review-app/src/components/FeedbackStatusBadge.tsx` | **New** | Status badge with feedback-specific colors |
| `review-app/src/components/FeedbackOriginIcon.tsx` | **New** | Origin icon/label component |
| `review-app/src/components/FeedbackItem.tsx` | **New** | Single feedback item (compact + expanded) |
| `review-app/src/components/FeedbackList.tsx` | **New** | Unified Comments list — user-origin items always, agent-origin items when `showAgent` is true, grouped by visit, filtered by status pill |
| `review-app/src/components/FeedbackSummaryBar.tsx` | **New** | Aggregate status count strip |
| `review-app/src/components/AgentFeedbackToggle.tsx` | **New** | `role="switch"` toggle that reveals agent-origin items inline in the unified Comments list (replaces `SidebarSegmentedControl`) |
| `review-app/src/components/FeedbackSheet.tsx` | **New** | Full-screen sheet overlay (mobile-only render; responsive behavior baked in — no `Mobile` prefix needed) |
| `review-app/src/components/FeedbackFloatingButton.tsx` | **New** | Floating action button that opens `FeedbackSheet` on mobile (full word replaces earlier `FAB` abbreviation) |
| `review-app/src/components/ReviewSidebar.tsx` | **Modify** | Render unified Comments list + AgentFeedbackToggle + status filter pills, handle feedback fetching, per-item submission |
| `review-app/src/components/ReviewPage.tsx` | **Modify** | Pass intentSlug + stageName to sidebar |
| `review-app/src/hooks/useSession.ts` | **Modify** | Add `useFeedback` hook and CRUD helpers |
| `review-app/src/types.ts` | **Modify** | Add `FeedbackItemData` type |
| `review-app/src/index.css` | **Modify** | Add feedback status styles and `FeedbackFloatingButton` pulse animation (with `prefers-reduced-motion` guard) |

**Dropped from inventory** (component retired — see `component-inventory.md`):

| Former name | Replaced by | Reason |
|---|---|---|
| `SidebarSegmentedControl` | `AgentFeedbackToggle` + unified Comments list | H·AI·K·U has no user identity; an identity-based split is undefined. Unit-05 rationale. |
| `MobileFeedbackSheet` | `FeedbackSheet` | `Mobile` prefix redundant — the sheet only ever renders on mobile breakpoints. Matches review-app convention (e.g. `ReviewSidebar`, not `DesktopReviewSidebar`). |
| `FeedbackFAB` | `FeedbackFloatingButton` | `FAB` is an abbreviation; existing review-app uses full words (`AnnotationCanvas`, `InlineComments`). |

---

## 10. Open Questions for Development

1. **Session data enrichment.** The `SessionData` type currently does not include `intent_slug` as a guaranteed field for review sessions (it is optional). The sidebar needs it for CRUD API calls. Confirm that `session.intent_slug` is always populated for review sessions, or add a fallback derivation from `session.intent?.slug`.

2. **Stage name derivation.** The current session data does not expose which stage the review gate belongs to. The sidebar needs `stageName` for CRUD API calls. Options: (a) add `stage` to `SessionData` from the server, (b) derive it from `session.stage_states` by finding the stage in `gate` phase, or (c) pass it from the orchestrator when opening the review session.

3. **Optimistic vs. confirmed status updates.** When the user clicks "Close" on a feedback item, should the UI optimistically update the badge and revert on API error, or wait for the API response? Recommendation: optimistic with revert, matching modern SPA patterns.

4. **Mobile breakpoint priority.** The `FeedbackFloatingButton` + `FeedbackSheet` is a net-new capability (mobile users currently cannot review at all). Confirm whether this is in-scope for v1 or a fast-follow.
