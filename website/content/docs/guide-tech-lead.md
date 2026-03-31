---
title: Tech Lead Guide
description: Guide for tech leads rolling out AI-DLC to their teams
order: 16
---

This guide is for tech leads responsible for introducing AI-DLC to their teams. It covers preparation, rollout strategies, and measuring success.

## Preparing for Team Adoption

### Personal Mastery First

Before introducing AI-DLC to your team, you need to be proficient yourself:

- [ ] Completed at least 5 units personally
- [ ] Used multiple workflow types
- [ ] Experienced common failure modes
- [ ] Developed opinions on conventions
- [ ] Can answer basic questions confidently

### Identifying Good First Projects

Not all work is equally suited for AI-DLC adoption. Start with projects that:

| Characteristic | Why It Helps |
|----------------|--------------|
| Low time pressure | Room for learning curve |
| Clear requirements | Easier to write good criteria |
| Isolated scope | Limited blast radius |
| Meaningful size | Enough to learn, not overwhelming |
| Technical familiarity | One new thing at a time |

**Avoid for first adoption:**
- Critical path deliverables
- Legacy systems with heavy context
- Projects requiring extensive stakeholder coordination
- Highly exploratory R&D work

### Preparing Materials

Before the team introduction:

1. **Example intent** - Prepare a realistic example for your domain
2. **Recorded demo** - Or plan a live demo for the team
3. **FAQ document** - Anticipate and answer common questions
4. **Success story** - Share your own positive experience

## Rolling Out AI-DLC

### The Champion Model (Recommended)

The most effective rollout pattern:

```
Phase 1: Champion works independently (1-2 sprints)
    ↓
Phase 2: Champion demonstrates to team (1 session)
    ↓
Phase 3: Pair programming - champion + each team member (1 unit each)
    ↓
Phase 4: Independent work with champion available (2-3 sprints)
    ↓
Phase 5: Team operates independently
```

**Why this works:**
- Champion encounters problems before they affect the team
- Demonstration provides shared context
- Pairing accelerates learning
- Gradual independence builds confidence

### The Parallel Model (Alternative)

For teams with multiple experienced developers:

```
Phase 1: 2-3 volunteers learn independently (1-2 sprints)
    ↓
Phase 2: Volunteers share learnings (1 session)
    ↓
Phase 3: Each volunteer supports 1-2 team members
    ↓
Phase 4: Full team adoption
```

**Why this works:**
- Multiple perspectives on the methodology
- Shared ownership of the rollout
- Faster coverage for larger teams

### Team Introduction Session

Structure for a 60-minute introduction:

| Time | Activity |
|------|----------|
| 0-10 | Why AI-DLC: Problem statement and benefits |
| 10-30 | Live demo: Complete a small unit end-to-end |
| 30-45 | Q&A: Address concerns and questions |
| 45-55 | First steps: How to get started |
| 55-60 | Commitment: Who's trying it first? |

**Key points to cover:**
- AI-DLC is about structure, not restriction
- Hat switching feels awkward at first, then becomes natural
- Quality improvements are the goal, speed follows
- It's okay to be skeptical - just give it a fair try

### Addressing Common Concerns

| Concern | Response |
|---------|----------|
| "This will slow us down" | "Initially, yes. But quality improvements reduce rework. Give it 5 units before judging." |
| "I already know what to build" | "Research often reveals surprises. Try 5-minute timeboxed research and see." |
| "Too much overhead" | "Most overhead is learning curve. It reduces significantly after mastery." |
| "AI will make mistakes" | "Yes, that's why we have review phases and clear criteria. The system catches mistakes." |
| "What if I don't like it?" | "Fair. Try 3-5 units genuinely before deciding. If it doesn't work for you, we'll discuss." |

## Establishing Team Conventions

### What to Standardize

Teams should agree on:

**File organization:**
```
.ai-dlc/
  intent.md                    # Main intent
  unit-01-description.md       # Sequential + descriptive
  unit-02-description.md
```

**Commit messages:**
```
feat(auth): complete unit-01-login-api

AI-DLC unit: unit-01-login-api
Status: complete
Criteria met: 5/5
```

**PR format:**
```markdown
## Intent
[Link to intent.md or copy relevant section]

## Units Completed
- unit-01-x: [brief description]
- unit-02-y: [brief description]

## Completion Criteria
[Copy from unit files or link to them]
```

**Configuring passes:**

For teams that want cross-functional iteration by default, configure `default_passes` in `.ai-dlc/settings.yml` so new intents automatically include design, product, and dev passes:

```yaml
# .ai-dlc/settings.yml
default_passes: [design, product, dev]
```

Without this, intents default to a single dev pass. See [Passes](/docs/concepts/#pass) for how passes work.

### What NOT to Standardize

Allow individual flexibility on:
- Hat transition timing
- Level of detail in research notes
- Working style within each hat
- Preference for different workflows

### Documenting Conventions

Create a team AI-DLC guide:

```markdown
# Team AI-DLC Conventions

## File Structure
[Your team's conventions]

## Workflow Selection
- Default: Most feature work
- TDD: Bug fixes, well-specified behavior
- Adversarial: Security-sensitive features

## Commit Strategy
[Your approach]

## Review Integration
[How AI-DLC integrates with PR reviews]
```

## Integrating with Existing Processes

### Sprint Planning

**Before AI-DLC:**
> "This feature will take 3 story points"

**With AI-DLC:**
> "This feature breaks into 4 units. Based on similar past work, we can complete 2-3 units per sprint."

Unit-based estimation benefits:
- More granular than story points
- Completion criteria make scope clear
- Dependencies are explicit in unit DAG

### Daily Standups

Team members can report:
- Current unit and hat
- Blockers documented
- Expected unit completion

Example:
> "I'm on unit-02 of the authentication intent, Builder hat. No blockers. Should complete today and move to unit-03 tomorrow."

### Pull Request Reviews

PRs become easier to review with AI-DLC:

1. **Context is clear** - Intent and unit files explain the "why"
2. **Scope is bounded** - Reviewers know what to expect
3. **Criteria are documented** - Checklist for review
4. **Review hat was worn** - AI already did first-pass review

Reviewers can focus on:
- Did the implementation meet criteria?
- Are there cases the criteria missed?
- Code quality concerns the AI missed

### Retrospectives

Add AI-DLC-specific discussion:
- Which workflows worked well?
- Any conventions need adjustment?
- Quality improvements observed?
- Pain points to address?

## Measuring Success

### Metrics to Track

**Adoption metrics:**
| Metric | How to Measure | Target |
|--------|----------------|--------|
| Team participation | Who's creating unit files | 100% |
| Units completed | Count completed units | Growing |
| Workflow variety | Which workflows used | All used appropriately |

**Quality metrics:**
| Metric | How to Measure | Target |
|--------|----------------|--------|
| Bug rate | Bugs per unit | Decreasing |
| PR revision rounds | Comments requiring changes | Decreasing |
| Test coverage | Coverage reports | Increasing |
| Criteria clarity | Review of criteria quality | Improving |

**Efficiency metrics:**
| Metric | How to Measure | Target |
|--------|----------------|--------|
| Unit completion rate | Units per sprint | Stable or increasing |
| Block time | Time units spend blocked | Decreasing |
| Rework rate | Units requiring re-opening | Low |

### Running a Pilot

For larger teams, run a controlled pilot:

1. **Select pilot group** - 2-3 volunteers
2. **Define success criteria** - What would make AI-DLC worth adopting?
3. **Time-box the pilot** - 4-6 sprints
4. **Collect data** - Track metrics above
5. **Gather feedback** - Interviews with participants
6. **Decide** - Expand, adjust, or discontinue

### Reporting to Leadership

When reporting AI-DLC adoption:

**Focus on:**
- Quality improvements (bugs, rework)
- Developer satisfaction
- Process visibility
- Specific success stories

**Avoid:**
- Claiming time savings too early
- Attributing all improvements to AI-DLC alone
- Overselling autonomy benefits

## Handling Challenges

### The Skeptic

Some team members will be skeptical. This is healthy.

**Do:**
- Acknowledge their concerns
- Ask them to try 3-5 units before deciding
- Pair them with an enthusiastic adopter
- Listen to specific feedback

**Don't:**
- Force adoption on unwilling developers
- Dismiss concerns as resistance to change
- Make AI-DLC mandatory before proving value

### The Over-Adopter

Some will try to use AI-DLC for everything.

**Watch for:**
- Using AI-DLC for trivial tasks (5-minute fixes)
- Creating intents for every small change
- Spending more time on process than work

**Guide toward:**
- Appropriate task selection
- Lightweight use for small work
- Balancing structure with pragmatism

### Quality Not Improving

If quality metrics aren't improving after adoption:

**Investigate:**
- Are criteria being written well?
- Is the Review hat actually being worn?
- Are quality gates being enforced?
- Is there sufficient test coverage?

**Address:**
- Review criteria writing practices
- Strengthen quality gate requirements
- Provide additional training
- Pair review units together

## Next Steps

- **[Manager Guide](/docs/guide-manager/)** - For presenting business case to leadership
- **[Team Onboarding Checklist](/docs/checklist-team-onboarding/)** - Step-by-step team adoption
- **[Adoption Roadmap](/docs/adoption-roadmap/)** - Full adoption journey
