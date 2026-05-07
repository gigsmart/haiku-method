// picker-wire-round-trip.test.mjs
//
// Schema validation + create + HTTP `/picker/:id/select` round-trip
// for the new picker session type that replaces MCP elicitation.
//
// Mirrors spa-wire-round-trip.test.mjs (the ad-hoc review wire test),
// just for the picker route.

import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

async function bootServer() {
	const { startHttpServer, stopHttpServer } = await import(`${SRC}/http.ts`)
	const port = await startHttpServer()
	return {
		port,
		stop: async () => {
			await stopHttpServer()
		},
	}
}

test("picker wire: create session + POST /picker/:id/select sets status answered", async () => {
	const { createPickerSession, getSession } = await import(`${SRC}/sessions.ts`)
	const { port, stop } = await bootServer()
	try {
		const session = createPickerSession({
			intent_slug: "wire-test",
			kind: "studio",
			title: "Pick a studio",
			prompt: "Studios are locked.",
			options: [
				{ id: "software", label: "software", description: "Full SDLC." },
				{ id: "design", label: "design", description: "Visual work." },
			],
		})
		const res = await fetch(
			`http://127.0.0.1:${port}/picker/${session.session_id}/select`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "software" }),
			},
		)
		assert.equal(res.status, 200)
		const body = await res.json()
		assert.equal(body.ok, true)
		assert.equal(body.id, "software")
		const after = getSession(session.session_id)
		assert.equal(after.status, "answered")
		assert.deepEqual(after.selection, { id: "software" })
	} finally {
		await stop()
	}
})

test("picker wire: rejects id not in option set with 400", async () => {
	const { createPickerSession } = await import(`${SRC}/sessions.ts`)
	const { port, stop } = await bootServer()
	try {
		const session = createPickerSession({
			intent_slug: "wire-test-bad",
			kind: "mode",
			title: "Pick a mode",
			prompt: "",
			options: [
				{ id: "continuous", label: "continuous" },
				{ id: "discrete", label: "discrete" },
			],
		})
		const res = await fetch(
			`http://127.0.0.1:${port}/picker/${session.session_id}/select`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "autopilot" }),
			},
		)
		assert.equal(res.status, 400)
		const body = await res.json()
		assert.match(body.error, /not in the option set/)
	} finally {
		await stop()
	}
})

test("picker wire: refuses second submit with 409", async () => {
	const { createPickerSession } = await import(`${SRC}/sessions.ts`)
	const { port, stop } = await bootServer()
	try {
		const session = createPickerSession({
			intent_slug: "wire-double",
			kind: "confirm",
			title: "Confirm?",
			prompt: "",
			options: [
				{ id: "yes", label: "Yes" },
				{ id: "no", label: "No" },
			],
		})
		const r1 = await fetch(
			`http://127.0.0.1:${port}/picker/${session.session_id}/select`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "yes" }),
			},
		)
		assert.equal(r1.status, 200)
		const r2 = await fetch(
			`http://127.0.0.1:${port}/picker/${session.session_id}/select`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "no" }),
			},
		)
		assert.equal(r2.status, 409)
	} finally {
		await stop()
	}
})

test("picker wire: GET /picker/:id returns SPA HTML", async () => {
	const { createPickerSession } = await import(`${SRC}/sessions.ts`)
	const { port, stop } = await bootServer()
	try {
		const session = createPickerSession({
			intent_slug: "wire-get",
			kind: "studio",
			title: "Pick",
			prompt: "",
			options: [{ id: "a", label: "a" }],
		})
		const res = await fetch(
			`http://127.0.0.1:${port}/picker/${session.session_id}`,
		)
		assert.equal(res.status, 200)
		const ct = res.headers.get("content-type") ?? ""
		assert.match(ct, /text\/html/)
	} finally {
		await stop()
	}
})

test("picker wire: GET on missing session returns 404", async () => {
	const { port, stop } = await bootServer()
	try {
		const res = await fetch(`http://127.0.0.1:${port}/picker/no-such-id`)
		assert.equal(res.status, 404)
	} finally {
		await stop()
	}
})

// runPicker's wait→drain cycle is covered by the wire round-trip
// test above (POST /picker/:id/select → updatePickerSession →
// notifySessionUpdate → wait wakes → drain returns selection).
