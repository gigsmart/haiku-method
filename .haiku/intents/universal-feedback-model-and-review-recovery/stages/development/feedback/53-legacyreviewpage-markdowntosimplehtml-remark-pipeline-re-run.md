---
title: >-
  LegacyReviewPage: markdownToSimpleHtml (remark pipeline) re-runs on every
  render
status: pending
origin: adversarial-review
author: performance
author_type: agent
created_at: '2026-04-21T20:24:30Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

## Finding

`packages/haiku-ui/src/components/ReviewPage.tsx:1612-1614`:
```ts
function markdownToSimpleHtml(md: string): string {
  return remark().use(remarkGfm).use(remarkHtml).processSync(md).toString()
}
```

This function is called **inline in JSX** inside `IntentReview` and `UnitReview`, with no `useMemo` around the result:
- Line 625 — `<InlineComments htmlContent={markdownToSimpleHtml(overviewMarkdown)} ...>`
- Line 832 — `<InlineComments htmlContent={markdownToSimpleHtml(kf.content)} ...>` inside `knowledgeFiles.map`
- Line 843 — `<InlineComments htmlContent={markdownToSimpleHtml(sa.content)} ...>` inside `stageArtifacts.map`
- Line 1066 — `<InlineComments htmlContent={markdownToSimpleHtml(combinedSpec)} ...>` in UnitReview spec tab
- Line 1248 — `<InlineComments htmlContent={markdownToSimpleHtml(a.content)} ...>` inside output-artifacts `artifacts.map`
- Line 1503 — `<InlineComments htmlContent={markdownToSimpleHtml(unitContent)} ...>` inside `stageUnits.map`

`remark().use(remarkGfm).use(remarkHtml).processSync(md)` constructs a fresh unified processor, parses the markdown into an mdast, transforms through remark-gfm, serializes via remark-html, and stringifies — every call. For a typical intent overview (2-5 KB markdown) that's 5-15ms each. Multiplied by the number of artifacts in the Knowledge or Outputs tab, and multiplied by every re-render of the parent (which happens any time the sidebar state, tab selection, or annotation state changes), the per-render cost compounds.

## Concrete scenario

A 20-unit intent opens the "Units" tab. Each expanded unit rebuilds `unitContent` (line 1442-1449) and calls `markdownToSimpleHtml(unitContent)` on every render of `UnitsTable`. A single state change in the sidebar (`setSidebarTab`, `setGeneralText`, `setAllInlineComments`) re-renders the whole `ReviewPage` tree and all its children — re-running the remark pipeline for every visible artifact.

## Belt-and-suspenders concern

Since `LegacyReviewPage` is dead code (filed separately), the primary impact of this bug is in `IntentReview` / `UnitReview` which ARE used — the re-export at line 155 goes through `pages/review/ReviewPage.tsx` → `ArtifactsPane` → (`IntentReview` or `UnitReview`). Those two functions live in the same file and carry the same un-memoized markdown→HTML conversions.

## Mandate violation

"No blocking operations on hot paths." A synchronous unified/remark pipeline is exactly a blocking CPU operation, and it runs during the React render phase — which is the hottest path in the UI.

## Suggested fix

1. Wrap each `markdownToSimpleHtml(...)` call in `useMemo(() => markdownToSimpleHtml(md), [md])` at the consumer site, or
2. Push the memoization into the `InlineComments` component by accepting raw markdown and memoizing internally, or
3. Cache at the function level with a `WeakMap<string, string>` keyed on the markdown string (cheapest change — zero consumer-site edits).

The content is static per session — only when the server pushes a new `session-update` does the markdown actually change. The current code re-processes it on every unrelated re-render.

## File references

- `packages/haiku-ui/src/components/ReviewPage.tsx:1610-1614` (the un-memoized function)
- `packages/haiku-ui/src/components/ReviewPage.tsx:625,832,843,1066,1248,1503` (six call-sites, all inline in JSX)
- `packages/haiku-ui/src/components/ReviewPage.tsx:1442-1449` (`unitContent` string is also rebuilt inline on every UnitsTable render)

