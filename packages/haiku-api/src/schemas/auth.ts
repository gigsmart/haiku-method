/**
 * Transport + session-token schemas — centralizes transport semantics so that
 * a future move from loopback-only routing to bearer-token routing is a
 * schema edit, not a code archaeology project.
 *
 * v1 runtime policy: every declared route in `routes.ts` MUST set
 * `transport: "loopback"`. That policy is enforced by the runtime invariant
 * test at `test/schemas.test.mjs` ("every route declares transport='loopback'").
 *
 * Schema policy: `TransportInvariantSchema` permits both `"loopback"` and
 * `"token"` so that future non-loopback deployments can flip individual
 * routes without a coordinated multi-file schema migration. Adding a
 * `"token"` route requires (a) lifting the runtime invariant test and
 * (b) plugging a session-token validator — both local, surgical edits.
 *
 * `SessionTokenSchema` is a skeleton for future bearer-token auth. No
 * current caller consumes it; it exists so the wire shape is fixed before
 * the first consumer lands.
 *
 * Ground truth mapping:
 * - `TransportInvariantSchema` — documents the transport security invariant
 * - `RouteTransportSchema` — public alias kept so `routes.ts` callers are unchanged
 * - `SessionTokenSchema` — future-extensibility skeleton; not wired yet
 */

import { z } from "zod"

/** Transport invariant for a route declaration.
 *
 *  v1 routes hard-code `"loopback"` as a runtime policy; the schema permits
 *  `"token"` so future non-loopback deployments are one-line table edits
 *  rather than a cross-file schema migration. Routes reachable only via the
 *  local 127.0.0.1 / ::1 listener declare `"loopback"`; routes reachable
 *  via a bearer token (when wired) declare `"token"`. */
export const TransportInvariantSchema = z
	.enum(["loopback", "token"])
	.describe(
		"Transport invariant — routes declare 'loopback' (v1 runtime policy) or 'token' (reserved for future bearer-token routes).",
	)
export type TransportInvariant = z.infer<typeof TransportInvariantSchema>

/** Public alias used by `routes.ts` + `test/schemas.test.mjs`. Kept as a
 *  distinct export so existing import sites don't need to change. */
export const RouteTransportSchema = TransportInvariantSchema
export type RouteTransport = TransportInvariant

/** Session-token skeleton for future non-loopback deployments.
 *
 *  Field caps:
 *  - `token` ≤ 512 chars — accommodates JWTs, opaque tokens, and signed
 *    envelopes without allowing malicious blowup of the per-route body cap.
 *  - `issued_at` / `expires_at` ≤ 64 chars — ISO-8601 timestamps are ≤ 40
 *    chars in every standard form; 64 leaves headroom without permitting
 *    injection of multi-kilobyte fake timestamps.
 *
 *  No current caller consumes this schema. It exists so the wire shape is
 *  fixed before the first consumer lands. Added fields (scopes, issuer,
 *  refresh-token hash, etc.) are non-breaking forward edits. */
export const SessionTokenSchema = z
	.object({
		token: z
			.string()
			.min(1)
			.max(512)
			.describe("Bearer token value (1..512 chars)."),
		issued_at: z
			.string()
			.min(1)
			.max(64)
			.describe("ISO-8601 timestamp the token was minted (≤ 64 chars)."),
		expires_at: z
			.string()
			.min(1)
			.max(64)
			.optional()
			.describe(
				"ISO-8601 expiry timestamp. Optional — tokens without an expiry are long-lived (deployment policy determines acceptability).",
			),
	})
	.describe(
		"Session-token skeleton for future non-loopback deployments. Not wired to any current route.",
	)
export type SessionToken = z.infer<typeof SessionTokenSchema>
