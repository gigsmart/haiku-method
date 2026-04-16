# Unit 08: Review Server and UI Implementation

## HTTP Endpoints Added (packages/haiku/src/http.ts)

- `GET /api/feedback/:intent/:stage` - List feedback with optional `?status=` filter
- `POST /api/feedback/:intent/:stage` - Create feedback (origin: user-visual, author: user)
- `PUT /api/feedback/:intent/:stage/:id` - Update status/addressed_by
- `DELETE /api/feedback/:intent/:stage/:id` - Delete (409 for pending)
- `GET /api/review/current` - Active intent state (stages, units, feedback summary)
- `GET /review/current` - Always-available review pane SPA route

## Review App Components (packages/haiku/review-app/src/)

- `FeedbackPanel.tsx` - Sidebar panel: Feedback/Mine toggle, status filter pills, feedback cards with status+origin badges, expand/collapse, action buttons (Close, Reject, Reopen, Delete)
- `StageProgressStrip.tsx` - Horizontal pipeline: completed=filled dot, current=diamond, future=hollow
- `ReviewContextHeader.tsx` - Context label with review type and gate type badge
- `ReviewCurrentPage.tsx` - Read-only overview page for always-available review pane
- `useFeedback.ts` - Hook: fetch, create, update, delete feedback via HTTP endpoints

## Integration Changes

- `ReviewPage.tsx` - Added StageProgressStrip and ReviewContextHeader at top, tabbed sidebar (Comments/Feedback)
- `ReviewSidebar.tsx` - Added `embedded` prop for rendering inside parent wrapper
- `App.tsx` - Added `/review/current` route and ReviewCurrentLoader
- `types.ts` - Added FeedbackItemData, FeedbackListResponse, ReviewCurrentResponse types
- `state-tools.ts` - Extended `haiku_review` with `open_pane` option

## Tests (packages/haiku/test/http-feedback.test.mjs)

21 tests covering all CRUD operations:
- GET: list all, filter by status, empty results, 404s
- POST: create with 201, validation errors (400), defaults
- PUT: update status, addressed_by, human can close, 400/404 errors
- DELETE: 409 for pending, 200 for non-pending, 404s
- Review current: returns active intent state with units and stages
