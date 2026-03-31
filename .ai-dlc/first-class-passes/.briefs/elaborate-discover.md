---
intent_slug: first-class-passes
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/first-class-passes
project_maturity: established
provider_config: {"spec": null, "ticketing": null, "design": null, "comms": null, "vcsHosting": "github", "ciCd": "github-actions"}
---

# Intent Description

Make passes a first-class concept in AI-DLC that shapes construction behavior, enables project customization, and fixes hat/pass namespacing. Currently passes only control scheduling (which units execute when) but don't influence how hats behave during construction. This intent:

1. Creates pass definition files (`plugin/passes/*.md`) with frontmatter metadata (available workflows, default workflow) and markdown instructions that get injected into hat context during construction
2. Enables project-level pass customization via `.ai-dlc/passes/*.md` — project passes are additive (new custom passes) and can augment built-in passes (append instructions) but never override/replace them
3. Applies the same namespacing pattern to hats — fix `inject-context.sh` and `subagent-context.sh` so project hats augment rather than override plugin hats
4. Wires active_pass context through the construction pipeline: inject-context.sh reads active_pass from intent frontmatter, loads the pass definition, injects instructions into subagent context
5. Constrains workflow availability per pass — only workflows listed in the pass definition are available for units in that pass
6. Updates the paper (ai-dlc-2026.md) to properly document the pass loop, pass-backs, and pass customization
7. Updates website docs and homepage to reflect the pass concept
8. Updates settings schema to remove hardcoded pass enum, allowing any pass name that has a definition file

Key design decisions from our discussion:
- Same intent across passes (artifacts accumulate, not new intents per pass)
- Configured passes are suggested, not required — user confirms or overrides per intent
- Pass sequence is an ordered array; forward is normal, pass-backs set active_pass backward
- Single-pass (dev only) is always the default — multipass is opt-in
- Operate phase only applies to dev pass (not design/product) — no phase metadata needed in pass definitions
- Elaborate and execute apply universally to all pass types

## Clarification Answers

Q: How does construction orient against a specific pass?
A: Pass definition files contain instructions that get injected into hat subagent context. Hats stay generic; the pass instructions shape what they produce.

Q: How can projects customize passes?
A: Project files in .ai-dlc/passes/ — same name as a plugin pass means augmentation (append instructions), new names mean custom passes.

Q: What about workflow availability per pass?
A: Pass frontmatter declares available workflows. Units in that pass can only use those workflows. If a unit requests a workflow not in the pass's list, it falls back to the pass's default_workflow.

Q: How does hat/pass namespacing work?
A: Plugin definitions are canonical (never overridden). Project definitions with matching names augment (append instructions). Project definitions with new names are custom additions.

Q: Is operate a pass?
A: No. Operate is a post-completion lifecycle concern that only applies to dev pass output. Elaborate and execute are universal to all passes.

Q: How does an intent move through passes?
A: Same intent, active_pass updated. Artifacts accumulate. When a pass completes, execution stops and the user re-elaborates for the next pass.

Q: Are configured passes required?
A: No. Settings provide defaults, user confirms or overrides per intent during elaboration.

Q: What about pass-backs?
A: When a later pass discovers issues requiring earlier-pass work, active_pass is set backward, re-elaboration occurs for that pass, then forward progression resumes.

## Discovery File Path

/Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/first-class-passes/.ai-dlc/first-class-passes/discovery.md
