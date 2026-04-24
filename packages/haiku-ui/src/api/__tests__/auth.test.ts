/**
 * FB-30 regression guard — SPA reads the tunnel-auth JWT from the URL
 * fragment and exposes it via `authHeader()` / `authQuery()` /
 * `withAuthQuery()` helpers. The fragment is the transport because the
 * server never sees `#...` (same-origin URL-bar state) — the SPA pulls
 * it and attaches it to every subsequent backend call.
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
	__resetAuthForTesting,
	__setAuthTokenForTesting,
	authHeader,
	authQuery,
	getAuthToken,
	withAuthQuery,
} from "../auth"

describe("tunnel auth token extraction", () => {
	beforeEach(() => {
		__resetAuthForTesting()
		if (typeof window !== "undefined") {
			window.location.hash = ""
		}
	})

	it("returns null when the hash is empty", () => {
		if (typeof window !== "undefined") window.location.hash = ""
		expect(getAuthToken()).toBeNull()
		expect(authHeader()).toEqual({})
		expect(authQuery()).toBe("")
	})

	it("reads a well-formed JWT out of the hash", () => {
		const jwt = "aaa.bbb.ccc"
		if (typeof window !== "undefined") window.location.hash = `#${jwt}`
		__resetAuthForTesting()
		expect(getAuthToken()).toBe(jwt)
		expect(authHeader()).toEqual({ Authorization: `Bearer ${jwt}` })
		expect(authQuery()).toBe(`t=${encodeURIComponent(jwt)}`)
	})

	it("ignores non-JWT-shaped fragments (routing state, etc.)", () => {
		if (typeof window !== "undefined") window.location.hash = "#route=home"
		__resetAuthForTesting()
		expect(getAuthToken()).toBeNull()
	})

	it("caches the token after first read", () => {
		const jwt = "aaa.bbb.ccc"
		__setAuthTokenForTesting(jwt)
		if (typeof window !== "undefined") window.location.hash = ""
		// Cached value survives a cleared hash.
		expect(getAuthToken()).toBe(jwt)
	})

	it("withAuthQuery appends ?t= when no query, &t= when present", () => {
		__setAuthTokenForTesting("a.b.c")
		expect(withAuthQuery("/files/abc/x.png")).toBe("/files/abc/x.png?t=a.b.c")
		expect(withAuthQuery("/files/abc/x.png?v=1")).toBe(
			"/files/abc/x.png?v=1&t=a.b.c",
		)
	})

	it("withAuthQuery is a no-op when no token", () => {
		__setAuthTokenForTesting(null)
		expect(withAuthQuery("/files/abc/x.png")).toBe("/files/abc/x.png")
	})
})
