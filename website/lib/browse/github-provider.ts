import type { BrowseProvider, HaikuIntent, HaikuIntentDetail, HaikuStageState, HaikuUnit } from "./types"
import { parseCriteria, parseFrontmatter } from "./types"

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const apiCache = new Map<string, { data: unknown; ts: number }>()

export class GitHubProvider implements BrowseProvider {
	readonly name = "GitHub"
	private owner: string
	private repo: string
	private branch: string
	private token: string | null

	constructor(owner: string, repo: string, branch: string = "", token: string | null = null) {
		this.owner = owner
		this.repo = repo
		this.branch = branch
		this.token = token
	}

	private headers(): HeadersInit {
		const h: HeadersInit = { Accept: "application/vnd.github.v3+json" }
		if (this.token) h.Authorization = `Bearer ${this.token}`
		return h
	}

	private async api(path: string, init?: RequestInit): Promise<Response> {
		const url = `https://api.github.com/repos/${this.owner}/${this.repo}${path}`
		return fetch(url, { ...init, headers: { ...this.headers(), ...init?.headers } })
	}

	private async cachedGet<T>(path: string): Promise<T | null> {
		const key = `${this.owner}/${this.repo}:${path}`
		const cached = apiCache.get(key)
		if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T
		const res = await this.api(path)
		if (!res.ok) return null
		const data = await res.json()
		apiCache.set(key, { data, ts: Date.now() })
		return data as T
	}

	async readFile(path: string): Promise<string | null> {
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const json = await this.cachedGet<{ encoding?: string; content?: string }>(`/contents/${path}${ref}`)
		if (!json) return null
		if (json.encoding === "base64" && json.content) {
			const binary = atob(json.content.replace(/\n/g, ""))
			const bytes = new Uint8Array(binary.length)
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
			return new TextDecoder().decode(bytes)
		}
		return null
	}

	async listFiles(dir: string): Promise<string[]> {
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const json = await this.cachedGet<Array<{ type: string; name: string }>>(`/contents/${dir}${ref}`)
		if (!json || !Array.isArray(json)) return []
		return json.filter((e) => e.type === "file").map((e) => e.name).sort()
	}

	private async listDirs(dir: string): Promise<string[]> {
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const json = await this.cachedGet<Array<{ type: string; name: string }>>(`/contents/${dir}${ref}`)
		if (!json || !Array.isArray(json)) return []
		return json.filter((e) => e.type === "dir").map((e) => e.name).sort()
	}

	async listIntents(onProgress?: (intent: HaikuIntent) => void): Promise<HaikuIntent[]> {
		const intentDirs = await this.listDirs(".haiku/intents")
		const intents: HaikuIntent[] = []

		for (const slug of intentDirs) {
			const raw = await this.readFile(`.haiku/intents/${slug}/intent.md`)
			if (!raw) continue
			const { data } = parseFrontmatter(raw)
			const studio = (data.studio as string) || "ideation"
			const stages = (data.stages as string[]) || []

			const intent: HaikuIntent = {
				slug,
				title: (data.title as string) || slug,
				studio,
				activeStage: (data.active_stage as string) || "",
				mode: (data.mode as string) || "continuous",
				startedAt: (data.started_at as string) || null,
				completedAt: (data.completed_at as string) || null,
				studioStages: (data.stages as string[]) || [],
				composite: (data.composite as Array<{ studio: string; stages: string[] }>) || null,
				stagesComplete: stages.length > 0 ? stages.indexOf(data.active_stage as string) : 0,
				stagesTotal: stages.length,
				status: (data.status as string) || "active",
				raw: data,
			}
			intents.push(intent)
			onProgress?.(intent)
		}

		return intents
	}

	async getIntent(slug: string): Promise<HaikuIntentDetail | null> {
		const raw = await this.readFile(`.haiku/intents/${slug}/intent.md`)
		if (!raw) return null

		const { data, content } = parseFrontmatter(raw)
		const studio = (data.studio as string) || "ideation"
		const stageNames = (data.stages as string[]) || []
		const activeStage = (data.active_stage as string) || ""

		const stageDirs = await this.listDirs(`.haiku/intents/${slug}/stages`)
		const stages: HaikuStageState[] = []

		for (const stageName of stageNames.length > 0 ? stageNames : stageDirs) {
			const unitFiles = await this.listFiles(`.haiku/intents/${slug}/stages/${stageName}/units`)
			const units: HaikuUnit[] = []

			for (const unitFile of unitFiles) {
				if (!unitFile.endsWith(".md")) continue
				const unitRaw = await this.readFile(`.haiku/intents/${slug}/stages/${stageName}/units/${unitFile}`)
				if (!unitRaw) continue
				const { data: unitData, content: unitContent } = parseFrontmatter(unitRaw)
				units.push({
					name: unitFile.replace(".md", ""),
					stage: stageName,
					type: (unitData.type as string) || "",
					status: (unitData.status as string) || "pending",
					dependsOn: (unitData.depends_on as string[]) || [],
					bolt: (unitData.bolt as number) || 0,
					hat: (unitData.hat as string) || "",
					startedAt: (unitData.started_at as string) || null,
					completedAt: (unitData.completed_at as string) || null,
					criteria: parseCriteria(unitContent),
					content: unitContent,
					raw: unitData,
				})
			}

			// Read stage state.json if it exists
			const stateRaw = await this.readFile(`.haiku/intents/${slug}/stages/${stageName}/state.json`)
			let stagePhase = ""
			let stageStartedAt: string | null = null
			let stageCompletedAt: string | null = null
			let gateOutcome: string | null = null
			if (stateRaw) {
				try {
					const stateData = JSON.parse(stateRaw)
					stagePhase = stateData.phase || ""
					stageStartedAt = stateData.started_at || null
					stageCompletedAt = stateData.completed_at || null
					gateOutcome = stateData.gate_outcome || null
				} catch { /* ignore parse errors */ }
			}

			let status: "pending" | "active" | "complete" = "pending"
			if (stageName === activeStage) status = "active"
			else if (stageNames.indexOf(stageName) < stageNames.indexOf(activeStage)) status = "complete"

			stages.push({ name: stageName, status, phase: stagePhase, startedAt: stageStartedAt, completedAt: stageCompletedAt, gateOutcome, units })
		}

		const knowledgeFiles = await this.listFiles(`.haiku/intents/${slug}/knowledge`)

		return {
			slug,
			title: (data.title as string) || slug,
			studio,
			activeStage,
			mode: (data.mode as string) || "continuous",
			startedAt: (data.started_at as string) || null,
			completedAt: (data.completed_at as string) || null,
			studioStages: (data.stages as string[]) || [],
				composite: (data.composite as Array<{ studio: string; stages: string[] }>) || null,
				stagesComplete: stageNames.indexOf(activeStage),
			stagesTotal: stageNames.length,
			status: (data.status as string) || "active",
			raw: data,
			stages,
			knowledge: knowledgeFiles.filter((f) => f.endsWith(".md")),
			operations: (await this.listFiles(`.haiku/intents/${slug}/operations`)).filter(f => f.endsWith(".md")),
			reflection: await this.readFile(`.haiku/intents/${slug}/reflection.md`),
			content,
		}
	}

	async writeFile(path: string, content: string, message: string): Promise<boolean> {
		// Get current file SHA (required for updates, absent for creates)
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const getRes = await this.api(`/contents/${path}${ref}`)
		let sha: string | undefined
		if (getRes.ok) {
			const currentFile = await getRes.json()
			sha = currentFile?.sha
		}

		// Base64 encode content (handle Unicode correctly)
		const encoded = btoa(
			Array.from(new TextEncoder().encode(content))
				.map((b) => String.fromCharCode(b))
				.join("")
		)

		const res = await this.api(`/contents/${path}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				message,
				content: encoded,
				...(sha ? { sha } : {}),
				...(this.branch ? { branch: this.branch } : {}),
			}),
		})
		return res.ok
	}

	/** Check if the repo is accessible. Returns status for error differentiation. */
	async isAccessible(): Promise<boolean> {
		const res = await this.api("")
		return res.ok
	}

	/** Get detailed access status for error messaging */
	async getAccessStatus(): Promise<{ ok: boolean; reason: "accessible" | "rate_limited" | "not_found" | "auth_required" }> {
		const res = await this.api("")
		if (res.ok) return { ok: true, reason: "accessible" }
		if (res.status === 403) return { ok: false, reason: "rate_limited" }
		if (res.status === 404) return { ok: false, reason: "not_found" }
		return { ok: false, reason: "auth_required" }
	}

	/** Get the OAuth URL for GitHub */
	static getOAuthUrl(clientId: string, redirectUri: string): string {
		return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`
	}
}
