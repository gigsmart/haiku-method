import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import {
	handleProviderCallback,
	setFetchImpl,
	setSessionStore,
} from "../dist/cli.js"
import { buildSession } from "../dist/sessions.js"
import { makeReq, makeRes, MemoryStore } from "./helpers.mjs"

// The server-side provider callback (the URL registered on the OAuth app):
// the provider redirects the browser to GET /{provider}/callback, the proxy
// exchanges the code SERVER-side and flips the session ready, then 302s to the
// browse-site done page. Token never touches the browser.

let mem
let lastFetch

function seedPending({ provider = "github", host, state = "ST", sessionId = "S1" } = {}) {
	const rec = buildSession({
		sessionId,
		state,
		provider,
		host: host || (provider === "github" ? "github.com" : "gitlab.com"),
	})
	mem.byId.set(rec.session_id, { ...rec })
	return rec
}

/** A fetch stub for the upstream token endpoint that records the call and
 *  returns a JSON token body (or an error body to exercise the failure path). */
function stubFetch(responseBody) {
	return async (url, opts) => {
		lastFetch = { url, body: JSON.parse(opts.body) }
		return {
			ok: true,
			status: 200,
			text: async () => JSON.stringify(responseBody),
		}
	}
}

const callbackReq = (provider, query, headers) =>
	makeReq({
		method: "GET",
		path: `/${provider}/callback`,
		query,
		headers: headers || {
			host: "auth.haikumethod.ai",
			"x-forwarded-proto": "https",
		},
	})

beforeEach(() => {
	mem = new MemoryStore()
	setSessionStore(mem)
	lastFetch = undefined
	process.env.HAIKU_GITHUB_OAUTH_CLIENT_ID = "gh_id"
	process.env.HAIKU_GITHUB_OAUTH_CLIENT_SECRET = "gh_secret"
	process.env.HAIKU_GITLAB_OAUTH_CLIENT_ID = "gl_id"
	process.env.HAIKU_GITLAB_OAUTH_CLIENT_SECRET = "gl_secret"
	delete process.env.PROXY_PUBLIC_ORIGIN
	delete process.env.ALLOWED_ORIGIN
	delete process.env.BROWSE_ORIGIN
})
afterEach(() => {
	setSessionStore(null)
	setFetchImpl(undefined)
})

describe("GET /{provider}/callback — routing", () => {
	it("ignores non-callback paths (returns false)", async () => {
		const res = makeRes()
		const owned = await handleProviderCallback(
			makeReq({ method: "GET", path: "/github/token" }),
			res,
		)
		assert.equal(owned, false)
	})

	it("owns /github/callback and /gitlab/callback", async () => {
		for (const p of ["github", "gitlab"]) {
			seedPending({ provider: p, state: `s-${p}`, sessionId: `id-${p}` })
			setFetchImpl(stubFetch({ access_token: "tok" }))
			const res = makeRes()
			const owned = await handleProviderCallback(
				callbackReq(p, { code: "c", state: `s-${p}` }),
				res,
			)
			assert.equal(owned, true)
		}
	})
})

describe("GET /github/callback — happy path", () => {
	it("exchanges server-side, flips session ready, redirects to done (no error)", async () => {
		seedPending({ provider: "github", state: "ST", sessionId: "S1" })
		setFetchImpl(stubFetch({ access_token: "gho_xyz", scope: "repo" }))
		const res = makeRes()

		await handleProviderCallback(
			callbackReq("github", { code: "abc", state: "ST" }),
			res,
		)

		assert.equal(res.statusCode, 302)
		assert.equal(res.redirectedTo, "https://haikumethod.ai/oauth/cli/done")

		const stored = await mem.getById("S1")
		assert.equal(stored.status, "ready")
		assert.equal(stored.token.access_token, "gho_xyz")
	})

	it("sends a redirect_uri byte-identical to the proxy's own callback URL", async () => {
		seedPending({ provider: "github", state: "ST", sessionId: "S1" })
		setFetchImpl(stubFetch({ access_token: "gho_xyz" }))
		await handleProviderCallback(
			callbackReq("github", { code: "abc", state: "ST" }),
			makeRes(),
		)
		assert.equal(
			lastFetch.body.redirect_uri,
			"https://auth.haikumethod.ai/github/callback",
		)
		assert.equal(lastFetch.body.client_secret, "gh_secret")
	})

	it("honors PROXY_PUBLIC_ORIGIN override for the redirect_uri", async () => {
		process.env.PROXY_PUBLIC_ORIGIN = "https://auth.example.com"
		seedPending({ provider: "github", state: "ST", sessionId: "S1" })
		setFetchImpl(stubFetch({ access_token: "gho_xyz" }))
		await handleProviderCallback(
			callbackReq("github", { code: "abc", state: "ST" }),
			makeRes(),
		)
		assert.equal(
			lastFetch.body.redirect_uri,
			"https://auth.example.com/github/callback",
		)
	})
})

describe("GET /gitlab/callback — happy path", () => {
	it("sends grant_type + redirect_uri and respects the session host", async () => {
		seedPending({
			provider: "gitlab",
			host: "git.acme.com",
			state: "ST",
			sessionId: "S1",
		})
		setFetchImpl(stubFetch({ access_token: "glpat", refresh_token: "r1" }))
		const res = makeRes()
		await handleProviderCallback(
			callbackReq("gitlab", { code: "abc", state: "ST" }),
			res,
		)
		assert.equal(lastFetch.url, "https://git.acme.com/oauth/token")
		assert.equal(lastFetch.body.grant_type, "authorization_code")
		assert.equal(
			lastFetch.body.redirect_uri,
			"https://auth.haikumethod.ai/gitlab/callback",
		)
		const stored = await mem.getById("S1")
		assert.equal(stored.status, "ready")
		assert.equal(stored.token.refresh_token, "r1")
	})
})

describe("GET /{provider}/callback — failure redirects (never JSON)", () => {
	it("provider error param → done?error=<code>, session untouched", async () => {
		seedPending({ state: "ST", sessionId: "S1" })
		const res = makeRes()
		await handleProviderCallback(
			callbackReq("github", { error: "access_denied", state: "ST" }),
			res,
		)
		assert.equal(res.redirectedTo, "https://haikumethod.ai/oauth/cli/done?error=access_denied")
		assert.equal((await mem.getById("S1")).status, "pending")
	})

	it("missing state → done?error=missing_state", async () => {
		const res = makeRes()
		await handleProviderCallback(callbackReq("github", { code: "c" }), res)
		assert.match(res.redirectedTo, /error=missing_state$/)
	})

	it("unknown state → done?error=unknown_state", async () => {
		const res = makeRes()
		await handleProviderCallback(
			callbackReq("github", { code: "c", state: "nope" }),
			res,
		)
		assert.match(res.redirectedTo, /error=unknown_state$/)
	})

	it("already-completed session → done?error=already_completed", async () => {
		const rec = seedPending({ state: "ST", sessionId: "S1" })
		await mem.update(rec.session_id, { status: "ready", token: { access_token: "t" } })
		const res = makeRes()
		await handleProviderCallback(
			callbackReq("github", { code: "c", state: "ST" }),
			res,
		)
		assert.match(res.redirectedTo, /error=already_completed$/)
	})

	it("provider mismatch → done?error=provider_mismatch", async () => {
		seedPending({ provider: "github", state: "ST", sessionId: "S1" })
		const res = makeRes()
		await handleProviderCallback(
			callbackReq("gitlab", { code: "c", state: "ST" }),
			res,
		)
		assert.match(res.redirectedTo, /error=provider_mismatch$/)
	})

	it("missing code → done?error=missing_code", async () => {
		seedPending({ state: "ST", sessionId: "S1" })
		const res = makeRes()
		await handleProviderCallback(callbackReq("github", { state: "ST" }), res)
		assert.match(res.redirectedTo, /error=missing_code$/)
	})

	it("upstream exchange error → done?error=provider_<code>, session stays pending", async () => {
		seedPending({ state: "ST", sessionId: "S1" })
		setFetchImpl(stubFetch({ error: "bad_verification_code" }))
		const res = makeRes()
		await handleProviderCallback(
			callbackReq("github", { code: "bad", state: "ST" }),
			res,
		)
		assert.match(res.redirectedTo, /error=provider_bad_verification_code$/)
		assert.equal((await mem.getById("S1")).status, "pending")
	})
})
