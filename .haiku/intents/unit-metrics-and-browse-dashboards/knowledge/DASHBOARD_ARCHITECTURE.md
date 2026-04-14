# Dashboard Architecture — Chart Library, Aggregation Strategy, Provider Contract

Scope: architectural decisions for the four metrics dashboards in `website/app/browse` (intent overview, studio/stage throughput, hat efficiency, time-series trends). This document does **not** define the metrics data model — that belongs to the design stage. It picks one chart library, one aggregation strategy, and the minimal `BrowseProvider` surface needed to support them.

Stack context: Next 15.1.6, React 19, Tailwind 4, TypeScript 5.7. Browse app already depends on `@xyflow/react` (node graphs) and `mermaid` (diagrams). No chart library is currently installed.

---

## 1. Chart library — pick: **Recharts 3.x**

**Recommendation: Recharts 3.x** (`recharts@^3`) for all dashboard charts.

### Why Recharts

- **React 19 compatible.** Recharts 3.0 (June 2025) dropped React ≤17 support and officially supports React 18 & 19; the peer range is `^16.8 || ^17 || ^18 || ^19`. No `legacyPeerDeps` hacks, no forked shims.
- **Declarative JSX composition** (`<LineChart><XAxis /><YAxis /><Line /></LineChart>`) matches how the rest of the browse app is written. New contributors can read a chart the same way they read a layout.
- **Tailwind 4 ergonomics.** All primitives accept `className` on SVG elements and raw `stroke`/`fill` props, so theme colors come straight from CSS custom properties already wired into the browse app (`--color-accent`, `--color-fg-muted`, etc.). No theme-config file to maintain.
- **TypeScript support is first-class** — types ship in the main package, no `@types/*` sidecar.
- **Bundle size is acceptable for a static site that already ships Mermaid.** Recharts 3 minified+gzipped is roughly ~95–110 kB gzipped for the full import; tree-shaking the subset we actually use (LineChart, BarChart, PieChart, Tooltip, Legend, ResponsiveContainer, CartesianGrid, XAxis, YAxis) drops that meaningfully. For reference, `mermaid@11` is already ~500 kB gzipped in the current bundle — Recharts is a fraction of that and only loads on dashboard routes, which are code-split by default in Next 15's app router.
- **Dashboards are not the hot path.** Operators hit `/browse` to look at an intent, not to stare at charts all day. A ~100 kB chart bundle loaded on `/browse/dashboards/*` only is fine. If we were building a dashboard-first app I'd pick differently; we're not.

### Discarded alternatives

**Visx (`@visx/*`)** — rejected. Visx is a set of low-level primitives over D3; it's maximally flexible but every chart is ~80 lines of JSX you write yourself. For four dashboards with conventional chart types (line, bar, donut, stacked bar) this is negative leverage. The bundle advantage only shows up when you need *one* chart type and tree-shake the rest — we need five or six. Revisit if we ever need a custom visualization that Recharts can't express.

**Apache ECharts (`echarts` / `echarts-for-react`)** — rejected. More powerful than Recharts (better for very large datasets, richer interactions, native canvas rendering) but the base bundle is ~350 kB gzipped and the React wrapper is a third-party package that historically lags React version support. React 19 compatibility is an ongoing community PR as of late 2025, not a guarantee. The power ceiling is above what the dashboards need, and the floor is below our React 19 requirement. Pass.

**Chart.js (`chart.js` + `react-chartjs-2`)** — rejected. Canvas-based so charts don't honor Tailwind utility classes; theming requires a separate JS options object. React wrapper is imperative-under-the-hood and has had React 19 peer-dep pain. Not worth fighting for features we don't need.

**Tremor (`@tremor/react`)** — tempting but rejected. Tremor is a higher-level component library *built on* Recharts with opinionated Tailwind styling. Two problems: (1) it ships its own Tailwind plugin and expects Tailwind 3 conventions — Tailwind 4 compat was still in flux as of late 2025; (2) it owns layout and chrome decisions (card wrappers, grid), which collides with the browse app's existing Tailwind 4 + CSS-variable theme. We get the same rendering engine (Recharts) with less coupling by using Recharts directly.

**nivo** — rejected for the same bundle-size reason as ECharts (~200 kB+ per chart type family) and because each chart type is a separate `@nivo/*` package, making upgrades chatty.

### Install surface

```
recharts@^3
```

One dependency, no peer-dep surgery.

---

## 2. Aggregation strategy — pick: **write-time rollups on disk**

**Decision:** Rollups are computed and persisted **at bolt-advance time** by the plugin's MCP tools. The browse app reads them as pre-aggregated JSON/frontmatter. No read-time aggregation in the client beyond simple sort/filter/slice.

### Why write-time

The binding constraint is the remote providers. `GitHubProvider` and `GitLabProvider` fetch repository content through GraphQL / REST Contents API one path at a time. They cannot run JavaScript on the server, cannot execute reducers across files, and cannot stream a directory tree cheaply — every file read is an HTTP round-trip counted against rate limits. A read-time strategy would mean: for every dashboard load, fetch every `intent.md` + every unit file across every intent over the network, parse them in the browser, reduce, then render. For 50 intents × 10 units that's 500+ requests per dashboard view. Not viable.

Pre-aggregation flips the shape: **the dashboards read one or two small JSON files per scope.** The writer is the plugin, which already mutates unit state via `state-tools.ts`, already runs on the operator's machine, and already has full filesystem access. It's the correct place for the reducer.

### What gets written, when, and where

When a bolt ends (i.e., inside `haiku_unit_advance_hat` and `haiku_unit_reject_hat` after the bolt's metrics have been captured), the plugin:

1. **Writes per-unit rollups** into the unit's own frontmatter `metrics:` block (totals across all bolts in that unit). This is already where the data lives — zero new files.
2. **Re-computes stage rollups** and writes them to a new file: `.haiku/intents/{slug}/stages/{stage}/metrics.json`. This is a single-file reduce over all units in the stage.
3. **Re-computes intent rollups** and writes them to: `.haiku/intents/{slug}/metrics.json`. Single-file reduce over stage rollups.
4. **Appends to a workspace-level index**: `.haiku/metrics/index.json` — a flat list of every intent with totals, studio, stage breakdown, and last-updated timestamp. This is the single file every dashboard lands on first.
5. **Appends a time-series event** to `.haiku/metrics/timeseries.ndjson` — one line per bolt, `{ts, intent, stage, unit, hat, bolt, tokens, cost_usd, duration_ms}`. Append-only, so writes are O(1) and providers can stream-read recent lines.

All five writes happen inside the same tool call that advances the bolt. They are cheap: a stage has ~5–20 units, an intent has ~3–6 stages, an index entry is ~200 bytes. The 100 ms budget per bolt-advance in DISCOVERY.md easily absorbs this.

### How it works per provider

- **LocalProvider** — reads each metrics file via `readFile()` directly through the File System Access API. Cheap, synchronous-ish.
- **GitHubProvider** — reads `.haiku/metrics/index.json` with a single GraphQL query (one `object(expression: "HEAD:.haiku/metrics/index.json")` call). Drill-down into an intent reads one more file (`.haiku/intents/{slug}/metrics.json`). Time-series reads the last N lines of `timeseries.ndjson` via the Contents API with a size cap. A dashboard page load is ≤3 network requests regardless of how many intents exist.
- **GitLabProvider** — identical shape via the Repository Files API. Same request count.

The remote providers *never* read unit files to compute anything. If `index.json` is missing or stale for an intent, the dashboard shows "no metrics captured" for that row and links to docs. No fallback scan, because a fallback scan over GraphQL is exactly the pathology we're avoiding.

### What does NOT get written at write-time

- Hat-efficiency deltas, percentiles, week-over-week trends. Those are cheap read-time derivations over the already-aggregated data and the browse app computes them on load from `index.json` + a time-series window. That's read-time aggregation, but over a bounded pre-aggregated dataset (one index file + a time-series slice), not over raw unit files. Call it "write-time rollups, read-time analytics."

### Discarded alternatives

- **Pure read-time** — fails the remote-provider constraint. Rejected above.
- **Hybrid (write unit totals, read-time reduce to stage/intent)** — still forces the browse app to fetch every unit file per dashboard load on remote providers. Same failure mode as pure read-time, just one level down. Rejected.
- **Server-side aggregation API** — would require a backend. Browse app is a static Next 15 site. Out of scope for this intent; revisit if we ever add a server.

---

## 3. `BrowseProvider` interface additions

New methods, all returning pre-aggregated data. No breaking changes to existing methods. All new methods are **optional** on the interface so old providers still satisfy the type — callers fall back to "no metrics" when `undefined`.

```ts
// Added types (shapes only — exact field set is the design stage's call)

export interface IntentMetricsSummary {
  slug: string
  title: string
  studio: string
  status: string
  totals: MetricsTotals
  stageBreakdown: Array<{ stage: string; totals: MetricsTotals }>
  updatedAt: string | null
}

export interface StageMetrics {
  intent: string
  stage: string
  totals: MetricsTotals
  unitBreakdown: Array<{ unit: string; hat: string | null; totals: MetricsTotals }>
  updatedAt: string | null
}

export interface IntentMetrics {
  slug: string
  totals: MetricsTotals
  stages: StageMetrics[]
  updatedAt: string | null
}

export interface MetricsTotals {
  tokensIn: number
  tokensOut: number
  tokensCacheRead: number
  tokensCacheWrite: number
  costUsd: number
  durationMs: number
  boltCount: number
  pricingVersion: string | null
}

export interface TimeseriesEvent {
  ts: string           // ISO 8601
  intent: string
  studio: string
  stage: string
  unit: string
  hat: string | null
  bolt: number
  totals: MetricsTotals
}

export interface TimeseriesQuery {
  since?: string       // ISO 8601, inclusive
  until?: string       // ISO 8601, inclusive
  intent?: string      // filter to one intent
  studio?: string      // filter to one studio
  limit?: number       // cap returned events (default 1000, max 5000)
}

// Additions to BrowseProvider

export interface BrowseProvider {
  // ...existing methods unchanged...

  /** Read the workspace metrics index — one row per intent with totals + stage breakdown.
   *  Returns [] if the index file is missing. Dashboards land here first. */
  listAllMetrics?(): Promise<IntentMetricsSummary[]>

  /** Read the full intent rollup (all stages, all units). Used by the intent-overview dashboard.
   *  Returns null if no metrics have been captured for this intent. */
  getIntentMetrics?(slug: string): Promise<IntentMetrics | null>

  /** Read stage-level rollup with per-unit breakdown. Used by stage-throughput and hat-efficiency dashboards. */
  getStageMetrics?(slug: string, stage: string): Promise<StageMetrics | null>

  /** Read a window of time-series bolt events. Used by the trends dashboard.
   *  Implementation note: local provider streams the NDJSON file; remote providers
   *  fetch the file (with byte-range or size cap) and parse client-side. */
  listTimeseries?(query: TimeseriesQuery): Promise<TimeseriesEvent[]>
}
```

Implementation notes for design/development:

- Every new method is a simple file read + JSON parse on top of existing `readFile()`. No new transport code.
- Providers that predate metrics capture return `undefined` (method not implemented) or `[]` / `null`. The browse app checks `provider.listAllMetrics?` before rendering the dashboards nav entry.
- `MetricsTotals` is referenced here as a shape for the provider contract only. The authoritative schema (field names, units, pricing version semantics) is the design stage's decision.

---

## 4. Per-dashboard data map

Each dashboard reads exactly one or two of the pre-aggregated files. No dashboard reads raw unit files.

### Dashboard A — Intent overview

- **Reads:** `provider.listAllMetrics()` (one file: `.haiku/metrics/index.json`).
- **Renders:** table of all intents with columns for total tokens, total cost USD, bolt count, duration, stage completion, last-updated. Sortable and filterable in the client.
- **Drill-down:** clicking an intent row calls `provider.getIntentMetrics(slug)` and transitions to a per-intent panel with the stage breakdown.
- **Aggregation level:** intent-scoped totals + stage-scoped totals. No unit-level data loaded until drill-down into a stage.

### Dashboard B — Studio / stage throughput

- **Reads:** `provider.listAllMetrics()` first for the studio list; then `provider.getStageMetrics(slug, stage)` on demand for each stage the user expands.
- **Renders:** grouped bar chart — x-axis = stage name, y-axis = average bolts or total tokens per stage across intents in the selected studio. Secondary chart shows wall-clock duration distribution per stage.
- **Aggregation level:** stage-scoped totals summed across intents (client-side reduce from `index.json`'s stage breakdown) plus per-stage drill-down.

### Dashboard C — Hat efficiency

- **Reads:** `provider.getStageMetrics(slug, stage)` for each stage the user selects in a filter (one call per selected stage).
- **Renders:** bar chart — x-axis = hat name, y-axis = tokens or cost per bolt (not per unit — bolts are the iteration unit of measure). Side table lists the worst-performing hats with drill-down into the unit that spent them.
- **Aggregation level:** hat is a field inside `StageMetrics.unitBreakdown[].hat`. The dashboard groups unit rows by hat client-side. Because stage metrics files are small (one per stage, ~5–20 units each), this is a bounded read-time operation.

### Dashboard D — Time-series trends

- **Reads:** `provider.listTimeseries({ since, until, limit })` (one file: `.haiku/metrics/timeseries.ndjson`, streamed or size-capped).
- **Renders:** line chart of rolling 7-day token spend + rolling 7-day cost USD, stacked area chart per studio. Optional filter by intent/studio.
- **Aggregation level:** per-bolt events bucketed client-side into day or week bins. No file reads beyond the one NDJSON fetch per dashboard load.

---

## 5. Scale target

**Designed for up to 200 intents × 20 units × 10 bolts (≈40 000 bolt events) before pagination or server-side aggregation is required.**

Sizing rationale:

- `index.json` at ~200 bytes per intent = 40 kB for 200 intents. One GraphQL fetch, parses and renders in <50 ms.
- `timeseries.ndjson` at ~300 bytes per event × 40 000 events = ~12 MB uncompressed. Remote providers fetch with a byte-range or size cap (last ~2 MB ≈ last 6 000 events, covering a ~3-month rolling window at typical throughput). Local provider streams the file.
- Recharts handles ~2 000 data points in a line chart comfortably; beyond that we bucket into day bins before rendering (handled in the client, not the provider).
- DOM render of 200 rows in the intent-overview table is a non-issue with Tailwind + React 19; virtualization kicks in above 1 000 rows, which we are nowhere near.

**Beyond the target:**

- 500+ intents — paginate `index.json` into `index-0000.json`, `index-0001.json` with a manifest, or split per studio: `.haiku/metrics/studios/{studio}/index.json`. Dashboards load the manifest first and then fetch pages on demand.
- 100 000+ bolt events — either roll the NDJSON into daily buckets (`.haiku/metrics/days/2026-04-14.ndjson`) or introduce a server-side aggregation layer. Both are out of scope for this intent; the file layout leaves room for either.

The point of the write-time rollup strategy is that this ceiling is a **rendering** ceiling, not a **fetch** ceiling. No dashboard load ever scales with raw unit count — only with intent count (`index.json`) and time window (`timeseries.ndjson`). Scaling up is a client-virtualization problem, not an architecture problem.
