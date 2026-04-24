/**
 * Deterministic fixture generator for FeedbackItemData arrays.
 *
 * Visits roll 1 → 7 so virtualized renders exercise every visit-counter tier
 * (hidden / stone / amber / red). Statuses cycle through pending, addressed,
 * closed, rejected so every status is represented in the first four items.
 *
 * The `FIXTURES` library rotates six realistic edge-case shapes so every
 * downstream FeedbackItem / FeedbackList / FeedbackSummaryBar / virtualization
 * test exercises real string-handling paths:
 *
 *   0. Multi-paragraph body with fenced code block + file:line refs.
 *   1. Markdown-heavy body — nested bullets, inline emphasis, backticks,
 *      reference-style links.
 *   2. Near-cap title — exactly 120 chars (the `writeFeedbackFile` cap in
 *      `packages/haiku/src/state-tools.ts`).
 *   3. Unicode title — contains `H·AI·K·U` mid-dot (`·`), an emoji, and a
 *      leading-dot filename ref (`.haiku/…`).
 *   4. Embedded newlines (LF + CRLF) plus markdown special characters that
 *      need escaping when rendered inline (backticks, pipes, asterisks,
 *      brackets, underscores).
 *   5. Long-tail body — ≥ 2 KB (typical adversarial finding) and ≥ 10 KB
 *      (long-tail). Built at module load via a stable filler so snapshots
 *      stay deterministic.
 *
 * `CLOSED_BY_CYCLE` rotates four closure slugs when `status === "closed"`
 * — `unit-99-assessor`, `unit-03-builder`, `unit-14-ui-gate`, and studio-level
 * `intent-assessor` — so the FeedbackItem card that surfaces this slug is
 * exercised against varied shapes. For `rejected` / `pending` / `addressed`,
 * `closed_by` is `null` (open or never-certified).
 *
 * This is deliberately a rotation over a fixed library, not randomised data:
 * snapshot tests pin the rendered HTML, and any randomness (Math.random, Date,
 * seeded PRNG) makes those tests flake. A deterministic modulo-indexed pick
 * gives coverage without flake.
 */

import type { FeedbackItemData } from "../../../types"
import type { FeedbackOrigin, FeedbackStatus } from "../tokens"

const STATUS_CYCLE: FeedbackStatus[] = [
	"pending",
	"addressed",
	"closed",
	"rejected",
]

const ORIGIN_CYCLE: FeedbackOrigin[] = [
	"adversarial-review",
	"user-chat",
	"user-visual",
	"external-pr",
	"agent",
	"external-mr",
]

/** Rotating closure slugs — exercise cross-unit and studio-level closures. */
const CLOSED_BY_CYCLE: string[] = [
	"unit-99-assessor",
	"unit-03-builder",
	"unit-14-ui-gate",
	"intent-assessor",
]

/**
 * Build a stable filler block of ~N characters. Uses a fixed seed sentence
 * concatenated a predictable number of times so snapshots stay byte-stable
 * across runs.
 */
function stableFiller(targetChars: number): string {
	const seed =
		"handlers at `src/api/feedback.ts:42` throw when the request body omits " +
		"the `author_type` discriminant — repro below. "
	const reps = Math.ceil(targetChars / seed.length)
	return seed.repeat(reps).slice(0, targetChars)
}

/**
 * Exactly-120-char title (the `writeFeedbackFile` cap). Written as a single
 * string so a reviewer can verify the byte count at a glance.
 */
const TITLE_120_CHARS =
	"FeedbackSheet focus-trap regresses on nested Radix Dialog portals " +
	"when user tabs past the final AnnotationCanvas pindrop"
// Sanity (compile-time-ish): this literal is exactly 120 chars.
// Keep aligned with the 120-char cap in packages/haiku/src/state-tools.ts.

type Fixture = { title: string; body: string }

const FIXTURES: Fixture[] = [
	// 0. Multi-paragraph body with fenced code + file:line refs.
	{
		title: "Stream handler throws on path-traversal 403 without test coverage",
		body:
			"The handler at `packages/haiku/src/http.ts:974` silently rethrows " +
			"when the client supplies `..` in `path`.\n\n" +
			"Repro:\n\n" +
			"```ts\n" +
			"await fetch('/api/stream?path=../../etc/passwd')\n" +
			"// expected: 403 Forbidden\n" +
			"// actual: 500 Internal Server Error\n" +
			"```\n\n" +
			"Reviewer note: add a regression scenario in " +
			"`stream-handler.feature` covering the 403 branch.",
	},
	// 1. Markdown-heavy body — nested lists, emphasis, code spans, ref link.
	{
		title: "FeedbackSheet escape-close test calls Dialog.close directly",
		body:
			"The test bypasses the browser keyboard path:\n\n" +
			"- Expected: simulate a real *keydown* of `Escape` on the sheet.\n" +
			"- Actual: calls `dialog.close()` imperatively via the **test-only** API.\n" +
			"  - This sidesteps the `onOpenChange` callback we actually ship.\n" +
			"  - It also hides a real bug where `autoFocus` on the primary action " +
			"    swallows the keystroke in Safari.\n\n" +
			"See [FeedbackSheet.tsx:88](packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx:88) " +
			"and compare with the [Radix dialog reference](https://www.radix-ui.com/docs).\n\n" +
			"_Blocker for external-review gate._",
	},
	// 2. Near-cap title — exactly 120 chars.
	{
		title: TITLE_120_CHARS,
		body:
			"Focus-trap unit tests only cover the single-dialog path. The nested " +
			"case — AnnotationCanvas pin dropdown inside the FeedbackSheet — is " +
			"untested and breaks on Safari 17.4.",
	},
	// 3. Unicode title — mid-dot, emoji, leading-dot path ref.
	{
		title:
			"H·AI·K·U plugin · `.haiku/intents/*/stages/*/feedback/FB-NN.md` naming collision 🐞",
		body:
			"The fixture generator at `.haiku/intents/foo/stages/development/` " +
			"collides with `current_visit` semantics — both systems reserve the " +
			"`unit-NN-*` prefix. See §4 of the migration plan.\n\n" +
			"Unicode characters in play: H·AI·K·U (U+00B7), 🐞 (U+1F41E), " +
			"smart quotes “foo”, en-dash –.",
	},
	// 4. Embedded newlines (LF + CRLF) + markdown specials needing escape.
	{
		title:
			"Markdown escaping: backticks | pipes * asterisks [brackets] _under_",
		body:
			"Inline specials that must not break the renderer:\r\n" +
			"- backticks: `` `code` `` and ``` ```ts\nfenced\n``` ```\r\n" +
			"- pipes in tables: | a | b |\r\n" +
			"- asterisks for *emphasis* and **strong**\r\n" +
			"- brackets for [links](x) and [refs][1]\r\n" +
			"- underscores for _em_ and __strong__\r\n\r\n" +
			"Plain LF follows:\n\nLine A\nLine B\nLine C\n",
	},
	// 5. Long-tail body — ~2 KB realistic + ~10 KB long-tail.
	{
		title: "AnnotationCanvas unbounded ImageData history — memory regression",
		body:
			"Adversarial review summary:\n\n" +
			"The AnnotationCanvas keeps every `putImageData` snapshot in a " +
			"JS array without a ceiling. At 500 annotations × 1920×1080×4 bytes, " +
			"the heap exceeds the 512 MB browser cap and the tab dies.\n\n" +
			"Trace (trimmed):\n\n" +
			"```\n" +
			"at AnnotationCanvas.pushHistory (src/components/annotation/AnnotationCanvas.tsx:214)\n" +
			"at AnnotationCanvas.onPointerUp (src/components/annotation/AnnotationCanvas.tsx:301)\n" +
			"```\n\n" +
			"Filler (deterministic, for payload-size testing):\n\n" +
			stableFiller(2_048) +
			"\n\n--- long-tail filler below ---\n\n" +
			stableFiller(10_240),
	},
]

/**
 * Build a deterministic array of feedback fixtures.
 *
 * The optional `overrides` param is merged on top of every generated item.
 * It is intentionally a single object applied uniformly — call sites that
 * need per-item variation should map over the result and spread overrides
 * themselves. Widening the signature this way lets transition-matrix /
 * upstream-stage / edge-case tests pin one field (e.g. `status: "closed"`,
 * `visit: 3`, future `upstream_stage: "design"`) without reconstructing
 * the whole fixture shape inline.
 *
 * Existing call sites that invoke `mockItems(n)` keep their behavior —
 * `overrides` defaults to an empty object which is a no-op spread.
 */
export function mockItems(
	n: number,
	overrides: Partial<FeedbackItemData> = {},
): FeedbackItemData[] {
	const items: FeedbackItemData[] = []
	for (let i = 0; i < n; i++) {
		const status = STATUS_CYCLE[i % STATUS_CYCLE.length]
		const origin = ORIGIN_CYCLE[i % ORIGIN_CYCLE.length]
		const visit = ((i % 7) + 1) as number
		const id = `FB-${String(i + 1).padStart(2, "0")}`
		const fixture = FIXTURES[i % FIXTURES.length]
		items.push({
			feedback_id: id,
			title: fixture.title,
			body: fixture.body,
			status,
			origin,
			author: origin === "agent" ? "agent" : "user",
			author_type: origin === "agent" ? "agent" : "human",
			created_at: `2026-04-20T10:${String(i % 60).padStart(2, "0")}:00Z`,
			visit,
			source_ref: null,
			closed_by:
				status === "closed"
					? CLOSED_BY_CYCLE[i % CLOSED_BY_CYCLE.length]
					: null,
			...overrides,
		})
	}
	return items
}
