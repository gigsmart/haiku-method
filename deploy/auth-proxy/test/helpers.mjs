// Shared test doubles for the auth-proxy CLI handlers.

/** In-memory SessionStore matching the SessionStore interface in sessions.ts. */
export class MemoryStore {
	constructor() {
		this.byId = new Map()
	}
	async create(rec) {
		this.byId.set(rec.session_id, { ...rec })
	}
	async getById(sessionId) {
		const rec = this.byId.get(sessionId)
		if (!rec) return null
		if (rec.expires_at <= Math.floor(Date.now() / 1000)) {
			this.byId.delete(sessionId)
			return null
		}
		return { ...rec }
	}
	async getByState(state) {
		for (const rec of this.byId.values()) {
			if (rec.state === state) {
				if (rec.expires_at <= Math.floor(Date.now() / 1000)) {
					this.byId.delete(rec.session_id)
					return null
				}
				return { ...rec }
			}
		}
		return null
	}
	async update(sessionId, patch) {
		const rec = this.byId.get(sessionId)
		if (!rec) return
		const next = { ...rec, ...patch }
		if ("token" in patch && patch.token === undefined) delete next.token
		this.byId.set(sessionId, next)
	}
	async delete(sessionId) {
		this.byId.delete(sessionId)
	}
}

/** Minimal Express-like Response capture. */
export function makeRes() {
	return {
		statusCode: 200,
		body: undefined,
		status(code) {
			this.statusCode = code
			return this
		},
		json(payload) {
			this.body = payload
			return this
		},
	}
}

export function makeReq({ method = "POST", path = "/", body = {} } = {}) {
	return { method, path, body }
}
