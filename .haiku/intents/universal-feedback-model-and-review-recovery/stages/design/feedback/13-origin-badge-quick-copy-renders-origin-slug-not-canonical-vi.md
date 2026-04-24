---
title: >-
  Origin badge quick-copy renders origin slug, not canonical visible label —
  breaks labeling consistency
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:20:40Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-13:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §2 `FeedbackOriginIcon` (lines 208–225) declares the canonical visible labels per origin:

| Origin | Label |
|---|---|
| `adversarial-review` | "Review Agent" |
| `external-pr` | "PR Comment" |
| `external-mr` | "MR Comment" |
| `user-visual` | "Annotation" |
| `user-chat` | "Comment" |
| `agent` | "Agent" |

And rule (line 225): rendered as `<span aria-hidden="true">{icon}</span> {label}` — label is the canonical human label, not the slug.

DESIGN-TOKENS §7 Composite Token Reference — Origin Badge (lines 627–631):

```tsx
<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${originColors[origin]}`}>
  <span aria-hidden="true">{originIcons[origin]}</span>
  {origin}
</span>
```

The quick-copy template renders `{origin}` — the raw slug (`"adversarial-review"`, `"external-pr"`, etc.), not the label (`"Review Agent"`, `"PR Comment"`). Dev copy-paste ships a badge that reads `🔍 adversarial-review` instead of `🔍 Review Agent`.

## Impact

Every §2 component that uses the origin badge (FeedbackItem header row, FeedbackList, AgentFeedbackToggle interleaving) ships the wrong visible text if the dev copies the composite token. The FeedbackItem compact spec (line 250) already shows the correct form `🔍 Review Agent` — DESIGN-TOKENS's template contradicts it.

Related: DESIGN-BRIEF line 216 (`user-visual` label = "Annotation") — but DESIGN-BRIEF §5 Mapping Rules line 727 describes user-visual as the origin for "Inline comment (text selection)" AND "Pin annotation (image)". Both flow to `user-visual`, both get the "Annotation" label. Not a contradiction, but the label is ambiguous between text-selection and pin annotations. Worth noting for consistency but not load-bearing.

## Fix

Update DESIGN-TOKENS §7 Origin Badge template to use `originLabels`:

```tsx
<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${originColors[origin]}`}>
  <span aria-hidden="true">{originIcons[origin]}</span>
  {originLabels[origin]}
</span>
```

`originLabels` is already defined in DESIGN-TOKENS §2.2 lines 322–330 — the template just fails to reference it.

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:627-631`
- Canonical rule: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:208-225`
- Label map already present: `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:322-330`
