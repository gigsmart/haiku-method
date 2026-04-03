---
title: "First-Class Passes"
description: "H·AI·K·U now supports typed iteration through disciplinary lenses — design, product, dev — where each pass shapes how hats behave and which workflows are available."
date: 2026-03-31
author: The Bushido Collective
---

Software teams do not build features in a single pass. A designer produces mockups. A product manager writes behavioral specs. A developer implements code. Each discipline looks at the same unit of work through a different lens, producing different artifacts, applying different quality standards, and asking different questions.

H·AI·K·U now models this directly. Passes are first-class.

## What Was Missing

H·AI·K·U already had passes as a scheduling concept. You could declare `passes: [design, product, dev]` in an intent, and the DAG scheduler would sequence units accordingly — run design-tagged units first, then product, then dev. But scheduling was all passes did. A builder in a design pass behaved identically to a builder in a dev pass. The same workflows were available. The same instructions applied. The discipline label was cosmetic.

This meant that an agent working a design unit would produce production code instead of wireframes. A product pass builder would jump straight to implementation instead of writing behavioral specs. The system knew *when* to run each pass but not *how* each pass should shape the work.

## How Passes Work Now

A pass is a definition file — markdown with frontmatter — that declares what discipline it represents, which workflows are available, and instructions that get injected into every hat during construction.

The three built-in passes:

**Design** constrains work to visual and interaction artifacts. The builder produces wireframes, mockups, design tokens, and component specs. The reviewer checks consistency with existing design systems, accessibility standards, and responsive behavior. Production code is explicitly out of scope. Only the `design` workflow is available.

**Product** orients work toward behavioral specifications. The builder writes acceptance criteria, identifies edge cases, documents data contracts and state transitions. The reviewer verifies specs are precise enough for implementation without follow-up questions. The `default` and `bdd` workflows are available.

**Dev** targets tested, deployable code. The builder implements against specs and design artifacts from prior passes. The reviewer validates that implementation matches those artifacts and that every acceptance criterion has a passing test. All standard workflows — `default`, `tdd`, `adversarial`, `bdd` — are available.

Each pass constrains the workflows available to its units. A design unit cannot use the `tdd` workflow because test-driven development does not apply to mockups. A dev unit has the full workflow palette because implementation benefits from all of them. This is not arbitrary restriction — it is the system encoding discipline-specific knowledge about how work should be done.

## Augmentation, Not Override

Passes follow an augmentation pattern that applies equally to hats. The plugin's built-in definitions are canonical — they always load and are never replaced. When a project defines a pass or hat with the same name, those instructions are *appended* to the plugin definition. New names create entirely custom additions.

This matters because it prevents a project from accidentally breaking the methodology. A project can add "use our Figma component library for all mockups" to the design pass without losing the pass's core guidance about producing wireframes and checking accessibility. The built-in instructions are a floor, not a ceiling.

The same pattern applies to hats. A project's `builder.md` does not replace the plugin's builder — it extends it with project-specific context. This was a deliberate departure from the previous resolution pattern, where project hats could fully override plugin hats, causing unpredictable behavior when a project definition missed important guardrails.

## The Pass Loop

During elaboration, the system presents configured passes as a suggestion. The user confirms, reorders, or overrides them per intent. Single-pass dev-only remains the default — multi-pass is opt-in, because most work does not need three disciplinary iterations.

During execution, when all units in the active pass complete, the system notifies the user and stops. This is a deliberate boundary. Transitioning between passes often requires human judgment: did the design artifacts actually capture what we need? Are the behavioral specs precise enough? The system does not auto-advance because the transition between disciplines is where the most important decisions happen.

Pass-backs are also possible. If dev reveals that the design missed an interaction state, work can flow back to the design pass. The pass loop is not a one-way conveyor — it is a feedback cycle that supports the kind of iterative refinement real teams do naturally.

## Custom Passes

The three built-in passes are not a closed set. Projects can define custom passes by adding definition files to `.haiku/studios/{studio}/stages/`. A security-focused team might add a `security` pass that constrains work to threat modeling and penetration testing. A data team might add an `analytics` pass that focuses on instrumentation and metric validation. The pass system is extensible because disciplines are not universal.

Custom passes declare their own available workflows and default workflow, and their instructions inject into hats just like built-in passes. The settings schema accepts any string for `default_passes` — there is no hardcoded enum to maintain.

## Why This Matters

Passes encode something that hats alone cannot: the idea that the *same role* should behave differently depending on what discipline is driving the work. A builder is always a builder, but a builder producing wireframes thinks differently than a builder writing integration tests. A reviewer checking design consistency applies different standards than a reviewer checking test coverage.

Without passes, you get one of two failure modes. Either the agent defaults to dev behavior regardless of context — producing code when you wanted specs, writing tests when you wanted mockups — or you compensate by writing increasingly specific unit descriptions that manually replicate what the pass system now handles automatically.

Passes are the system understanding that building software involves multiple disciplines, each with their own standards, artifacts, and workflows. The agent does not just know *what* to build. It knows *how to think about it* at each stage.

---

*Built with discipline. Shipped with confidence.*
