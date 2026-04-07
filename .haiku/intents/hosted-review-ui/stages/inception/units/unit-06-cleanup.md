---
title: "Cleanup and Integration Verification"
type: backend
depends_on: [unit-05-remove-bundled-react]
status: pending
---

# Cleanup and Integration Verification

## Description

Remove unused dependencies, clean up residual references, and verify the full end-to-end integration works correctly across all three session types.

### Dependency Cleanup

In `packages/haiku/package.json`:
- Verify no review-app-specific dependencies remain (react, react-dom, vite, @vitejs/plugin-react should NOT be in this package.json — they were in review-app's own package.json, but confirm nothing leaked)
- Check if `@tailwindcss/typography` and `tailwindcss` in devDependencies are still needed for `scripts/build-css.mjs` or can be removed
- Remove any orphaned type packages (`@types/react`, `@types/react-dom`) if they exist in this package

In `packages/haiku/review-app/` (already deleted in unit-05, but verify):
- Confirm no leftover `node_modules/` symlinks or `.tsbuildinfo` files

### Residual Reference Cleanup

- Search entire `packages/haiku/` for any remaining references to the old review app patterns:
  - `review-app` (directory references)
  - `serveSpa` (function references)
  - `REVIEW_APP_HTML` (constant references)
  - `http://127.0.0.1` in user-facing URLs (should all be `https://local.haikumethod.ai` or `https://haikumethod.ai` now)
- Update any documentation strings, comments, or error messages that reference the old architecture

### End-to-End Integration Verification

Verify the complete flow for each session type:

1. **Review session**: MCP `open_review` tool creates session, opens `https://haikumethod.ai/review/{encoded}/`, website loads, fetches session data from `https://local.haikumethod.ai:{port}/api/session/{id}`, renders review UI, user approves/requests changes, MCP tool unblocks with decision.

2. **Question session**: MCP `ask_user_visual_question` tool creates session, opens website URL, website renders question form with images, user answers, MCP tool unblocks with answers.

3. **Design direction session**: MCP `pick_design_direction` tool creates session, opens website URL, website renders archetype picker with parameter sliders, user selects.

4. **WebSocket**: Verify `wss://` connections work for real-time session updates.

5. **Mockups/wireframes**: Verify that mockup images and wireframe files served by the local HTTPS server display correctly in the website review UI (cross-origin image/asset loading).

## Completion Criteria

- [ ] `grep -r "review-app\|serveSpa\|REVIEW_APP_HTML" packages/haiku/src/` returns no matches — verified by running the grep command
- [ ] `grep -r "http://127.0.0.1" packages/haiku/src/ | grep -v "listen\|createServer\|console\|test"` returns no matches for user-facing URLs — verified by running the grep command
- [ ] `cd packages/haiku && npm run build` succeeds — verified by running the build
- [ ] `cd packages/haiku && npm run typecheck` passes — verified by running typecheck
- [ ] `cd website && npm run build` succeeds with the review route — verified by running the build
- [ ] Full end-to-end flow works: MCP tool opens browser, website loads review, user submits decision, MCP tool receives result — verified by manual test with all three session types (review, question, design_direction)
