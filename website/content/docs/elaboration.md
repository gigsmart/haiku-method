---
title: Inception & Planning
description: What to expect during H·AI·K·U inception — the collaborative phase where you define what to build
order: 3
---

Inception is the first phase of any H·AI·K·U intent. It's where you and the AI collaboratively define *what* to build, *why* it matters, and *how you'll know it's done*. Run `/haiku:start` to start.

## What Inception Produces

By the end of inception, you'll have a set of spec files in `.haiku/{intent-slug}/`:

| File | Purpose |
|------|---------|
| `intent.md` | Problem statement, solution approach, domain model, success criteria |
| `unit-01-*.md` | First unit -- self-contained piece of work with its own spec |
| `unit-02-*.md` | Additional units (for complex intents) |
| `discovery.md` | Technical exploration findings -- API schemas, codebase patterns, data sources |
| `mockups/` | Wireframes for frontend/design units (if applicable) |

These files are the contract that the execution phase (`/haiku:resume`) builds against.

## The Flow

Inception has several phases. Here's what to expect as a user -- the phases where *you* participate vs what happens automatically.

### 1. Describe What You Want

The AI asks: **"What do you want to build?"**

Give a natural language description. It doesn't need to be formal -- just explain the problem and what you want. The more context you provide upfront, the fewer clarifying questions you'll get.

### 2. Clarify Requirements

The AI asks **2-4 targeted questions** about your intent. These aren't generic checklists -- they're specific to what you described. Expect questions about:

- The specific problem and who it affects
- Systems, APIs, or data sources involved
- Key constraints (performance, security, compliance)
- What success looks like to you

### 3. Domain Discovery (Automatic)

The AI explores your codebase and external systems autonomously. This happens in the background -- you don't need to do anything. Discovery examines:

- **Existing code** -- architecture, patterns, conventions, related implementations
- **APIs and data sources** -- schema introspection, sample data, available fields
- **External docs** -- library documentation, API references, best practices
- **Deployment and monitoring** -- existing infrastructure, observability patterns, operational procedures
- **Quality tooling** -- test runners, linters, type checkers that become quality gates

For established projects, discovery also bootstraps the **knowledge layer** -- structured artifacts capturing your project's design language, architecture patterns, and domain model.

After discovery, the AI presents a **domain model** showing the key entities, relationships, and data sources it found. You confirm it's accurate or point out gaps.

If monitoring patterns were discovered and your intent has a deployment surface, the AI confirms the monitoring approach with you at this point.

### 4. Design Direction (New Projects Only)

For greenfield or early-stage projects, the AI presents a **design direction picker** where you select a visual archetype and tune parameters like density, color temperature, and typographic contrast. This seeds the project's design knowledge for consistent visual output. Established projects skip this step.

### 5. Studio Selection

The AI recommends a studio based on your intent and shows all available options. A studio defines the stage pipeline your intent will flow through:

| Studio | Stages | Best For |
|--------|--------|----------|
| Software (default) | Development | Most implementation work |
| Software (multi-stage) | Design -> Product -> Development | Cross-functional features |
| Ideation | Research -> Create -> Review -> Deliver | Content and research work |

Each stage has its own set of hats that define the work focus. For example, the development stage uses Planner -> Builder -> Reviewer, while the design stage uses Designer -> Design Reviewer.

You pick the studio. Individual units can override specific behavior if needed.

### 6. Success Criteria

The AI proposes **3-7 verifiable success criteria** based on the domain model and your requirements. You review and adjust. Each criterion must be:

- **Specific** -- unambiguous
- **Measurable** -- programmatically verifiable
- **Testable** -- you can write a test for it

The AI also asks about non-functional requirements (performance targets, security needs, accessibility level) and adds those as criteria.

### 7. Unit Elaboration

For complex intents, the AI breaks the work into **units** -- independent pieces with clear boundaries. Each unit has:

- A description tied to the domain model
- Its own success criteria
- Dependency edges (what must be built first)
- A discipline (frontend, backend, design, etc.)

You review each unit individually and approve, request changes, or ask for a rethink.

Simple intents (single concern, single area of code) get a single unit -- no elaboration needed.

### 8. Git Strategy

Two questions about how work will be delivered:

1. **Delivery strategy** -- One PR for the whole intent, individual PRs per unit, or direct to main
2. **Source branch** -- Build from the default branch or your current branch

These are per-intent decisions. For project-level defaults, configure them in `/haiku:setup`.

### 9. Quality Gates

The AI shows quality gates it detected from your project tooling (test runners, linters, type checkers). You confirm which ones to enforce during execution. Gates are *hard* -- the AI cannot stop building until all gates pass.

### 10. Spec Review (Automatic)

Two automated reviews run without your input:

1. **Spec review** -- checks for completeness, consistency, and YAGNI violations
2. **Adversarial review** -- probes for missing error paths, circular dependencies, spec gaps

High-confidence fixes are auto-applied. Remaining findings are presented for your decision.

### 11. Handoff

Inception is done. You choose what happens next:

- **Run** -- start the autonomous stage pipeline immediately
- **Open PR** -- create a spec review PR for your team before building

## Customizing Inception

### Project-Level Customization

Create `.haiku/ELABORATION.md` in your project to provide standing context for every inception session -- domain knowledge, required discovery areas, compliance requirements, team conventions.

### Settings (`/haiku:setup`)

These project-level settings affect inception behavior:

| Setting | Effect |
|---------|--------|
| `default_announcements` | What formats to generate on completion (changelog, release notes, etc.) |
| `default_studio` | Which studio to use by default for new intents |
| `visual_review` | Use browser-based review UI at inception gates |
| `granularity` | How finely to elaborate units (coarse / standard / fine) |
| Providers | Ticketing, spec, design, and comms integrations |

### Autonomous Mode

When invoked via `/haiku:autopilot`, inception runs with minimal interaction -- making reasonable defaults instead of asking questions. It only pauses for genuine ambiguity, spec contradictions, or unfixable review findings.

## Tips

- **Be specific upfront.** The more detail you give in Step 1, the fewer clarifying questions the AI needs to ask.
- **Push back on criteria.** If a proposed criterion is vague ("code is clean") or out of scope, say so. Criteria drive everything downstream.
- **Review domain models carefully.** A wrong domain model means wrong unit specs, which means building the wrong thing. This is the most important checkpoint.
- **Use `/haiku:start {slug}`** to modify an existing intent that hasn't started execution yet.
- **Use `/haiku:followup`** to create an iteration intent that builds on a completed one.

## What Happens After Inception

After inception, the typical flow is:

1. **Run** (`/haiku:resume`) -- autonomous stage pipeline: stages execute their hat sequences per unit
2. **Integration** -- cross-unit validation after all units complete
3. **Pre-delivery review** -- full-diff, multi-agent code review before PR creation
4. **PR creation** -- push and open a pull request

The **pre-delivery review** (`/haiku:review`) deserves special mention. It runs specialized review agents in fresh contexts against the full diff -- catching issues that the per-unit reviewer might miss because it only saw one unit at a time. It reads your project's `REVIEW.md` and `CLAUDE.md` for project-specific review rules, and auto-fixes issues in a loop before the PR is created.

You can also run `/haiku:review` standalone -- after `/haiku:quick`, or on any branch before pushing -- to catch issues before they hit external CI or review bots.

## Next Steps

- [Core Concepts](/docs/concepts/) -- Understand intents, units, stages, and bolts
- [Studios & Stages](/docs/studios/) -- Learn about studios and their stage pipelines
- [CLI Reference](/docs/cli-reference/) -- Full command reference
- [First Intent Checklist](/docs/checklist-first-intent/) -- Step-by-step walkthrough
