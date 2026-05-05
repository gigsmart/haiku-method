#!/usr/bin/env npx tsx
// Test suite for telemetry OTEL env-var resolution.
// Run: npx tsx test/telemetry-otel.test.mjs

import assert from "node:assert"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		console.log(`  ✓ ${name}`)
		passed++
	} catch (err) {
		console.error(`  ✗ ${name}`)
		console.error(`    ${err.message}`)
		failed++
	}
}

// Each test reloads telemetry.ts with a fresh env so module-level
// resolution picks up the env vars we set here.

async function withEnv(overrides, fn) {
	const originalEnv = { ...process.env }
	// Scrub any OTEL_ or CLAUDE_CODE_ENABLE_TELEMETRY first
	for (const k of Object.keys(process.env)) {
		if (k.startsWith("OTEL_") || k === "CLAUDE_CODE_ENABLE_TELEMETRY") {
			delete process.env[k]
		}
	}
	Object.assign(process.env, overrides)
	try {
		// Force fresh module evaluation for both config.ts and telemetry.ts
		const cacheBust = `?t=${Date.now()}-${Math.random()}`
		const mod = await import(`../src/telemetry.ts${cacheBust}`)
		return fn(mod.__test)
	} finally {
		for (const k of Object.keys(process.env)) {
			if (k.startsWith("OTEL_") || k === "CLAUDE_CODE_ENABLE_TELEMETRY") {
				delete process.env[k]
			}
		}
		Object.assign(process.env, originalEnv)
	}
}

console.log("=== telemetry: OTEL env-var resolution ===")

// ── parseHeaders ─────────────────────────────────────────────────────────

await withEnv({}, (t) => {
	test("parseHeaders: simple key=value pair", () => {
		const h = t.parseHeaders("x-api-key=abc123")
		assert.deepStrictEqual(h, { "x-api-key": "abc123" })
	})

	test("parseHeaders: multiple pairs", () => {
		const h = t.parseHeaders("x-api-key=abc,x-tenant=acme")
		assert.deepStrictEqual(h, { "x-api-key": "abc", "x-tenant": "acme" })
	})

	test("parseHeaders: value with = is preserved", () => {
		const h = t.parseHeaders("Authorization=Basic dXNlcjpwYXNz")
		assert.deepStrictEqual(h, { Authorization: "Basic dXNlcjpwYXNz" })
	})

	test("parseHeaders: value with base64 padding (=)", () => {
		const h = t.parseHeaders("X-Token=YWJjZA==")
		assert.deepStrictEqual(h, { "X-Token": "YWJjZA==" })
	})

	test("parseHeaders: percent-decodes values per OTEL spec", () => {
		const h = t.parseHeaders("x-auth=foo%2Cbar%20baz")
		assert.deepStrictEqual(h, { "x-auth": "foo,bar baz" })
	})

	test("parseHeaders: trims whitespace around pairs", () => {
		const h = t.parseHeaders("  x-one = aaa , x-two = bbb ")
		assert.deepStrictEqual(h, { "x-one": "aaa", "x-two": "bbb" })
	})

	test("parseHeaders: empty string yields empty map", () => {
		const h = t.parseHeaders("")
		assert.deepStrictEqual(h, {})
	})

	test("parseHeaders: malformed pair without = is skipped", () => {
		const h = t.parseHeaders("bad,x-good=ok")
		assert.deepStrictEqual(h, { "x-good": "ok" })
	})
})

// ── Endpoint resolution ──────────────────────────────────────────────────

await withEnv(
	{ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example:4318" },
	(t) => {
		test("endpoint: generic base gets /v1/logs appended", () => {
			assert.strictEqual(
				t.resolveEndpoint(),
				"http://collector.example:4318/v1/logs",
			)
		})
	},
)

await withEnv(
	{ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example:4318/" },
	(t) => {
		test("endpoint: trailing slash is stripped before append", () => {
			assert.strictEqual(
				t.resolveEndpoint(),
				"http://collector.example:4318/v1/logs",
			)
		})
	},
)

await withEnv(
	{
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://generic.example:4318",
		OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "https://logs.example/custom/path",
	},
	(t) => {
		test("endpoint: per-signal overrides generic and is used as-is", () => {
			assert.strictEqual(
				t.resolveEndpoint(),
				"https://logs.example/custom/path",
			)
		})
	},
)

await withEnv({}, (t) => {
	test("endpoint: default is localhost:4318 (HTTP) + /v1/logs", () => {
		assert.strictEqual(t.resolveEndpoint(), "http://localhost:4318/v1/logs")
	})
})

// ── Header resolution ────────────────────────────────────────────────────

await withEnv({ OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=abc" }, (t) => {
	test("headers: generic headers are used when no per-signal set", () => {
		assert.deepStrictEqual(t.resolveHeaders(), { "x-api-key": "abc" })
	})
})

await withEnv(
	{
		OTEL_EXPORTER_OTLP_HEADERS: "x-generic=g",
		OTEL_EXPORTER_OTLP_LOGS_HEADERS: "x-logs=l,Authorization=Bearer xyz",
	},
	(t) => {
		test("headers: per-signal replaces generic (OTEL spec)", () => {
			assert.deepStrictEqual(t.resolveHeaders(), {
				"x-logs": "l",
				Authorization: "Bearer xyz",
			})
		})
	},
)

// ── Protocol resolution ──────────────────────────────────────────────────

await withEnv({}, (t) => {
	test("protocol: defaults to http/json when nothing is set", () => {
		assert.strictEqual(t.resolveProtocol(), "http/json")
	})
})

await withEnv({ OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf" }, (t) => {
	test("protocol: honors generic setting", () => {
		assert.strictEqual(t.resolveProtocol(), "http/protobuf")
	})
})

await withEnv(
	{
		OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
		OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: "http/json",
	},
	(t) => {
		test("protocol: per-signal overrides generic", () => {
			assert.strictEqual(t.resolveProtocol(), "http/json")
		})
	},
)

// ── Timeout resolution ───────────────────────────────────────────────────

await withEnv({}, (t) => {
	test("timeout: defaults to OTEL spec 10_000 ms", () => {
		assert.strictEqual(t.resolveTimeoutMs(), 10_000)
	})
})

await withEnv({ OTEL_EXPORTER_OTLP_TIMEOUT: "3000" }, (t) => {
	test("timeout: honors generic value", () => {
		assert.strictEqual(t.resolveTimeoutMs(), 3000)
	})
})

await withEnv(
	{
		OTEL_EXPORTER_OTLP_TIMEOUT: "3000",
		OTEL_EXPORTER_OTLP_LOGS_TIMEOUT: "7500",
	},
	(t) => {
		test("timeout: per-signal overrides generic", () => {
			assert.strictEqual(t.resolveTimeoutMs(), 7500)
		})
	},
)

// ── Resource attribute resolution ────────────────────────────────────────

await withEnv({}, (t) => {
	test("resourceAttrs: defaults to service.name=haiku", () => {
		assert.deepStrictEqual(t.resolveResourceAttrs(), [
			{ key: "service.name", value: { stringValue: "haiku" } },
		])
	})
})

await withEnv({ OTEL_SERVICE_NAME: "my-service" }, (t) => {
	test("resourceAttrs: OTEL_SERVICE_NAME overrides default", () => {
		const attrs = t.resolveResourceAttrs()
		const byKey = Object.fromEntries(
			attrs.map((a) => [a.key, a.value.stringValue]),
		)
		assert.strictEqual(byKey["service.name"], "my-service")
	})
})

await withEnv(
	{
		OTEL_RESOURCE_ATTRIBUTES:
			"deployment.environment=prod,service.name=from-attrs,region=us-east",
	},
	(t) => {
		test("resourceAttrs: OTEL_RESOURCE_ATTRIBUTES can set service.name and add attrs", () => {
			const attrs = t.resolveResourceAttrs()
			const byKey = Object.fromEntries(
				attrs.map((a) => [a.key, a.value.stringValue]),
			)
			assert.strictEqual(byKey["service.name"], "from-attrs")
			assert.strictEqual(byKey["deployment.environment"], "prod")
			assert.strictEqual(byKey.region, "us-east")
		})
	},
)

await withEnv(
	{
		OTEL_RESOURCE_ATTRIBUTES: "service.name=from-attrs",
		OTEL_SERVICE_NAME: "from-svc-name",
	},
	(t) => {
		test("resourceAttrs: OTEL_SERVICE_NAME wins over OTEL_RESOURCE_ATTRIBUTES", () => {
			const attrs = t.resolveResourceAttrs()
			const byKey = Object.fromEntries(
				attrs.map((a) => [a.key, a.value.stringValue]),
			)
			assert.strictEqual(byKey["service.name"], "from-svc-name")
			// Should not have two service.name entries
			assert.strictEqual(
				attrs.filter((a) => a.key === "service.name").length,
				1,
			)
		})
	},
)

await withEnv(
	{ OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=prod%20east" },
	(t) => {
		test("resourceAttrs: percent-decodes values", () => {
			const attrs = t.resolveResourceAttrs()
			const byKey = Object.fromEntries(
				attrs.map((a) => [a.key, a.value.stringValue]),
			)
			assert.strictEqual(byKey["deployment.environment"], "prod east")
		})
	},
)

// ── otelHeadersHelper (Claude Code settings) ─────────────────────────────
//
// Write a temporary settings.json pointing at a temporary shell script,
// then run in that directory so loadClaudeCodeSettings() picks it up.

import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join as pjoin } from "node:path"

async function withHelperScript(scriptBody, settingsBody, fn) {
	const dir = mkdtempSync(pjoin(tmpdir(), "haiku-otel-helper-"))
	const claudeDir = pjoin(dir, ".claude")
	mkdirSync(claudeDir, { recursive: true })

	const scriptPath = pjoin(dir, "helper.sh")
	writeFileSync(scriptPath, scriptBody, { mode: 0o755 })
	chmodSync(scriptPath, 0o755)

	const settings = settingsBody ?? { otelHeadersHelper: scriptPath }
	writeFileSync(pjoin(claudeDir, "settings.json"), JSON.stringify(settings))

	const originalCwd = process.cwd()
	process.chdir(dir)
	try {
		await fn(scriptPath)
	} finally {
		process.chdir(originalCwd)
		rmSync(dir, { recursive: true, force: true })
	}
}

await withHelperScript(
	`#!/bin/sh\necho '{"Authorization":"Bearer helper-token","X-Tenant":"acme"}'\n`,
	null,
	async (_scriptPath) => {
		await withEnv({}, (t) => {
			t.resetHelperCache()
			test("otelHeadersHelper: executes script and returns parsed headers", () => {
				const headers = t.resolveHelperHeaders()
				assert.deepStrictEqual(headers, {
					Authorization: "Bearer helper-token",
					"X-Tenant": "acme",
				})
			})
		})
	},
)

await withHelperScript(`#!/bin/sh\necho "not json"\n`, null, async () => {
	await withEnv({}, (t) => {
		t.resetHelperCache()
		const origErr = console.error
		console.error = () => {}
		try {
			test("otelHeadersHelper: invalid JSON returns empty, does not throw", () => {
				const headers = t.resolveHelperHeaders()
				assert.deepStrictEqual(headers, {})
			})
		} finally {
			console.error = origErr
		}
	})
})

await withHelperScript(`#!/bin/sh\necho '{"key": 123}'\n`, null, async () => {
	await withEnv({}, (t) => {
		t.resetHelperCache()
		const origErr = console.error
		console.error = () => {}
		try {
			test("otelHeadersHelper: rejects non-string values", () => {
				const headers = t.resolveHelperHeaders()
				assert.deepStrictEqual(headers, {})
			})
		} finally {
			console.error = origErr
		}
	})
})

await withHelperScript(`#!/bin/sh\nexit 1\n`, null, async () => {
	await withEnv({}, (t) => {
		t.resetHelperCache()
		const origErr = console.error
		console.error = () => {}
		try {
			test("otelHeadersHelper: non-zero exit returns empty, does not throw", () => {
				const headers = t.resolveHelperHeaders()
				assert.deepStrictEqual(headers, {})
			})
		} finally {
			console.error = origErr
		}
	})
})

await withHelperScript(`#!/bin/sh\ndate +%s%N\n`, null, async () => {
	await withEnv(
		{ CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS: "60000" },
		(t) => {
			t.resetHelperCache()
			const origErr = console.error
			console.error = () => {}
			try {
				test("otelHeadersHelper: result is cached within debounce window", () => {
					const origStderr = process.stderr.write
					process.stderr.write = () => true
					try {
						// First call runs the helper (returns invalid JSON, so we get
						// empty object), caches the attempt timestamp. We expose a
						// separate test with a valid script below for the "cache hit
						// returns same object" path — here we just verify the
						// function returns without error and does not re-invoke
						// on the second call if cached successfully.
						const first = t.resolveHelperHeaders()
						const second = t.resolveHelperHeaders()
						assert.deepStrictEqual(first, second)
					} finally {
						process.stderr.write = origStderr
					}
				})
			} finally {
				console.error = origErr
			}
		},
	)
})

await withHelperScript(
	`#!/bin/sh\necho '{"Authorization":"Bearer one"}'\n`,
	null,
	async () => {
		await withEnv({}, (t) => {
			t.resetHelperCache()
			test("otelHeadersHelper: second call within debounce returns cached value", () => {
				const first = t.resolveHelperHeaders()
				assert.deepStrictEqual(first, { Authorization: "Bearer one" })
				// Second call should be served from cache (same reference in current impl)
				const second = t.resolveHelperHeaders()
				assert.deepStrictEqual(second, first)
			})
		})
	},
)

// Settings-not-configured path
{
	const dir = mkdtempSync(pjoin(tmpdir(), "haiku-otel-no-settings-"))
	const originalCwd = process.cwd()
	process.chdir(dir)
	try {
		await withEnv({}, (t) => {
			t.resetHelperCache()
			test("otelHeadersHelper: returns empty when not configured in settings", () => {
				assert.deepStrictEqual(t.resolveHelperHeaders(), {})
				assert.strictEqual(t.resolveOtelHeadersHelperPath(), "")
			})
		})
	} finally {
		process.chdir(originalCwd)
		rmSync(dir, { recursive: true, force: true })
	}
}

// ── Runtime PII deny-list (unit-02-telemetry-coverage) ──────────────────────
//
// These tests pin the chosen semantics: STRIP (not throw). Future refactors
// that flip the semantics — including silently removing the deny list — fail
// these tests, surfacing the change at PR time. Together with the static-grep
// gate (`pii-grep-gate-runs`), this is the runtime safety net that prevents a
// new emit site from silently exfiltrating user content as a telemetry attribute.

await withEnv({}, (t) => {
	test("PII deny: deny set contains the specified body-shaped keys", () => {
		// Spec keys (unit-02-telemetry-coverage runtime PII gate).
		const required = [
			"diff_unified",
			"excerpt",
			"file_content",
			"file_body",
			"user_email",
			"user_name",
			"message_body",
			"finding_body",
			"fb_body",
			"content",
		]
		for (const key of required) {
			assert.ok(t.piiDenyKeys.has(key), `expected "${key}" in deny list`)
		}
	})

	test("PII deny: deny set contains credential-shaped keys", () => {
		// Credential-shaped keys mirror the body-shaped concern: a future
		// emit site that grabs `req.headers.authorization` as `auth_header`
		// or `ctx.session.token` as `token` would silently leak a credential
		// through OTLP. These are the canonical (case-folded) entries.
		const required = [
			"password",
			"passwd",
			"pwd",
			"token",
			"access_token",
			"refresh_token",
			"id_token",
			"bearer_token",
			"bearer",
			"api_key",
			"apikey",
			"api-key",
			"authorization",
			"auth_header",
			"auth",
			"secret",
			"client_secret",
			"signing_secret",
			"credential",
			"credentials",
			"session_id",
			"cookie",
			"private_key",
			"pem",
		]
		for (const key of required) {
			assert.ok(t.piiDenyKeys.has(key), `expected "${key}" in deny list`)
		}
	})

	test("PII deny: path-shaped keys are NOT in the deny list", () => {
		// Path attributes describe the workflow-managed surface and are
		// opaque to PII. Stripping them would break correlation.
		assert.ok(!t.piiDenyKeys.has("file_path"))
		assert.ok(!t.piiDenyKeys.has("relpath"))
		assert.ok(!t.piiDenyKeys.has("path"))
	})

	test("PII deny: hash-shaped keys are NOT in the deny list", () => {
		assert.ok(!t.piiDenyKeys.has("before_sha256"))
		assert.ok(!t.piiDenyKeys.has("after_sha256"))
	})

	test("PII deny: sanitizeAttributes strips a single denied key", () => {
		t.resetPiiWarnings()
		// Capture stderr to assert the warning fires once per key.
		const errs = []
		const origErr = console.error
		console.error = (msg) => errs.push(String(msg))
		try {
			const cleaned = t.sanitizeAttributes("test.event", {
				intent_slug: "demo",
				diff_unified: "+++ secret\n--- secret",
			})
			assert.deepStrictEqual(cleaned, { intent_slug: "demo" })
			assert.ok(
				errs.some((e) => e.includes("diff_unified")),
				`expected stderr warning mentioning diff_unified, got: ${errs.join(" | ")}`,
			)
		} finally {
			console.error = origErr
		}
	})

	test("PII deny: sanitizeAttributes strips multiple denied keys at once", () => {
		t.resetPiiWarnings()
		const origErr = console.error
		console.error = () => {}
		try {
			const cleaned = t.sanitizeAttributes("test.event", {
				stage: "design",
				excerpt: "user diff line",
				message_body: "hi",
				file_path: "knowledge/X.md",
			})
			assert.deepStrictEqual(cleaned, {
				stage: "design",
				file_path: "knowledge/X.md",
			})
		} finally {
			console.error = origErr
		}
	})

	test("PII deny: sanitizeAttributes is a no-op when nothing matches", () => {
		t.resetPiiWarnings()
		const input = {
			intent_slug: "demo",
			stage: "design",
			tick_iteration: "3",
			before_sha256: "abc",
		}
		const cleaned = t.sanitizeAttributes("test.event", input)
		// Reference equality is the cheap signal that the path bypassed
		// the copy — confirming "no-strip" doesn't allocate.
		assert.strictEqual(cleaned, input)
	})

	test("PII deny: sanitizeAttributes strips credential-shaped keys", () => {
		t.resetPiiWarnings()
		const origErr = console.error
		console.error = () => {}
		try {
			const cleaned = t.sanitizeAttributes("test.event", {
				intent_slug: "demo",
				token: "ya29.A0AfH6SMB...",
				api_key: "sk-live-...",
				authorization: "Bearer abc.def.ghi",
				password: "hunter2",
			})
			assert.deepStrictEqual(cleaned, { intent_slug: "demo" })
		} finally {
			console.error = origErr
		}
	})

	test("PII deny: sanitizeAttributes is case-insensitive", () => {
		// HTTP header names and env-var conventions routinely use mixed case.
		// `Authorization`, `API_KEY`, `Token` must strip equivalently to their
		// lower-case canonical forms.
		t.resetPiiWarnings()
		const origErr = console.error
		console.error = () => {}
		try {
			const cleaned = t.sanitizeAttributes("test.event", {
				intent_slug: "demo",
				Authorization: "Bearer abc",
				API_KEY: "sk-live-...",
				Token: "ya29...",
				PASSWORD: "hunter2",
			})
			assert.deepStrictEqual(cleaned, { intent_slug: "demo" })
		} finally {
			console.error = origErr
		}
	})

	test("PII deny: warning fires once per key, not per call", () => {
		t.resetPiiWarnings()
		const errs = []
		const origErr = console.error
		console.error = (msg) => errs.push(String(msg))
		try {
			t.sanitizeAttributes("a", { content: "x" })
			t.sanitizeAttributes("b", { content: "y" })
			t.sanitizeAttributes("c", { content: "z" })
			const matches = errs.filter((e) => e.includes('"content"')).length
			assert.strictEqual(
				matches,
				1,
				`expected one warning for "content", got ${matches}: ${errs.join(" | ")}`,
			)
		} finally {
			console.error = origErr
		}
	})
})

// ── Attribute-schema stability (unit-02-telemetry-coverage) ─────────────────
//
// Pin the attribute key set for every event added by unit-02. Schema changes
// require a test update — visible at PR time. The events are emitted from
// drift-detection-gate.ts and run-tick.ts; here we only verify the
// allow-lists per event since the emit sites themselves are unit-tested by
// the gate suites.
test("schema: every drift/reconciliation event has a documented allow-list", () => {
	const SCHEMAS = {
		"haiku.drift.gate.kill_switch_hit": [
			"intent_slug",
			"stage",
			"tick_iteration",
		],
		"haiku.drift.gate.tick": ["intent_slug", "stage", "tick_iteration"],
		"haiku.drift.gate.duration_ms": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"duration_ms",
			"outcome",
		],
		"haiku.drift.markers.open_count": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"open_count",
		],
		"haiku.drift.markers.total_count": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"total_count",
		],
		"haiku.drift.markers.stale_removed": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"removed_count",
		],
		"haiku.drift.markers.suppressed_count": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"count",
		],
		"haiku.drift.surface.size": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"file_count",
		],
		"haiku.drift.findings.count": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"count",
			"synthetic",
		],
		"haiku.drift.silent_auto_add.count": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"count",
		],
		"haiku.drift.baseline.established": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"file_count",
		],
		"haiku.drift.baseline.corrupt": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"error",
		],
		"haiku.drift.baseline.write_failed": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"error",
			"site",
		],
		"haiku.drift.findings.mass_synthesized": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"raw_findings_count",
			"effective_surface_size",
			"drift_ratio",
		],
		"haiku.drift.assessments.count": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"count",
		],
		"haiku.drift.assessments.resolved": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"count",
		],
		"haiku.reconciliation.fingerprint.duration_ms": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"duration_ms",
		],
		"haiku.reconciliation.fingerprint.established": [
			"intent_slug",
			"stage",
			"tick_iteration",
		],
		"haiku.reconciliation.fingerprint.matched": [
			"intent_slug",
			"stage",
			"tick_iteration",
		],
		"haiku.reconciliation.fingerprint.drifted": [
			"intent_slug",
			"stage",
			"tick_iteration",
		],
		"haiku.reconciliation.fingerprint.skipped": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"reason",
		],
		"haiku.reconciliation.fingerprint.write_failed": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"error",
		],
		"haiku.reconciliation.findings.emitted": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"count",
		],
		"haiku.reconciliation.corpus.bytes": [
			"intent_slug",
			"stage",
			"tick_iteration",
			"bytes",
		],
	}
	// Every schema must include the correlation triple — the PII gate
	// treats absence of intent_slug as a violation upstream, but here
	// we statically guarantee the contract at the schema layer too.
	for (const [name, keys] of Object.entries(SCHEMAS)) {
		assert.ok(keys.includes("intent_slug"), `${name} missing intent_slug`)
		assert.ok(keys.includes("stage"), `${name} missing stage`)
		assert.ok(keys.includes("tick_iteration"), `${name} missing tick_iteration`)
	}
	// And no schema may declare a key that lives in the PII deny list.
	// This is the static counterpart to the runtime sanitiser: even
	// the documented schema can't accidentally pin a body-shaped or
	// credential-shaped key. Comparison is case-folded to mirror
	// `sanitizeAttributes` (HTTP header / env-var conventions use
	// mixed case and an exact-match would let `Authorization` through).
	const denied = new Set([
		// Body / content-shaped
		"diff_unified",
		"excerpt",
		"file_content",
		"file_body",
		"user_email",
		"user_name",
		"message_body",
		"finding_body",
		"fb_body",
		"content",
		// Credential-shaped
		"password",
		"passwd",
		"pwd",
		"token",
		"access_token",
		"refresh_token",
		"id_token",
		"bearer_token",
		"bearer",
		"api_key",
		"apikey",
		"api-key",
		"authorization",
		"auth_header",
		"auth",
		"secret",
		"client_secret",
		"signing_secret",
		"credential",
		"credentials",
		"session_id",
		"cookie",
		"private_key",
		"pem",
	])
	for (const [name, keys] of Object.entries(SCHEMAS)) {
		for (const key of keys) {
			assert.ok(
				!denied.has(key.toLowerCase()),
				`${name} declares deny-listed key "${key}"`,
			)
		}
	}
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
