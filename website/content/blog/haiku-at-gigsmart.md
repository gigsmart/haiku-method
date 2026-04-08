---
title: "How GigSmart's Team Works with AI Using H·AI·K·U"
date: 2026-04-07
author: Jason Waldrip
description: A look at how H·AI·K·U — built by the Bushido Collective and battle-tested at GigSmart — brings structure and quality to human-AI collaboration.
---

# How GigSmart's Team Works with AI Using H·AI·K·U

*By Jason Waldrip, CTO at GigSmart and Partner at The Bushido Collective*

H·AI·K·U didn't start as H·AI·K·U. It started as an idea in an AWS research paper about AI-assisted development lifecycles. That paper planted a seed: what if AI agents had structure — not just prompts, but a lifecycle with phases, quality gates, and human checkpoints?

In 2026, [Chris Driscol](https://github.com/cdriscol), [Josh Elliott](https://github.com/jcelliott), [Craig McDonald](https://github.com/thrackle), and I took those concepts and built a working implementation we called AI-DLC. We added hat-based behavioral roles, completion criteria as exit conditions, backpressure over prescription, and files as memory. It was developer-focused and it worked — but only for software.

Then came the realization: the patterns aren't specific to code. Legal review, marketing campaigns, incident response — they all follow the same shape. H·AI·K·U (Human + AI Knowledge Unification) universalized the framework with twenty domain-specific studios, all running on the same orchestration machinery. It's no longer just for developers — it's for everyone.

GigSmart became the proving ground for all three generations.

## The Problem

GigSmart is a workforce marketplace platform built on Elixir/Phoenix with dozens of services, complex billing logic, and real-time worker-to-gig matching. Our team was using AI tools across the organization — engineering, product, operations — but without structure, the results were unpredictable:

- **The AI worked for us, not with us** — it generated outputs but didn't understand our constraints, our architecture, or our standards
- **No shared understanding** — the AI and the human had different mental models of what "done" looked like
- **Quality was an afterthought** — generated work went through review after the fact, catching problems instead of preventing them
- **Knowledge evaporated** — what the AI learned during one task was gone by the next session

The core issue wasn't speed. We could generate code, docs, and plans quickly. The issue was trust. We couldn't trust the output without heavy human review that often undid the time savings.

## The Insight

**The AI shouldn't manage its own lifecycle.** That's the single idea that changed everything.

Instead of asking the AI to plan, execute, and review its own work, H·AI·K·U separates the concerns. A finite state machine drives the workflow. The AI follows the actions. Humans review at meaningful boundaries. No one — human or AI — can skip steps.

This isn't about slowing things down. It's about making every step count. When the AI knows what stage it's in, what hat it's wearing, and what criteria define "done," the output quality goes up dramatically. And when the human reviews at gate boundaries instead of reviewing everything, the collaboration becomes sustainable.

## What Changed at GigSmart

**Before H·AI·K·U:**
- Someone describes what they need → AI generates output → review catches problems → iterate

**After H·AI·K·U:**
- Intent created → inception understands the problem → design produces wireframes → product defines behavioral specs → development implements with structured quality → operations and security verify → delivery

Every stage has its own hats (behavioral roles), review agents (adversarial checks), and gates (human approval points). The state machine enforces the sequence. The AI can't skip inception and jump to code. The human doesn't have to review everything — just the gate boundaries.

### What We Gained

- **Shared understanding** — inception and product stages ensure the AI and the team agree on what "done" means before work begins
- **Design as input, not afterthought** — wireframes and mockups happen before implementation, informed by design tokens and existing systems
- **Structured quality** — adversarial review agents challenge the work from multiple perspectives before a human ever sees it
- **Persistent knowledge** — discovery documents, specs, and decisions persist across sessions. The next intent starts where the last one left off.
- **Trust** — we can hand the AI a complex feature and know it will go through the right stages, not skip to the end

## Beyond Engineering

What makes H·AI·K·U universal is the studio system. GigSmart uses the software studio for engineering, but the same framework powers:

- **Documentation** — API docs and internal guides go through outline → draft → review → publish
- **Incident response** — triage → investigate → mitigate → resolve → postmortem
- **Product strategy** — discovery → user research → prioritization → roadmap → stakeholder review
- **Dev evangelism** — research → narrative → create → publish → measure

Each studio defines its own stages, hats, and review agents — but they all run on the same orchestration. The pattern is universal: understand, plan, execute with quality gates, review, deliver.

## The Philosophy

H·AI·K·U is built on three principles:

1. **Backpressure over prescription** — don't tell the AI exactly how to do the work; set quality gates that catch bad output and let the AI figure out the approach
2. **Completion criteria enable autonomy** — when "done" is defined precisely, the AI can work independently within those bounds
3. **Files are memory** — everything the AI learns is written to disk. If the session ends, the knowledge survives. No context window dependency.

These aren't just engineering principles. They apply to any domain where humans and AI collaborate on structured work.

## What's Next

We're continuing to push H·AI·K·U forward:

- **Blocker tracking** — first-class management of stakeholder-dependent work
- **Session replay** — event logs that can replay an intent's journey for demos and retrospectives
- **More studios** — every team at GigSmart that works with AI is a candidate for a purpose-built studio

If your team is working with AI and finding that the outputs are inconsistent, the quality is unpredictable, or the collaboration feels one-sided — H·AI·K·U might be what you need. Not to go faster, but to go together.

---

*Born at [The Bushido Collective](https://thebushido.co). Battle-tested at [GigSmart](https://gigsmart.com). Available at [haikumethod.ai](https://haikumethod.ai).*
