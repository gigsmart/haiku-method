---
title: >-
  Origin-icon emoji set in DESIGN-BRIEF diverges from artifacts and
  aria-landmark-spec
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:51:56Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-13 completion criteria line 209 asserts: "DESIGN-BRIEF §2 and every artifact render the SAME emoji for each origin". They do not.

**DESIGN-BRIEF.md §2 (lines 174-179)** — "Icon mapping":
- `adversarial-review` → 🔍 "Review Agent"
- `external-pr` → 🔗 "PR Comment"
- `external-mr` → 🔗 "MR Comment"
- `user-visual` → ✎ "Annotation"
- `user-chat` → 💬 "Comment"
- `agent` → 🤖 "Agent"

**aria-landmark-spec.md** (per unit-13 reviewer rejection at line 152) canonicalized on:
- Review Agent = 🔍 (U+1F50D)
- External PR/MR = 🔗 (U+1F517)
- Agent = 🤖 (U+1F916)

DESIGN-BRIEF §2 lines 174-179 appear to actually match the aria-landmark canonical set — this is GOOD. However, the unit-13 bolt-2 rejection (unit-13 line 152) noted that 7 artifact files still had the FORBIDDEN codepoints 🛡 (U+1F6E1), 🔀 (U+1F500), ✨ (U+2728). unit-13 claims bolt-3 swept these. Needs verification: `grep -rE '🛡|🔀|✨' stages/design/` must equal 0. Also verify that `feedback-card-states.html`, `comments-list-with-agent-toggle.html`, `feedback-inline-desktop.html`, `feedback-inline-mobile.html`, `review-context-header.html`, `comment-to-feedback-flow.html` all use 🔍 / 🔗 / 🤖 and NOT 🛡 / 🔀 / ✨.

Additionally: DESIGN-TOKENS.md §2.2 lines 266-271 still encodes the OLD 🛡 / 🔀 / 👁 / ✨ emoji set:
```
"adversarial-review": "\uD83D\uDEE1\uFE0F"  // shield 🛡
"external-pr":        "\uD83D\uDD00"         // shuffle 🔀
"user-visual":        "\uD83D\uDC41\uFE0F"  // eye 👁
"agent":              "\u2728"                // sparkle ✨
```

This directly contradicts DESIGN-BRIEF §2 and aria-landmark-spec. The design system has two emoji dictionaries that disagree. Development will pick one and downstream will not match.

Fix: update DESIGN-TOKENS.md §2.2 `originIcons` table (lines 266-271) to use the canonical set from DESIGN-BRIEF §2 / aria-landmark-spec:
```
"adversarial-review": "🔍" (U+1F50D)
"external-pr":        "🔗" (U+1F517)
"external-mr":        "🔗" (U+1F517)
"user-visual":        "✎" (U+270E) or keep the eye emoji 👁 — reconcile with DESIGN-BRIEF which currently says ✎
"user-chat":          "💬" (U+1F4AC)
"agent":              "🤖" (U+1F916)
```

Note the secondary drift: DESIGN-BRIEF shows `user-visual = ✎` (pencil) while DESIGN-TOKENS shows `user-visual = 👁` (eye). Pick one.
