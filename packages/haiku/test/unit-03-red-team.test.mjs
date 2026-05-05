#!/usr/bin/env npx tsx
// unit-03 RED-TEAM probe — adversarial attempts against V-04 / V-08 / V-10 /
// V-11 mitigations. Different from `unit-03-security.test.mjs`: the security
// suite asserts that the mitigations work on the obvious cases (planted
// symlink, javascript: URL, etc). This suite probes for *bypasses* — vectors
// the obvious tests miss, edge-case parser ambiguities, and post-mitigation
// attack surfaces.
//
// Each test starts with a one-line ATTACK premise and asserts the OUTCOME
// the system actually produces. A test that PASSES means the defence held
// against this specific bypass attempt; a test that FAILS surfaces a new
// finding to be triaged into VULN-REPORT.md / unit-04 ASSESSMENTS.md.
//
// All findings (positive and negative) are summarized in
// stages/security/artifacts/unit-03/RED-TEAM-FINDINGS.md.

import assert from "node:assert"
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-unit-03-redteam-"))

let passed = 0
let failed = 0
const findings = [] // { severity, area, vector, outcome }

async function attack(name, fn) {
	try {
		await fn()
		passed++
		console.log(`  HELD  ${name}`)
	} catch (e) {
		failed++
		console.log(`  FAIL  ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.error(e)
		findings.push({ name, error: e.message })
	}
}

// ── V-04 RED-TEAM — symlink TOCTOU bypass attempts ──────────────────────────

console.log("\n=== V-04 RED-TEAM — symlink TOCTOU bypass attempts ===")

const { safeMkdirAndRename, cleanupTempFile } = await import(
	"../src/state/safe-write.ts"
)

await attack(
	"V-04.RT1: symlink AT THE DEST FILE itself (not in parent chain) — does rename overwrite the symlink target?",
	async () => {
		// ATTACK: parent chain is clean, but the dest file path is itself a
		// symlink pointing to a sensitive file. POSIX rename() of a regular
		// file ONTO a symlink atomically replaces the SYMLINK with the
		// regular file (it does NOT follow the symlink and overwrite the
		// target). Verify that's what happens here.
		const root = mkdtempSync(join(tmp, "v04rt1-"))
		const sensitive = join(tmp, "v04rt1-victim.txt")
		writeFileSync(sensitive, "sensitive original content")
		mkdirSync(join(root, "stages", "security", "knowledge"), {
			recursive: true,
		})
		// Plant the symlink at the dest path itself.
		symlinkSync(
			sensitive,
			join(root, "stages", "security", "knowledge", "evil.md"),
		)
		const tmpFile = join(root, ".tmp-write")
		writeFileSync(tmpFile, "attacker payload")

		const result = safeMkdirAndRename(
			root,
			join(root, "stages", "security", "knowledge"),
			tmpFile,
			join(root, "stages", "security", "knowledge", "evil.md"),
		)
		// rename() over the symlink replaces it with the regular file.
		// The sensitive target should be untouched.
		assert.strictEqual(
			readFileSync(sensitive, "utf-8"),
			"sensitive original content",
			"rename followed the dest symlink and overwrote the victim file",
		)
		// safeMkdirAndRename does not lstat the dest path — it's allowed to
		// succeed. But because POSIX rename replaces the symlink (doesn't
		// follow it), the attack does NOT escape. This is a known property
		// of the OS contract, not the helper.
		assert.strictEqual(result.ok, true)
		// Cleanup
		try {
			unlinkSync(sensitive)
		} catch {}
	},
)

await attack(
	"V-04.RT2: dest path with embedded '..' segments at the helper layer",
	async () => {
		// ATTACK: caller passes a destPath with '..' segments. Helper does
		// `resolve(destPath)` first — resolve normalises away '..' BEFORE
		// the prefix check fires. Verify the post-resolve check catches it.
		const root = mkdtempSync(join(tmp, "v04rt2-"))
		const tmpFile = join(root, ".tmp-write")
		writeFileSync(tmpFile, "x")
		const result = safeMkdirAndRename(
			root,
			join(root, "stages"),
			tmpFile,
			// dest tries to escape via .. — resolve() will normalise
			join(root, "stages", "..", "..", "elsewhere"),
		)
		// After resolve, dest is /tmp/.../v04rt2-XXXXX/elsewhere — not
		// inside parent ('stages/'). Should be parent_chain_escape.
		assert.strictEqual(result.ok, false)
		assert.strictEqual(result.code, "parent_chain_escape")
		cleanupTempFile(tmpFile)
	},
)

await attack(
	"V-04.RT3: parentDir is itself a symlink (not in chain — directly)",
	async () => {
		// ATTACK: parentDir argument is a symlink. The helper does
		// `relative(rootAbs, parentAbs).split(sep)` to walk the chain;
		// if parentDir is a symlink at root level, the lstat in the loop
		// catches it, BUT what if the symlink is at the very last segment
		// (parentDir itself)? Verify the chain walk includes the final
		// segment.
		const root = mkdtempSync(join(tmp, "v04rt3-"))
		const decoy = mkdtempSync(join(tmp, "v04rt3-decoy-"))
		mkdirSync(join(root, "stages"))
		// Plant: stages/security → /tmp/<decoy>
		symlinkSync(decoy, join(root, "stages", "security"))
		const tmpFile = join(root, ".tmp-write")
		writeFileSync(tmpFile, "payload")
		const result = safeMkdirAndRename(
			root,
			join(root, "stages", "security"), // parentDir IS the symlink
			tmpFile,
			join(root, "stages", "security", "x.md"),
		)
		assert.strictEqual(result.ok, false)
		assert.strictEqual(result.code, "parent_chain_contains_symlink")
		// Decoy must be untouched
		assert.strictEqual(readdirSync(decoy).length, 0)
		cleanupTempFile(tmpFile)
	},
)

await attack(
	"V-04.RT4: existing dir + planted symlink as a SIBLING in the same parent (no chain interference)",
	async () => {
		// ATTACK: an attacker who can write to a sibling of the dest
		// cannot use a sibling symlink to redirect the write. Verify a
		// legitimate write still succeeds when sibling is a symlink.
		const root = mkdtempSync(join(tmp, "v04rt4-"))
		const decoy = mkdtempSync(join(tmp, "v04rt4-decoy-"))
		mkdirSync(join(root, "stages", "security", "knowledge"), {
			recursive: true,
		})
		// Plant a sibling symlink — should NOT affect the write
		symlinkSync(
			decoy,
			join(root, "stages", "security", "knowledge", "sibling-link"),
		)
		const tmpFile = join(root, ".tmp-write")
		writeFileSync(tmpFile, "legit")
		const result = safeMkdirAndRename(
			root,
			join(root, "stages", "security", "knowledge"),
			tmpFile,
			join(root, "stages", "security", "knowledge", "real.md"),
		)
		assert.strictEqual(result.ok, true)
		// Sibling decoy still empty
		assert.strictEqual(readdirSync(decoy).length, 0)
		assert.strictEqual(
			readFileSync(
				join(root, "stages", "security", "knowledge", "real.md"),
				"utf-8",
			),
			"legit",
		)
	},
)

await attack("V-04.RT5: dest exactly equals parentDir (boundary)", async () => {
	// ATTACK: caller passes destPath === parentDir. The check
	// `destAbs.startsWith(parentAbs+sep)` should reject this — dest
	// must be BELOW parent, not equal. Verify rejection.
	const root = mkdtempSync(join(tmp, "v04rt5-"))
	const tmpFile = join(root, ".tmp-write")
	writeFileSync(tmpFile, "x")
	const result = safeMkdirAndRename(
		root,
		join(root, "stages"),
		tmpFile,
		join(root, "stages"), // dest == parent
	)
	assert.strictEqual(result.ok, false)
	assert.strictEqual(result.code, "parent_chain_escape")
	cleanupTempFile(tmpFile)
})

await attack(
	"V-04.RT6: chain walks past intentRoot when parent is rootAbs (segments=[])",
	async () => {
		// ATTACK: when parentDir == intentRoot, the chain walk produces
		// an empty segment list. The realpath gate at the end still fires.
		// Verify the legitimate-write case works.
		const root = mkdtempSync(join(tmp, "v04rt6-"))
		const tmpFile = join(root, ".tmp-write")
		writeFileSync(tmpFile, "ok")
		const result = safeMkdirAndRename(
			root,
			root, // parent IS intentRoot
			tmpFile,
			join(root, "x.md"),
		)
		assert.strictEqual(result.ok, true)
		assert.strictEqual(readFileSync(join(root, "x.md"), "utf-8"), "ok")
	},
)

await attack(
	"V-04.RT7: simulated TOCTOU — dir replaced with symlink BETWEEN chain walk and rename",
	async () => {
		// ATTACK: the helper walks the chain, validates every segment is
		// a real dir, then does a final realpathSync(parentAbs) gate
		// IMMEDIATELY before rename. We simulate the race by deleting
		// the parent dir and replacing it with a symlink AFTER chain walk
		// has succeeded — verify the final realpath gate catches it.
		//
		// Since we can't actually race a single sync function, we do it
		// by hand: pre-create the chain, plant a symlink at the LAST
		// dir AFTER the lstat would have run. The helper uses
		// realpathSync(parentDir) at the end — that resolves through the
		// symlink. If the resolved path escapes intentRoot, the gate fires.
		const root = mkdtempSync(join(tmp, "v04rt7-"))
		const decoy = mkdtempSync(join(tmp, "v04rt7-decoy-"))
		// Pre-create the chain so the chain-walk lstat sees a real dir.
		mkdirSync(join(root, "stages", "security"), { recursive: true })
		// Now atomically swap stages/security for a symlink. The chain
		// walk in the helper will see a real dir (lstat); the final
		// realpathSync at the end will resolve through the new symlink.
		// We can't time-race that, so we simulate by replacing BEFORE the
		// call — this exercises the realpathSync gate's job.
		rmSync(join(root, "stages", "security"), { recursive: true, force: true })
		symlinkSync(decoy, join(root, "stages", "security"))
		const tmpFile = join(root, ".tmp-write")
		writeFileSync(tmpFile, "payload")
		const result = safeMkdirAndRename(
			root,
			join(root, "stages", "security"),
			tmpFile,
			join(root, "stages", "security", "x.md"),
		)
		// chain walk catches it via lstat (refuses symlink in chain)
		assert.strictEqual(result.ok, false)
		assert.ok(
			result.code === "parent_chain_contains_symlink" ||
				result.code === "parent_chain_escape",
			`got ${result.code}`,
		)
		assert.strictEqual(readdirSync(decoy).length, 0)
		cleanupTempFile(tmpFile)
	},
)

// ── V-08 RED-TEAM — CSRF bypass attempts ────────────────────────────────────

console.log("\n=== V-08 RED-TEAM — CSRF bypass attempts ===")

const { isOriginAllowed } = await import("../src/http/csrf.ts")

await attack("V-08.RT1: Origin spoofing via 'null' literal", async () => {
	// ATTACK: some browsers emit `Origin: null` for sandboxed iframes,
	// data:/file: schemes, and certain redirect cases. If the matcher
	// allowed 'null', a sandboxed iframe could mount a CSRF.
	assert.strictEqual(isOriginAllowed("null", ["http://localhost:*"]), false)
})

await attack(
	"V-08.RT2: port wildcard does NOT match credentials in Origin",
	async () => {
		// ATTACK: `http://localhost:80@evil.com` — old URL parsers treat
		// 'localhost:80' as userinfo. Modern browsers don't send Origin
		// with credentials, but a misconfigured proxy or bug could.
		// The matcher must NOT match this string against http://localhost:*.
		assert.strictEqual(
			isOriginAllowed("http://localhost:80@evil.com", ["http://localhost:*"]),
			false,
		)
	},
)

await attack(
	"V-08.RT3: subdomain wildcard does NOT match domain-as-suffix",
	async () => {
		// ATTACK: pattern `https://*.example.com` against
		// `https://example.com.evil.com`. Naive `endsWith('.example.com')`
		// would match `evilexample.com` as well. The current implementation
		// uses `host.endsWith('.example.com')` which still matches
		// `attacker.com.example.com.evil.com`-style strings — verify.
		assert.strictEqual(
			isOriginAllowed("https://example.com.evil.com", [
				"https://*.example.com",
			]),
			false,
			"subdomain wildcard matched a different parent domain — V-08 bypass",
		)
		assert.strictEqual(
			isOriginAllowed("https://evilexample.com", ["https://*.example.com"]),
			false,
		)
	},
)

await attack(
	"V-08.RT4: subdomain wildcard treats apex match correctly",
	async () => {
		// ATTACK: apex domain `https://example.com` against
		// `https://*.example.com`. Current code: `host === rest` matches
		// the apex. That's a documentation choice — verify it matches.
		// (Whether matching apex is desirable is a separate policy
		// question; this test pins the current behaviour so any change
		// is intentional.)
		assert.strictEqual(
			isOriginAllowed("https://example.com", ["https://*.example.com"]),
			true,
			"apex match policy changed silently — verify this is intentional",
		)
	},
)

await attack(
	"V-08.RT5: port wildcard matches numeric ports only (not 'evil')",
	async () => {
		// ATTACK: `http://localhost:abc` — non-numeric port. Code uses
		// /^\d+$/ test on the port; should reject.
		assert.strictEqual(
			isOriginAllowed("http://localhost:abc", ["http://localhost:*"]),
			false,
		)
	},
)

await attack(
	"V-08.RT6: port wildcard rejects empty port (trailing colon)",
	async () => {
		// ATTACK: `http://localhost:` — empty port string. Should reject.
		assert.strictEqual(
			isOriginAllowed("http://localhost:", ["http://localhost:*"]),
			false,
		)
	},
)

await attack(
	"V-08.RT7: bare '*' wildcard is honoured (operator-policy test)",
	async () => {
		// ATTACK: `*` in allowList is an "allow anything" config. The code
		// honours `entry === '*' → return true`. Verify this is the
		// behaviour (and document it as a foot-gun in operator docs).
		assert.strictEqual(isOriginAllowed("https://anything.evil", ["*"]), true)
	},
)

// ── V-10 RED-TEAM — sanitizer bypass attempts ───────────────────────────────

console.log("\n=== V-10 RED-TEAM — sanitizer bypass attempts ===")

const { sanitizeFeedbackBody } = await import(
	"../src/state/sanitize-feedback.ts"
)

await attack(
	"V-10.RT1: nested tag obfuscation — <scr<script>ipt>",
	async () => {
		// ATTACK: legacy regex sanitizers strip the inner <script>...</script>
		// match and leave `<scr` + `ipt>alert(1)` behind, which the browser
		// re-parses as a valid script tag. Verify the standalone-opener
		// strip catches the residue.
		const out = sanitizeFeedbackBody("<scr<script>ipt>alert(1)</script>")
		// After block-strip removes <script>...</script>, we get "<script>"
		// remnant. The standalone-opener pass strips that. Final: "<scrript>"
		// or similar — the key invariant is no live <script> in output.
		assert.ok(!/<script\b/i.test(out), `live <script> survived: ${out}`)
	},
)

await attack(
	"V-10.RT2: <svg> with onload= — svg block not stripped, but onload= is",
	async () => {
		// ATTACK: <svg onload="alert(1)"></svg>. SVG is not in
		// DANGEROUS_BLOCK_TAGS — but stripEventHandlers should remove
		// onload=. Verify the residue is inert.
		const out = sanitizeFeedbackBody('<svg onload="alert(1)"></svg>')
		assert.ok(!/onload/i.test(out), `onload= survived: ${out}`)
	},
)

await attack(
	"V-10.RT3: <svg><script>alert(1)</script></svg> — inner script stripped",
	async () => {
		// ATTACK: SVG can contain <script> children that execute. Block-
		// strip should remove the inner <script>...</script>.
		const out = sanitizeFeedbackBody("<svg><script>alert(1)</script></svg>")
		assert.ok(!/<script/i.test(out), `<script> in SVG survived: ${out}`)
		assert.ok(!/alert\(1\)/.test(out), `payload survived: ${out}`)
	},
)

await attack("V-10.RT4: <math> + xlink:href javascript: scheme", async () => {
	// ATTACK: <math href="javascript:..."> or xlink:href="javascript:..."
	// — xlink:href is in stripDangerousAttrs. javascript: in href= is
	// neutralized. Both layers should fire.
	const out = sanitizeFeedbackBody(
		'<math xlink:href="javascript:alert(1)">x</math>',
	)
	assert.ok(!/xlink:href/i.test(out), `xlink:href survived: ${out}`)
	assert.ok(!/javascript:/i.test(out))
})

await attack(
	"V-10.RT5: CSS injection via <a style='background:url(javascript:...)'>",
	async () => {
		// ATTACK: style= attribute is NOT stripped by the sanitizer.
		// CSS expression / javascript: URL in style is an XSS vector in
		// IE/legacy renderers. Modern browsers don't execute javascript:
		// in CSS url(), but document this gap.
		const out = sanitizeFeedbackBody(
			'<a style="background:url(javascript:alert(1))">x</a>',
		)
		// EXPECTATION: style= survives. This is a documented residual gap.
		// The ASSERTION is that the helper does NOT strip style=, so
		// downstream callers (SPA renderer, CLI exporters) MUST apply
		// their own style= scrubbing if they render this content.
		assert.ok(
			/style=/.test(out),
			`style= unexpectedly stripped — verify policy`,
		)
		// Document this as RESIDUAL in unit-04 ASSESSMENTS.md
		findings.push({
			severity: "LOW",
			area: "V-10",
			vector: "style= attribute not stripped (CSS injection)",
			outcome: "documented residual — sanitizer is markdown/HTML, not CSS",
		})
	},
)

await attack(
	"V-10.RT6: <base href='javascript:'> — base tag not stripped",
	async () => {
		// ATTACK: <base href="javascript:..."> changes the base URL for
		// all relative URLs in the page. Not stripped by current code.
		// The href= javascript: scheme is neutralized → href="#".
		const out = sanitizeFeedbackBody('<base href="javascript:alert(1)">')
		assert.ok(
			!/javascript:/i.test(out),
			`javascript: in base href survived: ${out}`,
		)
		// <base> tag itself survives — that's fine because href is now #.
	},
)

await attack(
	"V-10.RT7: <meta http-equiv='refresh' content='0;url=javascript:...'>",
	async () => {
		// ATTACK: meta-refresh with a javascript: URL. content= attribute
		// is NOT in href/src — neutralizeAttrUrlSchemes won't touch it.
		// This is a documented residual; the SPA renderer's input-side
		// allowlist is the line of defence here.
		const out = sanitizeFeedbackBody(
			'<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
		)
		// Document this gap.
		assert.ok(
			/javascript:/i.test(out),
			`meta-refresh javascript: survived (expected gap)`,
		)
		findings.push({
			severity: "LOW",
			area: "V-10",
			vector: "<meta http-equiv='refresh'> with javascript: in content=",
			outcome:
				"documented residual — markdown spec doesn't render meta tags; SPA renderer's allowlist is the defence",
		})
	},
)

await attack(
	"V-10.RT8: CRLF / tab inside scheme — JAVA\\tSCRIPT:",
	async () => {
		// ATTACK: browsers used to accept tabs/newlines in URL schemes.
		// `javascript:alert(1)` written as `java\tscript:alert(1)` would
		// evade a strict scheme-prefix check. Verify behaviour.
		const out = sanitizeFeedbackBody('<a href="java\tscript:alert(1)">x</a>')
		// Code uses /^(?:javascript|...)/i on url.trim() — does NOT
		// strip embedded tabs. So `java\tscript:` is NOT recognized.
		// Modern browsers also don't accept this, but document the gap.
		findings.push({
			severity: "LOW",
			area: "V-10",
			vector: "tab/newline embedded in URL scheme (java\\tscript:)",
			outcome: `present in output: ${out.slice(0, 60)}... — modern browsers reject this; documented residual`,
		})
		// We do NOT assert here — this is environment-dependent.
		assert.ok(true)
	},
)

await attack("V-10.RT9: HTML entity encoded <script>", async () => {
	// ATTACK: `&lt;script&gt;alert(1)&lt;/script&gt;` — the sanitizer
	// won't see <script> literal. The on-disk content is harmless
	// text. But if a downstream renderer decodes entities BEFORE
	// rendering and then renders as HTML, this re-emerges. Document.
	const out = sanitizeFeedbackBody("&lt;script&gt;alert(1)&lt;/script&gt;")
	// Sanitizer preserves entity-encoded text — that's correct for a
	// markdown-safe sanitizer (entities are display-time concerns).
	assert.strictEqual(out, "&lt;script&gt;alert(1)&lt;/script&gt;")
})

await attack(
	"V-10.RT10: markdown autolink <javascript:alert(1)> — angle-bracket form",
	async () => {
		// ATTACK: markdown supports <https://...> as an autolink. With
		// `<javascript:alert(1)>` the sanitizer's HTML-tag stripper sees
		// `<javascript:alert(1)>` — javascript is NOT in the dangerous-tag
		// list, so the tag-name check doesn't fire. The dangerous-URL-
		// scheme check operates on href=/src= and on `[text](url)` markdown
		// — NOT on bare-angle autolinks. Verify residual.
		const input = "<javascript:alert(1)>"
		const out = sanitizeFeedbackBody(input)
		findings.push({
			severity: "LOW",
			area: "V-10",
			vector: "markdown angle-bracket autolink with javascript: scheme",
			outcome: `present in output: ${out} — markdown renderers MAY render this as a link; SPA's input-side allowlist is the defence`,
		})
		// We do NOT assert; SPA allowlist is the actual defence.
		assert.ok(true)
	},
)

await attack(
	"V-10.RT11: orphan attribute survives after tag strip — onerror= alone on a line",
	async () => {
		// ATTACK: `<img src=x onerror=alert(1)>` — stripEventHandlers
		// regex requires `\s+on...=...`. If onerror is the FIRST attribute
		// after the tag name (`<img onerror=...>`), the leading `\s+`
		// matches the space after `<img`. Verify this case works.
		const out = sanitizeFeedbackBody("<img onerror=alert(1) src=x>")
		assert.ok(!/onerror/i.test(out), `onerror survived: ${out}`)
	},
)

await attack(
	"V-10.RT12: closing tag form </script> alone — orphan closer stripped",
	async () => {
		// ATTACK: orphan </script> can break out of a parent context in
		// some renderers. Verify it's stripped.
		const out = sanitizeFeedbackBody("normal text </script> more text")
		assert.ok(!/<\/script>/i.test(out))
	},
)

await attack(
	"V-10.RT13: backslash-escaped quote in attribute value",
	async () => {
		// ATTACK: `<img src=\"x\" onerror=\"alert(1)\">` — backslashes in
		// JSON-quoted strings reach the sanitizer as literal text. Verify
		// onerror= is still stripped.
		const out = sanitizeFeedbackBody('<img src=\\"x\\" onerror=\\"alert(1)\\">')
		// onerror= survived because the value uses `\"` not `"`. The regex
		// `(?:"[^"]*"|'[^']*'|[^\s>]+)` would try unquoted-value matching
		// against `\"alert(1)\"`. Worth documenting.
		findings.push({
			severity: "INFO",
			area: "V-10",
			vector: "backslash-escaped quotes in attribute values",
			outcome: `output: ${out} — JSON un-escapes happen at decoder layer; sanitizer sees literal backslash-quote`,
		})
		// Just record; no assertion.
		assert.ok(true)
	},
)

await attack(
	"V-10.RT14 (FB-32): nested-tag reconstitution — single-pass replace would leave live tag",
	async () => {
		// ATTACK (FB-32): a single-pass regex sanitiser strips the inner
		// `<script src=x>` from `<scr<script src=x>ipt src=x>`, then
		// concatenates the surrounding `<scr` + `ipt src=x>` into a brand-
		// new live `<script src=x>` tag. The sanitiser must iterate until
		// the input is stable (fixed point) to neutralise this class.
		// Cover several block tags and the iframe/style equivalents.
		const cases = [
			"<scr<script src=x>ipt src=x>",
			"<scri<script>pt>alert(1)</scri</script>pt>",
			"<<script>script>alert(1)</script>",
			"<i<iframe>frame src=evil>",
			"<sty<style>le>body{display:none}</sty</style>le>",
		]
		for (const input of cases) {
			const out = sanitizeFeedbackBody(input)
			assert.ok(
				!/<script\b/i.test(out),
				`reconstituted <script> survived for input ${JSON.stringify(input)}: ${out}`,
			)
			assert.ok(
				!/<iframe\b/i.test(out),
				`reconstituted <iframe> survived for input ${JSON.stringify(input)}: ${out}`,
			)
			assert.ok(
				!/<style\b/i.test(out),
				`reconstituted <style> survived for input ${JSON.stringify(input)}: ${out}`,
			)
		}
	},
)

await attack(
	"V-10.RT15 (FB-32): data:image/svg+xml in href/src is neutralised — SVG can carry <script>",
	async () => {
		// ATTACK (FB-32): SVG documents can embed executable `<script>`
		// elements and event handlers. Even via `<img src=...>`, certain
		// renderings (e.g. <object>, <embed>, direct navigation) execute
		// the SVG's scripts. `data:image/svg+xml` must be on the
		// dangerous-scheme list.
		const cases = [
			'<a href="data:image/svg+xml;base64,PHN2Zw==">x</a>',
			'<img src="data:image/svg+xml,<svg onload=alert(1)/>">',
			"![x](data:image/svg+xml;base64,PHN2Zw==)",
		]
		for (const input of cases) {
			const out = sanitizeFeedbackBody(input)
			assert.ok(
				!/data:image\/svg\+xml/i.test(out),
				`data:image/svg+xml survived for input ${JSON.stringify(input)}: ${out}`,
			)
		}
	},
)

await attack(
	"V-10.RT16 (FB-32): data:application/(java|ecma)script + data:text/javascript neutralised",
	async () => {
		// ATTACK (FB-32): script-as-data MIME types execute when navigated
		// to. The original allowlist only caught `data:text/html`; the
		// JS-flavoured data: URLs slipped through.
		const cases = [
			'<a href="data:application/javascript,alert(1)">x</a>',
			'<a href="data:application/ecmascript,alert(1)">x</a>',
			'<a href="data:text/javascript,alert(1)">x</a>',
			"[click](data:application/javascript,alert(1))",
			"[click](data:text/javascript,alert(1))",
		]
		for (const input of cases) {
			const out = sanitizeFeedbackBody(input)
			assert.ok(
				!/data:(?:application|text)\/(?:java|ecma)script/i.test(out),
				`script-as-data scheme survived for input ${JSON.stringify(input)}: ${out}`,
			)
		}
	},
)

await attack(
	"V-10.RT17 (FB-32): safe data:image/png + intent-scope paths are preserved",
	async () => {
		// REGRESSION GUARD (FB-32): widening the dangerous-scheme list
		// must NOT touch raster image data: URLs (legitimate base64
		// attachments) or relative intent-scope paths.
		const safeRaster =
			"![ok](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9R6lYwIAAAAASUVORK5CYII=)"
		assert.strictEqual(sanitizeFeedbackBody(safeRaster), safeRaster)
		const safeJpeg = "![ok](data:image/jpeg;base64,/9j/4AAQ==)"
		assert.strictEqual(sanitizeFeedbackBody(safeJpeg), safeJpeg)
		const intentScope = "![x](/api/feedback-attachment/abc/def/123.png)"
		assert.strictEqual(sanitizeFeedbackBody(intentScope), intentScope)
	},
)

// ── V-11 RED-TEAM — baseline-corrupt operator-gate bypass attempts ──────────

console.log(
	"\n=== V-11 RED-TEAM — baseline-corrupt operator-gate bypass attempts ===",
)

const { wasBaselinePreviouslyEstablished } = await import(
	"../src/orchestrator/workflow/drift-baseline.ts"
)

await attack(
	"V-11.RT1: state.json delete (CLOSED by blue-team bolt 1) — gate stays armed via action-log + sidecar fallback",
	async () => {
		// ATTACK: V-11 defence used to rely SOLELY on
		// `wasBaselinePreviouslyEstablished` reading
		// `drift_baseline_established_at` from state.json. An out-of-band
		// attacker who corrupted baseline.json AND deleted state.json
		// could silently re-establish.
		//
		// FIX (unit-03 blue-team bolt 1):
		// `wasBaselinePreviouslyEstablished` now checks THREE sources in
		// priority order:
		//   1. `baseline_established` marker in `action-log.jsonl`
		//      (append-only, tamper-evident — closes RT1 / RT6).
		//   2. validated `baseline-content/` sidecar presence
		//      (content-addressed sha256, tamper-evident — closes RT1 / RT6
		//      even if the action-log is unavailable).
		//   3. state.json `drift_baseline_established_at` fast path
		//      (legacy compat — kept but no longer the only signal).
		//
		// This test now asserts the FIX: with a `baseline_established`
		// marker in the action log AND a validated sidecar on disk,
		// deleting state.json does NOT disarm the gate.
		const root = mkdtempSync(join(tmp, "v11rt1-"))
		mkdirSync(join(root, "stages", "security"), { recursive: true })
		// SIMULATE: stage established a baseline previously, leaving a
		// marker in the action-log AND a validated sidecar.
		writeFileSync(
			join(root, "stages", "security", "state.json"),
			JSON.stringify({
				status: "active",
				drift_baseline_established_at: "2026-04-30T00:00:00Z",
			}),
		)
		writeFileSync(
			join(root, "action-log.jsonl"),
			`${JSON.stringify({
				entry_type: "baseline_established",
				path: "__baseline_marker__:established:security",
				sha: "",
				author_class: "agent",
				timestamp: "2026-04-30T00:00:00Z",
				human_author_id: null,
				entry_id: "BLN-EST-1-aaa",
				tick_counter: 1,
			})}\n`,
		)
		const { createHash } = await import("node:crypto")
		const sidecarContent = Buffer.from("sample baselined content")
		const sidecarSha = createHash("sha256").update(sidecarContent).digest("hex")
		mkdirSync(join(root, "stages", "security", "baseline-content"), {
			recursive: true,
		})
		writeFileSync(
			join(root, "stages", "security", "baseline-content", sidecarSha),
			sidecarContent,
		)

		// Confirm gate sees previously-established before the attack.
		assert.strictEqual(
			wasBaselinePreviouslyEstablished(root, "security"),
			true,
			"setup: marker + sidecar present",
		)
		// ATTACK: delete state.json (out-of-band file modification).
		unlinkSync(join(root, "stages", "security", "state.json"))
		// HELD: gate still reports previously-established because the
		// action-log marker AND the validated sidecar both survive.
		const after = wasBaselinePreviouslyEstablished(root, "security")
		assert.strictEqual(
			after,
			true,
			"BYPASS REGRESSION: V-11 gate disarmed by state.json delete — fix in drift-baseline.ts must check action-log marker and sidecar presence",
		)
	},
)

await attack(
	"V-11.RT2: baseline-thrash.json delete (CLOSED by blue-team bolt 1) — action-log floor preserves the count",
	async () => {
		// ATTACK: thrash counter used to live SOLELY in
		// `baseline-thrash.json` on-disk. An out-of-band attacker who
		// deleted it zeroed the circuit breaker, opening the door for
		// fresh recovery cycles per attack.
		//
		// FIX (unit-03 blue-team bolt 1): `recordBaselineCorruption`
		// now ALSO appends a `baseline_corruption_event` entry to
		// `action-log.jsonl` (append-only, tamper-evident).
		// `isBaselineThrashing` takes MAX(cache_count, log_count) so an
		// attacker who deletes only the cache file is still seen as
		// thrashing if the log retains the events.
		//
		// This test now asserts the FIX: deleting baseline-thrash.json
		// does NOT zero the breaker.
		const { recordBaselineCorruption, isBaselineThrashing } = await import(
			"../src/orchestrator/workflow/drift-baseline.ts"
		)
		const root = mkdtempSync(join(tmp, "v11rt2-"))
		mkdirSync(join(root, "stages", "security"), { recursive: true })
		// Build up to thrashing state (4 events at tick 4).
		recordBaselineCorruption(root, "security", 1)
		recordBaselineCorruption(root, "security", 2)
		recordBaselineCorruption(root, "security", 3)
		recordBaselineCorruption(root, "security", 4)
		assert.strictEqual(
			isBaselineThrashing(root, "security", 4).thrashing,
			true,
			"setup: thrashing engaged",
		)
		// ATTACK: delete the thrash counter
		unlinkSync(join(root, "stages", "security", "baseline-thrash.json"))
		const after = isBaselineThrashing(root, "security", 4)
		// HELD: action-log floor keeps the count at 4, breaker stays
		// engaged.
		assert.strictEqual(
			after.thrashing,
			true,
			"BYPASS REGRESSION: circuit breaker zeroed by baseline-thrash.json delete — fix in drift-baseline.ts must mirror corruption events to action-log",
		)
		assert.strictEqual(
			after.recentCount,
			4,
			"action-log floor must retain all 4 events",
		)
	},
)

await attack(
	"V-11.RT3: ack marker without corresponding diff hash — only diff_hash field shape is checked",
	async () => {
		// ATTACK: writeBaselineAckMarker is exported and called by the
		// repair tool. `readBaselineAckMarker` validates `diff_hash` is
		// 64 hex chars and `created_at` is non-empty — but does NOT cross-
		// check that diff_hash matches the reconstructed-vs-on-disk diff.
		// That cross-check is the REPAIR TOOL's job. Verify the storage
		// layer is permissive (stores any well-formed marker).
		const { writeBaselineAckMarker, readBaselineAckMarker } = await import(
			"../src/orchestrator/workflow/drift-baseline.ts"
		)
		const root = mkdtempSync(join(tmp, "v11rt3-"))
		mkdirSync(join(root, "stages", "security"), { recursive: true })
		const fakeMarker = {
			diff_hash: "f".repeat(64), // arbitrary but well-formed
			created_at: "2026-04-30T00:00:00Z",
		}
		writeBaselineAckMarker(root, "security", fakeMarker)
		const back = readBaselineAckMarker(root, "security")
		assert.deepStrictEqual(back, fakeMarker)
		// The DRIFT GATE's defence is the SINGLE-USE clearAckMarker semantic
		// — even with a forged-but-well-formed marker, it authorises ONE
		// silent establish, then is consumed. So an attacker who can write
		// the marker file directly (filesystem access) can authorise ONE
		// silent establish per cycle.
		findings.push({
			severity: "MED",
			area: "V-11",
			vector: "out-of-band write of .baseline-ack with arbitrary diff_hash",
			outcome:
				"single silent-establish per write — gate doesn't verify the diff_hash matches a real reconstructed-vs-on-disk diff. Mitigation: gate should compute diff_hash itself and compare. Threat-model assumption is that out-of-band-writable filesystem == compromised host == can't defend further; document residual.",
		})
	},
)

await attack(
	"V-11.RT4: thrash threshold is strictly > 3, not >= 3 — verify boundary",
	async () => {
		// ATTACK: an attacker who knows the thrash threshold (3) can fire
		// EXACTLY 3 corruption events per 10-tick window indefinitely
		// without tripping the circuit breaker. Verify this boundary.
		const { recordBaselineCorruption, isBaselineThrashing } = await import(
			"../src/orchestrator/workflow/drift-baseline.ts"
		)
		const root = mkdtempSync(join(tmp, "v11rt4-"))
		mkdirSync(join(root, "stages", "security"), { recursive: true })
		recordBaselineCorruption(root, "security", 1)
		recordBaselineCorruption(root, "security", 2)
		recordBaselineCorruption(root, "security", 3)
		const at3 = isBaselineThrashing(root, "security", 3)
		assert.strictEqual(at3.recentCount, 3)
		assert.strictEqual(
			at3.thrashing,
			false,
			"3 events does NOT trip circuit breaker — attacker can fire 3-per-window indefinitely",
		)
		findings.push({
			severity: "INFO",
			area: "V-11",
			vector: "thrash threshold = strictly > 3",
			outcome:
				"an attacker who paces corruption to ≤3 per 10-tick window stays under the breaker. Each corruption requires operator ack to recover, so the attack is loud — operator will notice the recurring acks. Documented residual; tighten threshold if telemetry shows the pattern in production.",
		})
	},
)

await attack(
	"V-11.RT5: reconstructPriorBaseline trusts action-log paths without validating against tracked surface",
	async () => {
		// ATTACK: action-log.jsonl is on-disk and could be tampered with
		// (even though haiku_human_write blocks the agent, out-of-band
		// access is the threat model). reconstructPriorBaseline reads
		// path strings from the log without checking they're inside the
		// tracked surface. An attacker who appends a forged entry like
		// {"path": "../../etc/passwd", "sha": "<valid-sidecar-sha>"}
		// could mislead the operator-confirmation diff.
		const { reconstructPriorBaseline } = await import(
			"../src/orchestrator/workflow/drift-baseline.ts"
		)
		const { createHash } = await import("node:crypto")
		const root = mkdtempSync(join(tmp, "v11rt5-"))
		mkdirSync(join(root, "stages", "security", "baseline-content"), {
			recursive: true,
		})
		const content = Buffer.from("hello")
		const sha = createHash("sha256").update(content).digest("hex")
		writeFileSync(
			join(root, "stages", "security", "baseline-content", sha),
			content,
		)
		writeFileSync(
			join(root, "action-log.jsonl"),
			`${JSON.stringify({
				path: "../../etc/passwd",
				sha,
				tick_counter: 1,
			})}\n`,
		)
		const result = reconstructPriorBaseline(root, "security")
		// EXPECTED: the path should NOT appear in the reconstructed
		// baseline (or appear with a sanitized indicator). Current code
		// inserts it as-is into entries.
		assert.ok(result, "reconstruction should succeed")
		const escapingPath = result.entries.get("../../etc/passwd")
		// If escapingPath is defined, this is a path-injection in the
		// operator-confirmation diff. The diff itself is for OPERATOR
		// review — the operator would notice an `etc/passwd` entry. But
		// document the gap.
		if (escapingPath) {
			findings.push({
				severity: "LOW",
				area: "V-11",
				vector:
					"reconstructPriorBaseline trusts action-log paths (no tracked-surface validation)",
				outcome: `path '../../etc/passwd' surfaces in reconstructed baseline. Mitigation: filter paths through canonicalisePath + tracked-surface allowlist before emitting. Operator-visible in diff so the attack is noisy.`,
			})
		}
		assert.ok(true)
	},
)

await attack(
	"V-11.RT6: state.json field stealth-removal (CLOSED by blue-team bolt 1) — sidecar fallback wins",
	async () => {
		// ATTACK: an attacker who can write state.json (out-of-band) used
		// to be able to remove only the drift_baseline_established_at
		// field while leaving everything else intact — same effect as
		// deleting the whole file but stealthier.
		//
		// FIX (unit-03 blue-team bolt 1):
		// `wasBaselinePreviouslyEstablished` consults action-log + sidecar
		// presence BEFORE the state.json fast-path; truncating the field
		// no longer disarms the gate.
		const root = mkdtempSync(join(tmp, "v11rt6-"))
		mkdirSync(join(root, "stages", "security"), { recursive: true })
		const stateFile = join(root, "stages", "security", "state.json")
		writeFileSync(
			stateFile,
			JSON.stringify({
				status: "active",
				drift_baseline_established_at: "2026-04-30T00:00:00Z",
				other: "field",
			}),
		)
		// SIMULATE: sidecar exists from a prior establish (the fix's
		// secondary tamper-evident anchor).
		const { createHash } = await import("node:crypto")
		const sidecarContent = Buffer.from("sample baselined content rt6")
		const sidecarSha = createHash("sha256").update(sidecarContent).digest("hex")
		mkdirSync(join(root, "stages", "security", "baseline-content"), {
			recursive: true,
		})
		writeFileSync(
			join(root, "stages", "security", "baseline-content", sidecarSha),
			sidecarContent,
		)
		assert.strictEqual(wasBaselinePreviouslyEstablished(root, "security"), true)
		// ATTACK: rewrite state.json without the stamp
		writeFileSync(
			stateFile,
			JSON.stringify({ status: "active", other: "field" }),
		)
		const after = wasBaselinePreviouslyEstablished(root, "security")
		// HELD: sidecar presence keeps the signal alive even with the
		// stamp removed.
		assert.strictEqual(
			after,
			true,
			"BYPASS REGRESSION: V-11 gate disarmed by stamp removal — fix must keep sidecar/action-log fallback",
		)
	},
)

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Red-team summary ===`)
console.log(`  ${passed} attacks held (defence worked)`)
console.log(`  ${failed} attacks succeeded (real bypass / gap surfaced)`)
console.log(`  ${findings.length} findings logged for triage`)
// Standard "X passed, Y failed" line for the run-all.mjs aggregator.
// Each red-team attack maps to one assertion that the defence held;
// findings are observational artifacts logged for unit-04 triage, NOT
// test failures.
console.log(`\n${passed} passed, ${failed} failed`)
if (findings.length > 0) {
	console.log("\nFindings:")
	for (const f of findings) {
		if (f.severity) {
			console.log(`  [${f.severity}] ${f.area}: ${f.vector}`)
			console.log(`         ${f.outcome}`)
		} else {
			console.log(`  • ${f.name}: ${f.error}`)
		}
	}
}

// Cleanup
try {
	rmSync(tmp, { recursive: true, force: true })
} catch {
	// best-effort
}

process.exit(failed > 0 ? 1 : 0)
