---
title: "One Instruction at a Time"
description: "Most agent harnesses are giant skills the model tries to execute end-to-end. H·AI·K·U has always treated workflow as software. v4 is where that lands."
date: "2026-05-08T16:00:00Z"
---

Most agent harnesses today are a markdown file thousands of words long. The agent loads it, nods at the section called CRITICAL, and tries to run the whole flow in one head — discovery, build, review, merge — while keeping every MUST in working memory at once. Halfway through, the prompt is already losing resolution.

[Brian Suh's piece on this](https://bsuh.bearblog.dev/agents-need-control-flow/) says the part out loud: "If you've ever resorted to MANDATORY or DO NOT SKIP, you've hit the ceiling of prompting." A longer prompt is not the fix. The fix is to stop asking the model to be the runtime.

## The category we're not in

Most harnesses we look at fall into one of two camps. Prompt-based ones use a single long system message describing the workflow, the roles, and the rules, and trust the model to execute it end to end. Skills-based ones use a library of named markdown files the agent loads on demand, each one again a self-contained program the model is asked to run start to finish. Same shape underneath: the workflow is prose, the model is the interpreter.

H·AI·K·U has never been that, and the post-mortems we wrote on AI-DLC are why. AI-DLC was prompts-as-runtime. We watched it walk over its own MUSTs more than once. One session ended with a model agreeing that a unit's `quality_gates` had to be tightened, and then routing around the constraint by telling the human to do the write itself. The prompt was clear. The workflow simply had no surface that prevented the wrong move, and prose alone has never been able to.

The reframe we landed on, then and now: the workflow is software. Hats, gates, drift, feedback — real components with real contracts. Prompts describe the work inside a step, not the shape of the program. v4, shipped in commit `b743524ab` and PR [#323](https://github.com/gigsmart/haiku-method/pull/323), is where that approach finally has the scaffolding to stand up cleanly.

## The cursor

The center of the v4 engine is a function called `derivePosition`. It lives in `packages/haiku/src/orchestrator/workflow/cursor.ts` and it does one thing: read the disk, return the next instruction. No model in the loop, no prompt, no judgement call. Given the same disk state, it returns the same answer.

It walks three tracks, in priority order. Track C is the drift sweep. Track B is open feedback across every prior stage and the current one. Track A is the intent walk — the forward progression through stages, units, hats. The first track that has something to say wins, and the cursor returns one action: `start_unit_hat`, `start_feedback_hat`, `merge_stage`, `close_feedback`, `elaborate`, `drift_detected`. Then the tick is over.

The unit-level state machine is just as bare. `nextHatForUnit` at line 291 of the same file reads the unit's `iterations[]` array and decides the next hat. Last result was `advance` and there's another configured hat? Return that hat. Last result was `reject`? Walk back one. Terminal hat advanced? Return null, the unit is done. No inference involved. Anyone reading the function tomorrow can predict every output from every input, which is exactly what prose can't give you.

## One instruction at a time

This is the shape of every `haiku_run_next` call: the agent ticks, the cursor returns one action, the agent does that one thing, the agent ticks again. There is no "here is the seven-step plan, please execute it." There is no skill the model loads and tries to walk to the end of. The agent's loop is small enough to fit in a card: tick, do, tick.

That's the architectural shift. In a prompt-based harness, the model is the program counter. In H·AI·K·U, the cursor is the program counter and the model is one stage inside the CPU. The model picks how to do the current hat well. The cursor picks what hat is current. The boundary between those two jobs is a function return value rather than a paragraph that begins with "IMPORTANT."

You can feel the difference in what the agent stops needing to remember. It doesn't track which feedback is open across which stages — Track B walks them in priority order and hands the next one back. It doesn't decide whether the workflow has stalled — the cursor returns `null` and the tick is a noop. It doesn't decide when a unit is done — the iterations array makes that mechanical. The mental load that used to live in the system prompt now lives on disk, in a function that can be unit-tested.

## Drift, watched by the sweep

Drift is the cleanest example. Every signed slot — a spec witness, a unit output, a discovery artifact — stamps a content hash at sign time. Markdown gets body-hashed so the engine's own frontmatter mutations don't trip false events; binaries get full-file-hashed. Both helpers live in `packages/haiku/src/orchestrator/workflow/sign-slot.ts:79`. The sweep at `packages/haiku/src/orchestrator/workflow/drift-sweep.ts` re-hashes the slots every tick and emits `drift_detected` for any mismatch. The cursor turns those events into FB files the next pass picks up.

The agent never reasons about whether content drifted. The sweep does it mechanically, before any handler runs, before any prompt loads. The prompt-based equivalent would be a paragraph in the system message saying "before continuing, verify that previously-signed artifacts have not been modified" — and that paragraph stops being load-bearing the moment the context window gets crowded.

## Feedback, dispatched one at a time

The fix loop is the second example. When adversarial review opens findings, the cursor doesn't hand the agent the whole list. It reads `fix_hats:` off the stage's `STAGE.md` — for the development stage that's `[classifier, builder, feedback-assessor]` — and dispatches one hat against one finding at a time. Each hat runs as its own subagent with a single job: read this FB, decide or do the next thing, advance or reject. When the terminal hat advances, the cursor returns `close_feedback` and the file moves to closed.

Track B walks every prior stage before touching the current one, so an upstream finding gets attention before forward progress resumes. The agent never picks which FB to address next. There's no pick to make — the cursor has already enumerated them in priority order, and the next tick will hand back the head of the queue. One instruction at a time, all the way down.

## What's left for prompts

Plenty, and it's the part prompts are actually good at. The hat files still describe what good work looks like for each role — what a clean implementation reads like for the builder, what a coherent spec reads like for the spec-reviewer, what genuine closure smells like for the feedback-assessor. That's craft and judgement, and prose is the right tool for both. What we pulled out of the prompts was the workflow load: the "first do this, then do that, and don't forget to update X" sequencing that was always going to fray the moment the model held it loosely.

Brian's piece names a real ceiling, and a smarter model isn't what gets you under it. A smaller ask is — one move at a time, decided on disk, with the prose describing the work inside each move. v4 is the cleanest version of that idea H·AI·K·U has shipped, and it's still the same idea we started with.
