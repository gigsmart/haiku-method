---
title: About H·AI·K·U
description: The evolution from AWS's AI-DLC paper to a universal lifecycle framework — built by the Bushido Collective, forged at GigSmart
order: 100
---

# About H·AI·K·U

*Born at The Bushido Collective. Battle-tested at GigSmart.*

![The Bushido Collective + GigSmart](/images/co-brand.svg)

## The Evolution

H·AI·K·U didn't appear overnight. It evolved through three distinct generations, each expanding the scope of what structured AI-assisted work could look like.

### Generation 1: The AWS Paper (AI-DLC)

It started with a research paper from AWS on AI-assisted development lifecycles. The paper introduced the core idea: AI agents need structure — not just prompts, but a lifecycle with phases, quality gates, and human checkpoints. The concepts were sound but theoretical. The paper was aimed at developers and focused exclusively on software engineering.

### Generation 2: AI-DLC 2026

[Jason Waldrip](https://github.com/jwaldrip), [Chris Driscol](https://github.com/cdriscol), [Josh Elliott](https://github.com/jcelliott), and [Craig McDonald](https://github.com/thrackle) took the AI-DLC concepts and built a working implementation. The 2026 paper expanded the original with practical patterns: hat-based behavioral roles, completion criteria as exit conditions, backpressure over prescription, and files as memory. It was battle-tested at [GigSmart](https://gigsmart.com) — a large Elixir/Phoenix platform with complex billing, real-time matching, and multi-tenant architecture. Still developer-focused, but now production-proven.

### Generation 3: H·AI·K·U (Human + AI Knowledge Unification)

The breakthrough was realizing that the lifecycle patterns weren't specific to software. Legal review, marketing campaigns, incident response, executive strategy, vendor management — they all follow the same shape: understand the problem, plan the work, execute with quality gates, review, and deliver.

H·AI·K·U universalized the framework with the **studio model**: named lifecycle templates that define stages, hats, and review gates for any domain. The software studio is one of twenty. The methodology is for everyone — not just developers.

## The Bushido Collective

The [Bushido Collective](https://thebushido.co) is a collective of senior engineers and technical leaders who build tools and practices for rigorous, repeatable AI-assisted work. H·AI·K·U is our primary project.

We believe:
- Single-pass human-AI collaboration is the ideal; multi-pass is a concession
- Quality comes from structure, not from hoping the AI gets it right
- The AI shouldn't manage its own lifecycle — a state machine should
- Files are memory; completion criteria enable autonomy; backpressure beats prescription

## GigSmart — Founding Contributor

[GigSmart](https://gigsmart.com) isn't just a user of H·AI·K·U — they're a founding contributor. The framework was forged in their production environment, where real features with real deadlines and real users exposed every weakness in the methodology.

Key contributions from the GigSmart team:
- Battle-testing the studio/stage/hat model across real features
- Validating the inception → design → product → development → operations → security pipeline
- Pushing the limits of parallel execution and worktree isolation
- Providing the real-world feedback that shaped the review UI, gate behavior, and FSM enforcement
- Proving that AI-assisted development can be rigorous enough for production systems

## Built With

H·AI·K·U is built on:
- [Claude Code](https://claude.com/claude-code) by Anthropic — the AI backbone
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io) — the integration standard
- TypeScript + esbuild — the plugin runtime
- React + Vite — the review UI

## Contributing

H·AI·K·U is open source under the Apache 2.0 license. Contributions welcome:
- [GitHub Repository](https://github.com/TheBushidoCollective/haiku-method)
- [Website](https://haikumethod.ai)
