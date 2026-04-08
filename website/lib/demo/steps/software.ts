import type { DemoConfig } from "../types"

const P = ".haiku/intents/add-oauth-login"

export const config: DemoConfig = {
  title: "software",
  studio: "software",
  stages: ["inception", "design", "product", "development", "operations", "security"],
  completionText: "All 6 stages passed. add-oauth-login delivered.",
  steps: [
    // Step 1: User invokes /haiku:new
    { delay: 800, actions: [{ type: "msg", role: "user", label: "you", text: "/haiku:new" }] },
    { delay: 1200, actions: [{ type: "typing" }] },
    { delay: 1000, actions: [{ type: "removeTyping" }, { type: "msg", role: "agent", label: "agent", text: "What do you want to accomplish?" }] },
    { delay: 1500, actions: [{ type: "msg", role: "user", label: "you", text: "Add OAuth login to the app" }] },

    // Step 2: Intent created
    { delay: 800, actions: [{ type: "typing" }] },
    { delay: 1200, actions: [{ type: "removeTyping" }, { type: "msg", role: "agent", label: "agent", text: "Creating intent: add-oauth-login..." }, { type: "file", path: `${P}/intent.md` }] },
    { delay: 800, actions: [{ type: "msg", role: "system", label: "system", text: "Intent created. Studio: software. 6 stages: inception \u2192 design \u2192 product \u2192 development \u2192 operations \u2192 security" }] },

    // Step 3: Inception - elaborate (collaborative)
    { delay: 1000, actions: [{ type: "activateStage", stage: "inception" }, { type: "msg", role: "agent", label: "agent", text: "Entering inception stage. Hat: elaborator." }, { type: "file", path: `${P}/stages/inception/state.json` }] },
    { delay: 1200, actions: [{ type: "msg", role: "agent", label: "agent", text: "What OAuth providers do you need to support?" }] },
    { delay: 2000, actions: [{ type: "msg", role: "user", label: "you", text: "Google and GitHub. Maybe Apple later." }] },
    { delay: 800, actions: [{ type: "typing" }] },
    { delay: 1200, actions: [{ type: "removeTyping" }, { type: "msg", role: "agent", label: "agent", text: "I\u2019ll set up the provider abstraction to make adding Apple easy. Here\u2019s the breakdown:" }] },
    { delay: 1000, actions: [{ type: "msg", role: "agent", label: "agent", text: "3 units: OAuth provider setup, callback handler, session management" }, { type: "file", path: `${P}/stages/inception/units/unit-01-oauth-provider-setup.md` }, { type: "file", path: `${P}/stages/inception/units/unit-02-callback-handler.md` }, { type: "file", path: `${P}/stages/inception/units/unit-03-session-management.md` }, { type: "card", stage: "inception", name: "oauth-provider-setup", status: "in-progress" }, { type: "card", stage: "inception", name: "callback-handler", status: "" }, { type: "card", stage: "inception", name: "session-management", status: "" }] },
    { delay: 2200, actions: [{ type: "msg", role: "user", label: "you", text: "Split the callback into its own unit \u2014 it has complex error handling" }] },
    { delay: 800, actions: [{ type: "typing" }] },
    { delay: 1000, actions: [{ type: "removeTyping" }, { type: "msg", role: "agent", label: "agent", text: "Good call. Updated to 4 units." }, { type: "file", path: `${P}/stages/inception/units/unit-04-callback-error-handling.md` }, { type: "card", stage: "inception", name: "callback-errors", status: "" }] },

    // Step 4: Inception - execute
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Hat: architect. Starting OAuth provider setup \u2014 mapping provider abstraction layer..." }] },
    { delay: 600, actions: [{ type: "fastForward", seconds: "30" }] },
    { delay: 2000, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Provider setup complete. Abstraction layer supports Google and GitHub with a clean interface for adding Apple later." }, { type: "file", path: `${P}/knowledge/DISCOVERY.md` }, { type: "updateCard", stage: "inception", name: "oauth-provider-setup", status: "completed" }, { type: "updateCard", stage: "inception", name: "callback-handler", status: "in-progress" }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "25" }] },
    { delay: 1500, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Callback handler analysis done. Google uses server-side code exchange, GitHub\u2019s token endpoint differs. Both mapped." }, { type: "updateCard", stage: "inception", name: "callback-handler", status: "completed" }, { type: "updateCard", stage: "inception", name: "session-management", status: "in-progress" }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "20" }] },
    { delay: 1200, actions: [{ type: "removeFastForward" }, { type: "updateCard", stage: "inception", name: "session-management", status: "completed" }, { type: "updateCard", stage: "inception", name: "callback-errors", status: "in-progress" }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "20" }] },
    { delay: 1200, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "All 4 units complete. Callback error handling confirmed your instinct \u2014 the two providers need separate error paths due to different failure modes." }, { type: "updateCard", stage: "inception", name: "callback-errors", status: "completed" }] },

    // Step 5: Inception gate - auto
    { delay: 1000, actions: [{ type: "msg", role: "system", label: "system", text: "Inception complete. Review gate: auto. All criteria met \u2014 advancing." }, { type: "msg", role: "agent", label: "agent", text: "Advancing to design stage." }] },

    // Step 6: Design - elaborate
    { delay: 1000, actions: [{ type: "activateStage", stage: "design" }, { type: "msg", role: "agent", label: "agent", text: "Entering design stage. Hat: designer.\nElaborating design work..." }, { type: "file", path: `${P}/stages/design/state.json` }] },
    { delay: 800, actions: [{ type: "file", path: `${P}/stages/design/units/unit-01-login-screen.md` }, { type: "file", path: `${P}/stages/design/units/unit-02-oauth-flow.md` }, { type: "card", stage: "design", name: "login-screen", status: "in-progress" }, { type: "card", stage: "design", name: "oauth-flow", status: "" }, { type: "msg", role: "agent", label: "agent", text: "2 units: login-screen and oauth-flow." }] },

    // Step 7: Design - execute (collaborative)
    { delay: 1200, actions: [{ type: "msg", role: "agent", label: "agent", text: "For the login screen \u2014 modal overlay or full page?" }] },
    { delay: 2200, actions: [{ type: "msg", role: "user", label: "you", text: "Full page with the app logo. Social buttons prominent." }] },
    { delay: 800, actions: [{ type: "typing" }] },
    { delay: 1200, actions: [{ type: "removeTyping" }, { type: "msg", role: "agent", label: "agent", text: "Opening visual review..." }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "45" }] },
    { delay: 2000, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Wireframe ready. Presenting for review." }, { type: "showDesignReview", title: "Design", intent: "add-oauth-login" }] },
    { delay: 2500, actions: [{ type: "hideReview" }, { type: "msg", role: "user", label: "you", text: "Add a 'forgot password' link below the form" }] },
    { delay: 800, actions: [{ type: "typing" }] },
    { delay: 1000, actions: [{ type: "removeTyping" }, { type: "msg", role: "agent", label: "agent", text: "Added. Design brief updated." }, { type: "updateCard", stage: "design", name: "login-screen", status: "completed" }, { type: "updateCard", stage: "design", name: "oauth-flow", status: "in-progress" }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "30" }] },
    { delay: 1500, actions: [{ type: "removeFastForward" }, { type: "updateCard", stage: "design", name: "oauth-flow", status: "completed" }, { type: "file", path: `${P}/stages/design/DESIGN-BRIEF.md` }, { type: "file", path: `${P}/knowledge/DESIGN-TOKENS.md` }, { type: "file", path: `${P}/stages/design/artifacts/login-screen-desktop.png` }, { type: "file", path: `${P}/stages/design/artifacts/login-screen-mobile.png` }, { type: "file", path: `${P}/stages/design/artifacts/oauth-flow.png` }, { type: "msg", role: "agent", label: "agent", text: "Design brief and hi-fi mockups written to intent spec. Tokens extracted to knowledge. Desktop and mobile login screens plus OAuth flow diagram committed as design artifacts. All breakpoints, interactive states, accessible color contrast verified." }] },

    // Step 8: Design gate - ask (visual review)
    { delay: 1000, actions: [{ type: "msg", role: "system", label: "system", text: "Design stage complete. Review gate: ask." }, { type: "msg", role: "agent", label: "agent", text: "Opening visual review for stage approval..." }] },
    { delay: 800, actions: [{ type: "showDesignReview", title: "Design", intent: "add-oauth-login" }] },
    { delay: 2000, actions: [{ type: "highlightApprove" }] },
    { delay: 1200, actions: [{ type: "hideReview" }, { type: "msg", role: "agent", label: "agent", text: "Approved via visual review. Advancing to product stage." }] },

    // Step 9: Product stage (collaborative)
    { delay: 1000, actions: [{ type: "activateStage", stage: "product" }, { type: "msg", role: "agent", label: "agent", text: "Entering product stage. Hat: product-owner.\nLoading design stage outputs as inputs..." }, { type: "file", path: `${P}/stages/product/state.json` }] },
    { delay: 800, actions: [{ type: "msg", role: "system", label: "system", text: "Resolved inputs \u2192 inception/discovery (knowledge/DISCOVERY.md), design/design-brief (stages/design/DESIGN-BRIEF.md), design/design-tokens (knowledge/DESIGN-TOKENS.md)" }, { type: "msg", role: "agent", label: "agent", text: "Design brief specifies full-page login with social buttons and forgot-password link. Tokens define spacing, colors, breakpoints.\nElaborating product work from design artifacts..." }, { type: "file", path: `${P}/stages/product/units/unit-01-auth-spec.md` }, { type: "card", stage: "product", name: "auth-spec", status: "in-progress" }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "40" }] },
    { delay: 1800, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Here are the acceptance criteria for the callback flow:" }] },
    { delay: 1000, actions: [{ type: "msg", role: "agent", label: "agent", text: "1. Valid code \u2192 token exchange \u2192 session created\n2. Invalid code \u2192 400 error\n3. Expired code \u2192 redirect to login" }] },
    { delay: 2500, actions: [{ type: "msg", role: "user", label: "you", text: "Add a rate limiting scenario \u2014 what happens at 100 requests/minute?" }] },
    { delay: 800, actions: [{ type: "typing" }] },
    { delay: 1200, actions: [{ type: "removeTyping" }, { type: "msg", role: "agent", label: "agent", text: "Added: rate limit returns 429 with retry-after header." }, { type: "file", path: `${P}/knowledge/BEHAVIORAL-SPEC.md` }, { type: "file", path: `${P}/knowledge/DATA-CONTRACTS.md` }, { type: "updateCard", stage: "product", name: "auth-spec", status: "completed" }] },
    { delay: 800, actions: [{ type: "msg", role: "system", label: "system", text: "Product stage complete. Review gate: external." }, { type: "msg", role: "agent", label: "agent", text: "Sharing browse URL for external review..." }] },
    { delay: 1000, actions: [{ type: "showReview", title: "Product", intent: "add-oauth-login", criteria: ["Valid code \u2192 token exchange \u2192 session created", "Invalid code \u2192 400 error with message", "Expired code \u2192 redirect to login", "Rate limit at 100 req/min \u2192 429 + retry-after"] }] },
    { delay: 800, actions: [{ type: "animateCheckmarks" }] },
    { delay: 2200, actions: [{ type: "highlightApprove" }] },
    { delay: 1200, actions: [{ type: "hideReview" }, { type: "msg", role: "system", label: "system", text: "External review approved via browse page." }, { type: "msg", role: "agent", label: "agent", text: "Advancing to development stage." }] },

    // Step 10: Development stage (bolt loop, collaborative)
    { delay: 1000, actions: [{ type: "activateStage", stage: "development" }, { type: "msg", role: "agent", label: "agent", text: "Entering development stage. Hat: planner.\nLoading upstream stage outputs..." }, { type: "file", path: `${P}/stages/development/state.json` }] },
    { delay: 800, actions: [{ type: "msg", role: "system", label: "system", text: "Resolved inputs \u2192 inception/discovery, design/design-brief, design/design-tokens, product/behavioral-spec, product/data-contracts" }, { type: "msg", role: "agent", label: "agent", text: "Design brief: full-page login with social buttons + forgot-password link. Tokens: spacing and color system. Product spec: OAuth callback flow with 429 rate limiting.\nElaborating into implementation units..." }, { type: "file", path: `${P}/stages/development/units/unit-01-oauth-provider.md` }, { type: "file", path: `${P}/stages/development/units/unit-02-login-ui.md` }, { type: "file", path: `${P}/stages/development/units/unit-03-session-mgmt.md` }, { type: "card", stage: "development", name: "oauth-provider", status: "in-progress" }, { type: "card", stage: "development", name: "login-ui", status: "" }, { type: "card", stage: "development", name: "session-mgmt", status: "" }] },
    // Bolt 1
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Unit: oauth-provider. Bolt 1. Hat: builder.\nImplementing OAuth provider integration for Google and GitHub..." }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "60" }] },
    { delay: 2000, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Bolt 1 complete. Hat: reviewer. Running code review..." }] },
    { delay: 1200, actions: [{ type: "msg", role: "agent", label: "agent", text: "Review found 1 issue: race condition in concurrent token exchanges" }] },
    { delay: 2200, actions: [{ type: "msg", role: "user", label: "you", text: "Good catch. Use a mutex on the token store." }] },
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Fixed \u2014 added lock on token write. Re-running review..." }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "20" }] },
    { delay: 1200, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Review passed. All criteria met." }, { type: "updateCard", stage: "development", name: "oauth-provider", status: "completed" }, { type: "updateCard", stage: "development", name: "login-ui", status: "in-progress" }] },
    // Unit 2
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Unit: login-ui. Hat: builder. Building login components with the forgot-password link from the design brief..." }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "45" }] },
    { delay: 1500, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Login UI complete. Review passed on first bolt." }, { type: "updateCard", stage: "development", name: "login-ui", status: "completed" }, { type: "updateCard", stage: "development", name: "session-mgmt", status: "in-progress" }] },
    // Unit 3
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Unit: session-mgmt. Hat: builder. Implementing session lifecycle with the rate limiting from the product spec..." }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "50" }] },
    { delay: 1500, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Session management complete \u2014 includes the 429 rate limiting on the callback endpoint. All 3 units delivered." }, { type: "updateCard", stage: "development", name: "session-mgmt", status: "completed" }] },
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Running design consistency and accessibility review agents..." }] },
    { delay: 1000, actions: [{ type: "msg", role: "agent", label: "agent", text: "Review agents passed: design consistency OK, accessibility OK." }, { type: "file", path: "src/lib/oauth/provider.ts" }, { type: "file", path: "src/lib/oauth/callback.ts" }, { type: "file", path: "src/components/LoginPage.tsx" }, { type: "file", path: ".haiku/knowledge/ARCHITECTURE.md" }] },
    { delay: 800, actions: [{ type: "msg", role: "system", label: "system", text: "Development stage complete. Review gate: ask. Awaiting your approval." }] },
    { delay: 1500, actions: [{ type: "msg", role: "user", label: "you", text: "Approved." }, { type: "msg", role: "agent", label: "agent", text: "Advancing to operations stage." }] },

    // Step 11: Operations stage (collaborative)
    { delay: 1000, actions: [{ type: "activateStage", stage: "operations" }, { type: "msg", role: "agent", label: "agent", text: "Entering operations stage. Hat: ops-engineer.\nI see you\u2019re on Kubernetes with Helm charts. For the OAuth secrets (client IDs, client secrets), do you want me to use your existing Vault setup or Kubernetes secrets?" }, { type: "file", path: `${P}/stages/operations/state.json` }, { type: "file", path: `${P}/stages/operations/units/unit-01-deploy-config.md` }, { type: "card", stage: "operations", name: "deploy-config", status: "in-progress" }] },
    { delay: 2000, actions: [{ type: "msg", role: "user", label: "you", text: "Use Vault. We\u2019re migrating everything there. Kubernetes secrets are being phased out." }] },
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Got it. I\u2019ll wire the OAuth secrets through Vault with the existing injector sidecar pattern. Updating the Helm values and adding the Vault policy." }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "35" }] },
    { delay: 1500, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Hat: sre. Vault policies configured, health checks added for both provider endpoints, rollback plan documented with secret rotation procedure." }, { type: "updateCard", stage: "operations", name: "deploy-config", status: "completed" }, { type: "file", path: "deploy/terraform/oauth.tf" }, { type: "file", path: ".haiku/knowledge/RUNBOOK.md" }] },
    { delay: 800, actions: [{ type: "msg", role: "system", label: "system", text: "Operations complete. Review gate: auto. Advancing." }, { type: "msg", role: "agent", label: "agent", text: "Advancing to security stage." }] },

    // Step 12: Security stage (collaborative)
    { delay: 1000, actions: [{ type: "activateStage", stage: "security" }, { type: "msg", role: "agent", label: "agent", text: "Entering security stage. Running review agents in parallel:\n  \u2022 Hat: threat-modeler \u2014 STRIDE analysis\n  \u2022 Hat: red-team \u2014 attack surface scan\n  \u2022 Hat: blue-team \u2014 defense validation" }, { type: "file", path: `${P}/stages/security/state.json` }, { type: "file", path: `${P}/stages/security/units/unit-01-threat-model.md` }, { type: "file", path: `${P}/stages/security/units/unit-02-pen-test.md` }, { type: "card", stage: "security", name: "threat-model", status: "in-progress" }, { type: "card", stage: "security", name: "pen-test", status: "in-progress" }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "60" }] },
    { delay: 2000, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Threat model found 2 medium-risk items:\n  1. GitHub OAuth doesn\u2019t support PKCE \u2014 relying on state param + client_secret only\n  2. Token stored in localStorage on one code path (should be httpOnly cookie everywhere)\n\nItem 2 is a code fix. Item 1 is an accepted limitation \u2014 want me to document it as a known risk or is there a mitigation you prefer?" }] },
    { delay: 2200, actions: [{ type: "msg", role: "user", label: "you", text: "Document it as a known risk. GitHub doesn\u2019t support PKCE, that\u2019s on them. Fix the localStorage issue though \u2014 that should never have been there." }] },
    { delay: 800, actions: [{ type: "msg", role: "agent", label: "agent", text: "Agreed. Fixing the localStorage path now and documenting GitHub\u2019s PKCE gap as accepted risk with compensating controls (strict state validation + short-lived tokens)." }] },
    { delay: 500, actions: [{ type: "fastForward", seconds: "15" }] },
    { delay: 1200, actions: [{ type: "removeFastForward" }, { type: "msg", role: "agent", label: "agent", text: "Fixed. All token storage now uses httpOnly cookies. CSRF protection verified across both providers." }, { type: "updateCard", stage: "security", name: "threat-model", status: "completed" }, { type: "updateCard", stage: "security", name: "pen-test", status: "completed" }, { type: "file", path: ".haiku/knowledge/THREAT-MODEL.md" }, { type: "file", path: `${P}/knowledge/VULN-REPORT.md` }] },
    { delay: 1000, actions: [{ type: "msg", role: "agent", label: "agent", text: "Hat: security-reviewer. Final review... All findings addressed. No critical or high-risk issues remain." }] },
    { delay: 800, actions: [{ type: "msg", role: "system", label: "system", text: "Security stage complete. Review gate: external." }, { type: "msg", role: "agent", label: "agent", text: "Sharing browse URL for external security review..." }] },
    { delay: 1000, actions: [{ type: "showReview", title: "Security", intent: "add-oauth-login", criteria: ["STRIDE threat model complete", "No critical/high-risk findings remain", "Token storage uses httpOnly cookies only", "CSRF protection verified both providers", "GitHub PKCE gap documented as accepted risk"] }] },
    { delay: 800, actions: [{ type: "animateCheckmarks" }] },
    { delay: 2400, actions: [{ type: "highlightApprove" }] },
    { delay: 1200, actions: [{ type: "hideReview" }, { type: "msg", role: "system", label: "system", text: "External security review approved via browse page." }] },

    // Step 13: Intent complete
    { delay: 1200, actions: [{ type: "complete" }, { type: "msg", role: "agent", label: "agent", text: "All 6 stages complete for add-oauth-login.\n\nDelivered:\n  \u2022 OAuth provider integration (Google, GitHub) with separate callback handlers\n  \u2022 Login UI with forgot-password link, 3-breakpoint responsive design\n  \u2022 Session management with 429 rate limiting on callback endpoint\n  \u2022 Race-condition-safe token refresh with distributed mutex lock\n  \u2022 Deploy config with Vault secret management and rollback plan\n  \u2022 Security review with STRIDE threat model, localStorage fix applied\n\nIntent status: complete." }] },
    { delay: 1500, actions: [{ type: "msg", role: "system", label: "system", text: "__SHOW_COMPLETION__" }] },
  ],
}
