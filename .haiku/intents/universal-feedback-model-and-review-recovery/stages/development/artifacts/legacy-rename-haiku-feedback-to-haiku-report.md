# Unit 03: Rename haiku_feedback to haiku_report

## Changes

- `packages/haiku/src/server.ts:349` — tool name `haiku_feedback` -> `haiku_report`
- `packages/haiku/src/server.ts:416` — routing handler `haiku_feedback` -> `haiku_report`
- `plugin/skills/report/SKILL.md:11` — skill instruction `haiku_feedback` -> `haiku_report`
- `plugin/bin/haiku` — rebuilt binary reflects rename

## Verification

- `npx tsc --noEmit` passes
- All 248 tests pass (6 test suites)
- `grep haiku_feedback packages/haiku/src/server.ts` returns no matches
- `grep haiku_report packages/haiku/src/server.ts` returns lines 349 and 416
- The `haiku_feedback` references in `state-tools.ts` are the NEW feedback-file tool (different unit), not the Sentry tool

## Commit

`05a65894` — refactor: rename haiku_feedback Sentry tool to haiku_report
