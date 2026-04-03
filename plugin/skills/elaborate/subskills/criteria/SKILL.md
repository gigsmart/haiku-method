---
description: (Internal) Success criteria definition with NFRs for H·AI·K·U elaboration
user-invocable: false
---

# Elaborate: Success Criteria

Composable sub-skill for defining verifiable success criteria including non-functional requirements. Used by single-stage and stage-elaborate mode sub-skills.

**This sub-skill runs inline** — it has access to `AskUserQuestion` and the full conversation context.

---

## Inputs (from calling context)

- `INTENT_SLUG` — the intent slug
- `AUTONOMOUS_MODE` — `true` or `false`
- `CRITERIA_FOCUS` (optional) — if set by stage-elaborate, constrains criteria to a specific discipline type: `design`, `product`, `dev`, or empty for all types (single-stage)

---

## Step 1: Define Success Criteria

Work with the user to define 3-7 **verifiable** success criteria. Each MUST be:
- **Specific** - Unambiguous
- **Measurable** - Programmatically verifiable
- **Testable** - Can write a test for it

Good:
```
- [ ] API endpoint returns 200 with valid auth token
- [ ] Invalid tokens return 401 with error message
- [ ] Rate limit of 100 requests/minute is enforced
- [ ] All existing tests pass
```

Bad:
```
- [ ] Code is clean
- [ ] API works well
```

### Criteria Focus Filtering

When `CRITERIA_FOCUS` is set, read the `## Criteria Guidance` section from the active stage's definition file and use it to guide criteria generation. The stage definition contains examples of good and bad criteria for this stage's discipline.

### Design-Focused Criteria

Design criteria are verified by **visual approval** (a human reviews and approves) rather than automated test suites.

Good (design):
```
- [ ] Screen layouts defined for all breakpoints (mobile 375px / tablet 768px / desktop 1280px)
- [ ] All interactive states specified (default, hover, focus, active, disabled, error)
- [ ] Color usage references only design system tokens — no raw hex values
- [ ] Touch targets meet 44px minimum on mobile breakpoints
- [ ] Empty states, loading states, and error states designed
- [ ] Contrast ratios meet WCAG AA (4.5:1 body text, 3:1 large text)
- [ ] Focus order documented for keyboard navigation
- [ ] Component hierarchy documented (which design system components to use/extend)
- [ ] Interaction specs complete for all user actions (tap, swipe, scroll, transition)
```

Bad (design):
```
- [ ] Design looks good
- [ ] It's responsive
- [ ] Accessible
```

**When writing design criteria, keep these principles in mind:**
- Design criteria are verified by **visual approval**, not automated tests — a reviewer inspects the deliverable against the criteria.
- Include **explicit responsive breakpoint requirements**. "Responsive" alone is meaningless — name the breakpoints and viewport widths.
- **Always include accessibility criteria** for design units: contrast ratios, focus order, touch target sizing, screen reader annotations.
- Design criteria and dev criteria can coexist on the same intent — design units get design criteria, implementation units get dev criteria.

---

## Step 2: Non-Functional Requirements

Before confirming criteria, explicitly ask the user about non-functional dimensions using `AskUserQuestion`. Select the dimensions relevant to this intent:

- **Performance** — Response times, throughput, latency budgets (e.g., "p95 < 200ms")
- **Security** — Auth requirements, data protection, OWASP concerns
- **Accessibility** — WCAG level, screen reader support, keyboard navigation
- **Observability** — Logging, metrics, tracing, alerting requirements
- **Scalability** — Load expectations, concurrency limits, growth projections

Each non-functional requirement MUST be expressed as a verifiable success criterion. Do NOT accept vague NFRs — "performant" is not a criterion, "p95 response < 200ms under 1000 req/s" is.

Add confirmed NFRs to the success criteria list before presenting for final confirmation.

**Autonomous mode:** Generate criteria and auto-approve. Derive NFRs from the domain model and codebase patterns. Do NOT ask for confirmation.

---

## Step 3: Confirm Criteria

**Before asking for confirmation, display the full criteria list as a numbered markdown checklist so the user can see exactly what they're approving.** Do NOT ask "are these complete?" without showing what "these" are. Example:

```
## Success Criteria

1. [ ] API endpoint returns 200 with valid auth token
2. [ ] Invalid tokens return 401 with error message
3. [ ] Rate limit of 100 requests/minute is enforced
4. [ ] All existing tests pass
5. [ ] p95 response < 200ms under 1000 req/s
```

**Autonomous mode:** Skip this question. Auto-approve.

**Interactive mode:** Use `AskUserQuestion` to confirm:
```json
{
  "questions": [{
    "question": "Are these success criteria complete?",
    "header": "Criteria",
    "options": [
      {"label": "Yes, looks good", "description": "Proceed with these criteria"},
      {"label": "Need to add more", "description": "I have additional criteria"},
      {"label": "Need to revise", "description": "Some criteria need adjustment"}
    ],
    "multiSelect": false
  }]
}
```

Loop until the user approves.

---

## Output

The confirmed success criteria list is carried forward to the calling mode sub-skill for writing into intent.md.
