import type { BrowseProvider, HaikuIntent, HaikuIntentDetail, HaikuStageState, HaikuUnit } from "./types"
import { parseCriteria, parseFrontmatter } from "./types"

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

	private async api(path: string): Promise<Response> {
		const url = `https://api.github.com/repos/${this.owner}/${this.repo}${path}`
		return fetch(url, { headers: this.headers() })
	}

	async readFile(path: string): Promise<string | null> {
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const res = await this.api(`/contents/${path}${ref}`)
		if (!res.ok) return null
		const json = await res.json()
		if (json.encoding === "base64" && json.content) {
			// Decode base64 → Uint8Array → UTF-8 string (atob mangles multi-byte chars)
			const binary = atob(json.content.replace(/\n/g, ""))
			const bytes = new Uint8Array(binary.length)
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
			return new TextDecoder().decode(bytes)
		}
		return null
	}

	async listFiles(dir: string): Promise<string[]> {
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const res = await this.api(`/contents/${dir}${ref}`)
		if (!res.ok) return []
		const json = await res.json()
		if (!Array.isArray(json)) return []
		return json.filter((e: { type: string }) => e.type === "file").map((e: { name: string }) => e.name).sort()
	}

	private async listDirs(dir: string): Promise<string[]> {
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const res = await this.api(`/contents/${dir}${ref}`)
		if (!res.ok) return []
		const json = await res.json()
		if (!Array.isArray(json)) return []
		return json.filter((e: { type: string }) => e.type === "dir").map((e: { name: string }) => e.name).sort()
	}

	async listIntents(): Promise<HaikuIntent[]> {
		const intentDirs = await this.listDirs(".haiku/intents")
		const intents: HaikuIntent[] = []

		for (const slug of intentDirs) {
			const raw = await this.readFile(`.haiku/intents/${slug}/intent.md`)
			if (!raw) continue
			const { data } = parseFrontmatter(raw)
			const studio = (data.studio as string) || "ideation"
			const stages = (data.stages as string[]) || []

			intents.push({
				slug,
				title: (data.title as string) || slug,
				studio,
				activeStage: (data.active_stage as string) || "",
				mode: (data.mode as string) || "continuous",
				stagesComplete: stages.length > 0 ? stages.indexOf(data.active_stage as string) : 0,
				stagesTotal: stages.length,
				status: (data.status as string) || "active",
				raw: data,
			})
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
					criteria: parseCriteria(unitContent),
					content: unitContent,
					raw: unitData,
				})
			}

			let status: "pending" | "active" | "complete" = "pending"
			if (stageName === activeStage) status = "active"
			else if (stageNames.indexOf(stageName) < stageNames.indexOf(activeStage)) status = "complete"

			stages.push({ name: stageName, status, units })
		}

		const knowledgeFiles = await this.listFiles(`.haiku/intents/${slug}/knowledge`)

		return {
			slug,
			title: (data.title as string) || slug,
			studio,
			activeStage,
			mode: (data.mode as string) || "continuous",
			stagesComplete: stageNames.indexOf(activeStage),
			stagesTotal: stageNames.length,
			status: (data.status as string) || "active",
			raw: data,
			stages,
			knowledge: knowledgeFiles.filter((f) => f.endsWith(".md")),
			content,
		}
	}

	/** Check if the repo is accessible (returns false if 401/403) */
	async isAccessible(): Promise<boolean> {
		const res = await this.api("")
		return res.ok
	}

	/** Get the OAuth URL for GitHub */
	static getOAuthUrl(clientId: string, redirectUri: string): string {
		return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`
	}
}
