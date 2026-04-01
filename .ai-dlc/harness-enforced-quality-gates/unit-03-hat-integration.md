---
status: completed
hat: done
last_updated: ""
depends_on:
  - unit-01-quality-gate-hook
branch: ai-dlc/harness-enforced-quality-gates/03-hat-integration
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-03-hat-integration

## Description
Update builder and reviewer hat instructions and the advance skill to reference frontmatter-defined quality gates instead of hardcoded `npm test`/`npm run lint`/`npx tsc` commands. The hats should tell the agent that quality gates are harness-enforced and guide behavior accordingly, rather than instructing the agent to manually run checks.

## Discipline
backend - Modifying skill and hat markdown instructions.

## Domain Entities
- **Builder Hat** (`plugin/hats/builder.md`): Instructions for the building role. Currently references hardcoded backpressure commands.
- **Builder Reference** (`plugin/hats/builder-reference.md`): Extended reference material for builder.
- **Reviewer Hat** (`plugin/hats/reviewer.md`): Instructions for the review role. Currently verifies hardcoded test/lint/type checks.
- **Reviewer Reference** (`plugin/hats/reviewer-reference.md`): Extended reference material for reviewer.
- **Advance Skill** (`plugin/skills/execute/subskills/advance/SKILL.md`): Currently contains hardcoded TESTS_PASS gate logic.

## Data Sources
- `plugin/hats/builder.md` — builder hat with backpressure section (~lines 61-76)
- `plugin/hats/builder-reference.md` — builder extended reference
- `plugin/hats/reviewer.md` — reviewer hat with gate verification
- `plugin/hats/reviewer-reference.md` — reviewer extended reference
- `plugin/skills/execute/subskills/advance/SKILL.md` — advance skill with hardcoded TESTS_PASS gate (~lines 48-99)
- `plugin/skills/backpressure/SKILL.md` — backpressure skill documentation

## Technical Specification

### Part 1: Update Builder Hat

In `plugin/hats/builder.md`, update the backpressure/quality gate section to:

1. **Remove hardcoded commands**: Replace references to specific commands (`npm test`, `npm run lint`, `npx tsc --noEmit`) with references to frontmatter-defined gates.

2. **Explain harness enforcement**: Tell the builder that quality gates are enforced by the harness — if gates fail, the agent will be blocked from stopping until they pass. This is not a suggestion; it's mechanical enforcement.

3. **Update anti-rationalization table**: Change entries about "I'll fix lint later" to reference harness enforcement rather than manual discipline. Example:
   - Old: "Backpressure exists NOW. Fix before advancing."
   - New: "The harness will block you from stopping if gates fail. Fix now — you literally cannot proceed otherwise."

4. **Add gate awareness section**: The builder should know:
   - Quality gates are defined in intent.md and unit frontmatter under `quality_gates:`
   - The builder can ADD gates to the current unit's frontmatter when discovering new needs
   - Gates can never be removed (ratchet effect)
   - The harness runs gates automatically on Stop — no manual invocation needed
   - If a gate fails, the failure output is injected as context — use it to diagnose and fix

### Part 2: Update Reviewer Hat

In `plugin/hats/reviewer.md`, update the verification section to:

1. **Remove hardcoded gate checks**: The reviewer no longer needs to manually verify `npm test`, `npm run lint`, etc. The harness enforced them before the builder could advance.

2. **Add gate verification context**: The reviewer should know that quality gates already passed (the builder couldn't have reached reviewer otherwise). The reviewer focuses on:
   - Criteria compliance (still reviewer's job)
   - Code quality beyond what gates check (architecture, readability, security)
   - Whether the right gates are defined (reviewer can suggest adding gates)

3. **Add ratchet review**: Reviewer should verify that no gates were removed from intent or unit frontmatter compared to what was defined during elaboration. This is the human-verified side of the ratchet.

### Part 3: Update Advance Skill

In `plugin/skills/execute/subskills/advance/SKILL.md`, update the hard gate logic:

1. **Remove TESTS_PASS gate**: The advance skill's hardcoded TESTS_PASS check (running `npm test`, `npm run lint`, `npx tsc --noEmit`) is now redundant — the quality-gate.sh hook enforces frontmatter-defined gates before the agent can even call `/advance`. Remove or replace with a note that gates are harness-enforced.

2. **Keep PLAN_APPROVED gate**: This gate checks for the existence of a plan file, not a shell command. It's structural, not quality-related. Keep it in the advance skill.

3. **Keep CRITERIA_MET gate**: This gate checks review-result.json for `allPass: true`. Also structural. Keep it.

4. **Add documentation**: Note in the advance skill that quality gates are now harness-enforced via the Stop/SubagentStop hook, and the advance skill only handles structural gates (plan exists, criteria met).

### Part 4: Update Backpressure Skill

In `plugin/skills/backpressure/SKILL.md`, update to explain the relationship between:
- **Quality gates** (harness-enforced, defined in frontmatter, run on Stop) — hard enforcement
- **Backpressure** (stop hooks in user's .claude/settings.json via han) — soft guidance during development

Quality gates are a subset of backpressure that has been promoted to hard enforcement. Other backpressure (e.g., custom project checks that don't need to block) remains advisory.

## Success Criteria
- [ ] Builder hat references frontmatter-defined gates instead of hardcoded commands
- [ ] Builder hat explains harness enforcement (agent blocked from stopping if gates fail)
- [ ] Builder hat anti-rationalization table updated for harness enforcement
- [ ] Reviewer hat no longer manually checks test/lint/type (harness handles it)
- [ ] Reviewer hat includes ratchet review (verify no gates removed)
- [ ] Advance skill TESTS_PASS hardcoded gate removed or replaced with harness reference
- [ ] Advance skill PLAN_APPROVED and CRITERIA_MET gates preserved
- [ ] Backpressure skill updated to explain quality gates vs. soft backpressure

## Risks
- **Builders relying on old patterns**: Existing muscle memory of "run tests before /advance" might conflict with new "harness blocks you automatically". Mitigation: clear hat instructions explaining the change.
- **Over-removal from advance**: Accidentally removing structural gates (PLAN_APPROVED, CRITERIA_MET) along with TESTS_PASS. Mitigation: explicit in spec — only TESTS_PASS is removed.

## Boundaries
This unit modifies hat instructions and the advance skill ONLY. It does NOT:
- Modify quality-gate.sh hook (unit-01)
- Modify the elaborate skill (unit-02)
- Add any new shell scripts or hook registrations

## Notes
- The advance skill's TESTS_PASS gate was the agent self-policing. The quality-gate.sh hook is the harness policing the agent. The former is redundant once the latter exists.
- The reviewer still plays a crucial role: verifying criteria compliance, code quality, and gate integrity (ratchet review). The reviewer's job shifts from "did tests pass?" (harness handles) to "is the code actually correct?" (judgment call).
