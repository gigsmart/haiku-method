# Proposal: Local Team Review System

**Status:** Draft / Placeholder  
**Author:** —  
**Date:** 2026-04-14

---

## Problem

Today, multi-person review requires routing through an external system (GitHub PR
or GitLab MR via the `external` gate type). This has friction:

- Requires a hosted forge that all reviewers have access to
- Couples the H·AI·K·U review flow to git-platform conventions
- Overkill when the goal is simply "let my teammates weigh in on this
  elaboration before we execute"

## Vision

A **Slack-first team review** flow where:

1. During elaboration (or at any gate), the system posts a review request to a
   Slack channel.
2. The message includes a direct link to the review-app session so teammates can
   read the intent, units, knowledge artifacts, and specs.
3. Multiple team members open the link on their own machine and submit
   independent decisions (approve / request changes / comment).
4. The system collects responses and advances the gate once the approval
   threshold is met — **no PR, no MR, no external forge required.**

This effectively makes the existing review-app the "PR viewer" and Slack the
notification bus.

---

## How It Maps to Existing Architecture

| Existing Piece | Role in Team Review |
|---|---|
| **Review-app** (`packages/haiku/review-app/`) | Already a web UI for reviewing intents/units. Needs to be network-accessible (not just localhost) and support multiple concurrent decision submissions per session. |
| **Comms provider** (`plugin/providers/comms.md`) | Already posts gate notifications to Slack and reads thread replies. Would post the review link + context summary. |
| **Slack schema** (`plugin/schemas/providers/slack.schema.json`) | Config for channel, workspace, thread behavior. Would gain team-review-specific fields. |
| **`ask` gate type** | Single-user local approval. Team review is the multi-user generalization of this. |
| **`await` gate type** | Waits for an external event signal. Team review borrows the "wait for N signals" pattern but sources them from the review-app instead of a thread reply. |
| **Session model** (`packages/haiku/review-app/src/types.ts`) | Currently stores one `decision` + `feedback` + `annotations`. Needs to store a list of reviewer decisions. |

---

## Key Design Questions

### 1. Network Accessibility

The review-app currently serves on `localhost`. For teammates to access it:

- **Option A: LAN access** — Bind to `0.0.0.0` + share local IP. Simple but
  requires same network.
- **Option B: Tunnel** — Use something like `cloudflared`, `ngrok`, or
  `tailscale funnel` to expose a stable URL. Best for remote teams.
- **Option C: Hosted relay** — A lightweight relay service that proxies review
  sessions. Most seamless but adds infrastructure.

> **Note:** The URL posted to Slack needs to be reachable by all reviewers.
> This is the single hardest problem in the design.

### 2. Approval Threshold

How many approvals are needed to advance?

```yaml
# Possible STAGE.md frontmatter
review: team
team-review:
  approvers: 2          # minimum approvals to advance
  timeout: 24h          # auto-escalate if not met
  timeout-action: ask   # fall back to single-user ask gate
```

Options:
- **Any N of M** — e.g., 2 approvals from anyone on the team
- **Named approvers** — specific people must approve (by Slack handle or alias)
- **Unanimous** — all invited reviewers must approve
- **Quorum** — majority of invited reviewers

### 3. Session Model Changes

Current `SessionData` has a single `decision` field. For team review:

```typescript
// New: per-reviewer decision record
interface ReviewerDecision {
  reviewer_id: string;       // Slack user ID or display name
  decision: "approved" | "changes_requested";
  feedback?: string;
  annotations?: ReviewAnnotations;
  submitted_at: string;
}

// SessionData gains:
interface SessionData {
  // ... existing fields ...
  team_review?: {
    required_approvals: number;
    decisions: ReviewerDecision[];
    threshold_met: boolean;
  };
}
```

### 4. Slack Integration Flow

```
Elaboration completes
  |
  v
Orchestrator enters gate with type "team"
  |
  v
Comms provider posts to Slack:
  +---------------------------------------------------------+
  | [H·AI·K·U] Review requested: "Add payment processing"  |
  |                                                         |
  | Stage: design · 3 units · 2 approvals needed            |
  | Review: https://tunnel.example/review/abc123            |
  |                                                         |
  | React with :white_check_mark: or open the link to       |
  | leave detailed feedback.                                |
  +---------------------------------------------------------+
  |
  v
Teammates click link → review-app opens with full session
  |
  v
Each reviewer submits their decision independently
  |
  v
Orchestrator polls / gets webhook when threshold met → advances gate
```

### 5. Feedback Aggregation

When multiple reviewers submit feedback:
- All `changes_requested` feedback is concatenated with reviewer attribution
- The agent sees a combined review like a PR with multiple review comments
- Annotations (pins, inline comments) are merged with reviewer labels
- If threshold is met but some reviewers requested changes, surface the
  feedback but still advance (configurable: strict vs. advisory)

### 6. Relationship to External Review

Team review doesn't replace `external` — it's a lighter-weight alternative:

| Scenario | Gate Type |
|---|---|
| Solo work, quick check | `ask` (single user) |
| Team wants to weigh in, no PR needed | `team` (this proposal) |
| Formal code review with merge required | `external` (PR/MR) |
| Compliance sign-off from named authority | `[team, await]` (composite) |

A stage could also use `[team, external]` to require both team approval via
the review-app AND a merged PR.

---

## Open Questions / Notes

<!-- Add your notes here -->

- Should the review-app support anonymous/unauthenticated reviewers, or require
  Slack OAuth to tie decisions to identities?
- Could Slack emoji reactions (thumbsup / thumbsdown) serve as lightweight
  approvals without opening the full review-app?
- How does this interact with `gate-protocol.timeout` — if the team doesn't
  respond, does it escalate to `ask` (single user proceeds) or block?
- Should the Slack message update in real-time as approvals come in
  (e.g., "1/2 approvals received")?
- Could this work with other comms providers (Discord, Teams) using the same
  pattern?
- What's the minimum viable version? Possibly: just post the review-app link to
  Slack + add a way to collect >1 decision per session. No threshold logic
  initially — host manually advances when satisfied.

---

## Implementation Phases (Rough)

### Phase 1: Multi-Decision Sessions
- Extend `SessionData` to accept multiple reviewer decisions
- Review-app UI shows who has already reviewed
- Host can see all feedback and manually advance

### Phase 2: Slack Notification
- Comms provider posts review link to configured channel on `team` gate
- Include intent summary, unit count, stage context in the message

### Phase 3: Threshold & Auto-Advance
- `team-review` config in STAGE.md frontmatter
- Orchestrator auto-advances when approval count meets threshold
- Timeout / escalation behavior

### Phase 4: Network Accessibility
- Built-in tunnel support or hosted relay
- Stable, shareable URLs for review sessions

---

## References

- Current gate logic: `packages/haiku/src/orchestrator.ts` (lines 1355-1419)
- Review-app session model: `packages/haiku/review-app/src/types.ts`
- Review UI decision panel: `packages/haiku/review-app/src/components/ReviewSidebar.tsx`
- Comms provider: `plugin/providers/comms.md`
- Slack config schema: `plugin/schemas/providers/slack.schema.json`
- Gate protocol (timeout): `plugin/studios/sales/stages/proposal/STAGE.md`
