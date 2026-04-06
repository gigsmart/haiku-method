import type { BrowseProvider, HaikuIntent, HaikuIntentDetail, HaikuStageState, HaikuUnit } from "./types"
import { parseCriteria, parseFrontmatter } from "./types"

export class GitLabProvider implements BrowseProvider {
	readonly name = "GitLab"
	private host: string
	private projectPath: string
	private branch: string
	private token: string | null

	constructor(host: string, projectPath: string, branch: string = "", token: string | null = null) {
		this.host = host
		this.projectPath = projectPath
		this.branch = branch
		this.token = token
	}

	private get encodedProject(): string {
		return encodeURIComponent(this.projectPath)
	}

	private headers(): HeadersInit {
		const h: HeadersInit = {}
		if (this.token) h["PRIVATE-TOKEN"] = this.token
		return h
	}

	private async api(path: string, init?: RequestInit): Promise<Response> {
		const url = `https://${this.host}/api/v4/projects/${this.encodedProject}${path}`
		return fetch(url, { ...init, headers: { ...this.headers(), ...init?.headers } })
	}

	async readFile(path: string): Promise<string | null> {
		const ref = this.branch ? `&ref=${encodeURIComponent(this.branch)}` : ""
		const encodedPath = encodeURIComponent(path)
		const res = await this.api(`/repository/files/${encodedPath}/raw?${ref}`)
		if (!res.ok) return null
		return res.text()
	}

	async listFiles(dir: string): Promise<string[]> {
		const ref = this.branch ? `&ref=${encodeURIComponent(this.branch)}` : ""
		const res = await this.api(`/repository/tree?path=${encodeURIComponent(dir)}&per_page=100${ref}`)
		if (!res.ok) return []
		const json = await res.json()
		if (!Array.isArray(json)) return []
		return json.filter((e: { type: string }) => e.type === "blob").map((e: { name: string }) => e.name).sort()
	}

	private async listDirs(dir: string): Promise<string[]> {
		const ref = this.branch ? `&ref=${encodeURIComponent(this.branch)}` : ""
		const res = await this.api(`/repository/tree?path=${encodeURIComponent(dir)}&per_page=100${ref}`)
		if (!res.ok) return []
		const json = await res.json()
		if (!Array.isArray(json)) return []
		return json.filter((e: { type: string }) => e.type === "tree").map((e: { name: string }) => e.name).sort()
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
				startedAt: (data.started_at as string) || null,
				completedAt: (data.completed_at as string) || null,
				studioStages: (data.stages as string[]) || [],
				composite: (data.composite as Array<{ studio: string; stages: string[] }>) || null,
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
					bolt: (unitData.bolt as number) || 0,
					hat: (unitData.hat as string) || "",
					startedAt: (unitData.started_at as string) || null,
					completedAt: (unitData.completed_at as string) || null,
					criteria: parseCriteria(unitContent),
					content: unitContent,
					raw: unitData,
				})
			}

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
				} catch { /* ignore */ }
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
		const encodedPath = encodeURIComponent(path)
		const branch = this.branch || "main"

		// Base64 encode content (handle Unicode correctly)
		const encoded = btoa(
			Array.from(new TextEncoder().encode(content))
				.map((b) => String.fromCharCode(b))
				.join("")
		)

		// Try update first (PUT), fall back to create (POST) if file doesn't exist
		const res = await this.api(`/repository/files/${encodedPath}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				branch,
				commit_message: message,
				encoding: "base64",
				content: encoded,
			}),
		})

		if (res.ok) return true

		// If file doesn't exist yet, create it
		if (res.status === 400 || res.status === 404) {
			const createRes = await this.api(`/repository/files/${encodedPath}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					branch,
					commit_message: message,
					encoding: "base64",
					content: encoded,
				}),
			})
			return createRes.ok
		}

		return false
	}

	async isAccessible(): Promise<boolean> {
		const res = await this.api("")
		return res.ok
	}

	static getOAuthUrl(host: string, clientId: string, redirectUri: string): string {
		return `https://${host}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read_api`
	}
}
