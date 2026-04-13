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
	/** Maps "slug/stageName" → branch/PR metadata for stage-level branches */
	private stageBranchMap = new Map<string, { branch: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null }>()
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

		// Scan mode: load all intents from HEAD, then merge branch data on top.
		// HEAD is the canonical catalog. Each haiku/{slug}/main branch carries the
		// most current version of its own intent — we read only that one file and
		// merge it over the HEAD baseline.
		const intentsBySlug = new Map<string, HaikuIntent>()

		// Step 1: List haiku/* branches with PR data
		const branchesCacheKey = `gh:${this.owner}/${this.repo}:listHaikuBranches`
		const branchesData = await this.cachedQuery<operationsListHaikuBranchesQuery$data>(
			ListHaikuBranchesQuery,
			{ owner: this.owner, name: this.repo, refPrefix: "refs/heads/haiku/" },
			branchesCacheKey,
		)

		const branchNodes = branchesData?.repository?.refs?.nodes ?? []

		// Capture stage-level branches (haiku/{slug}/{stageName}, where stageName != "main")
		for (const node of branchNodes) {
			if (!node || node.name.endsWith("/main")) continue
			const parts = node.name.split("/")
			if (parts.length < 2) continue
			const slug = parts.slice(0, -1).join("/")
			const stageName = parts[parts.length - 1]
			const branchName = `haiku/${node.name}`
			const pr = node.associatedPullRequests.nodes?.[0]
			this.stageBranchMap.set(`${slug}/${stageName}`, {
				branch: branchName,
				prUrl: pr?.url ?? null,
				prStatus: pr?.state.toLowerCase() ?? null,
				prNumber: pr?.number ?? null,
			})
		}

		// Step 2: Load ALL intents from default branch — the canonical catalog
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

			const subEntries = entry.object?.entries
			if (!subEntries) continue

			const intentEntry = subEntries.find(
				(e) => e.name === "intent.md" && e.type === "blob",
			)
			const rawText = intentEntry?.object?.text
			if (!rawText) continue

			const intent = this.parseIntentFromRaw(entry.name, rawText)
			intentsBySlug.set(entry.name, intent)
		}

		// Step 3: For each haiku/{slug}/main branch, read ONLY the matching intent
		// and merge it over the HEAD baseline. Branch version is more current for
		// active work and carries branch/PR metadata.
		const mainBranches = branchNodes.filter(
			(node) => node?.name.endsWith("/main"),
		)

		const branchReadPromises = mainBranches.map(async (node) => {
			if (!node) return
			const slug = node.name.replace(/\/main$/, "")
			const branchName = `haiku/${node.name}`

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
		})

		// Stream default-branch intents immediately so the UI renders progressively
		for (const [, intent] of intentsBySlug) {
			onProgress?.(intent)
		}

		// Branch reads may update existing entries — re-emit after they resolve
		await Promise.all(branchReadPromises)

		const allIntents = Array.from(intentsBySlug.values())
		for (const intent of allIntents) {
			if (intent.branch) onProgress?.(intent)
		}

		return allIntents
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

	// ── Three-level merge helpers ────────────────────────────────────────

	/** Fetch the full intent tree from a specific ref via the GetIntentQuery. */
	private async fetchIntentFromRef(
		slug: string,
		ref: string | undefined,
	): Promise<operationsGetIntentQuery$data | null> {
		const basePath = `.haiku/intents/${slug}`
		const effectiveRef = ref || this.branch || "HEAD"
		const cacheKey = `gh:${this.owner}/${this.repo}:getIntent:${slug}:${effectiveRef}`
		return (await this.cachedQuery<operationsGetIntentQuery$data>(
			GetIntentQuery,
			{
				owner: this.owner,
				name: this.repo,
				intentExpr: `${effectiveRef}:${basePath}/intent.md`,
				stagesExpr: `${effectiveRef}:${basePath}/stages`,
				knowledgeExpr: `${effectiveRef}:${basePath}/knowledge`,
				operationsExpr: `${effectiveRef}:${basePath}/operations`,
				reflectionExpr: `${effectiveRef}:${basePath}/reflection.md`,
			},
			cacheKey,
		)) ?? null
	}

	/** Parse a single stage directory from the stagesTree entries. */
	private parseStageFromTree(
		slug: string,
		stageName: string,
		stageEntries: NonNullable<NonNullable<operationsGetIntentQuery$data["repository"]>["stagesTree"]>["entries"],
		activeStage: string,
		stageNames: string[],
		ref: string,
	): HaikuStageState | null {
		const entries = stageEntries ?? []
		const stageEntry = entries.find(
			(e) => e.name === stageName && e.type === "tree",
		)
		if (!stageEntry) return null
		const stageChildren = stageEntry?.object?.entries ?? []

		// Units
		const units: HaikuUnit[] = []
		const unitsEntry = stageChildren.find((e) => e.name === "units" && e.type === "tree")
		for (const ue of unitsEntry?.object?.entries ?? []) {
			if (ue.type !== "blob" || !ue.name.endsWith(".md")) continue
			const text = ue.object?.text
			if (!text) continue
			units.push(parseUnit(ue.name, stageName, text))
		}

		// Artifacts
		const artifacts: HaikuArtifact[] = []
		const artifactsEntry = stageChildren.find((e) => e.name === "artifacts" && e.type === "tree")
		for (const ae of artifactsEntry?.object?.entries ?? []) {
			if (ae.type !== "blob") continue
			const artType = classifyArtifact(ae.name)
			if (ae.object?.text != null) {
				artifacts.push({ name: ae.name, content: ae.object.text, type: artType })
			} else {
				const basePath = `.haiku/intents/${slug}`
				const filePath = `${basePath}/stages/${stageName}/artifacts/${ae.name}`
				const rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${encodeURIComponent(ref)}/${filePath}`
				artifacts.push({ name: ae.name, rawUrl, type: artType })
			}
		}

		// state.json
		const stateEntry = stageChildren.find((e) => e.name === "state.json" && e.type === "blob")
		let phase = ""
		let startedAt: string | null = null
		let completedAt: string | null = null
		let gateOutcome: string | null = null
		if (stateEntry?.object?.text) {
			try {
				const s = JSON.parse(stateEntry.object.text)
				phase = s.phase || ""
				startedAt = s.started_at || null
				completedAt = s.completed_at || null
				gateOutcome = s.gate_outcome || null
			} catch { /* ignore */ }
		}

		let status: "pending" | "active" | "complete" = "pending"
		if (stageName === activeStage) status = "active"
		else if (stageNames.indexOf(stageName) < stageNames.indexOf(activeStage)) status = "complete"

		return {
			name: stageName,
			status,
			phase,
			startedAt,
			completedAt,
			gateOutcome,
			units,
			artifacts: artifacts.length > 0 ? artifacts : undefined,
		}
	}

	/** Extract knowledge files from a query result's knowledgeTree. */
	private parseKnowledgeFromTree(
		data: operationsGetIntentQuery$data | null,
	): HaikuKnowledgeFile[] {
		return (data?.repository?.knowledgeTree?.entries ?? [])
			.filter((e) => e.type === "blob" && e.name.endsWith(".md"))
			.map((e) => ({ name: e.name, content: e.object?.text || "" }))
	}

	/** Merge knowledge files — overlay wins on filename collision, new files are added. */
	private mergeKnowledge(
		base: HaikuKnowledgeFile[],
		overlay: HaikuKnowledgeFile[],
	): HaikuKnowledgeFile[] {
		const byName = new Map<string, HaikuKnowledgeFile>()
		for (const f of base) byName.set(f.name, f)
		for (const f of overlay) byName.set(f.name, f)
		return Array.from(byName.values())
	}

	// ── getIntent: three-level trust merge ───────────────────────────────

	/**
	 * Get full intent detail by merging data from three trust levels:
	 *
	 * 1. Default branch (baseline — all intents including completed/archived)
	 * 2. Intent branch `haiku/{slug}/main` (overrides for active intent)
	 * 3. Stage branches `haiku/{slug}/{stage}` (highest trust, scoped to own stage + knowledge)
	 *
	 * In single-branch mode (explicit `this.branch`), skips the merge and reads from that branch only.
	 */
	async getIntent(slug: string): Promise<HaikuIntentDetail | null> {
		// Single-branch mode: explicit branch — no merge needed
		if (this.branch) {
			return this.getIntentSingleRef(slug)
		}

		let intentBranch = this.intentBranchMap.get(slug)

		// Deep-link resolution: probe for branch + PR data if maps aren't populated yet
		if (!intentBranch) {
			intentBranch = await this.probeIntentBranch(slug)
		}

		// Collect stage branches for this slug
		const stageBranches = new Map<string, { branch: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null }>()
		for (const [key, meta] of this.stageBranchMap) {
			if (key.startsWith(`${slug}/`)) {
				stageBranches.set(key.slice(slug.length + 1), meta)
			}
		}

		// Fetch all trust levels in parallel
		const stageBranchPromises = new Map<string, Promise<operationsGetIntentQuery$data | null>>()
		for (const [stageName, meta] of stageBranches) {
			stageBranchPromises.set(stageName, this.fetchIntentFromRef(slug, meta.branch))
		}

		const [defaultData, intentData] = await Promise.all([
			this.fetchIntentFromRef(slug, undefined),
			intentBranch ? this.fetchIntentFromRef(slug, intentBranch) : null,
		])

		// Resolve stage branch fetches (they ran in parallel with the above)
		const stageBranchData = new Map<string, operationsGetIntentQuery$data | null>()
		for (const [stageName, promise] of stageBranchPromises) {
			stageBranchData.set(stageName, await promise)
		}

		// intent.md: intent branch wins, fallback to default
		const intentRaw = intentData?.repository?.intentFile?.text
			?? defaultData?.repository?.intentFile?.text
		if (!intentRaw) return null

		const { data: frontmatter, content } = parseFrontmatter(intentRaw)
		const studio = (frontmatter.studio as string) || "ideation"
		const stageNames = (frontmatter.stages as string[]) || []
		const activeStage = (frontmatter.active_stage as string) || ""

		// Determine ordered stage list from frontmatter or directory listing
		const fallbackDirNames = (intentData ?? defaultData)?.repository?.stagesTree?.entries
			?.filter((e) => e.type === "tree")
			.map((e) => e.name)
			.sort() ?? []
		const orderedStages = stageNames.length > 0 ? stageNames : fallbackDirNames

		// Build stages with three-level merge:
		// default ← intent branch ← stage branch (scoped to own stage only)
		const stages: HaikuStageState[] = []
		for (const stageName of orderedStages) {
			const stageBranchRef = stageBranches.get(stageName)
			const stageBranchResult = stageBranchData.get(stageName)

			// Try each trust level, highest first
			let parsed: HaikuStageState | null = null

			// Level 3: Stage branch (highest trust for its own stage)
			if (stageBranchResult?.repository?.stagesTree?.entries) {
				parsed = this.parseStageFromTree(
					slug, stageName,
					stageBranchResult.repository.stagesTree.entries,
					activeStage, stageNames,
					stageBranchRef!.branch,
				)
			}

			// Level 2: Intent branch
			if (!parsed && intentData?.repository?.stagesTree?.entries) {
				parsed = this.parseStageFromTree(
					slug, stageName,
					intentData.repository.stagesTree.entries,
					activeStage, stageNames,
					intentBranch ?? "HEAD",
				)
			}

			// Level 1: Default branch (baseline)
			if (!parsed && defaultData?.repository?.stagesTree?.entries) {
				parsed = this.parseStageFromTree(
					slug, stageName,
					defaultData.repository.stagesTree.entries,
					activeStage, stageNames,
					"HEAD",
				)
			}

			if (!parsed) {
				// Stage declared in frontmatter but not found on any branch
				parsed = { name: stageName, status: "pending", phase: "", startedAt: null, completedAt: null, gateOutcome: null, units: [] }
			}

			// Attach stage branch/PR metadata
			const meta = stageBranches.get(stageName)
			stages.push({
				...parsed,
				branch: meta?.branch,
				prUrl: meta?.prUrl ?? null,
				prStatus: meta?.prStatus ?? null,
				prNumber: meta?.prNumber ?? null,
			})
		}

		// Knowledge: merge from all levels (each can contribute)
		let knowledge = this.parseKnowledgeFromTree(defaultData)
		if (intentData) {
			knowledge = this.mergeKnowledge(knowledge, this.parseKnowledgeFromTree(intentData))
		}
		for (const [, data] of stageBranchData) {
			if (data) knowledge = this.mergeKnowledge(knowledge, this.parseKnowledgeFromTree(data))
		}

		// Operations: intent branch wins, fallback to default (stage branches cannot touch)
		const opsSource = intentData ?? defaultData
		const operations: HaikuKnowledgeFile[] = (opsSource?.repository?.operationsTree?.entries ?? [])
			.filter((e) => e.type === "blob" && e.name.endsWith(".md"))
			.map((e) => ({ name: e.name, content: e.object?.text || "" }))

		// Reflection: intent branch wins (stage branches cannot touch)
		const reflection = intentData?.repository?.reflectionFile?.text
			?? defaultData?.repository?.reflectionFile?.text
			?? null

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
				(frontmatter.composite as Array<{ studio: string; stages: string[] }>)
				|| null,
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
			knowledge,
			operations,
			reflection,
			content,
			assets: [],
			...(this.intentMetaMap.get(slug) || {}),
		}
	}

	/** Deep-link probe: discover intent branch + stage branches when maps aren't populated. */
	private async probeIntentBranch(slug: string): Promise<string | undefined> {
		const branchName = `haiku/${slug}/main`
		const testRead = await this.readFileFromBranch(branchName, `.haiku/intents/${slug}/intent.md`)
		if (!testRead) return undefined

		this.intentBranchMap.set(slug, branchName)

		try {
			const branchesCacheKey = `gh:${this.owner}/${this.repo}:listHaikuBranches:${slug}`
			const branchesData = await this.cachedQuery<operationsListHaikuBranchesQuery$data>(
				ListHaikuBranchesQuery,
				{ owner: this.owner, name: this.repo, refPrefix: `refs/heads/haiku/${slug}/` },
				branchesCacheKey,
			)
			const mainNode = branchesData?.repository?.refs?.nodes?.find(
				(n) => n?.name === `${slug}/main`,
			)
			const pr = mainNode?.associatedPullRequests.nodes?.[0]
			const prMeta = pr
				? { prUrl: pr.url, prStatus: pr.state.toLowerCase(), prNumber: pr.number }
				: { prUrl: null, prStatus: null, prNumber: null }
			this.intentMetaMap.set(slug, { branch: branchName, ...prMeta })

			for (const node of branchesData?.repository?.refs?.nodes ?? []) {
				if (!node || node.name === `${slug}/main`) continue
				const parts = node.name.split("/")
				const stageName = parts[parts.length - 1]
				if (!stageName) continue
				const stagePr = node.associatedPullRequests.nodes?.[0]
				this.stageBranchMap.set(`${slug}/${stageName}`, {
					branch: `haiku/${node.name}`,
					prUrl: stagePr?.url ?? null,
					prStatus: stagePr?.state.toLowerCase() ?? null,
					prNumber: stagePr?.number ?? null,
				})
			}
		} catch {
			this.intentMetaMap.set(slug, { branch: branchName, prUrl: null, prStatus: null, prNumber: null })
		}

		return branchName
	}

	/** Single-ref fallback for explicit branch mode (no three-level merge). */
	private async getIntentSingleRef(slug: string): Promise<HaikuIntentDetail | null> {
		const data = await this.fetchIntentFromRef(slug, this.branch)

		if (!data?.repository) return null
		const rawText = data.repository.intentFile?.text
		if (!rawText) return null

		const { data: frontmatter, content } = parseFrontmatter(rawText)
		const studio = (frontmatter.studio as string) || "ideation"
		const stageNames = (frontmatter.stages as string[]) || []
		const activeStage = (frontmatter.active_stage as string) || ""
		const ref = this.branch || "HEAD"

		const fallbackDirNames = data.repository.stagesTree?.entries
			?.filter((e) => e.type === "tree")
			.map((e) => e.name)
			.sort() ?? []

		const stages: HaikuStageState[] = []
		for (const stageName of stageNames.length > 0 ? stageNames : fallbackDirNames) {
			const parsed = this.parseStageFromTree(
				slug, stageName,
				data.repository.stagesTree?.entries ?? null,
				activeStage, stageNames,
				ref,
			)
			if (parsed) stages.push(parsed)
		}

		const knowledge = this.parseKnowledgeFromTree(data)
		const operations: HaikuKnowledgeFile[] = (data.repository.operationsTree?.entries ?? [])
			.filter((e) => e.type === "blob" && e.name.endsWith(".md"))
			.map((e) => ({ name: e.name, content: e.object?.text || "" }))
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
				(frontmatter.composite as Array<{ studio: string; stages: string[] }>)
				|| null,
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
			knowledge,
			operations,
			reflection,
			content,
			assets: [],
			branch: this.branch,
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
		this.stageBranchMap.clear()
		this.intentMetaMap.clear()
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
	 * Scope: `repo` — full read access to public + private repositories.
	 * This is required because the browse UI:
	 *   - Reads `.haiku/intents/` contents (public + private repos)
	 *   - Reads branches and associated PRs (including CLOSED/rejected ones) */
	static getOAuthUrl(clientId: string, redirectUri: string): string {
		return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`
	}
}
