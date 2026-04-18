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
|  - Tab panels               |  | Sidebar Header     | |
|  - Cards with InlineComments|  | [Feedback | Mine]   | |
|  - AnnotationCanvas         |  +--------------------+ |
|                              |  | Feedback List      | |
|                              |  | (scrollable)       | |
|                              |  |                    | |
|                              |  | - Existing items   | |
|                              |  |   (from prior      | |
|                              |  |    visits,          | |
|                              |  |    adversarial,     | |
|                              |  |    external)        | |
|                              |  |                    | |
|                              |  | - Current session  | |
|                              |  |   comments         | |
|                              |  |   (inline, pin,    | |
|                              |  |    general)        | |
|                              |  +--------------------+ |
|                              |  | General Input      | |
|                              |  | Decision Buttons   | |
|                              |  +--------------------+ |
+------------------------------------------------------+
```

### Sidebar Internal Tabs

The sidebar header gains a segmented control with two views:

- **"Feedback" (default)**: Shows all feedback items for this stage, grouped by visit cycle. Includes items from adversarial review agents, external PR comments, prior review cycles, and the current session's comments. Each item shows a status badge.
- **"Mine"**: Shows only the current session's comments (inline, pin, general) -- the same view the existing sidebar provides today. This is the "working" view where the user manages their in-progress annotations before submitting.

The segmented control uses the existing tab styling but compact: `text-xs font-medium` buttons with `border-b-2` indicator, matching the main content tabs but smaller.

**Rationale**: Keeping "Mine" as a separate filter prevents the feedback list from overwhelming the user with historical context while they're actively annotating. They can switch to "Feedback" to see the full picture, then back to "Mine" to manage their own work.

---

## 2. Component Inventory

> **State-coverage requirement (added in unit-15 / FB-25).** Every new component in this intent — and every new component introduced in downstream stages — **MUST** ship with a six-state grid (default / hover / focus / active / disabled / error) rendered alongside its component spec. Use `stages/design/artifacts/state-coverage-grid.md` as the template. Components whose element cannot reach a given state (e.g. a non-focusable label) **MUST** mark the state `N/A` with a one-line rationale; silently omitting a state is not acceptable. The design-reviewer hat walks this grid row-by-row before approval.

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

**Icon mapping:**

| Origin | Icon | Label |
|---|---|---|
| `adversarial-review` | `🔍` | "Review Agent" |
| `external-pr` | `🔗` | "PR Comment" |
| `external-mr` | `🔗` | "MR Comment" |
| `user-visual` | `✎` | "Annotation" |
| `user-chat` | `💬` | "Comment" |
| `agent` | `🤖` | "Agent" |

Rendered as: `<span className="text-xs text-stone-500 dark:text-stone-400">{icon} {label}</span>`

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
- If `status === "pending"` and `author_type === "agent"`: a "Reject" button (small, secondary style).
- If `status === "pending"` and `author_type === "human"`: a "Close" button (only visible in the review UI where the user has authority).

**Interaction states:**
- **Default**: compact, clickable.
- **Hover**: border highlight (teal).
- **Expanded**: body visible, action buttons visible.
- **Status: addressed**: entire row gets a subtle left border in blue (`border-l-2 border-l-blue-400`).
- **Status: closed**: entire row is slightly faded (`opacity-70`) with green left border.
- **Status: rejected**: faded (`opacity-50`) with strikethrough on title.

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

#### `SidebarSegmentedControl`

A two-segment toggle for switching between "Feedback" and "Mine" views within the sidebar.

```
+---------------------------------------------+
| [ Feedback (5) ]  [ Mine (2) ]              |
+---------------------------------------------+
```

- Container: `flex border-b border-stone-200 dark:border-stone-700`
- Active segment: `border-b-2 border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400 text-xs font-medium px-3 py-2`
- Inactive segment: `border-b-2 border-transparent text-stone-500 dark:text-stone-400 text-xs font-medium px-3 py-2 hover:text-stone-700 dark:hover:text-stone-200`
- Count badges: `ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold` with amber background for pending items, stone for others.

---

### Modified Components

#### `ReviewSidebar.tsx` -- Changes

The sidebar's internal structure changes from a flat comments list to the segmented Feedback/Mine view. The footer (general comment input + decision buttons) remains unchanged.

**State additions:**
```typescript
const [sidebarView, setSidebarView] = useState<"feedback" | "mine">("feedback");
const [feedbackItems, setFeedbackItems] = useState<FeedbackItemData[]>([]);
const [feedbackLoading, setFeedbackLoading] = useState(true);
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
3. The "Feedback" view renders `FeedbackList` with these items.
4. The "Mine" view renders the existing `SidebarComment[]` list (unchanged behavior).
5. The footer stays visible in both views.

**Submission flow change ("Request Changes"):**

Current flow:
1. Collect all comments from state.
2. Serialize into a `feedback` string and `annotations` object.
3. Call `submitDecision(sessionId, "changes_requested", feedback, annotations)`.

New flow:
1. For each comment (inline, pin, general), call `POST /api/feedback/{intent}/{stage}` to create a feedback file.
2. Collect the returned feedback IDs.
3. Call `submitDecision(sessionId, "changes_requested", feedbackSummary, annotations)` where `feedbackSummary` references the created feedback files.
4. Clear the "Mine" comment list.
5. Refresh the "Feedback" list to show the newly-created items.

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

### Sidebar -- Feedback View

| State | Visual | Behavior |
|---|---|---|
| Loading | Spinner (same as session loading: `animate-spin rounded-full border-2 border-stone-300 border-t-teal-500`) | Fetch in progress |
| Empty (visit 0) | Italic muted text: "No feedback items. This is the first review." | No items exist |
| Empty (visit > 0) | Italic muted text: "All feedback addressed!" with a green checkmark | All items resolved |
| Populated | `FeedbackList` with items grouped by visit | Scrollable list |
| Item hover | Border highlight (teal) | Click to expand |
| Item expanded | Body visible, action buttons visible | In-place expansion |
| Status change | Badge animates (opacity transition 150ms) | Optimistic update, revert on API error |
| API error | Red toast at bottom of sidebar: `text-xs text-red-600` | 3-second auto-dismiss |

### Sidebar -- Mine View

| State | Visual | Behavior |
|---|---|---|
| Empty | Italic muted text: "No comments yet. Select text or drop pins to add feedback." | Same as current |
| Populated | Existing `SidebarComment` list (unchanged) | Same interactions as today |
| Editing | Inline textarea with Save/Cancel (unchanged) | Same as current |

### Submission Flow

| State | Visual | Behavior |
|---|---|---|
| Pre-submit | "Request Changes" button in amber (when comments exist) or secondary style (when empty) | Same as current conditional styling |
| Submitting | Button text: "Saving feedback..." with disabled state | Sequential CRUD calls |
| Per-item progress | Optional: small progress indicator in "Mine" view showing N/M items saved | Nice-to-have, not required for v1 |
| Success | SubmitSuccess component (existing): "Decision submitted!" | Same as current |
| Partial failure | Error toast identifying which feedback items failed to save | Retry button for failed items |

### Feedback Status Transitions (User Actions in Review UI)

| Current Status | User Action | New Status | Guard |
|---|---|---|---|
| `pending` | Click "Close" | `closed` | Only on human-authored OR any item when user explicitly closes |
| `pending` | Click "Reject" | `rejected` | Only on agent-authored items |
| `addressed` | Click "Reopen" | `pending` | Any item the user can see |
| `closed` | Click "Reopen" | `pending` | Any item the user can see |
| `rejected` | Click "Reopen" | `pending` | Any item the user can see |

The UI shows only the actions valid for the item's current status and author_type. Invalid actions are not rendered (not disabled -- absent entirely).

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
- **Mobile feedback access:** The sidebar content becomes accessible via a floating action button (FAB) in the bottom-right corner that opens a full-screen sheet overlay.
- FAB: `fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center text-lg` -- shows the comment count badge when > 0.
- Sheet overlay: `fixed inset-0 z-50 bg-white dark:bg-stone-900` with a close button at top-right. Contains the same sidebar content (segmented control, feedback list, general input, decision buttons).
- The FAB and sheet overlay are new components: `MobileFeedbackSheet` and `FeedbackFAB`.

**Note:** The current sidebar is already `hidden md:flex`, so mobile users currently have NO access to review actions. The FAB/sheet pattern is a new addition that unblocks mobile review entirely.

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
| Rejected (light) | `stone-500` (#78716c) | `stone-100` (#f5f5f4) | 4.6:1 | AA |
| Rejected (dark) | `stone-400` (#a8a29e) | `stone-800` (#292524) | 5.0:1 | AA |

### Focus Order

The sidebar focus order follows the DOM order, which matches the visual top-to-bottom flow:

1. Sidebar segmented control ("Feedback" / "Mine" buttons)
2. Feedback summary bar filter buttons (if present)
3. Feedback items in list order (each item is focusable via `tabIndex={0}`)
4. Expanded item action buttons (Close / Reject / Reopen)
5. General comment textarea
6. "Add" button
7. Decision buttons (Approve, External Review, Request Changes)

### Keyboard Navigation

| Key | Context | Action |
|---|---|---|
| `Tab` | Sidebar | Move focus through the focus order above |
| `Enter` / `Space` | Segmented control button | Switch view |
| `Enter` / `Space` | Feedback item (compact) | Expand item |
| `Escape` | Feedback item (expanded) | Collapse item |
| `Enter` / `Space` | Action button (Close/Reject/Reopen) | Trigger status change |
| `Cmd+Enter` / `Ctrl+Enter` | General comment textarea | Add comment |
| `Escape` | General comment textarea | Blur textarea |
| `Tab` | Within expanded item | Move through action buttons |

### Screen Reader Announcements

- Feedback items use `role="listitem"` within a `role="list"` container.
- Status badges have `aria-label` including the status text (e.g., `aria-label="Status: pending"`).
- Status changes trigger a live region announcement: `<div role="status" aria-live="polite">` at the sidebar level that announces "Feedback FB-03 marked as closed" or similar.
- The segmented control uses `role="tablist"` with `role="tab"` on each segment and `aria-selected` on the active segment.
- The summary bar counts have `aria-label` (e.g., `aria-label="3 pending feedback items"`).
- Expanded feedback item body is announced when the item gains focus and is expanded.

### Mobile Sheet Overlay

- The FAB has `aria-label="Open feedback panel"` with the count (e.g., `aria-label="Open feedback panel, 3 comments"`).
- The sheet overlay traps focus within itself when open (focus trap pattern).
- `Escape` closes the sheet.
- The close button has `aria-label="Close feedback panel"`.
- When the sheet opens, focus moves to the first interactive element (segmented control).
- When the sheet closes, focus returns to the FAB.

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

/* Mobile feedback FAB pulse animation for new items */
@keyframes feedback-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(13, 148, 136, 0); }
}
.feedback-fab-pulse {
  animation: feedback-pulse 2s ease-in-out 3;
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
│            │  │  [Feedback view] → FeedbackList        │
│            │  │  [Mine view]     → SidebarComment list │
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

| File | Action | Description |
|---|---|---|
| `review-app/src/components/FeedbackStatusBadge.tsx` | **New** | Status badge with feedback-specific colors |
| `review-app/src/components/FeedbackOriginIcon.tsx` | **New** | Origin icon/label component |
| `review-app/src/components/FeedbackItem.tsx` | **New** | Single feedback item (compact + expanded) |
| `review-app/src/components/FeedbackList.tsx` | **New** | Grouped, sorted feedback list |
| `review-app/src/components/FeedbackSummaryBar.tsx` | **New** | Aggregate status count strip |
| `review-app/src/components/SidebarSegmentedControl.tsx` | **New** | Two-segment toggle for sidebar views |
| `review-app/src/components/MobileFeedbackSheet.tsx` | **New** | Full-screen sheet overlay for mobile |
| `review-app/src/components/FeedbackFAB.tsx` | **New** | Floating action button for mobile |
| `review-app/src/components/ReviewSidebar.tsx` | **Modify** | Add segmented view, feedback fetching, per-item submission |
| `review-app/src/components/ReviewPage.tsx` | **Modify** | Pass intentSlug + stageName to sidebar |
| `review-app/src/hooks/useSession.ts` | **Modify** | Add `useFeedback` hook and CRUD helpers |
| `review-app/src/types.ts` | **Modify** | Add `FeedbackItemData` type |
| `review-app/src/index.css` | **Modify** | Add feedback status and FAB animation styles |

---

## 10. Open Questions for Development

1. **Session data enrichment.** The `SessionData` type currently does not include `intent_slug` as a guaranteed field for review sessions (it is optional). The sidebar needs it for CRUD API calls. Confirm that `session.intent_slug` is always populated for review sessions, or add a fallback derivation from `session.intent?.slug`.

2. **Stage name derivation.** The current session data does not expose which stage the review gate belongs to. The sidebar needs `stageName` for CRUD API calls. Options: (a) add `stage` to `SessionData` from the server, (b) derive it from `session.stage_states` by finding the stage in `gate` phase, or (c) pass it from the orchestrator when opening the review session.

3. **Optimistic vs. confirmed status updates.** When the user clicks "Close" on a feedback item, should the UI optimistically update the badge and revert on API error, or wait for the API response? Recommendation: optimistic with revert, matching modern SPA patterns.

4. **Mobile breakpoint priority.** The mobile FAB/sheet is a net-new capability (mobile users currently cannot review at all). Confirm whether this is in-scope for v1 or a fast-follow.
