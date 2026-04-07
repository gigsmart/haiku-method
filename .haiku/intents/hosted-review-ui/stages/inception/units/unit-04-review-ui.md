---
status: pending
type: frontend
depends_on: [unit-03-session-bridge]
---

# Review UI

## Scope
Port the review page components from `packages/haiku/review-app/` to the website. This includes: ReviewPage (tabs, criteria checklist, mermaid diagrams, stage states), DecisionForm (approve/changes requested + feedback), AnnotationCanvas (pin annotations on screenshots), InlineComments (comment on paragraphs), and CommentTray. Components must fetch session data from `https://local.haikumethod.ai:{port}/api/session/{id}` and submit decisions back via POST. WebSocket support for real-time sync.

## Completion Criteria
- `website/app/review/[encoded]/page.tsx` renders full review UI with tabs
- Decision form submits to local API and MCP tool receives the decision
- Inline comments and annotation pins work and are included in feedback
- Mermaid diagrams render correctly
- End-to-end flow works: MCP calls open_review → browser opens website → user reviews → decision returns to MCP
