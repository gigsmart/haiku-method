---
title: "Adopting Existing Features"
description: "H·AI·K·U now supports reverse-engineering existing codebases into structured intent artifacts, enabling brownfield systems to participate in the full lifecycle."
date: 2026-03-30
author: GigSmart
---

H·AI·K·U had a greenfield problem. Every entry point assumed you were building something new.

`/haiku:start` starts from a blank intent and walks you through specification, elaboration, and planning for work that does not exist yet. `/haiku:followup` iterates on a previous intent — but only one that was originally built through H·AI·K·U, with artifacts already on disk. If your team adopted H·AI·K·U after years of shipping software the traditional way, those existing features were invisible to the methodology. No intent files. No unit specs. No operational plans. No way to run `/haiku:operate auth-system` because the system had never heard of `auth-system`.

This is the brownfield gap. Most real teams are not starting from zero. They have authentication systems, billing pipelines, notification services — production features with real users, real tests, and real operational history. Telling those teams "H·AI·K·U works great, but only for the next thing you build" is not a serious answer.

`/haiku:adopt` closes the gap.

## What Adopt Does

Adopt reverse-engineers an existing feature into complete H·AI·K·U artifacts — intent, units, discovery, operational plans — without modifying a single line of production code. The feature already works. The code is already deployed. Adopt does not rebuild it. It documents it in the structured format that the rest of the lifecycle expects.

The result is a set of artifacts that look exactly like what `/haiku:elaborate` would have produced if the feature had been built through the methodology from the start. Every unit has completion criteria. Every criterion references traceable evidence — a specific test file, a CI check, a deployment configuration. Every artifact is marked `status: completed`, because there is no construction phase. The code exists. The work is done. What was missing was the structure.

## The Seven-Phase Workflow

Adopt runs through seven phases with interactive confirmation gates at each boundary.

**Phase 1: Gather.** The user describes the feature — what it does, where the code lives, what matters operationally. This is a conversation, not a form. The system needs enough context to know where to look.

**Phase 2: Explore.** Five parallel subagents fan out across the codebase, each analyzing a different dimension of the feature:

| Explorer | What It Analyzes |
|---|---|
| Code path | Entry points, module boundaries, dependency graph, architectural patterns |
| Git history | Commit patterns, authorship, evolution timeline, refactoring history |
| Test suite | Test files, coverage patterns, assertion strategies, edge cases exercised |
| CI configuration | Build steps, test commands, quality gates, deployment triggers |
| Deployment surface | Infrastructure, environment configuration, runtime dependencies, observability |

These run concurrently. The parallelism is not cosmetic — each explorer operates in its own context, focused on a single analytical lens, producing findings that the later phases synthesize. Running them sequentially would multiply wall-clock time for no benefit.

**Phase 3: Propose.** The system synthesizes explorer findings into a proposed intent with elaborated units. The user reviews the proposed structure — are the unit boundaries sensible? Does the elaboration match how the team thinks about the feature? This is the first confirmation gate.

**Phase 4: Criteria.** Success criteria are reverse-engineered from the test suite and CI configuration. Each criterion points to concrete evidence: "Authentication rejects expired tokens" references `test/auth/token_expiry_test.ts`. "Rate limiting enforces per-user quotas" references `test/middleware/rate_limit_test.ts` and the CI step that runs load tests. The criteria are not invented — they are extracted from what the codebase already proves about itself. The user reviews and approves.

**Phase 5: Operational plan.** The system generates an operational plan covering monitoring, incident response, scaling considerations, and maintenance patterns — derived from the deployment surface analysis. The user reviews and approves.

**Phase 6: Write.** Artifacts are written to `.haiku/intents/{slug}/` in the standard format. Intent file, unit files, discovery notes, operational plan. All units are marked completed.

**Phase 7: Handoff.** The system confirms what was created and explains what is now available. The adopted feature is a first-class citizen.

## Why Completed Status Matters

Every artifact adopt produces is `status: completed`. This is not a technicality — it is the core design decision.

Adopt does not create work. It creates structure around work that is already done. If adopt generated units with `status: active`, the execution loop would try to build them. There is nothing to build. The code exists. The tests pass. Setting completed status tells the rest of the methodology: this feature is real, it is documented, and it is ready for operations.

This is what enables the two capabilities that motivated adopt in the first place. `/haiku:operate auth-system` works because the intent exists, the operational plan exists, and the status says the feature is live. `/haiku:followup auth-system` works because there is a completed intent to iterate on — the system knows what was built, what the criteria were, and what evidence supports them.

## From Greenfield Tool to Full Lifecycle

Adopt transforms H·AI·K·U from a methodology that only covers new work into one that encompasses the full lifecycle of a software system. New features enter through `/elaborate`. Existing features enter through `/adopt`. Both produce the same artifact structure, participate in the same operational workflows, and support the same iteration patterns.

This matters because no methodology survives contact with a real codebase if it cannot account for what already exists. Teams do not start from zero. They start from years of accumulated decisions, shipped features, and operational knowledge. A lifecycle methodology that ignores all of that is a toy. One that can absorb it and bring it under governance is a tool.

The brownfield gap is closed. Every feature — whether built yesterday through H·AI·K·U or built three years ago by hand — can participate in the full lifecycle.

---

*Built with discipline. Shipped with confidence.*
