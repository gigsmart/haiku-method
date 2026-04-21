/**
 * In-process smoke test for audit-banned-patterns.mjs.
 *
 * Spawns the audit script as a subprocess via execFileSync per profile and
 * asserts exit 0 plus a clean summary line. `execFileSync` throws on
 * non-zero exit, so the catch path surfaces the stdout/stderr for easy
 * debugging. See unit-09 tactical plan §E.
 */

import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// process.cwd() resolves to the haiku-ui package root under `npm test` (the
// package.json scripts set the CWD). Fall back to walking from the test file
// if invoked outside the package directory.
const SCRIPT = resolve(process.cwd(), "scripts/audit-banned-patterns.mjs")

function runAudit(profile: string): string {
	try {
		return execFileSync(process.execPath, [SCRIPT, `--profile=${profile}`], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		})
	} catch (err: unknown) {
		const error = err as {
			status?: number
			stdout?: string | Buffer
			stderr?: string | Buffer
		}
		const stdout =
			typeof error.stdout === "string"
				? error.stdout
				: (error.stdout?.toString() ?? "")
		const stderr =
			typeof error.stderr === "string"
				? error.stderr
				: (error.stderr?.toString() ?? "")
		throw new Error(
			`audit exited with code ${error.status}\n--- STDOUT ---\n${stdout}\n--- STDERR ---\n${stderr}`,
		)
	}
}

describe("audit-banned-patterns.mjs", () => {
	it("tokens profile passes with zero banned hits", () => {
		const stdout = runAudit("tokens")
		expect(stdout).not.toMatch(/\[FAIL\]/)
		expect(stdout).toMatch(/0 banned hits/)
	})

	it("stage-wide profile passes with zero banned hits and required-presence satisfied", () => {
		const stdout = runAudit("stage-wide")
		expect(stdout).not.toMatch(/\[FAIL\]/)
		expect(stdout).toMatch(/0 banned hits/)
		expect(stdout).toMatch(/0 required-presence missing/)
		// The canonical presence check must match ≥ 1 occurrence of the
		// aria-label in the component file — anchors the regression guard.
		expect(stdout).toMatch(
			/require-agent-feedback-toggle-canonical \(required-presence/,
		)
		// unit-13 regression guards must be wired in and green:
		//   banned-pin-tabindex-negative — pin markers MUST NOT carry tabindex="-1"
		//   banned-xss-sinks-annotation-path — no dangerouslySetInnerHTML etc.
		expect(stdout).toMatch(/\[OK\] banned-pin-tabindex-negative/)
		expect(stdout).toMatch(/\[OK\] banned-xss-sinks-annotation-path/)
	})
})
