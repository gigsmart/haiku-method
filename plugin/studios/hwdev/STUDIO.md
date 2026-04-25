---
name: hardware-development
slug: hwdev
description: Lifecycle for hardware products — electronics, firmware, manufacturing
stages: [inception, requirements, design, firmware, validation, manufacturing]
category: engineering
default_model: sonnet
---

# Hardware Development

Lifecycle for hardware products. Unlike application development, hardware has
physical constraints, safety regulations, one-shot manufacturing tooling, and
a cost structure where late changes are orders of magnitude more expensive
than early ones.

Inception is market research (same shape as application development).
Requirements captures functional, safety, and regulatory constraints upfront
because they shape every downstream decision and cannot be retrofitted.

The design stage uses [tscircuit](https://tscircuit.com) as the EDA platform —
schematics and PCB layouts are authored as TypeScript/React (`.tsx`) circuit
code, previewed live via `tsci dev`, and exported to Gerbers, pick-and-place,
and BOM files for manufacturing. This keeps electronics design diff-able,
reviewable in a pull request, and reproducible from source.
