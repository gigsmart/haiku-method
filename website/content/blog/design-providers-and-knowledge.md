---
title: "Design Providers and Knowledge Synthesis"
description: "AI-DLC gains first-class integration with six design tools and a persistent knowledge system that gives agents institutional memory across features."
date: 2026-04-01
author: The Bushido Collective
---

Two features shipped today that address the same underlying problem from different angles: AI agents forget.

They forget what your design system looks like. They forget which component library you use. They forget that your team chose 8px spacing, not 4px. Every new intent starts from a blank slate, and the agent rediscovers — or reinvents — decisions that were already made.

Knowledge synthesis gives agents a snapshot of the project to build from. Design providers give them hands.

## The Amnesia Problem

AI-DLC's construction loop breaks work into intents and units, each running in focused context windows with clear completion criteria. This structure is load-bearing — it prevents the model from losing coherence across large tasks. But it also means that each new intent starts fresh. The agent that built your authentication flow last week and the agent building your dashboard today share no memory of what happened between them.

The practical consequences compound. Design tokens get reinvented with slightly different values. Component patterns diverge across features. API conventions drift. The codebase develops the signature of a project built by a rotating team with no shared documentation — because that is exactly what it is.

## Knowledge Synthesis

The `/ai-dlc:knowledge-synthesize` skill addresses this directly. It scans the codebase during elaboration and extracts structured knowledge artifacts — design tokens from CSS and theme files, component usage patterns from the UI layer, layout principles from existing screens, and the rationale behind decisions where it can be inferred.

The skill produces five artifact types: design, architecture, product, conventions, and domain. Each artifact is written to `.ai-dlc/knowledge/` and persists across intents. When the designer hat starts up, it loads design knowledge before creating anything. When the builder hat starts up, it loads technical patterns. When the reviewer hat evaluates output, it validates against established conventions.

The skill is a codebase scan — it reads existing files, extracts patterns, and writes a structured snapshot. It runs in two places: during elaboration (when starting a new intent) and after integration (when an intent completes and all units have been merged). The post-integrate refresh is what closes the loop for greenfield projects. Intent 1 builds the foundation — design tokens, component library, architecture. After integration passes, synthesis re-runs on the merged codebase and captures those patterns as knowledge artifacts. Intent 2 starts elaboration, finds real knowledge instead of empty scaffolds, and builds on what intent 1 established.

Knowledge has a shelf life. Each artifact carries a `last_updated` timestamp, and hats treat knowledge older than 90 days as potentially stale. If the knowledge says `--color-primary: #3B82F6` but the actual codebase has moved to `#2563EB`, the agent flags the discrepancy rather than blindly following the outdated record. Knowledge informs decisions but does not override what the code actually says today.

The skill is also maturity-aware. Greenfield projects get scaffold artifacts with empty sections — there is nothing to scan. Early projects get a shallow scan with low-confidence findings. Established projects get the full treatment: deep scans across 5-10 representative files per pattern, high-confidence artifacts that downstream hats can rely on.

## First-Class Design Providers

Knowledge synthesis solves the memory problem. Design providers solve the tool problem.

Previously, AI-DLC's relationship with design was indirect. Designs existed as screenshots in a folder. The agent analyzed them via vision, extracted specs, and built from those specs. The design tool itself — Figma, Canva, whatever the team uses — was external to the workflow. If the agent needed to create wireframes, it generated HTML. If it needed to compare built output against a design, it compared screenshots.

AI-DLC now integrates natively with six design tools: **Canva**, **Figma**, **OpenPencil**, **Pencil.dev**, **Penpot**, and **Excalidraw**. Each is supported through a capability-based provider abstraction that maps tool-specific MCP operations to a unified interface.

The integration touches three phases of the workflow:

**Elaboration.** When breaking an intent into units, the wireframe generation skill can now create wireframes directly in the team's design tool. If Canva is configured, it creates a Canva design. If OpenPencil is available, it produces an `.op` file. HTML wireframes remain the fallback when no provider is configured — existing behavior is fully preserved.

**Design.** The designer hat discovers the active provider at startup, loads its design tokens (brand colors, fonts, spacing from the tool's own system), and creates native design artifacts. A `design_ref` field in each unit's frontmatter points to the provider-native artifact — a `canva://design/abc123` URI, a `.ai-dlc/{intent}/designs/unit-01-login.op` file path, or a Figma file reference. The agent works in the tool, not around it.

**Review.** The reviewer hat resolves `design_ref` values to PNG exports for visual comparison. The resolution system handles provider URIs, local native files, and cloud-only references through a unified pipeline. When a provider-native design exists, the visual fidelity gate expects a closer match than it would for an HTML wireframe — the reference is higher quality, so the standard rises to match.

### Auto-Detection

When the design provider is set to `auto` (the default), AI-DLC detects which design MCP tools are available in the current session and selects the best provider based on a priority order. A team that has the Canva MCP connected gets Canva integration automatically. A team with OpenPencil gets OpenPencil. No configuration required — though explicit configuration is supported for teams that want to pin a specific tool.

### Graceful Degradation

This is the design principle that matters most: nothing breaks without a provider. Every path through the designer hat, the wireframe skill, and the visual review pipeline has a fallback that works exactly as it did before. HTML wireframes. Screenshot-based analysis. Text design specs. The provider integration adds capability on top of a fully functional baseline.

Teams adopt design providers when they are ready. The harness does not demand it.

## How They Work Together

The two features are complementary. Knowledge synthesis extracts design tokens from the codebase. Design providers load design tokens from the tool. When both exist, provider tokens take precedence — the tool is the authoritative source for the current state of the design system, while knowledge artifacts capture the broader context of how and why the system was designed that way.

A concrete example: your design knowledge artifact says the primary color is `#3B82F6` and documents that it was chosen for WCAG AA contrast compliance on white backgrounds. The Canva brand kit returns `#2563EB` — the design team updated it last week. The designer hat uses `#2563EB` (the provider's current value) and notes the discrepancy with the knowledge artifact, which can then be refreshed.

Knowledge provides the rationale. The provider provides the current state. Together, they give the agent both institutional memory and real-time accuracy.

## What This Means for Teams

For teams that already use a supported design tool, the design provider integration meets them where they work. Designers keep using Canva, Figma, or Penpot. The AI agent creates and reads designs in the same tool, using the same brand kit and design tokens. There is no export-screenshot-import loop. The harness speaks the tool's native language.

For teams building multiple features over time, knowledge synthesis means each new intent starts with a structured snapshot of the project as it exists today — design tokens, component patterns, domain terminology, architecture conventions — instead of the agent rediscovering all of it from scratch. The post-integrate refresh keeps this snapshot current automatically: every completed intent triggers a re-synthesis, so the knowledge always reflects the latest merged state.

Both features make the harness quieter. Less rediscovery. Less reinvention. Less drift. The agent spends its context budget on the work, not on figuring out what the project looks like.

---

*Built with discipline. Shipped with confidence.*
