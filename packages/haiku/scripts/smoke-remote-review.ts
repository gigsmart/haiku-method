#!/usr/bin/env tsx
// Standalone smoke test for H·AI·K·U remote review.
// Starts HTTP server, opens tunnel, creates a fake review session, builds the
// signed review URL, and prints it. Run with:
//
//   HAIKU_REMOTE_REVIEW=1 npx tsx scripts/smoke-remote-review.ts [--open]

import { spawn } from "node:child_process"
import { review } from "../src/config.ts"
import { startHttpServer } from "../src/http.ts"
import { createSession } from "../src/sessions.ts"
import {
	buildReviewUrl,
	closeTunnel,
	isRemoteReviewEnabled,
	openTunnel,
} from "../src/tunnel.ts"

console.error("HAIKU_REMOTE_REVIEW   :", process.env.HAIKU_REMOTE_REVIEW)
console.error("HAIKU_REVIEW_SITE_URL :", process.env.HAIKU_REVIEW_SITE_URL)
console.error("isRemoteReviewEnabled :", isRemoteReviewEnabled())
console.error("review.siteUrl        :", review.siteUrl)

const session = createSession({
	intent_dir: "/tmp/fake-intent",
	intent_slug: "smoke-test",
	review_type: "intent",
	target: "smoke-test",
	html: "",
})
console.error("session_id            :", session.session_id)

const port = await startHttpServer()
console.error("http port             :", port)

let url: string
if (isRemoteReviewEnabled()) {
	const tunnelUrl = await openTunnel(port)
	console.error("tunnel url            :", tunnelUrl)
	url = buildReviewUrl(session.session_id, tunnelUrl, "review")
} else {
	url = `http://127.0.0.1:${port}/review/${session.session_id}`
}

console.log("")
console.log("REVIEW URL:")
console.log(url)
console.log("")

if (process.argv.includes("--open")) {
	const cmd = process.platform === "darwin" ? "open" : "xdg-open"
	spawn(cmd, [url], { stdio: "ignore", detached: true }).unref()
}

const holdMs = Number(process.env.SMOKE_HOLD_MS ?? 600_000)
console.error(`holding open for ${Math.round(holdMs / 1000)}s — curl or browse the URL`)

function shutdown(): void {
	try {
		closeTunnel()
	} catch {
		/* best-effort */
	}
	process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

setTimeout(shutdown, holdMs)
