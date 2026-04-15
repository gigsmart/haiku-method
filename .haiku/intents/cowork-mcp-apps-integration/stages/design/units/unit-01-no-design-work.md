---
title: 'No design work — backend transport swap, existing UI reused verbatim'
type: cleanup
model: haiku
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
---

# No design work — backend transport swap

## Scope

This intent is a backend transport swap: replace the HTTP server + tunnel + browser-launch flow with an MCP Apps `ui://` resource delivery path when the connected MCP host advertises the MCP Apps capability. The existing review SPA at `packages/haiku/review-app/` is reused **verbatim** — same React tree, same styles, same components, same screens, same tokens.

The design stage is included in every `software`-studio intent by template. For backend-only intents like this one, the honest output is: *"no new UI; the existing UI is preserved."* This unit records that decision in the FSM-tracked unit format so the design stage can advance through review and gate without spawning speculative wireframes.

### In scope

- Confirm the design brief at `stages/design/DESIGN-BRIEF.md` records "no new UI" for every affected surface.
- Confirm the design tokens at `knowledge/DESIGN-TOKENS.md` records "no new tokens".
- Cross-reference these files from this unit's `inputs:`.
- Verify the review SPA component tree (`packages/haiku/review-app/src/components/*`) is **not** touched by any `cowork-mcp-apps-integration`-scoped change in unit-04 (the SPA host bridge unit) — the bridge module is a new file, not an edit to existing components.

### Out of scope

- Anything that would introduce a new screen, component, token, or interaction state.
- Any change to existing review SPA visual / interaction behavior.
- Any wireframe generation — there is nothing new to wireframe.

## Completion Criteria

1. **Design brief exists and declares no UI changes.** `test -f .haiku/intents/cowork-mcp-apps-integration/stages/design/DESIGN-BRIEF.md && grep -q "No new user-facing UI" .haiku/intents/cowork-mcp-apps-integration/stages/design/DESIGN-BRIEF.md`.
2. **Design tokens artifact exists and declares no new tokens.** `test -f .haiku/intents/cowork-mcp-apps-integration/knowledge/DESIGN-TOKENS.md && grep -q "No new tokens" .haiku/intents/cowork-mcp-apps-integration/knowledge/DESIGN-TOKENS.md`.
3. **No new SPA components.** `git diff main -- packages/haiku/review-app/src/components/ | grep -E "^\+\+\+ b/" | grep -v "^\+\+\+ /dev/null"` returns zero **new** files (the bridge is at `src/host-bridge.ts`, not `src/components/`).
4. **Review SPA visual snapshot unchanged.** Re-running the review-app build produces a `REVIEW_APP_HTML` whose visible text content matches `main` byte-for-byte (the bridge swap is invisible to the rendered DOM). Verified by snapshot diff: `node scripts/diff-review-html-text.mjs` exits 0. (If the script doesn't exist yet, this criterion is downgraded to manual visual inspection at PR review time — recorded in the PR description.)
5. **Design-reviewer hat acknowledges the no-op stage.** When the design-reviewer hat runs in the execute phase, it produces a one-paragraph confirmation note at `stages/design/artifacts/no-design-work-acknowledged.md` instead of a full design review. Verified by file existence.
