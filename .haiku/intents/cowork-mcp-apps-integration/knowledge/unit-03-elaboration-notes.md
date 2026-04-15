# Unit 03 Elaboration Notes

Refined `unit-03-ui-resource-registration.md` from researcher findings.

## Key decisions folded into the spec

1. **Capabilities gap is a first step.** `server.ts:158` currently advertises only `tools`, `prompts`, `completions`. Added explicit completion criterion that `resources: {}` MUST appear in the capabilities block — without it, the SDK rejects `resources/*` requests.
2. **Greenfield handlers.** Researcher confirmed zero existing `ListResourcesRequestSchema` / `ReadResourceRequestSchema` hits. Spec calls this out so implementer does not look for a pattern to follow — there isn't one.
3. **`buildUiResourceMeta()` is a new utility, not a refactor.** Handlers today return `{ content: [...] }` literals with no `_meta` field and no central builder. New file `packages/haiku/src/ui-resource.ts` isolates the helper so unit-04 can import cleanly.
4. **Version stamp is a 3-line addition.** `build-review-app.mjs:69` gets a sha256 slice of `html`, appended to `tsContent` as `REVIEW_APP_VERSION`. Stable across rebuilds; bumps on any SPA-source edit.
5. **Scope firewall around `http.ts:serveSpa`.** Completion criterion 8 asserts `git diff main -- packages/haiku/src/http.ts` is empty. The local HTTP path MUST stay byte-identical; non-Cowork hosts keep their existing review flow.
6. **Bundle size is a flag, not a scope item.** ~5.15 MB inlined HTML measured by researcher. Passed downstream to unit-04 (host-bridge / iframe preload) and unit-05 (Cowork open handler) as context. The `vite-plugin-singlefile` shrink question stays open for a later unit.

## Criteria sharpening

Each completion criterion now names a specific verification command or assertion:

- ripgrep patterns for capability block, handler registration, URI references, helper export.
- Integration-test JSON-RPC regex for the URI (`/^ui:\/\/haiku\/review\/[0-9a-f]{12}$/`).
- Byte-length equality check between `resources/read` response and `REVIEW_APP_HTML.length`.
- `diff` of two consecutive prebuild emissions for version stability.
- `git diff main -- packages/haiku/src/http.ts` empty for scope-firewall enforcement.
- Snapshot assertion that `result._meta` is `undefined` on an unrelated tool (no accidental wiring).

## Model assignment

`sonnet` — standard feature addition with a known pattern (SDK request-handler registration), multiple files touched, no architectural trade-offs. Clear scope, clear firewall, no cascading-failure risk.

## Downstream handoff

- Unit-04 (SPA host bridge) imports `buildUiResourceMeta` from `ui-resource.ts`; it will also need to know the ~5.15 MB inline size when designing the iframe preload path.
- Unit-05 (`_openReviewAndWait` Cowork path) uses the resource URI shape `ui://haiku/review/<version>` established here.
