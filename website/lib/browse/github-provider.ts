import { fetchQuery } from "relay-runtime"
import { createRelayEnvironment } from "./graphql/environment"
import type {
	BrowseProvider,
	HaikuArtifact,
	HaikuIntent,
	HaikuIntentDetail,
	HaikuKnowledgeFile,
	HaikuStageState,
	HaikuUnit,
} from "./types"
import { normalizeIntentStatus, parseFrontmatter, parseUnit } from "./types"
import { parseSettingsYaml } from "./resolve-links"

import type { operationsGetIntentQuery$data } from "./graphql/github/__generated__/operationsGetIntentQuery.graphql"
import GetIntentQuery from "./graphql/github/__generated__/operationsGetIntentQuery.graphql"
import type { operationsListHaikuBranchesQuery$data } from "./graphql/github/__generated__/operationsListHaikuBranchesQuery.graphql"
import ListHaikuBranchesQuery from "./graphql/github/__generated__/operationsListHaikuBranchesQuery.graphql"
import ListFilesQuery from "./graphql/github/__generated__/operationsListFilesQuery.graphql"
// Relay-compiled query artifacts (schema-validated, fully typed)
import type { operationsListIntentsQuery$data } from "./graphql/github/__generated__/operationsListIntentsQuery.graphql"
import ListIntentsQuery from "./graphql/github/__generated__/operationsListIntentsQuery.graphql"
import ReadFileQuery from "./graphql/github/__generated__/operationsReadFileQuery.graphql"

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const apiCache = new Map<string, { data: unknown; ts: number }>()

function classifyArtifact(name: string): HaikuArtifact["type"] {
	const lower = name.toLowerCase()
	if (lower.endsWith(".md")) return "markdown"
	if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html"
	if (/\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/.test(lower)) return "image"
	return "other"
}

export class GitHubProvider implements BrowseProvider {
	readonly name = "GitHub"
	private owner: string
	private repo: string
	private branch: string
	private token: string | null
	private env: ReturnType<typeof createRelayEnvironment>
	/** Maps slug → branch for intents discovered via branch scanning */
	private intentBranchMap = new Map<string, string>()
	/** Maps slug → branch/PR metadata for carrying into detail views */
	private intentMetaMap = new Map<string, { branch?: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null }>()
	/** ETag from the last branch-change poll */
	private lastRefsEtag: string | null = null

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

	/** Read a file from a specific branch (bypasses this.branch). */
	private async readFileFromBranch(branch: string, path: string): Promise<string | null> {
		const expression = `${branch}:${path}`
		const cacheKey = `gh:${this.owner}/${this.repo}:readFile:${expression}`
		const data = await this.cachedQuery<{
			repository: { object: { text?: string | null } | null } | null
		}>(
			ReadFileQuery,
			{ owner: this.owner, name: this.repo, expression },
			cacheKey,
		)
		return data?.repository?.object?.text ?? null
	}

	/** Fetch the most recent PR for a given head branch. Returns nulls on failure. */
	private async fetchPrForBranch(
		branchName: string,
	): Promise<{ prUrl: string | null; prStatus: string | null; prNumber: number | null }> {
		try {
			const head = `${this.owner}:${branchName}`
			const res = await this.restApi(
				`/pulls?head=${encodeURIComponent(head)}&state=all&sort=updated&direction=desc&per_page=1`,
			)
			if (res.ok) {
				const prs = await res.json()
				if (Array.isArray(prs) && prs.length > 0) {
					const pr = prs[0]
					return {
						prUrl: pr.html_url,
						prStatus: pr.merged_at ? "merged" : pr.state.toLowerCase(),
						prNumber: pr.number,
					}
				}
			}
		} catch {
			// Non-critical
		}
		return { prUrl: null, prStatus: null, prNumber: null }
	}

	/** Parse raw intent.md text into a HaikuIntent with optional branch/PR metadata. */
	private parseIntentFromRaw(
		slug: string,
		rawText: string,
		meta?: { branch?: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null },
	): HaikuIntent {
		const { data: frontmatter, content } = parseFrontmatter(rawText)
		const studio = (frontmatter.studio as string) || "ideation"
		const stages = (frontmatter.stages as string[]) || []

		return {
			slug,
			title: (frontmatter.title as string) || slug,
			studio,
			activeStage: (frontmatter.active_stage as string) || "",
			mode: (frontmatter.mode as string) || "continuous",
			createdAt: (frontmatter.created_at as string) || (frontmatter.created as string) || null,
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
			content,
			raw: frontmatter,
			branch: meta?.branch,
			prUrl: meta?.prUrl ?? null,
			prStatus: meta?.prStatus ?? null,
			prNumber: meta?.prNumber ?? null,
		}
	}

	/**
	 * List all intents by scanning haiku branches and the main branch.
	 *
	 * When no branch is specified (default), scans all haiku/{slug}/main branches
	 * for active intents and merges with completed intents from the default branch.
	 * Branch version wins on slug collision (active work is more current).
	 *
	 * When a branch is explicitly specified, falls back to single-branch mode
	 * for backward compatibility and deep links.
	 */
	async listIntents(
		onProgress?: (intent: HaikuIntent) => void,
	): Promise<HaikuIntent[]> {
		// Single-branch mode: explicit branch specified — use legacy flow
		if (this.branch) {
			return this.listIntentsSingleBranch(onProgress)
		}

		// Scan mode: discover intents across all haiku/* branches + default branch
		const intentsBySlug = new Map<string, HaikuIntent>()

		// Step 1: List haiku/* branches with PR data
		const branchesCacheKey = `gh:${this.owner}/${this.repo}:listHaikuBranches`
		const branchesData = await this.cachedQuery<operationsListHaikuBranchesQuery$data>(
			ListHaikuBranchesQuery,
			{ owner: this.owner, name: this.repo, refPrefix: "refs/heads/haiku/" },
			branchesCacheKey,
		)

		const branchNodes = branchesData?.repository?.refs?.nodes ?? []

		// Step 2: For each haiku/*/main branch, read the intent.md
		// Branch name format: haiku/{slug}/main (refs strip the prefix, so name = "{slug}/main")
		const mainBranches = branchNodes.filter(
			(node) => node?.name.endsWith("/main"),
		)

		const branchReadPromises = mainBranches.map(async (node) => {
			if (!node) return
			const slug = node.name.replace(/\/main$/, "")
			const branchName = `haiku/${node.name}`

			// Extract PR info
			const pr = node.associatedPullRequests.nodes?.[0]
			const prMeta = pr
				? { prUrl: pr.url, prStatus: pr.state.toLowerCase(), prNumber: pr.number }
				: { prUrl: null, prStatus: null, prNumber: null }

			const rawText = await this.readFileFromBranch(branchName, `.haiku/intents/${slug}/intent.md`)
			if (!rawText) return

			const intent = this.parseIntentFromRaw(slug, rawText, {
				branch: branchName,
				...prMeta,
			})
			intentsBySlug.set(slug, intent)
			this.intentBranchMap.set(slug, branchName)
			this.intentMetaMap.set(slug, { branch: branchName, ...prMeta })
			onProgress?.(intent)
		})

		await Promise.all(branchReadPromises)

		// Step 3: Read completed/archived intents from the default branch (HEAD)
		const defaultBranchCacheKey = `gh:${this.owner}/${this.repo}:listIntents:HEAD`
		const defaultData = await this.cachedQuery<operationsListIntentsQuery$data>(
			ListIntentsQuery,
			{
				owner: this.owner,
				name: this.repo,
				expression: "HEAD:.haiku/intents",
			},
			defaultBranchCacheKey,
		)

		const defaultEntries = defaultData?.repository?.object?.entries ?? []

		for (const entry of defaultEntries) {
			if (entry.type !== "tree") continue

			// Skip if we already have this intent from a feature branch (branch version wins)
			if (intentsBySlug.has(entry.name)) continue

			const subEntries = entry.object?.entries
			if (!subEntries) continue

			const intentEntry = subEntries.find(
				(e) => e.name === "intent.md" && e.type === "blob",
			)
			const rawText = intentEntry?.object?.text
			if (!rawText) continue

			const intent = this.parseIntentFromRaw(entry.name, rawText)
			intentsBySlug.set(entry.name, intent)
			onProgress?.(intent)
		}

		return Array.from(intentsBySlug.values())
	}

	/** Single-branch mode: read .haiku/intents/ from one specific branch. */
	private async listIntentsSingleBranch(
		onProgress?: (intent: HaikuIntent) => void,
	): Promise<HaikuIntent[]> {
		const cacheKey = `gh:${this.owner}/${this.repo}:listIntents:${this.branch}`
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

			const subEntries = entry.object?.entries
			if (!subEntries) continue

			const intentEntry = subEntries.find(
				(e) => e.name === "intent.md" && e.type === "blob",
			)
			const rawText = intentEntry?.object?.text
			if (!rawText) continue

			const intent = this.parseIntentFromRaw(entry.name, rawText, {
				branch: this.branch,
			})
			intents.push(intent)
			onProgress?.(intent)
		}

		return intents
	}

	/** Build a git expression for a specific branch (or fallback to this.branch/HEAD). */
	private exprForBranch(branch: string | undefined, path: string): string {
		const ref = branch || this.branch || "HEAD"
		return `${ref}:${path}`
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
	 *
	 * In scan mode, uses the intentBranchMap to resolve which branch holds this intent.
	 */
	async getIntent(slug: string): Promise<HaikuIntentDetail | null> {
		let intentBranch = this.intentBranchMap.get(slug)

		// If branch map isn't populated yet (deeplink before listIntents), try to resolve the branch
		// and fetch its associated PR data. Without this, deep-linked intents render without
		// branch name or PR link until a full listIntents() pass runs.
		if (!intentBranch && !this.branch) {
			const branchName = `haiku/${slug}/main`
			const testRead = await this.readFileFromBranch(branchName, `.haiku/intents/${slug}/intent.md`)
			if (testRead) {
				intentBranch = branchName
				this.intentBranchMap.set(slug, branchName)

				// Fetch associated PRs (any state, most recent first) so the detail view
				// shows the PR link on first render.
				try {
					const branchesCacheKey = `gh:${this.owner}/${this.repo}:listHaikuBranches:${slug}`
					const branchesData = await this.cachedQuery<operationsListHaikuBranchesQuery$data>(
						ListHaikuBranchesQuery,
						{ owner: this.owner, name: this.repo, refPrefix: `refs/heads/haiku/${slug}/` },
						branchesCacheKey,
					)
					const node = branchesData?.repository?.refs?.nodes?.find(
						(n) => n?.name === `${slug}/main`,
					)
					const pr = node?.associatedPullRequests.nodes?.[0]
					const prMeta = pr
						? { prUrl: pr.url, prStatus: pr.state.toLowerCase(), prNumber: pr.number }
						: { prUrl: null, prStatus: null, prNumber: null }
					this.intentMetaMap.set(slug, { branch: branchName, ...prMeta })
				} catch {
					// Best-effort — if PR lookup fails, still show the branch
					this.intentMetaMap.set(slug, { branch: branchName, prUrl: null, prStatus: null, prNumber: null })
				}
			}
		}

		const basePath = `.haiku/intents/${slug}`
		const cacheKey = `gh:${this.owner}/${this.repo}:getIntent:${slug}:${intentBranch || this.branch || "HEAD"}`
		const data = await this.cachedQuery<operationsGetIntentQuery$data>(
			GetIntentQuery,
			{
				owner: this.owner,
				name: this.repo,
				intentExpr: this.exprForBranch(intentBranch, `${basePath}/intent.md`),
				stagesExpr: this.exprForBranch(intentBranch, `${basePath}/stages`),
				knowledgeExpr: this.exprForBranch(intentBranch, `${basePath}/knowledge`),
				operationsExpr: this.exprForBranch(intentBranch, `${basePath}/operations`),
				reflectionExpr: this.exprForBranch(intentBranch, `${basePath}/reflection.md`),
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

				units.push(parseUnit(unitEntry.name, stageName, unitText))
			}

			// Parse artifacts from the "artifacts" subdirectory
			const stageArtifacts: HaikuArtifact[] = []
			const artifactsEntry = stageChildren.find(
				(e) => e.name === "artifacts" && e.type === "tree",
			)
			const artifactEntries = artifactsEntry?.object?.entries ?? []

			for (const artEntry of artifactEntries) {
				if (artEntry.type !== "blob") continue
				const artType = classifyArtifact(artEntry.name)
				const textContent = artEntry.object?.text
				if (textContent != null) {
					stageArtifacts.push({ name: artEntry.name, content: textContent, type: artType })
				} else {
					// Binary file — build a raw URL via GitHub API
					const ref = intentBranch || this.branch || "HEAD"
					const filePath = `${basePath}/stages/${stageName}/artifacts/${artEntry.name}`
					const rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${encodeURIComponent(ref)}/${filePath}`
					stageArtifacts.push({ name: artEntry.name, rawUrl, type: artType })
				}
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
				artifacts: stageArtifacts.length > 0 ? stageArtifacts : undefined,
			})
		}

		// Knowledge files (include content)
		const knowledgeEntries = data.repository.knowledgeTree?.entries ?? []
		const knowledgeFiles: HaikuKnowledgeFile[] = knowledgeEntries
			.filter((e) => e.type === "blob" && e.name.endsWith(".md"))
			.map((e) => ({
				name: e.name,
				content: e.object?.text || "",
			}))

		// Operations files (include content)
		const operationsEntries = data.repository.operationsTree?.entries ?? []
		const operationsFiles: HaikuKnowledgeFile[] = operationsEntries
			.filter((e) => e.type === "blob" && e.name.endsWith(".md"))
			.map((e) => ({
				name: e.name,
				content: e.object?.text || "",
			}))

		// Reflection
		const reflection = data.repository.reflectionFile?.text ?? null

		return {
			slug,
			title: (frontmatter.title as string) || slug,
			studio,
			activeStage,
			mode: (frontmatter.mode as string) || "continuous",
			createdAt: (frontmatter.created_at as string) || (frontmatter.created as string) || null,
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
			...(await this.getOrFetchMeta(slug, intentBranch)),
		}
	}

	/** Get cached meta or fetch MR/PR data on deeplink when listIntents hasn't populated the map. */
	private async getOrFetchMeta(slug: string, intentBranch: string | undefined) {
		const cached = this.intentMetaMap.get(slug)
		if (cached) return cached
		if (!intentBranch) return {}
		const prMeta = await this.fetchPrForBranch(intentBranch)
		const meta = { branch: intentBranch, ...prMeta }
		this.intentMetaMap.set(slug, meta)
		return meta
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

	/** Check if haiku branches have changed since last poll using ETags. Returns true if changed. */
	async checkForBranchChanges(): Promise<boolean> {
		// Only useful in scan mode (no explicit branch)
		if (this.branch) return false

		const headers = new Headers(this.restHeaders())
		if (this.lastRefsEtag) {
			headers.set("If-None-Match", this.lastRefsEtag)
		}

		const res = await fetch(
			`https://api.github.com/repos/${this.owner}/${this.repo}/git/refs/heads/haiku`,
			{ headers },
		)

		if (res.status === 304) return false // Not modified

		const etag = res.headers.get("etag")
		if (etag) this.lastRefsEtag = etag

		return res.ok // true = changed, re-fetch needed
	}

	/** Clear cached branch and intent data so the next fetch gets fresh results. */
	clearBranchCache(): void {
		for (const key of apiCache.keys()) {
			if (
				key.includes("listHaikuBranches") ||
				key.includes("listIntents") ||
				key.includes("getIntent")
			) {
				apiCache.delete(key)
			}
		}
		this.intentBranchMap.clear()
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

	/** Get the OAuth URL for GitHub.
	 *
	 * Scope: `repo` — full read/write access to public + private repositories.
	 * This is required because the browse UI:
	 *   - Reads `.haiku/intents/` contents (public + private repos)
	 *   - Reads branches and associated PRs (including CLOSED/rejected ones)
	 *   - Writes stage gate approvals via `writeFile` (external review buttons)
	 *
	 * Narrower alternatives like `public_repo` or `read:repo` would work for
	 * read-only public access but would break gate approvals on private repos. */
	static getOAuthUrl(clientId: string, redirectUri: string): string {
		return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`
	}
}
