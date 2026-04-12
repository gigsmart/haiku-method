# Unit 02 Planner Output — Model Assignment Guidance

## Implementation Scope

**Single file to modify:** `plugin/studios/software/stages/inception/hats/elaborator.md`

- Add a new **"Model Assignment"** section with complexity tiers and decision heuristic
- Update the **"Produces"** section to document `model:` as a required unit frontmatter field
- Total additions: ~30–40 lines

## Exact Content to Add

### 1. New "Model Assignment" Section

Insert after the existing "Produces" section, before "Reads":

```markdown
## Model Assignment

Every unit MUST have a `model:` field assigned during elaboration. This field determines which Claude model will execute the unit's builder hat.

### Complexity Tiers and Signals

**opus** — Use for architectural decisions, orchestration changes, or high-risk work:
- The unit requires architectural trade-offs between competing valid approaches
- The unit touches core orchestration logic or execution engine
- The unit spans multiple subsystems and requires deep interaction understanding
- The unit involves security-critical or permission-based decisions
- The unit is novel — no established pattern exists in the codebase
- The unit requires reverse-engineering complex existing behavior before modification
- Cascading breakage risk is high if execution is incorrect

**sonnet** — The default for most work. Use for standard feature additions and well-bounded changes:
- The unit implements a known pattern with meaningful application logic
- The unit involves API design (types, interfaces, signatures) with judgment calls
- The unit is a standard feature addition (new endpoint, component, or tool)
- The unit requires reading existing code to understand context before modifying
- The unit involves cross-file changes within a bounded scope
- The unit writes substantive documentation (not pure boilerplate)
- Risk is moderate — breakage caught by type checking or CI

**haiku** — Use for mechanical, additive work with no decision-making:
- The unit is purely additive (adding a field, column, badge, or value) with no logic changes
- The unit follows an exact established pattern (copy-paste-adapt with minimal judgment)
- The unit involves only string changes, renaming, or reformatting
- The unit depends on completed units doing the hard work — this unit just wires or exposes values
- The unit writes boilerplate documentation from a clear template
- Risk is low — wrong output is immediately visible and easily corrected
- Execution is mechanical; the spec is complete enough to follow without interpretation

### Decision Heuristic

Start at `sonnet` unless strong signals justify moving up or down. Ask: "Could a junior engineer execute this spec correctly by following instructions?" If yes, it's not opus. If the specification leaves room for multiple valid architectural choices, it might be opus.

### Anti-Patterns (RFC 2119)

- The agent **MUST NOT** assign `opus` to units with fully-specified, mechanical execution paths
- The agent **MUST NOT** leave `model:` unset — every unit spec MUST include the field
- The agent **MUST NOT** assign the same model to all units without assessing each individually
- The agent **MUST NOT** let "this is important work" justify `opus` — importance and complexity are different things
```

### 2. Update "Produces" Section

Replace the existing line:
```
**Produces:** Unit specs with completion criteria, dependencies, and scope boundaries.
```

With:
```
**Produces:** Unit specs with completion criteria, dependencies, scope boundaries, and `model:` assignment (opus/sonnet/haiku) for each unit.
```

## Implementation Steps

1. Open `plugin/studios/software/stages/inception/hats/elaborator.md`
2. Locate the "Produces" section (currently line 9)
3. Update the Produces line to include `model:` field documentation
4. Add the full "Model Assignment" section after "Produces", before "Reads"
5. Verify the formatting matches existing hat files (headers, bullet points, emphasis)
6. Run no additional verification — the file is a documentation artifact, not code

## Verification Checklist (for builder hat)

- [ ] elaborator.md contains a "Model Assignment" section
- [ ] Three tiers (opus, sonnet, haiku) each have at least 3 concrete signals
- [ ] `sonnet` is named as the default
- [ ] The decision heuristic mentions starting at sonnet
- [ ] All four anti-patterns appear as RFC 2119 MUST NOT statements
- [ ] Produces section mentions `model:` field
- [ ] No formatting errors or markdown issues

## Risks and Rationale

**No risks identified:**
- Single file, isolated change
- Documentation only — no code changes, no breaking changes
- Content is drawn directly from research notes; no new judgment required
- No other files depend on this hat's internal structure

**Why this approach:**
- Research confirms this is the only file needing updates (software studio is the only one with elaborator hat that produces unit specs)
- Content is prescriptive but flexible — elaborators can apply judgment within the framework
- Tiers are defined with concrete signals, not vague descriptions (matches existing "no vague criteria" anti-pattern)
- The heuristic of "start at sonnet" prevents over-specification without removing guidance

## Builder Hat Instructions

The builder will:

1. Open `plugin/studios/software/stages/inception/hats/elaborator.md` in an editor
2. Locate the current "Produces" section (line 9)
3. Locate the "Reads" section (line 11)
4. Between them, insert the complete "Model Assignment" section (see above)
5. Update line 9 to include `model:` field
6. Verify markdown formatting: headers (##/###), bold (**text**), bullets, code blocks
7. Run `git diff` to review changes before commit
8. Commit with message: `haiku: add model assignment guidance to elaborator hat`

No tests, no builds, no verification commands needed — this is documentation.

### Output Definition

**Produces:** Updated elaborator.md with Model Assignment section, updated Produces line
