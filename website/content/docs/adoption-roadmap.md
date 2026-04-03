---
title: Adoption Roadmap
description: A phased approach to adopting AI-DLC, from individual developer to organization-wide
order: 15
---

Adopting AI-DLC is a journey, not a destination. This roadmap provides a phased approach that scales from individual experimentation to organization-wide practice.

## Phase 1: Individual Developer

Start with one developer on one project. Master the fundamentals before scaling.

### Prerequisites

Before starting Phase 1, ensure you have:

- **Claude Code installed** and working in your development environment
- **A real project** - Not a toy project, but something you're actively working on
- **Dedicated time** - Plan for a learning curve in the first few sessions
- **An open mindset** - AI-DLC may feel slower at first; trust the process

### Goals

- [ ] Complete 3-5 units using the default workflow
- [ ] Experience all four hats (Researcher, Planner, Builder, Reviewer)
- [ ] Develop muscle memory for hat transitions
- [ ] Build intuition for writing good completion criteria

### Activities

**First session:**
1. Install the AI-DLC plugin
2. Create your first intent with 2-3 units
3. Work through the first unit using `/ai-dlc:elaborate` and `/ai-dlc:execute`
4. Complete the full hat cycle

**Subsequent sessions:**
- Experiment with different workflow types (TDD, Hypothesis)
- Practice writing increasingly specific completion criteria
- Learn when to `/clear` and restart vs. when to push through

### Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Units completed | 3-5 | Count `.ai-dlc/unit-*.md` files marked complete |
| Hat utilization | All 4 used | Self-observation |
| Criteria specificity | Improving | Fewer ambiguous criteria per unit |
| Autonomy achieved | Some AHOTL | At least one Builder phase ran without intervention |

### Common Pitfalls

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| Skipping research | Jumping straight to building | Force yourself to wear Researcher hat for 5+ minutes |
| Vague criteria | "Make it work" style criteria | Ask "How would I verify this programmatically?" |
| Premature optimization | Trying advanced workflows first | Stick to Default workflow until it feels natural |
| Giving up early | Abandoning mid-unit | Complete at least 3 units before evaluating |

### Phase 1 Checklist

- [ ] Plugin installed and working
- [ ] First intent created
- [ ] First unit completed
- [ ] Experienced all four hats
- [ ] Completed 3 units total
- [ ] Developed personal workflow preferences
- [ ] Ready to share experience with others

---

## Phase 2: Team Adoption

Once one developer has proven the methodology, expand to the team.

### Prerequisites

Before starting Phase 2, ensure:

- **Phase 1 champion available** - Someone who can answer questions and model good practices
- **Team buy-in** - At least interest, preferably enthusiasm
- **Low-stakes project** - Don't start with the critical release
- **Documentation ready** - Share this documentation with the team

### Goals

- [ ] All team members complete at least one unit independently
- [ ] Establish team conventions for intent/unit organization
- [ ] Integrate AI-DLC into existing workflows (PR reviews, standups)
- [ ] Create shared understanding of when to use which workflow

### Rolling Out

**Champion Model (Recommended)**

1. Champion demonstrates AI-DLC on a real task in team meeting
2. Team members pair with champion for their first unit
3. Team members work independently with champion available for questions
4. Team reviews first independently-completed units together

**Pair Programming Model (Alternative)**

1. Two developers work through units together
2. One drives, one observes and learns
3. Switch roles for next unit
4. Both become champions for remaining team members

### Establishing Conventions

The team should agree on:

| Convention | Options | Recommendation |
|------------|---------|----------------|
| Intent file location | Root, `.ai-dlc/`, feature branch | `.ai-dlc/` directory |
| Unit naming | Sequential, descriptive, both | `unit-01-description.md` |
| Commit strategy | Per unit, per hat, per feature | Per unit (one commit per complete unit) |
| PR integration | One PR per intent, per unit | Per intent (all units in one PR) |

### Integration Points

**Daily standups:**
- "I'm working on unit 3 of the authentication intent"
- "Blocked on unit 2 - need API spec clarification"

**Pull requests:**
- Link to intent file in PR description
- Reviewers can check completion criteria were met
- Unit files provide context for changes

**Sprint planning:**
- Estimate by unit count, not hours
- Break features into intents during planning
- Dependencies visible in unit DAG

### Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Team adoption | 100% | All team members completed at least one unit |
| Consistency | High | Team uses same conventions across projects |
| Quality | Improved | Fewer bugs, cleaner PRs, better test coverage |
| Velocity | Maintained or improved | Sprint completion rate |

### Common Pitfalls

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| Inconsistent adoption | Only champion uses AI-DLC | Make it required for specific task types |
| Convention drift | Everyone does it differently | Document and enforce conventions |
| Overhead complaints | "This slows me down" | Focus on quality improvements, be patient |
| Tool blame | "AI made a mistake" | Improve criteria and review process |

### Phase 2 Checklist

- [ ] Champion identified and prepared
- [ ] Team introduction completed
- [ ] All members completed first unit
- [ ] Conventions documented
- [ ] Integration points established
- [ ] Feedback collected and addressed
- [ ] Ready for broader adoption

---

## Phase 3: Organization-Wide

Scale AI-DLC across the organization with proper support and governance.

### Prerequisites

Before starting Phase 3, ensure:

- **Multiple successful team adoptions** - At least 2-3 teams using AI-DLC effectively
- **Executive sponsorship** - Leadership understands and supports the methodology
- **Training resources** - Documentation, examples, champions available
- **Metrics framework** - Ability to measure and report on adoption

### Goals

- [ ] AI-DLC becomes default methodology for appropriate work types
- [ ] Training program established for new hires and existing staff
- [ ] Tooling and automation support AI-DLC workflows
- [ ] Continuous improvement process in place

### Institutionalization

**Training Program:**
- Onboarding includes AI-DLC introduction
- Advanced workshops for workflow selection and custom workflows
- Champion certification program
- Regular office hours with experienced practitioners

**Tooling Support:**
- Project templates include `.ai-dlc/` structure
- CI/CD aware of completion criteria
- Dashboards track adoption metrics
- Automated reminders for incomplete units

**Governance:**
- Guidelines for when AI-DLC is required vs. optional
- Quality standards for intents and units
- Review process for custom workflows
- Feedback channels for methodology improvements

### Cross-Team Coordination

For large features spanning teams:

```
feature-xyz/
  intent.md              # High-level feature intent
  team-backend/
    intent.md            # Backend team's intent
    unit-01-api.md
    unit-02-database.md
  team-frontend/
    intent.md            # Frontend team's intent
    unit-01-components.md
    unit-02-integration.md
  team-mobile/
    intent.md            # Mobile team's intent
    unit-01-screens.md
```

Each team owns their intent and units, with dependencies across team boundaries explicitly declared.

### Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Adoption rate | >80% of eligible projects | Automated scanning for `.ai-dlc/` |
| Training completion | 100% of developers | LMS tracking |
| Quality improvement | Measurable | Bug rates, PR revision counts, test coverage |
| Developer satisfaction | High | Surveys, retention |

### Continuous Improvement

1. **Quarterly reviews** - Assess methodology effectiveness
2. **Retrospectives** - Collect and act on feedback
3. **Experimentation** - Try new workflows, tools, practices
4. **Sharing** - Document and spread successful patterns

### Phase 3 Checklist

- [ ] Executive sponsorship secured
- [ ] Training program launched
- [ ] Tooling support implemented
- [ ] Governance framework established
- [ ] Cross-team coordination working
- [ ] Metrics dashboard operational
- [ ] Continuous improvement process active

---

## Timeline Guidance

The timeline for adoption varies by organization size and culture. Here's a general framework:

| Phase | Small Team (5-10) | Medium Org (50-200) | Large Org (500+) |
|-------|-------------------|---------------------|------------------|
| Phase 1 | 1-2 sprints | 1-2 sprints | 2-4 sprints |
| Phase 2 | 2-3 sprints | 3-6 sprints | 6-12 sprints |
| Phase 3 | N/A | 6-12 sprints | 12-24 sprints |

**Key principle:** Don't rush. Sustainable adoption takes time. It's better to have one team using AI-DLC excellently than five teams using it poorly.

## Next Steps

- **[Developer Guide](/docs/guide-developer/)** - Day-to-day usage for individual developers
- **[Tech Lead Guide](/docs/guide-tech-lead/)** - Leading team adoption
- **[Manager Guide](/docs/guide-manager/)** - Business case and metrics
