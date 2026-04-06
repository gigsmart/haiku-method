import { fetchQuery } from "relay-runtime"
import { createRelayEnvironment } from "./graphql/environment"
import type {
	BrowseProvider,
	HaikuIntent,
	HaikuIntentDetail,
	HaikuStageState,
	HaikuUnit,
} from "./types"
import { normalizeIntentStatus, parseCriteria, parseFrontmatter } from "./types"
import { parseSettingsYaml } from "./resolve-links"

import type { operationsGetIntentQuery$data } from "./graphql/github/__generated__/operationsGetIntentQuery.graphql"
import GetIntentQuery from "./graphql/github/__generated__/operationsGetIntentQuery.graphql"
import ListFilesQuery from "./graphql/github/__generated__/operationsListFilesQuery.graphql"
// Relay-compiled query artifacts (schema-validated, fully typed)
import type { operationsListIntentsQuery$data } from "./graphql/github/__generated__/operationsListIntentsQuery.graphql"
import ListIntentsQuery from "./graphql/github/__generated__/operationsListIntentsQuery.graphql"
import ReadFileQuery from "./graphql/github/__generated__/operationsReadFileQuery.graphql"

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const apiCache = new Map<string, { data: unknown; ts: number }>()

export class GitHubProvider implements BrowseProvider {
	readonly name = "GitHub"
	private owner: string
	private repo: string
	private branch: string
	private token: string | null
	private env: ReturnType<typeof createRelayEnvironment>

	constructor(
		owner: string,
		repo: string,
		branch = "",
		token: string | null = null,
	) {
		this.owner = owner
		this.repo = repo
		this.branch = branch
		this.token = token
		this.env = createRelayEnvironment({
			url: "https://api.github.com/graphql",
			headers: () => this.graphqlHeaders(),
		})
	}

	private graphqlHeaders(): HeadersInit {
		const h: HeadersInit = {}
		if (this.token) h.Authorization = `Bearer ${this.token}`
		return h
	}

	private restHeaders(): HeadersInit {
		const h: HeadersInit = { Accept: "application/vnd.github.v3+json" }
		if (this.token) h.Authorization = `Bearer ${this.token}`
		return h
	}

	private async restApi(path: string, init?: RequestInit): Promise<Response> {
		const url = `https://api.github.com/repos/${this.owner}/${this.repo}${path}`
		return fetch(url, {
			...init,
			headers: { ...this.restHeaders(), ...init?.headers },
		})
	}

	/** Build a git expression like "main:.haiku/intents" */
	private expr(path: string): string {
		const ref = this.branch || "HEAD"
		return `${ref}:${path}`
	}

	/**
	 * Execute a Relay query with caching.
	 * Cache key is based on the query name and variables.
	 */
	private async cachedQuery<T>(
		query: Parameters<typeof fetchQuery>[1],
		variables: Record<string, unknown>,
		cacheKey: string,
	): Promise<T | undefined> {
		const cached = apiCache.get(cacheKey)
		if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T

		const result = await fetchQuery(this.env, query, variables).toPromise()
		if (result) {
			apiCache.set(cacheKey, { data: result, ts: Date.now() })
		}
		return result as T | undefined
	}

	async readFile(path: string): Promise<string | null> {
		const cacheKey = `gh:${this.owner}/${this.repo}:readFile:${path}`
		const data = await this.cachedQuery<{
			repository: { object: { text?: string | null } | null } | null
		}>(
			ReadFileQuery,
			{ owner: this.owner, name: this.repo, expression: this.expr(path) },
			cacheKey,
		)
		return data?.repository?.object?.text ?? null
	}

	async listFiles(dir: string): Promise<string[]> {
		const cacheKey = `gh:${this.owner}/${this.repo}:listFiles:${dir}`
		type TreeData = {
			repository: {
				object: {
					entries?: ReadonlyArray<{ name: string; type: string }> | null
				} | null
			} | null
		}
		const data = await this.cachedQuery<TreeData>(
			ListFilesQuery,
			{ owner: this.owner, name: this.repo, expression: this.expr(dir) },
			cacheKey,
		)
		const entries = data?.repository?.object?.entries
		if (!entries) return []
		return entries
			.filter((e) => e.type === "blob")
			.map((e) => e.name)
			.sort()
	}

	private async listDirs(dir: string): Promise<string[]> {
		const cacheKey = `gh:${this.owner}/${this.repo}:listDirs:${dir}`
		type TreeData = {
			repository: {
				object: {
					entries?: ReadonlyArray<{ name: string; type: string }> | null
				} | null
			} | null
		}
		const data = await this.cachedQuery<TreeData>(
			ListFilesQuery,
			{ owner: this.owner, name: this.repo, expression: this.expr(dir) },
			cacheKey,
		)
		const entries = data?.repository?.object?.entries
		if (!entries) return []
		return entries
			.filter((e) => e.type === "tree")
			.map((e) => e.name)
			.sort()
	}

	/**
	 * List all intents using a single GraphQL query.
	 *
	 * The query fetches the .haiku/intents/ tree with two levels of nesting,
	 * retrieving each intent directory's entries including intent.md content.
	 * This replaces N+1 REST calls (1 for listing dirs + 1 per intent).
	 */
	async listIntents(
		onProgress?: (intent: HaikuIntent) => void,
	): Promise<HaikuIntent[]> {
		const cacheKey = `gh:${this.owner}/${this.repo}:listIntents`
		const data = await this.cachedQuery<operationsListIntentsQuery$data>(
			ListIntentsQuery,
			{
				owner: this.owner,
				name: this.repo,
				expression: this.expr(".haiku/intents"),
			},
			cacheKey,
		)

		const entries = data?.repository?.object?.entries
		if (!entries) return []

		const intents: HaikuIntent[] = []

		for (const entry of entries) {
			if (entry.type !== "tree") continue

			// Look for intent.md in this intent directory's entries
			const subEntries = entry.object?.entries
			if (!subEntries) continue

			const intentEntry = subEntries.find(
				(e) => e.name === "intent.md" && e.type === "blob",
			)
			const rawText = intentEntry?.object?.text
			if (!rawText) continue

			const { data: frontmatter } = parseFrontmatter(rawText)
			const studio = (frontmatter.studio as string) || "ideation"
			const stages = (frontmatter.stages as string[]) || []

			const intent: HaikuIntent = {
				slug: entry.name,
				title: (frontmatter.title as string) || entry.name,
				studio,
				activeStage: (frontmatter.active_stage as string) || "",
				mode: (frontmatter.mode as string) || "continuous",
				startedAt: (frontmatter.started_at as string) || null,
				completedAt: (frontmatter.completed_at as string) || null,
				studioStages: (frontmatter.stages as string[]) || [],
				composite:
					(frontmatter.composite as Array<{
						studio: string
						stages: string[]
					}>) || null,
				...normalizeIntentStatus(
					(frontmatter.status as string) || "active",
					(frontmatter.completed_at as string) || null,
					stages.length > 0 ? stages.indexOf(frontmatter.active_stage as string) : 0,
					stages.length,
				),
				stagesTotal: stages.length,
				follows: (frontmatter.follows as string) || null,
				raw: frontmatter,
			}
			intents.push(intent)
			onProgress?.(intent)
		}

		return intents
	}

	/**
	 * Get full intent detail using a single GraphQL query.
	 *
	 * Uses aliased object() fields to fetch in one round-trip:
	 * - intent.md content
	 * - Full stages tree (stages -> units, state.json)
	 * - Knowledge directory listing
	 * - Operations directory listing
	 * - reflection.md content
	 *
	 * This replaces ~20+ REST calls with 1 GraphQL query.
	 */
	async getIntent(slug: string): Promise<HaikuIntentDetail | null> {
		const basePath = `.haiku/intents/${slug}`
		const cacheKey = `gh:${this.owner}/${this.repo}:getIntent:${slug}`
		const data = await this.cachedQuery<operationsGetIntentQuery$data>(
			GetIntentQuery,
			{
				owner: this.owner,
				name: this.repo,
				intentExpr: this.expr(`${basePath}/intent.md`),
				stagesExpr: this.expr(`${basePath}/stages`),
				knowledgeExpr: this.expr(`${basePath}/knowledge`),
				operationsExpr: this.expr(`${basePath}/operations`),
				reflectionExpr: this.expr(`${basePath}/reflection.md`),
			},
			cacheKey,
		)

		if (!data?.repository) return null

		const rawText = data.repository.intentFile?.text
		if (!rawText) return null

		const { data: frontmatter, content } = parseFrontmatter(rawText)
		const studio = (frontmatter.studio as string) || "ideation"
		const stageNames = (frontmatter.stages as string[]) || []
		const activeStage = (frontmatter.active_stage as string) || ""

		// Parse stages from the GraphQL tree response
		const stageEntries = data.repository.stagesTree?.entries ?? []
		const stageDirNames = stageEntries
			.filter((e) => e.type === "tree")
			.map((e) => e.name)
			.sort()

		const stages: HaikuStageState[] = []

		for (const stageName of stageNames.length > 0
			? stageNames
			: stageDirNames) {
			const stageEntry = stageEntries.find(
				(e) => e.name === stageName && e.type === "tree",
			)
			const stageChildren = stageEntry?.object?.entries ?? []

			// Parse units from the "units" subdirectory
			const units: HaikuUnit[] = []
			const unitsEntry = stageChildren.find(
				(e) => e.name === "units" && e.type === "tree",
			)
			const unitEntries = unitsEntry?.object?.entries ?? []

			for (const unitEntry of unitEntries) {
				if (unitEntry.type !== "blob" || !unitEntry.name.endsWith(".md"))
					continue
				const unitText = unitEntry.object?.text
				if (!unitText) continue

				const { data: unitData, content: unitContent } =
					parseFrontmatter(unitText)
				units.push({
					name: unitEntry.name.replace(".md", ""),
					stage: stageName,
					type: (unitData.type as string) || "",
					status: (unitData.status as string) || "pending",
					dependsOn: (unitData.depends_on as string[]) || [],
					refs: (unitData.refs as string[]) || [],
					bolt: (unitData.bolt as number) || 0,
					hat: (unitData.hat as string) || "",
					startedAt: (unitData.started_at as string) || null,
					completedAt: (unitData.completed_at as string) || null,
					criteria: parseCriteria(unitContent),
					content: unitContent,
					raw: unitData,
				})
			}

			// Parse state.json
			const stateEntry = stageChildren.find(
				(e) => e.name === "state.json" && e.type === "blob",
			)
			let stagePhase = ""
			let stageStartedAt: string | null = null
			let stageCompletedAt: string | null = null
			let gateOutcome: string | null = null

			if (stateEntry?.object?.text) {
				try {
					const stateData = JSON.parse(stateEntry.object.text)
					stagePhase = stateData.phase || ""
					stageStartedAt = stateData.started_at || null
					stageCompletedAt = stateData.completed_at || null
					gateOutcome = stateData.gate_outcome || null
				} catch {
					/* ignore parse errors */
				}
			}

			let status: "pending" | "active" | "complete" = "pending"
			if (stageName === activeStage) status = "active"
			else if (stageNames.indexOf(stageName) < stageNames.indexOf(activeStage))
				status = "complete"

			stages.push({
				name: stageName,
				status,
				phase: stagePhase,
				startedAt: stageStartedAt,
				completedAt: stageCompletedAt,
				gateOutcome,
				units,
			})
		}

		// Knowledge files
		const knowledgeEntries = data.repository.knowledgeTree?.entries ?? []
		const knowledgeFiles = knowledgeEntries
			.filter((e) => e.type === "blob" && e.name.endsWith(".md"))
			.map((e) => e.name)

		// Operations files
		const operationsEntries = data.repository.operationsTree?.entries ?? []
		const operationsFiles = operationsEntries
			.filter((e) => e.type === "blob" && e.name.endsWith(".md"))
			.map((e) => e.name)

		// Reflection
		const reflection = data.repository.reflectionFile?.text ?? null

		return {
			slug,
			title: (frontmatter.title as string) || slug,
			studio,
			activeStage,
			mode: (frontmatter.mode as string) || "continuous",
			startedAt: (frontmatter.started_at as string) || null,
			completedAt: (frontmatter.completed_at as string) || null,
			studioStages: (frontmatter.stages as string[]) || [],
			composite:
				(frontmatter.composite as Array<{
					studio: string
					stages: string[]
				}>) || null,
			...normalizeIntentStatus(
				(frontmatter.status as string) || "active",
				(frontmatter.completed_at as string) || null,
				stageNames.indexOf(activeStage),
				stageNames.length,
			),
			stagesTotal: stageNames.length,
			follows: (frontmatter.follows as string) || null,
			raw: frontmatter,
			stages,
			knowledge: knowledgeFiles,
			operations: operationsFiles,
			reflection,
			content,
			assets: [],
		}
	}

	async getSettings(): Promise<Record<string, unknown> | null> {
		const raw = await this.readFile(".haiku/settings.yml")
		if (!raw) return null
		return parseSettingsYaml(raw)
	}

	/** Write a file via REST API (mutations stay REST — they're rare). */
	async writeFile(
		path: string,
		content: string,
		message: string,
	): Promise<boolean> {
		// Get current file SHA (required for updates, absent for creates)
		const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""
		const getRes = await this.restApi(`/contents/${path}${ref}`)
		let sha: string | undefined
		if (getRes.ok) {
			const currentFile = await getRes.json()
			sha = currentFile?.sha
		}

		// Base64 encode content (handle Unicode correctly)
		const encoded = btoa(
			Array.from(new TextEncoder().encode(content))
				.map((b) => String.fromCharCode(b))
				.join(""),
		)

		const res = await this.restApi(`/contents/${path}`, {
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
		const res = await this.restApi("")
		return res.ok
	}

	/** Get detailed access status for error messaging */
	async getAccessStatus(): Promise<{
		ok: boolean
		reason: "accessible" | "rate_limited" | "not_found" | "auth_required"
	}> {
		const res = await this.restApi("")
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
