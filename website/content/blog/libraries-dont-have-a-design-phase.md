---
title: "Libraries Don't Have a Design Phase"
description: "Splitting the one-size-fits-all software studio into four product-family lifecycles — and why forcing a library through a UX design sprint was telling us something we didn't want to hear."
date: 2026-04-12
---

For a long time, H·AI·K·U had one studio for "software." You'd kick off an intent to build a logging library and the lifecycle would helpfully route you through a product discovery phase and a UX design phase on your way to writing code. You'd stare at the prompt. "What's the user journey for `log.info()`?" Nobody wants to answer that question because it's not a real question.

We were telling ourselves it was fine. Every stage is "optional-ish." You can skip phases. You can customize. The template is just a starting point.

That's the thing about a template that needs to be skipped half the time — it's not a template, it's a bad fit pretending to be universal.

## The shape of the mismatch

The software studio's stages were: inception, product, design, development, security, operations. Beautiful for a web app. Works fine for a SaaS backend. Reasonable for a mobile app. Actively wrong for anything else.

A library doesn't have a "product" phase because the API is the product. There's no separate discovery step where you figure out what users want — consumers want functions with well-chosen signatures and an error model they can reason about. Slot that into the "design" stage and you'll get mockups for a thing that has no UI. The template fought us.

A game doesn't have a "development" phase that ends with a PR merge. Game development has a prototype gate — a binary "is this fun" question that has to be answered before you commit production resources to content. Skip the prototype gate and you build six months of assets for a core loop that doesn't work. The game industry already named this problem ("the prototype trap") and built a stage just for it. Our software studio had no room for that stage.

Hardware doesn't have an "operations" phase at the end. It has a *manufacturing* phase, which happens exactly once, is enormously expensive, and whose main risk is that the FCC decides you didn't do the compliance work upstream. Compliance isn't a checkbox you add later. It constrains the schematic, the firmware, and the BOM. The software studio's vague "security" stage, bolted on near the end, was a category error for hardware.

So we had a shape that only fit apps. And we'd been trying to convince ourselves that the shape was "flexible enough" for everything else.

## Lifecycles, not roles

Here's what I missed for a long time. Specialization in AI-assisted workflows isn't about *roles*. It's about *lifecycles*.

The software industry spent decades arguing about roles. "Full-stack or specialist?" "Product manager or product engineer?" "Where does QA fit?" Most of that debate assumed a fixed lifecycle: requirements → design → build → test → ship → operate. What changed between arguments was who sits in which chair.

When the implementation bottleneck collapses — when an AI can write the code, draft the spec, sketch the wireframe, and run the tests — the role question matters less. What matters is whether the *lifecycle* you're running matches the artifact you're making.

A library is not a product that happens to be a library. It's a contract with consumers who will depend on it for years. Its lifecycle is API-shape-driven, not user-journey-driven.

A game is not an app that happens to be fun. It's an experience whose validation has to happen against real players before you scale content. Its lifecycle needs a fun-gate, and polish isn't "we'll clean it up later" — it's where games become great.

A hardware product is not a software product with a casing. It's a one-shot manufacturing commitment with regulatory constraints that touch every layer. Its lifecycle has to front-load compliance because retrofits cost 10x.

Different lifecycles. Same orchestration machinery underneath — same FSM, same review gates, same quality enforcement, same persistence. But the stage sequence, the artifacts produced at each stage, the review agents, the review-gate shapes: those come from the artifact, not the tooling.

## Four studios, not one

So `software` became `application-development` (slug `appdev`, alias `software` for back-compat), and three siblings moved in next to it:

- **`appdev`** stays the default for apps: inception → product → design → development → security → operations. What you actually want when you're building a thing with users clicking on it.
- **`libdev`** is inception → development → security → release. Inception folds in the API surface because that's where the contract lives. Release publishes to a registry; there's no on-call rotation.
- **`gamedev`** is concept → prototype → production → polish → release. Concept absorbs inception because a game pitch and market fit are the same conversation. Prototype is a hard gate — fun or bust. Polish gets its own stage because "tune later" has never once produced a game that felt great.
- **`hwdev`** is inception → requirements → design → firmware → validation → manufacturing. Requirements captures compliance upfront because the FCC doesn't care when you noticed. Validation has its own external-await gate because cert labs are on their own clock. Manufacturing is one-shot.

The existing `software` directory stays put on disk. Intents with `studio: software` still resolve cleanly — aliases are indexed alongside canonical names and slugs, so you never have to migrate anything. You can type `appdev`, `application-development`, or `software`. All three land in the same place.

## The principle

Here's the takeaway, if you're designing AI-assisted workflows of your own:

**Don't force one lifecycle on every product shape.** Specialization in AI-assisted work happens at the lifecycle layer, not the role layer. The same orchestration machinery can drive every studio — same FSM, same gates, same quality enforcement. What changes is the *sequence* and the *artifacts* each stage produces, because those come from the thing you're building, not the tools you're using.

When your template starts needing "skip this phase" instructions, the template is telling you something. Libraries don't have a design phase. Games don't have a development-that-ends-at-deploy phase. Hardware doesn't have an operations phase at the end. Build each lifecycle for what it actually is.

Everything else is retrofit.
