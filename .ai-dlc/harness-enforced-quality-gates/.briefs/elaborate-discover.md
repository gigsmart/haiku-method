---
intent_slug: harness-enforced-quality-gates
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/harness-enforced-quality-gates
project_maturity: established
provider_config: {"spec":null,"ticketing":null,"design":null,"comms":null,"vcsHosting":"github","ciCd":"github-actions"}
---

# Intent Description

Replace the current agent-interpreted "hard gates" in the advance skill with actual harness-enforced quality gates — CC hooks that read gate definitions from unit/intent frontmatter and enforce them with exit codes. Gates are discovered and defined during elaboration (and can be added during construction with a ratchet effect — add-only, never remove). Also migrate existing han-delegated hooks (inject-context on SessionStart, iterate on Stop/SubagentStop) to native CC hooks, eliminating the han hook intermediary dependency.

## Clarification Answers

### Gate Scope
Both intent-level and unit-level. Intent frontmatter defines default gates that apply to all units. Units inherit intent gates and can add their own (additive merge). Units cannot remove or override intent-level gates.

### Mutability
Add-only during construction. Builders can add new gates during construction when they discover needs, but can never remove or weaken existing ones. Ratchet effect.

### Trigger
Stop hook. But must be scoped so subagents of a builder (Explore, test-runner, etc.) don't accidentally trigger gate enforcement. The hook should only fire for the right context. CC provides Stop (top-level) and SubagentStop (subagents) as separate events. The payload includes agent_id and agent_type for subagent contexts.

### Gate Format
Raw shell commands with a name for communication:
```yaml
quality_gates:
  - name: tests
    command: "npm test"
  - name: lint
    command: "npm run lint"
  - name: typecheck
    command: "npx tsc --noEmit"
```

### Gate Inheritance
Additive merge. Unit gates ADD to intent gates. A unit always runs intent defaults plus its own. Ratchet up only — no removal possible.

### Failure Mode
Exit 2 with message. The agent gets the failure output and must fix until gates pass.

### Hook Migration
Remove all `han hook run ai-dlc ...` delegations from hooks.json. Implement inject-context and iterate (enforce-iteration) as direct CC hooks alongside the new quality gate hook.

## Discovery File Path

/Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/harness-enforced-quality-gates/.ai-dlc/harness-enforced-quality-gates/discovery.md
