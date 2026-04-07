---
title: "Remove Bundled React App"
type: backend
depends_on: [unit-04-website-review-page]
status: pending
---

# Remove Bundled React App

## Description

Delete the bundled React review app and all associated build infrastructure now that the website handles all rendering.

### Deletions

1. **`packages/haiku/review-app/`** — entire directory (React 19 + Vite SPA source)
   - `src/` (App.tsx, components/, hooks/, types.ts, main.tsx, index.css)
   - `index.html`, `vite.config.ts`, `tsconfig.json`
   - `package.json`, `package-lock.json`, `node_modules/`
   - `dist/` (build output)

2. **`packages/haiku/scripts/build-review-app.mjs`** — build script that bundles Vite output into inlined HTML string

3. **`packages/haiku/src/review-app-html.ts`** — the `REVIEW_APP_HTML` constant (auto-generated ~237K token file)

### Modifications

4. **`packages/haiku/src/http.ts`**:
   - Remove `import { REVIEW_APP_HTML } from "./review-app-html.js"`
   - Remove `serveSpa()` function
   - Remove `handleReviewGet()`, `handleQuestionGet()`, `handleDirectionGet()` functions
   - Remove the route matches that call these functions
   - (These should already be removed in unit-02, but verify and clean up any remnants)

5. **`packages/haiku/package.json`**:
   - Remove `node scripts/build-review-app.mjs` from `prebuild` and `build` scripts
   - Keep `node scripts/build-css.mjs` (if still needed for other purposes)
   - Verify the build still produces a working `plugin/bin/haiku` binary

6. **`packages/haiku/src/server.ts`**:
   - Remove `import { renderReviewPage } from ...` (the HTML template rendering)
   - Remove `import { renderQuestionPage } from ...`
   - Remove `import { renderDesignDirectionPage } from ...`
   - Remove `session.html = render...()` calls (the `html` field on sessions is no longer needed)

7. **Session types** (`packages/haiku/src/sessions.ts`):
   - Remove `html: string` field from `ReviewSession`, `QuestionSession`, `DesignDirectionSession` interfaces
   - Update `createSession`, `createQuestionSession`, `createDesignDirectionSession` to not require `html` param

## Completion Criteria

- [ ] `packages/haiku/review-app/` directory does not exist — verified by `test ! -d packages/haiku/review-app && echo OK`
- [ ] `packages/haiku/scripts/build-review-app.mjs` does not exist — verified by `test ! -f packages/haiku/scripts/build-review-app.mjs && echo OK`
- [ ] `packages/haiku/src/review-app-html.ts` does not exist — verified by `test ! -f packages/haiku/src/review-app-html.ts && echo OK`
- [ ] `grep -r "REVIEW_APP_HTML\|review-app-html\|build-review-app\|renderReviewPage\|renderQuestionPage\|renderDesignDirectionPage" packages/haiku/src/` returns no matches
- [ ] `npm run build` in `packages/haiku/` succeeds and produces `plugin/bin/haiku` — verified by `cd packages/haiku && npm run build && test -x ../../plugin/bin/haiku && echo OK`
- [ ] `npm run typecheck` in `packages/haiku/` passes with no errors — verified by `cd packages/haiku && npm run typecheck`
