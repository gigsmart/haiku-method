---
title: "The Workshop Has Two Editors"
description: "H·AI·K·U used to assume the agent owned every file in the intent dir. Drift detection, audit logs, and a human-write MCP tool make the workshop honest."
date: 2026-05-04
---

A designer drops fourteen PNGs from Figma into `stages/design/artifacts/`. A PM hand-edits the success criteria on `unit-03-billing-policy.md` and types into chat: "I tightened the criteria, take it from here." An operator runs `vim` on `knowledge/runbook.md` to fix a typo before standup.

None of those writes goes through the agent. Until this intent shipped, none of them was visible to the workflow either. The next `haiku_run_next` tick would steamroll the designer's PNGs by re-generating from the design brief. It would fight the PM's hand-tuned criteria with a different draft on the next iteration. It would silently accept the operator's `vim` patch and lose the audit trail entirely.

You're the PM. You spent twenty minutes tightening the criteria. You committed nothing — you just edited the file in your local checkout and asked the agent to keep going. What happens? Until last week the answer was "we don't know." The agent might pick up your edit. It might not. The next adversarial reviewer might flag it as "unexpected change." There was no deterministic story for the most basic collaboration move on the team.

That's the failure we shipped against. The intent dir was modeled as the agent's workspace alone. Real teams don't work that way.

## The factory and the workshop

The factory has one machine. Materials go in, products come out, the machine writes every step. The pipeline is closed.

The workshop has many craftspeople. The agent has the keyboard most of the time, but a designer can grab it to drop a hero image, a PM can grab it to tighten a unit spec, an operator can grab it to patch a runbook. The work is shared. The pipeline is not closed.

H·AI·K·U was modeled as a factory. The intent-completion gate confirmed it: by the time the workflow ran adversarial reviews, only commits the agent authored were in scope. Anything dropped by a human into the same directory got tagged "untracked" and either ignored or overwritten on the next tick. The PM's tightened criteria? Either silently accepted (no audit) or silently lost (no diff). Neither is acceptable.

Last week we landed three engine pieces that flip the model.

## What it takes to be honest about that

**Detection.** Every tick, before any handler runs, the workflow takes a SHA-256 fingerprint of every file in the tracked surface and compares it to the baseline stored in `state.json`. Any file whose hash doesn't match the baseline fires `manual_change_assessment` — a structured action listing every changed path with a unified diff. The agent reads each finding and classifies: `ignore` (accept the change, baseline updates), `inline-fix` (absorb into the current bolt), `surface-as-feedback` (open an FB and let the next iteration triage), or `trigger-revisit` (the change invalidates a prior stage's work; rewind there). Per-file decision, on the record. Implementation: `runDriftDetectionGate` in `packages/haiku/src/orchestrator/workflow/drift-detection-gate.ts`, dispatched from `runWorkflowTick` in `packages/haiku/src/orchestrator/workflow/run-tick.ts:29`.

**Attribution.** The agent doesn't just find changes; it labels them. A new MCP tool, `haiku_human_write`, lets a human-instructed write land with `author_class: "human-via-mcp"` in the action log. The SPA upload UI does the same for files dropped through the browser. Anything else that shows up in the diff is `author_class: "human-implicit"` — the agent can't prove who wrote it, and the workflow records that ambiguity instead of papering over it. Provenance is not negotiable.

**Discipline.** The drift gate doesn't run the moment a human touches a file. It runs the next time the agent ticks. Concurrency is eventually consistent — the workshop has no locks because `vim` doesn't honor `flock` and we're not going to pretend it does. The compensating control is the gate: every tick re-hashes the tracked surface, observes whatever happened since the last tick, and reconciles. Writes can race. The reconciler doesn't.

## The PM's edit, end-to-end

The PM hand-edits `unit-03-billing-policy.md` and types into the chat: "I tightened the criteria. Take it from here." The next tick:

The pre-tick drift gate compares the file's current SHA against the baseline in `state.json`. Mismatch. The engine emits `manual_change_assessment` with the unified diff and a unique `tick_id` so the agent's classification can't race. The agent reads the diff. The PM's edit added two completion criteria; the existing criteria are unchanged. Not a regenerate signal — the criteria are tighter, not different. The agent calls `haiku_classify_drift` with `outcome: "inline-fix"` and a one-line rationale. The validator atomically writes a `DA-NN.json` assessment record, updates the baseline, and clears the dispatch. The unit's hat sees the updated spec the next time it loads.

No regeneration. No fight. The action log records the PM edited the file, the agent classified it, the baseline updated. Everything's on the record.

A different scenario: the designer drops fourteen PNGs into `stages/design/artifacts/`. The drift gate notices fourteen new files, fires the assessment with `change_kind: "added"` and `is_binary: true`. Text files come with a unified diff. Opaque binaries — fonts, archives, PDFs — get the SHA pair as the receipt and nothing else, because there's nothing else to render. Images sit between the two. The SHA pair tells the engine what happened, but the *useful* diff for an image is visual: before-and-after thumbnails, side-by-side, on the assessment screen. Designs land as PNGs more often than they land as Markdown, and "look at this" is the diff that matters. The engine today treats every binary the same — image-aware drift is the next iteration, and the SPA already renders uploaded mockups through `MockupEmbeds` (`packages/haiku-ui/src/pages/review/shared/MockupEmbeds.tsx`), the component path the drift surface will reuse. The agent classifies the additions as `ignore` — designer-provided artifacts, accepted as canonical. Next time `/haiku:revisit design` runs, the elaborate phase sees the PNGs as inputs, not as work to redo.

The intent dir is a workshop. The drift gate is the receipt every craftsperson hands in at the end of their shift. The action log is the ledger. The compensating control is observation, not permission.

## What the user actually does

Nothing different. You drop files. You edit specs. You uploaded a brand kit through the SPA. You typed into the chat. You ran `vim`.

The workflow notices. It asks the agent to triage. The triage takes two seconds. Your edits stay. The pipeline integrates. The audit log records who did what.

What changed is that the file you just edited is no longer either a black hole or a footgun. It's a write the system saw, classified, and absorbed. Try it on a stage where you've been hand-tuning specs and watch the next `haiku_run_next` ask "this changed; is it canonical?" and accept your one-word answer. The intent dir was a sandbox. Now it's a workshop.
