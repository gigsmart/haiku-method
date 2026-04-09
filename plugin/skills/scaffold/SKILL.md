---
name: scaffold
description: Scaffold custom H·AI·K·U artifacts — studios, stages, hats, providers
---

# Scaffold

Create custom H·AI·K·U artifact templates.

## Artifact Types

### Studio
Create `.haiku/studios/{name}/STUDIO.md` with frontmatter (name, description, stages, category) and a `stages/` directory.

### Stage
Create `.haiku/studios/{studio}/stages/{name}/STAGE.md` with frontmatter (name, description, hats, review) plus `hats/` and `review-agents/` directories. Add the stage name to the parent studio's stages list.

### Hat
Create a hat file at `.haiku/studios/{studio}/stages/{stage}/hats/{name}.md` with Focus, Produces, Reads, and Anti-patterns sections. Add the hat name to the parent stage's hats list.

### Provider
Create `.haiku/providers/{name}.md` by copying the built-in provider from `$CLAUDE_PLUGIN_ROOT/providers/{category}.md` as a starting template. Commit.

## Process

Ask the user which artifact type to scaffold and the name. For stages and hats, also ask for the parent artifact. Then create the file structure and templates.
