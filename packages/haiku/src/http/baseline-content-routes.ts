// http/baseline-content-routes.ts — Serve baseline content sidecar
// bytes for image-aware drift previews.
//
// Routes:
//   GET /api/intents/:intent/baseline-content/stage/:stage/:sha256
//       Stage-scoped sidecar for an artifact under stages/<stage>/.
//
//   GET /api/intents/:intent/baseline-content/intent/:sha256
//       Intent-scope sidecar for an entry whose `stage === null`
//       (intent-root knowledge/...).
//
// Content-Type is sniffed from the file's magic bytes via
// `detectImageKindSync` so the SPA can render the bytes through a
// standard `<img>` element. Non-image sidecars (text-diff sources)
// fall through to `application/octet-stream` — the SPA shouldn't be
// requesting those by SHA, but we serve them safely if asked.
//
// SHA validation: 64-hex-char only. Anything else is 400. The sidecar
// path is built from the validated SHA and never accepts the request
// path directly, so traversal isn't possible.
//
// Caching: sidecars are immutable per-SHA, so we set a long cache
// header. Browsers can keep the bytes indefinitely.

import { createReadStream, existsSync } from "node:fs"
import type { FastifyInstance } from "fastify"
import {
	baselineContentPath,
	baselineIntentContentPath,
	detectImageKindSync,
} from "../orchestrator/workflow/drift-baseline.js"
import { intentDir } from "../state-tools.js"
import { requireTunnelAuth } from "./auth.js"
import { isValidSlug, validateIntent } from "./validation.js"

const SHA256_HEX = /^[0-9a-f]{64}$/

const IMAGE_MIME: Record<string, string> = {
	png: "image/png",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
}

function badParam(reply: import("fastify").FastifyReply, code: string): void {
	reply.status(400).send({ error: code, code })
}

function notFound(reply: import("fastify").FastifyReply, code: string): void {
	reply.status(404).send({ error: code, code })
}

function streamBaselineFile(
	reply: import("fastify").FastifyReply,
	absPath: string,
): void {
	if (!existsSync(absPath)) {
		notFound(reply, "sidecar_not_found")
		return
	}
	const kind = detectImageKindSync(absPath)
	const contentType = kind ? IMAGE_MIME[kind] : "application/octet-stream"
	reply.header("Content-Type", contentType)
	// Sidecars are content-addressed by SHA-256, so the bytes for any
	// given URL never change. A long immutable cache is the right call.
	reply.header("Cache-Control", "public, max-age=31536000, immutable")
	reply.send(createReadStream(absPath))
}

export function registerBaselineContentRoutes(instance: FastifyInstance): void {
	instance.get<{
		Params: { intent: string; stage: string; sha256: string }
	}>(
		"/api/intents/:intent/baseline-content/stage/:stage/:sha256",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, null)) return

			const { intent, stage, sha256 } = req.params
			if (!isValidSlug(intent) || !isValidSlug(stage)) {
				badParam(reply, "bad_param")
				return
			}
			if (!SHA256_HEX.test(sha256)) {
				badParam(reply, "bad_sha")
				return
			}
			if (!validateIntent(intent)) {
				notFound(reply, "intent_not_found")
				return
			}

			const absPath = baselineContentPath(intentDir(intent), stage, sha256)
			streamBaselineFile(reply, absPath)
		},
	)

	instance.get<{
		Params: { intent: string; sha256: string }
	}>(
		"/api/intents/:intent/baseline-content/intent/:sha256",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, null)) return

			const { intent, sha256 } = req.params
			if (!isValidSlug(intent)) {
				badParam(reply, "bad_param")
				return
			}
			if (!SHA256_HEX.test(sha256)) {
				badParam(reply, "bad_sha")
				return
			}
			if (!validateIntent(intent)) {
				notFound(reply, "intent_not_found")
				return
			}

			const absPath = baselineIntentContentPath(intentDir(intent), sha256)
			streamBaselineFile(reply, absPath)
		},
	)
}
