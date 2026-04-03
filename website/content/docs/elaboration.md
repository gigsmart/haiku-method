---
title: Elaboration Guide
description: What to expect during AI-DLC elaboration — the collaborative phase where you define what to build
order: 3
---

Elaboration is the first phase of any AI-DLC intent. It's where you and the AI collaboratively define *what* to build, *why* it matters, and *how you'll know it's done*. Run `/ai-dlc:elaborate` to start.

## What Elaboration Produces

By the end of elaboration, you'll have a set of spec files in `.ai-dlc/{intent-slug}/`:

| File | Purpose |
|------|---------|
| `intent.md` | Problem statement, solution approach, domain model, success criteria |
| `unit-01-*.md` | First unit — self-contained piece of work with its own spec |
| `unit-02-*.md` | Additional units (for complex intents) |
| `discovery.md` | Technical exploration findings — API schemas, codebase patterns, data sources |
| `mockups/` | Wireframes for frontend/design units (if applicable) |

These files are the contract that the execution phase (`/ai-dlc:execute`) builds against.

## The Flow

Elaboration has several phases. Here's what to expect as a user — the phases where *you* participate vs what happens automatically.

### 1. Describe What You Want

The AI asks: **"What do you want to build?"**

Give a natural language description. It doesn't need to be formal — just explain the problem and what you want. The more context you provide upfront, the fewer clarifying questions you'll get.

### 2. Clarify Requirements

The AI asks **2-4 targeted questions** about your intent. These aren't generic checklists — they're specific to what you described. Expect questions about:

- The specific problem and who it affects
- Systems, APIs, or data sources involved
- Key constraints (performance, security, compliance)
- What success looks like to you

### 3. Domain Discovery (Automatic)

The AI explores your codebase and external systems autonomously. This happens in the background — you don't need to do anything. Discovery examines:

- **Existing code** — architecture, patterns, conventions, related implementations
- **APIs and data sources** — schema introspection, sample data, available fields
- **External docs** — library documentation, API references, best practices
- **Deployment and monitoring** — existing infrastructure, observability patterns, operational procedures
- **Quality tooling** — test runners, linters, type checkers that become quality gates

For established projects, discovery also bootstraps the **knowledge layer** — structured artifacts capturing your project's design language, architecture patterns, and domain model.

After discovery, the AI presents a **domain model** showing the key entities, relationships, and data sources it found. You confirm it's accurate or point out gaps.

If monitoring patterns were discovered and your intent has a deployment surface, the AI confirms the monitoring approach with you at this point.

### 4. Design Direction (New Projects Only)

For greenfield or early-stage projects, the AI presents a **design direction picker** where you select a visual archetype and tune parameters like density, color temperature, and typographic contrast. This seeds the project's design knowledge for consistent visual output. Established projects skip this step.

### 5. Workflow Selection

The AI recommends a workflow based on your intent and shows all available options:

| Workflow | Hat Sequence | Best For |
|----------|-------------|----------|
| Default | Planner → Builder → Reviewer | Most implementation work |
| Design | Planner → Designer → Reviewer | UI/UX design work |
| TDD | Test Writer → Implementer → Refactorer → Reviewer | High-correctness code |
| Adversarial | Planner → Builder → Red Team → Blue Team → Reviewer | Security-sensitive work |

You pick one. Individual units can override the intent-level workflow if needed.

### 6. Success Criteria

The AI proposes **3-7 verifiable success criteria** based on the domain model and your requirements. You review and adjust. Each criterion must be:

- **Specific** — unambiguous
- **Measurable** — programmatically verifiable
- **Testable** — you can write a test for it

The AI also asks about non-functional requirements (performance targets, security needs, accessibility level) and adds those as criteria.

### 7. Unit Decomposition

For complex intents, the AI breaks the work into **units** — independent pieces with clear boundaries. Each unit has:

- A description tied to the domain model
- Its own success criteria
- Dependency edges (what must be built first)
- A discipline (frontend, backend, design, etc.)

You review each unit individually and approve, request changes, or ask for a rethink.

Simple intents (single concern, single area of code) get a single unit — no decomposition needed.

### 8. Git Strategy

Two questions about how work will be delivered:

1. **Delivery strategy** — One PR for the whole intent, individual PRs per unit, or direct to main
2. **Source branch** — Build from the default branch or your current branch

These are per-intent decisions. For project-level defaults, configure them in `/ai-dlc:setup`.

### 9. Quality Gates

The AI shows quality gates it detected from your project tooling (test runners, linters, type checkers). You confirm which ones to enforce during execution. Gates are *hard* — the AI cannot stop building until all gates pass.

### 10. Spec Review (Automatic)

Two automated reviews run without your input:

1. **Spec review** — checks for completeness, consistency, and YAGNI violations
2. **Adversarial review** — probes for missing error paths, circular dependencies, spec gaps

High-confidence fixes are auto-applied. Remaining findings are presented for your decision.

### 11. Handoff

Elaboration is done. You choose what happens next:

- **Execute** — start the autonomous build loop immediately
- **Open PR** — create a spec review PR for your team before building

## Customizing Elaboration

### Project-Level Customization

Create `.ai-dlc/ELABORATION.md` in your project to provide standing context for every elaboration session — domain knowledge, required discovery areas, compliance requirements, team conventions.

### Settings (`/ai-dlc:setup`)

These project-level settings affect elaboration behavior:

| Setting | Effect |
|---------|--------|
| `default_announcements` | What formats to generate on completion (changelog, release notes, etc.) |
| `default_passes` | Cross-functional iteration passes (design → product → dev) |
| `visual_review` | Use browser-based review UI at elaboration gates |
| `granularity` | How finely to decompose units (coarse / standard / fine) |
| Providers | Ticketing, spec, design, and comms integrations |

### Autonomous Mode

When invoked via `/ai-dlc:autopilot`, elaboration runs with minimal interaction — making reasonable defaults instead of asking questions. It only pauses for genuine ambiguity, spec contradictions, or unfixable review findings.

## Tips

- **Be specific upfront.** The more detail you give in Step 1, the fewer clarifying questions the AI needs to ask.
- **Push back on criteria.** If a proposed criterion is vague ("code is clean") or out of scope, say so. Criteria drive everything downstream.
- **Review domain models carefully.** A wrong domain model means wrong unit specs, which means building the wrong thing. This is the most important checkpoint.
- **Use `/ai-dlc:elaborate {slug}`** to modify an existing intent that hasn't started execution yet.
- **Use `/ai-dlc:followup`** to create an iteration intent that builds on a completed one.

## What Happens After Elaboration

After elaboration, the typical flow is:

1. **Execute** (`/ai-dlc:execute`) — autonomous build loop: Planner → Builder → Reviewer per unit
2. **Integration** — cross-unit validation after all units complete
3. **Pre-delivery review** — full-diff, multi-agent code review before PR creation
4. **PR creation** — push and open a pull request

The **pre-delivery review** (`/ai-dlc:review`) deserves special mention. It runs specialized review agents in fresh contexts against the full diff — catching issues that the per-unit reviewer might miss because it only saw one unit at a time. It reads your project's `REVIEW.md` and `CLAUDE.md` for project-specific review rules, and auto-fixes issues in a loop before the PR is created.

You can also run `/ai-dlc:review` standalone — after `/ai-dlc:quick`, or on any branch before pushing — to catch issues before they hit external CI or review bots.

## Next Steps

- [Core Concepts](/docs/concepts/) — Understand intents, units, hats, and bolts
- [Workflows](/docs/workflows/) — Learn about the four named workflows
- [First Intent Checklist](/docs/checklist-first-intent/) — Step-by-step walkthrough
