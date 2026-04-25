# Unit 02: CRUD Companion Tools

## Summary

Registered 4 new MCP tools for feedback lifecycle management, implementing DATA-CONTRACTS sections 1.2-1.5.

## Tools Added

- `haiku_feedback_update` -- Update status/addressed_by on feedback items. Agent guard: cannot close human-authored.
- `haiku_feedback_delete` -- Remove feedback files. Guards: cannot delete pending, agents cannot delete human-authored.
- `haiku_feedback_reject` -- Reject agent-authored feedback with reason. Appends rejection reason to body, sets status to rejected.
- `haiku_feedback_list` -- List feedback with optional stage (cross-stage) and status filters. Returns JSON array.

## Files Changed

- `packages/haiku/src/state-tools.ts` -- Added 4 tool definitions to `stateToolDefs` and 4 handler cases in `handleStateTool`
- `packages/haiku/test/feedback.test.mjs` -- Added 26 tests covering all happy paths and guard violations (67 total)
- `packages/haiku/src/orchestrator.ts` -- Fixed pre-existing TS errors (number->string telemetry attrs, renamed function ref)

## Verification

- `npx tsc --noEmit` passes clean
- `npm test` passes: 329 tests across 8 files, 0 failures
