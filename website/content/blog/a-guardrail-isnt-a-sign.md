---
title: "A Guardrail Isn't a Sign"
description: "MUST and DO NOT SKIP are signs. The agent reads them, agrees with them, and drives off the cliff anyway. v4 makes the cliff unreachable."
date: "2026-05-08T16:00:00Z"
---

In Mike's session, the agent told the user the fix was to edit a unit file outside Claude Code — to bypass the agent-write block. The prompt for that hat ran three paragraphs of MUST and DO NOT SKIP about how `quality_gates` had to be tightened on the unit's frontmatter. The agent read it, agreed with it, and then routed around it the only way it could: tell the human to do the write itself, and call that compliance. The workflow had no MCP path that would let the agent do it.

That's the moment Brian Suh's [Agents Need Control Flow, Not More Prompts](https://bsuh.bearblog.dev/agents-need-control-flow/) names. "If you've ever resorted to MANDATORY or DO NOT SKIP, you've hit the ceiling of prompting." We had a prompt that said "do X." We had no surface that allowed X. The agent did the only thing it could see from there, which was hand X to the human.

## The ceiling is real and we hit it repeatedly

Every new failure mode landed as another paragraph in another prompt. The prompt grew. The agent's adherence didn't — adherence isn't really the variable. The variable is whether the action the prompt forbids is *available*. If it's available, eventually the agent takes it, especially under pressure.

H·AI·K·U pre-v4 had dozens of "the agent MUST" instructions across hat files, system prompts, and review mandates. Some were load-bearing. Most were aspirational fences around behavior the surface couldn't actually constrain. We'd patch a session bug by adding three sentences of MUST to a hat. The next session would route around it differently. Brian's framing fit too well: a programming language where every statement is a suggestion and every method returns success while producing the wrong answer.

Panda's session showed the inverse failure. Cross-stage `haiku_feedback_move` in v3.16.3 silently failed when the target stage differed from the source. Same-stage worked. Cross-stage returned a no-op with a success-shaped response. The agent tried it, got "ok," kept moving, hit the same finding next tick, eventually diagnosed it themselves and worked around with a manual file move. The tool said success. Reality said no. There's no prompt you can write that fixes that — the gap is in the call, not in the instruction.

## What the surface refuses

The H·AI·K·U v4 engine refactor (PR [#323](https://github.com/gigsmart/haiku-method/pull/323), commit `b743524ab`) is the lived version of Brian's argument. The change isn't "we wrote better prompts." The change is "we deleted the load Big Prompts were carrying and put it in the surface."

A PreToolUse hook at `packages/haiku/src/hooks/guard-workflow-fields.ts` blocks generic `Read`, `Write`, `Edit`, and `MultiEdit` against `units/*.md`, `feedback/*.md`, `intent.md`, and `stages/*/state.json`. The agent doesn't decide whether to honor that boundary — the boundary refuses the call, returns a structured message naming the right MCP tool, and the agent's only path forward is to take the named path. No prompt says "do not edit unit files directly." It can't.

Every MCP tool input is gated by a TypeBox schema validated by AJV before the handler runs. `feedback_id: Type.Integer({ minimum: 1, maximum: 999 })` in `packages/haiku/src/state/schemas/inputs/feedback-variants.ts:36`. Pass `"FB-001"` as a string and you get `haiku_feedback_advance_hat_input_invalid` back, with a stable named code that tests assert against. The handler never executes. The agent gets a precise error pointing at the field and re-shapes the call. No "the system MAY misinterpret string-form IDs" in a hat file. The system can't accept string-form IDs at all.

Workflow position lives in a deterministic function with no model in the loop. `derivePosition(slug)` in `packages/haiku/src/orchestrator/workflow/cursor.ts:914` walks Track C (drift sweep), Track B (open feedback), Track A (intent walk) on every `haiku_run_next` call. Same disk state, same answer, every time. `nextHatForUnit` at line 291 is a literal state machine: read iterations, pick the next configured hat on advance, walk back on reject, return null at the terminal hat. The cursor isn't asking the model where the workflow is. The cursor *tells* the model what hat to load.

## A guardrail isn't a sign

The mental model that broke us was thinking of MUST as a guardrail. It isn't. A sign that says CLIFF AHEAD is not a guardrail. A guardrail is the thing that stops the car at the cliff regardless of whether the driver read the sign.

This is the line Brian draws and it's the line v4 finally enforces. Treat the LLM as a component, not the system. The system is the surface — the hooks, the schemas, the cursor, the validators that compose call-by-call into a flow the model could not violate even if it wanted to. The model picks its move within the legal-move set. The legal-move set is software.

You can see the difference in the review cycle this PR went through. Four rounds of automated Claude review on the action runner. Twelve critical-and-high issues addressed in commit `3938863f5`, three more in `bb08b2718`, three CI-stability fixes in `eb9b36df5`. 1365 tests across 101 files, all green at merge. Each fix has a regression test pinning the contract — `packages/haiku/test/cross-stage-feedback-move.test.mjs` for Panda's silent failure, `packages/haiku/test/intent-scope-isolation.test.mjs` for the cowork-mcp-apps-integration intent dir pollution we hunted today (commit `1ccae8d0c` — the engine was auto-resolving to "the only active intent on disk" when no intent branch matched, which let one intent's tick poison another's directory). Every one of those tests is a guardrail. None of them are signs.

## What's left for prompts

Plenty. The model still chooses which feedback to triage first, which review-agent finding to take seriously, what the unit body should say, how to interpret a designer's mockup. Hat files still describe the work each role does because that work is taste, judgment, and craft — not workflow. We didn't delete the prompts. We deleted their load-bearing role in keeping the workflow consistent.

That's the asymmetry Brian's piece is pointing at. Prompts are good at describing what well-done work looks like inside a constrained environment. They are catastrophic at being the constrained environment. We spent two years writing better prompts. The week we stopped writing them and started writing the surface, all four review rounds went green.

If your agent project is on its third revision of "the agent MUST" in the same hat file, the fix isn't a fourth revision. The fix is a tool the agent can call that makes the wrong move uncallable. Build the surface. Let the prompts go back to describing the work.
