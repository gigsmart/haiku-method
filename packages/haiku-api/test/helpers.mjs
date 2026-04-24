/**
 * Minimal pass/fail harness for *.test.mjs files. Avoids the overhead of a
 * third-party runner and matches the output format
 *   N passed, M failed
 * that run-all.mjs parses.
 */

let passed = 0
let failed = 0

export function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (err) {
		failed++
		console.log(`  ✗ ${name}`)
		if (err instanceof Error) {
			console.log(`    ${err.message}`)
			if (err.stack) {
				console.log(err.stack.split("\n").slice(1, 4).join("\n"))
			}
		} else {
			console.log(`    ${String(err)}`)
		}
	}
}

export function describe(label, fn) {
	console.log(`\n${label}`)
	fn()
}

export function summary() {
	console.log(`\n${passed} passed, ${failed} failed`)
	if (failed > 0) process.exit(1)
}

export function assertValid(schema, value, label) {
	const result = schema.safeParse(value)
	if (!result.success) {
		throw new Error(
			`${label ?? "expected value to parse"}: ${result.error.message}`,
		)
	}
	return result.data
}

export function assertInvalid(schema, value, label) {
	const result = schema.safeParse(value)
	if (result.success) {
		throw new Error(
			`${label ?? "expected value to be rejected"}: schema accepted ${JSON.stringify(value)}`,
		)
	}
	return result.error
}
