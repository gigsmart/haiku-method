---
name: scaffold
description: Scaffold custom H·AI·K·U artifacts — studios, stages, hats, providers
---

# Scaffold

Create custom H·AI·K·U artifact templates. Ask the user which type and name.

- **Studio:** `.haiku/studios/{name}/STUDIO.md` + `stages/` directory
- **Stage:** `.haiku/studios/{studio}/stages/{name}/STAGE.md` + `hats/` and `review-agents/` dirs. Add to parent studio's stages list.
- **Hat:** `.haiku/studios/{studio}/stages/{stage}/hats/{name}.md` with Focus, Produces, Reads, Anti-patterns. Add to parent stage's hats list.
- **Provider:** `.haiku/providers/{name}.md` copied from `$CLAUDE_PLUGIN_ROOT/providers/{category}.md` as template.
