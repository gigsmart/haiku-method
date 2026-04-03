---
title: Team Onboarding Checklist
description: Step-by-step checklist for onboarding a team to AI-DLC
order: 22
---

This checklist guides you through onboarding an entire team to AI-DLC. It's designed for tech leads and engineering managers.

## Prerequisites

Before starting team onboarding:

### Champion Readiness
- [ ] Champion identified (experienced AI-DLC user)
- [ ] Champion has completed 5+ units personally
- [ ] Champion has used multiple workflow types
- [ ] Champion can answer common questions
- [ ] Champion has time allocated for supporting team

### Team Readiness
- [ ] All team members have Claude Code access
- [ ] Team has capacity for learning curve (not in crunch)
- [ ] Management supports the adoption
- [ ] Team is aware AI-DLC is coming

### Project Readiness
- [ ] Identified first project for team adoption
- [ ] Project is low-risk (not critical path)
- [ ] Project has clear requirements
- [ ] Project is appropriately sized (2-4 sprints)

---

## Phase 1: Setup (Pre-Introduction)

### Documentation Preparation
- [ ] AI-DLC documentation shared with team
- [ ] Team conventions document drafted
- [ ] Example intent prepared (from team's domain)
- [ ] FAQ document ready (anticipate questions)

### Tooling Setup
- [ ] All team members can install the plugin
- [ ] Any team-specific configuration documented
- [ ] Slack channel or communication channel for AI-DLC questions

### Scheduling
- [ ] Team introduction session scheduled (60-90 min)
- [ ] Pair programming sessions scheduled with each team member
- [ ] Check-in meetings scheduled (weekly for first sprint)

---

## Phase 2: Team Introduction

### The Introduction Session

**Agenda (60 minutes):**

- [ ] **Why AI-DLC** (10 min)
  - [ ] Problem statement covered
  - [ ] Benefits explained
  - [ ] Connection to team's work made clear

- [ ] **Live Demo** (20 min)
  - [ ] Champion demonstrates end-to-end
  - [ ] Used realistic example from team's domain
  - [ ] All four hats demonstrated

- [ ] **Q&A** (20 min)
  - [ ] Questions answered
  - [ ] Concerns acknowledged
  - [ ] Skeptics addressed respectfully

- [ ] **Next Steps** (10 min)
  - [ ] Pair programming schedule shared
  - [ ] First project identified
  - [ ] Support resources explained

### Post-Introduction
- [ ] Recording shared (if applicable)
- [ ] Documentation links sent
- [ ] Questions from session addressed in writing
- [ ] Pair programming schedule confirmed

---

## Phase 3: Pair Programming

For each team member:

### Session Preparation
- [ ] Task selected for pair session
- [ ] Task is appropriate size (1-2 hours)
- [ ] Champion has prepared context
- [ ] Team member has environment ready

### During the Session
- [ ] Champion drives first, team member observes
- [ ] Explain each hat transition
- [ ] Point out key decision moments
- [ ] Answer questions as they arise

- [ ] Switch roles - team member drives
- [ ] Champion provides guidance as needed
- [ ] Let team member make decisions
- [ ] Correct gently when off-track

### After the Session
- [ ] Debrief: What went well? What was confusing?
- [ ] Schedule follow-up if needed
- [ ] Team member has clear next step

### Pair Programming Tracker

| Team Member | Session Scheduled | Session Complete | Independent Ready |
|-------------|-------------------|------------------|-------------------|
| __________ | [ ] | [ ] | [ ] |
| __________ | [ ] | [ ] | [ ] |
| __________ | [ ] | [ ] | [ ] |
| __________ | [ ] | [ ] | [ ] |
| __________ | [ ] | [ ] | [ ] |

---

## Phase 4: Independent Work

### Establishing Independence

For each team member's first independent unit:

- [ ] Task assigned
- [ ] Team member starts independently
- [ ] Champion available but not watching
- [ ] Team member completes first unit
- [ ] Champion reviews completed unit

### First Sprint Checkpoints

**End of first week:**
- [ ] All team members have completed at least one independent unit
- [ ] Common questions documented
- [ ] No major blockers outstanding

**End of first sprint:**
- [ ] Team is using AI-DLC consistently
- [ ] Conventions are being followed
- [ ] Quality metrics baseline established

### Support Structure
- [ ] Slack channel active with questions
- [ ] Champion doing regular check-ins
- [ ] Weekly team sync includes AI-DLC discussion
- [ ] Issues being documented for improvement

---

## Phase 5: Conventions

### Convention Documentation

Document and share team agreements:

**File Organization:**
- [ ] Intent file location: ______________
- [ ] Unit naming convention: ______________
- [ ] Directory structure: ______________

**Workflow Selection:**
- [ ] When to use Default: ______________
- [ ] When to use TDD: ______________
- [ ] When to use Adversarial: ______________
- [ ] When to use Hypothesis: ______________

**Git/PR Integration:**
- [ ] Commit message format: ______________
- [ ] PR description template: ______________
- [ ] How units map to commits: ______________

**Quality Gates:**
- [ ] Required gates for all units: ______________
- [ ] Team-specific requirements: ______________

### Convention Review
- [ ] Conventions documented
- [ ] Team has reviewed conventions
- [ ] Conventions committed to repo
- [ ] New members know where to find them

---

## Phase 6: Integration

### Process Integration

**Daily Standups:**
- [ ] Format updated to include unit status
- [ ] Sample: "Working on unit-02, Builder hat, no blockers"
- [ ] Team is using new format

**Sprint Planning:**
- [ ] Features broken into intents during planning
- [ ] Unit estimation replacing/supplementing story points
- [ ] Dependencies captured in planning

**Pull Requests:**
- [ ] PR template includes intent/unit reference
- [ ] Reviewers checking criteria were met
- [ ] Link to unit files in PR description

**Retrospectives:**
- [ ] AI-DLC discussed in retros
- [ ] Feedback being collected
- [ ] Improvements being made

### Tool Integration (If Applicable)
- [ ] CI/CD aware of quality gates
- [ ] Dashboards track unit completion
- [ ] Metrics collection automated

---

## Phase 7: Metrics

### Baseline Metrics (Before AI-DLC)

Document current state for comparison:

| Metric | Current Value | Date |
|--------|---------------|------|
| Bug rate (per sprint) | _____ | _____ |
| PR revision rounds | _____ | _____ |
| Test coverage | _____ | _____ |
| Rework percentage | _____ | _____ |

### Tracking Metrics (After AI-DLC)

Track these during and after adoption:

**Adoption Metrics:**
- [ ] Participation rate tracking
- [ ] Unit completion tracking
- [ ] Workflow variety tracking

**Quality Metrics:**
- [ ] Bug rate comparison
- [ ] PR revision comparison
- [ ] Test coverage comparison

**Satisfaction Metrics:**
- [ ] Developer survey planned
- [ ] Survey completed
- [ ] Results analyzed

### Metrics Review
- [ ] Metrics reviewed at end of pilot period
- [ ] Comparison to baseline documented
- [ ] Decision made on continuing/expanding

---

## Phase 8: Support

### Ongoing Support Structure

- [ ] Champion continues availability
- [ ] Office hours scheduled (weekly or bi-weekly)
- [ ] Documentation kept up to date
- [ ] New learnings shared with team

### Handling Issues

**Common Issues Checklist:**
- [ ] "Too much overhead" → Review conventions, simplify where possible
- [ ] "Criteria unclear" → Run criteria writing workshop
- [ ] "Hat transitions awkward" → More practice, pair sessions
- [ ] "Quality not improving" → Review gate enforcement

### Escalation Path
- [ ] Champion handles most questions
- [ ] Tech lead handles process issues
- [ ] Manager handles resource/priority issues
- [ ] External community for hard problems

---

## Success Criteria

### Phase Completion Checklist

**Phase 1-2 (Setup & Introduction) Complete:**
- [ ] All team members attended introduction
- [ ] Documentation available to all
- [ ] Pair sessions scheduled

**Phase 3-4 (Training & Independence) Complete:**
- [ ] All team members completed pair session
- [ ] All team members completed independent unit
- [ ] Support structure working

**Phase 5-6 (Conventions & Integration) Complete:**
- [ ] Conventions documented and followed
- [ ] Process integration complete
- [ ] Team using AI-DLC consistently

**Phase 7-8 (Metrics & Support) Complete:**
- [ ] Metrics showing positive or neutral impact
- [ ] Support structure sustainable
- [ ] Team operating independently

### Team Onboarding Complete When:

- [ ] 100% of team has completed at least 3 independent units
- [ ] Team conventions documented and followed
- [ ] AI-DLC integrated with daily processes
- [ ] Quality metrics maintained or improved
- [ ] Positive developer feedback (>70%)
- [ ] Champion support no longer needed daily

---

## Templates

### Team Introduction Email

```
Subject: AI-DLC Introduction Session - [Date]

Team,

We're introducing AI-DLC, a structured methodology for AI-assisted development.

**What:** Team introduction session
**When:** [Date/Time]
**Where:** [Location/Link]
**Duration:** 60 minutes

Before the session:
- Read: [Link to AI-DLC docs]
- Install: Claude Code (if not already)

What to expect:
- Why we're adopting AI-DLC
- Live demo from [Champion]
- Q&A
- Next steps

See you there!
```

### Weekly Check-In Agenda

```
## AI-DLC Weekly Check-In

### Wins
- What went well this week?

### Challenges
- What was difficult?
- Any blockers?

### Questions
- Open questions needing answers

### Conventions
- Any conventions that need adjustment?

### Action Items
- [Who] [What] [By when]
```

### Developer Feedback Survey

```
## AI-DLC Feedback Survey

1. How comfortable are you with AI-DLC? (1-5)
2. Is AI-DLC improving your work quality? (Yes/No/Too early)
3. What's working well?
4. What's frustrating?
5. Would you recommend AI-DLC to another team? (1-10)
6. What would make AI-DLC better for you?
```

---

## Next Steps After Onboarding

- [ ] Schedule retrospective on adoption process
- [ ] Document lessons learned
- [ ] Plan for new team member onboarding
- [ ] Consider expanding to other teams
- [ ] Share success stories
