---
intent_slug: first-class-design-providers
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/first-class-design-providers
project_maturity: established
provider_config: {}
---

# Intent Description

Integrate agent-controllable design tools as first-class design providers in AI-DLC. The plugin currently generates low-fidelity HTML wireframes during elaboration and uses a designer hat during execution that produces design specs. This intent adds a design provider abstraction that supports multiple design tool backends, enabling higher-fidelity design outputs through real design tools that AI agents can control programmatically.

## Supported Providers (All)

1. **Canva MCP** — Already connected via Claude platform MCP. Fully headless. Template-based generation, transactional editing, brand kit management, export.
2. **OpenPencil** (ZSeven-W/openpencil) — MIT, headless CLI (`op`), MCP server, modular SDK (`pen-core`, `pen-codegen`, `pen-figma`, `pen-renderer`), 8 export targets (React, Vue, Svelte, HTML, Flutter, SwiftUI, Compose, React Native), `.op` JSON format.
3. **Pencil.dev** — Commercial, headless CLI (`@pencil.dev/cli`), MCP server (port 3100), `.pen` JSON format, deep IDE integration.
4. **Penpot** — MPL-2.0 open source, official MCP server (`@penpot/mcp`), self-hostable, 45K stars. Requires browser session for canvas operations.
5. **Excalidraw** — Official MCP server (remote at mcp.excalidraw.com), community MCP toolkit (26 tools with closed feedback loop — AI can screenshot its own work), hand-drawn style diagrams/wireframes.
6. **Figma** — Framelink MCP (14K stars, read-only) for design-to-code. Figma Write Server (24 tool categories, full write access, requires Figma Desktop). Figsor (45+ tools, AI SVG generation).

## Integration Points

1. **Elaboration phase (elaborate-wireframes skill)**: Design provider generates wireframes/mockups instead of (or alongside) HTML wireframes. Provider is preferred when available, HTML is fallback.
2. **Execution phase (designer hat)**: Design provider creates high-fidelity designs during the design workflow. Agent uses MCP tools or CLI to manipulate the design canvas.
3. **Visual review integration (ask_user_visual_question MCP tool)**: Design artifacts are presented to users for review via the existing visual question tool. Two modes: (a) present-for-review when creating from scratch, (b) auto-compare against design_ref when one exists and only prompt user when differences exceed threshold.
4. **Design reference resolution (resolve-design-ref.sh)**: Recognize provider-native file formats (.pen, .op, .excalidraw, etc.) as high-fidelity references. Export to PNG for visual comparison.

## Configuration

- Auto-detect available providers (check MCP connections, CLI tools in PATH)
- Allow explicit override in .ai-dlc/settings.yml under a design_provider section
- Consistent with existing provider pattern in plugin/providers/ and plugin/schemas/providers/

## Clarification Answers

Q: Which design tools should be supported initially?
A: All researched tools — Canva, OpenPencil, Pencil.dev, Penpot, Excalidraw, Figma Write.

Q: How should design provider integrate with visual review?
A: Both modes — auto-compare when design_ref exists, present-for-review when creating from scratch.

Q: Replace or complement HTML wireframes?
A: Complement — HTML wireframes remain as fallback, design providers preferred when available.

Q: How should users configure which design provider to use?
A: Both auto-detect and explicit settings.yml override.

Q: Which phases should design providers be usable in?
A: Both elaboration (wireframes) and execution (designer hat).

## Discovery File Path

/Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/first-class-design-providers/.ai-dlc/first-class-design-providers/discovery.md
