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

import type { operationsBatchBlobsQuery$data } from "./graphql/gitlab/__generated__/operationsBatchBlobsQuery.graphql"
import BatchBlobsQuery from "./graphql/gitlab/__generated__/operationsBatchBlobsQuery.graphql"
import type { operationsIntentTreeQuery$data } from "./graphql/gitlab/__generated__/operationsIntentTreeQuery.graphql"
import IntentTreeQuery from "./graphql/gitlab/__generated__/operationsIntentTreeQuery.graphql"
import type { operationsListBranchNamesQuery$data } from "./graphql/gitlab/__generated__/operationsListBranchNamesQuery.graphql"
import ListBranchNamesQuery from "./graphql/gitlab/__generated__/operationsListBranchNamesQuery.graphql"
import ListFilesQueryArtifact from "./graphql/gitlab/__generated__/operationsListFilesQuery.graphql"
// Relay-compiled query artifacts (schema-validated, fully typed)
import type { operationsListIntentsTreeQuery$data } from "./graphql/gitlab/__generated__/operationsListIntentsTreeQuery.graphql"
import ListIntentsTreeQuery from "./graphql/gitlab/__generated__/operationsListIntentsTreeQuery.graphql"
import ReadFileQuery from "./graphql/gitlab/__generated__/operationsReadFileQuery.graphql"

const glCache = new Map<string, { data: unknown; ts: number }>()
const GL_CACHE_TTL = 5 * 60 * 1000
const CHUNK_SIZE = 10

function classifyArtifact(name: string): HaikuArtifact["type"] {
	const lower = name.toLowerCase()
	if (lower.endsWith(".md")) return "markdown"
	if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html"
	if (/\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/.test(lower)) return "image"
	return "other"
}

export class GitLabProvider implements BrowseProvider {
	readonly name = "GitLab"
	private host: string
	private projectPath: string
	private branch: string
	private token: string | null
	private env: ReturnType<typeof createRelayEnvironment>
	/** Maps slug → branch for intents discovered via branch scanning */
	private intentBranchMap = new Map<string, string>()
	private intentMetaMap = new Map<string, { branch?: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null }>()
	/** ETag from the last branch-change poll */
	private lastBranchesEtag: string | null = null

	constructor(
		host: string,
		projectPath: string,
		branch = "",
		token: string | null = null,
	) {
		this.host = host
		this.projectPath = projectPath
		this.branch = branch
		this.token = token
		this.env = createRelayEnvironment({
			url: `https://${this.host}/api/graphql`,
			headers: () => this.graphqlHeaders(),
		})
	}

	private graphqlHeaders(): HeadersInit {
		const h: HeadersInit = {}
		if (this.token) h.Authorization = `Bearer ${this.token}`
		return h
	}

	private get encodedProject(): string {
		return encodeURIComponent(this.projectPath)
	}

	private restHeaders(): HeadersInit {
		const h: HeadersInit = {}
		if (this.token) h.Authorization = `Bearer ${this.token}`
		return h
	}

	private async restApi(path: string, init?: RequestInit): Promise<Response> {
		const url = `https://${this.host}/api/v4/projects/${this.encodedProject}${path}`
		return fetch(url, {
			...init,
			headers: { ...this.restHeaders(), ...init?.headers },
		})
	}

	/** Ref parameter for GraphQL queries. null means HEAD (server default). */
	private get ref(): string | null {
		return this.branch || null
	}

	/**
	 * Execute a Relay query with caching.
	 */
	private async cachedQuery<T>(
		query: Parameters<typeof fetchQuery>[1],
		variables: Record<string, unknown>,
		cacheKey: string,
	): Promise<T | undefined> {
		const cached = glCache.get(cacheKey)
		if (cached && Date.now() - cached.ts < GL_CACHE_TTL) return cached.data as T

		const result = await fetchQuery(this.env, query, variables).toPromise()
		if (result) {
			glCache.set(cacheKey, { data: result, ts: Date.now() })
		}
		return result as T | undefined
	}

	async readFile(path: string): Promise<string | null> {
		const cacheKey = `gl:${this.host}:${this.projectPath}:readFile:${path}`
		type ReadData = {
			project: {
				repository: {
					blobs: {
						nodes: Array<{ path: string; rawTextBlob: string | null } | null> | null
					} | null
				} | null
			} | null
		}
		const data = await this.cachedQuery<ReadData>(
			ReadFileQuery,
			{ fullPath: this.projectPath, paths: [path], ref: this.ref },
			cacheKey,
		)
		const nodes = data?.project?.repository?.blobs?.nodes
		if (!nodes || nodes.length === 0) return null
		return nodes[0]?.rawTextBlob ?? null
	}

	async listFiles(dir: string): Promise<string[]> {
		const cacheKey = `gl:${this.host}:${this.projectPath}:listFiles:${dir}`
		type ListData = {
			project: {
				repository: {
					tree: {
						blobs: {
							nodes: Array<{ name: string; path: string } | null> | null
						} | null
						trees: {
							nodes: Array<{ name: string; path: string } | null> | null
						} | null
					} | null
				} | null
			} | null
		}
		const data = await this.cachedQuery<ListData>(
			ListFilesQueryArtifact,
			{ fullPath: this.projectPath, path: dir, ref: this.ref },
			cacheKey,
		)
		const blobs = data?.project?.repository?.tree?.blobs?.nodes
		if (!blobs) return []
		return blobs
			.filter((n): n is { name: string; path: string } => n != null)
			.map((n) => n.name)
			.sort()
	}

	private async listDirs(dir: string): Promise<string[]> {
		const cacheKey = `gl:${this.host}:${this.projectPath}:listDirs:${dir}`
		type ListData = {
			project: {
				repository: {
					tree: {
						blobs: {
							nodes: Array<{ name: string; path: string } | null> | null
						} | null
						trees: {
							nodes: Array<{ name: string; path: string } | null> | null
						} | null
					} | null
				} | null
			} | null
		}
		const data = await this.cachedQuery<ListData>(
			ListFilesQueryArtifact,
			{ fullPath: this.projectPath, path: dir, ref: this.ref },
			cacheKey,
		)
		const trees = data?.project?.repository?.tree?.trees?.nodes
		if (!trees) return []
		return trees
			.filter((n): n is { name: string; path: string } => n != null)
			.map((n) => n.name)
			.sort()
	}

	/** Read a file from a specific ref (bypasses this.ref). */
	private async readFileFromRef(ref: string, path: string): Promise<string | null> {
		const cacheKey = `gl:${this.host}:${this.projectPath}:readFile:${ref}:${path}`
		type ReadData = {
			project: {
				repository: {
					blobs: {
						nodes: Array<{ path: string; rawTextBlob: string | null } | null> | null
					} | null
				} | null
			} | null
		}
		const data = await this.cachedQuery<ReadData>(
			ReadFileQuery,
			{ fullPath: this.projectPath, paths: [path], ref },
			cacheKey,
		)
		const nodes = data?.project?.repository?.blobs?.nodes
		if (!nodes || nodes.length === 0) return null
		return nodes[0]?.rawTextBlob ?? null
	}

	/** Fetch the most recent MR for a given source branch. Returns nulls on failure. */
	private async fetchMrForBranch(
		branchName: string,
	): Promise<{ prUrl: string | null; prStatus: string | null; prNumber: number | null }> {
		try {
			const mrRes = await this.restApi(
				`/merge_requests?source_branch=${encodeURIComponent(branchName)}&state=all&order_by=updated_at&sort=desc&per_page=1`,
			)
			if (mrRes.ok) {
				const mrs = await mrRes.json()
				if (Array.isArray(mrs) && mrs.length > 0) {
					return {
						prUrl: mrs[0].web_url,
						prStatus: mrs[0].state,
						prNumber: mrs[0].iid,
					}
				}
			}
		} catch {
			// Non-critical
		}
		return { prUrl: null, prStatus: null, prNumber: null }
	}

	/** Get cached meta or fetch MR data on deeplink when listIntents hasn't populated the map. */
	private async getOrFetchMeta(slug: string, intentBranch: string | undefined) {
		const cached = this.intentMetaMap.get(slug)
		if (cached) return cached
		if (!intentBranch) return {}
		const mrMeta = await this.fetchMrForBranch(intentBranch)
		const meta = { branch: intentBranch, ...mrMeta }
		this.intentMetaMap.set(slug, meta)
		return meta
	}

	/** Parse raw intent.md text into a HaikuIntent with optional branch/MR metadata. */
	private parseIntentFromRaw(
		slug: string,
		rawText: string,
		meta?: { branch?: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null },
	): HaikuIntent {
		const { data, content } = parseFrontmatter(rawText)
		const studio = (data.studio as string) || "ideation"
		const stages = (data.stages as string[]) || []

		return {
			slug,
			title: (data.title as string) || slug,
			studio,
			activeStage: (data.active_stage as string) || "",
			mode: (data.mode as string) || "continuous",
			createdAt: (data.created_at as string) || (data.created as string) || null,
			startedAt: (data.started_at as string) || null,
			completedAt: (data.completed_at as string) || null,
			studioStages: (data.stages as string[]) || [],
			composite:
				(data.composite as Array<{ studio: string; stages: string[] }>) ||
				null,
			...normalizeIntentStatus(
				(data.status as string) || "active",
				(data.completed_at as string) || null,
				stages.length > 0 ? stages.indexOf(data.active_stage as string) : 0,
				stages.length,
			),
			stagesTotal: stages.length,
			follows: (data.follows as string) || null,
			content,
			raw: data,
			branch: meta?.branch,
			prUrl: meta?.prUrl ?? null,
			prStatus: meta?.prStatus ?? null,
			prNumber: meta?.prNumber ?? null,
		}
	}

	/**
	 * List all intents by scanning haiku branches and the default branch.
	 *
	 * When no branch is specified (default), scans all haiku/{slug}/main branches
	 * for active intents and merges with completed intents from the default branch.
	 * Branch version wins on slug collision.
	 *
	 * When a branch is explicitly specified, falls back to single-branch mode.
	 */
	async listIntents(
		onProgress?: (intent: HaikuIntent) => void,
	): Promise<HaikuIntent[]> {
		// Single-branch mode: explicit branch specified
		if (this.branch) {
			return this.listIntentsSingleBranch(onProgress)
		}

		// Scan mode: discover intents across all haiku/* branches + default branch
		const intentsBySlug = new Map<string, HaikuIntent>()

		// Step 1: List haiku/* branches via GraphQL
		const branchesCacheKey = `gl:${this.host}:${this.projectPath}:listHaikuBranches`
		const branchesData = await this.cachedQuery<operationsListBranchNamesQuery$data>(
			ListBranchNamesQuery,
			{ fullPath: this.projectPath, searchPattern: "haiku/*", offset: 0, limit: 100 },
			branchesCacheKey,
		)

		const branchNames = branchesData?.project?.repository?.branchNames ?? []
		if (branchNames.length > 0) {
			console.log(`[haiku-browse] Found ${branchNames.length} haiku branches:`, branchNames)
		} else {
			console.log(`[haiku-browse] No haiku branches found via branchNames query`)
		}

		// Filter to haiku/*/main branches and extract slugs
		const mainBranches = branchNames.filter((name: string) => {
			const parts = name.split("/")
			return parts.length >= 2 && parts[parts.length - 1] === "main"
		})

		// Step 2: For each haiku/*/main branch, read intent.md and check for MRs
		const branchReadPromises = mainBranches.map(async (branchName) => {
			// Extract slug: "haiku/my-feature/main" -> "my-feature"
			// branchNames returns the full name including "haiku/" prefix
			const parts = branchName.split("/")
			// Remove first part ("haiku") and last part ("main"), rest is the slug
			const slug = parts.slice(1, -1).join("/")
			if (!slug) return

			const rawText = await this.readFileFromRef(branchName, `.haiku/intents/${slug}/intent.md`)
			if (!rawText) return

			// Fetch the most recent MR for this branch in ANY state (opened, merged, closed).
			const { prUrl, prStatus, prNumber } = await this.fetchMrForBranch(branchName)

			const intent = this.parseIntentFromRaw(slug, rawText, {
				branch: branchName,
				prUrl,
				prStatus,
				prNumber,
			})
			intentsBySlug.set(slug, intent)
			this.intentBranchMap.set(slug, branchName)
			this.intentMetaMap.set(slug, { branch: branchName, prUrl, prStatus, prNumber })
			onProgress?.(intent)
		})

		await Promise.all(branchReadPromises)

		// Step 3: Read completed/archived intents from default branch
		const defaultIntents = await this.listIntentsFromRef(null)
		for (const intent of defaultIntents) {
			// Skip if we already have this intent from a feature branch (branch version wins)
			if (intentsBySlug.has(intent.slug)) continue
			intentsBySlug.set(intent.slug, intent)
			onProgress?.(intent)
		}

		return Array.from(intentsBySlug.values())
	}

	/** Single-branch mode: read .haiku/intents/ from one specific branch. */
	private async listIntentsSingleBranch(
		onProgress?: (intent: HaikuIntent) => void,
	): Promise<HaikuIntent[]> {
		const intents = await this.listIntentsFromRef(this.ref)
		for (const intent of intents) {
			intent.branch = this.branch
			onProgress?.(intent)
		}
		return intents
	}

	/** Read intents from a specific ref (or default branch if null). */
	private async listIntentsFromRef(ref: string | null): Promise<HaikuIntent[]> {
		const treeCacheKey = `gl:${this.host}:${this.projectPath}:listIntentsTree:${ref || "HEAD"}`
		const treeData =
			await this.cachedQuery<operationsListIntentsTreeQuery$data>(
				ListIntentsTreeQuery,
				{ fullPath: this.projectPath, path: ".haiku/intents", ref },
				treeCacheKey,
			)

		const intentDirs = treeData?.project?.repository?.tree?.trees?.nodes
		if (!intentDirs || intentDirs.length === 0) return []

		const allPaths = intentDirs
			.filter((n): n is { name: string; path: string } => n != null)
			.map((n) => `${n.path}/intent.md`)

		const blobByPath = new Map<string, string>()

		for (let i = 0; i < allPaths.length; i += CHUNK_SIZE) {
			const chunk = allPaths.slice(i, i + CHUNK_SIZE)
			const blobsCacheKey = `gl:${this.host}:${this.projectPath}:listIntentsBlobs:${ref || "HEAD"}:${i}`
			try {
				const blobsData = await this.cachedQuery<operationsBatchBlobsQuery$data>(
					BatchBlobsQuery,
					{ fullPath: this.projectPath, paths: chunk, ref },
					blobsCacheKey,
				)
				const blobs = blobsData?.project?.repository?.blobs?.nodes ?? []
				for (const blob of blobs) {
					if (blob?.rawTextBlob && blob.path) {
						blobByPath.set(blob.path, blob.rawTextBlob)
					}
				}
			} catch {
				for (const path of chunk) {
					const raw = ref ? await this.readFileFromRef(ref, path) : await this.readFile(path)
					if (raw) blobByPath.set(path, raw)
				}
			}
		}

		const intents: HaikuIntent[] = []

		for (const dir of intentDirs) {
			if (!dir) continue
			const slug = dir.name
			const rawText = blobByPath.get(`${dir.path}/intent.md`)
			if (!rawText) continue

			const intent = this.parseIntentFromRaw(slug, rawText)
			intents.push(intent)
		}

		return intents
	}

	/**
	 * Get full intent detail using 3 GraphQL queries:
	 * 1. Recursive tree of the intent's stages directory
	 * 2. Batch-fetch all file contents (intent.md, state.json, units, etc.)
	 * 3. Tree listing for knowledge/operations directories
	 *
	 * This replaces ~20+ REST calls with 3 GraphQL queries.
	 *
	 * In scan mode, uses the intentBranchMap to resolve which branch holds this intent.
	 */
	async getIntent(slug: string): Promise<HaikuIntentDetail | null> {
		let intentBranch = this.intentBranchMap.get(slug)

		// If branch map isn't populated yet (deeplink before listIntents), try to resolve the branch
		if (!intentBranch && !this.branch) {
			const branchName = `haiku/${slug}/main`
			const testRead = await this.readFileFromRef(branchName, `.haiku/intents/${slug}/intent.md`)
			if (testRead) {
				intentBranch = branchName
				this.intentBranchMap.set(slug, branchName)
			}
		}

		const effectiveRef = intentBranch || this.ref
		const basePath = `.haiku/intents/${slug}`

		// Step 1: Get the recursive tree for the intent directory
		const treeCacheKey = `gl:${this.host}:${this.projectPath}:intentTree:${slug}:${effectiveRef || "HEAD"}`
		const treeData = await this.cachedQuery<operationsIntentTreeQuery$data>(
			IntentTreeQuery,
			{ fullPath: this.projectPath, path: basePath, ref: effectiveRef },
			treeCacheKey,
		)

		const allBlobs = treeData?.project?.repository?.tree?.blobs?.nodes ?? []
		const allTrees = treeData?.project?.repository?.tree?.trees?.nodes ?? []

		// Collect all file paths from tree, then batch-fetch via rawTextBlob
		// rawTextBlob returns null for binary files — safe to request everything
		const filePaths = allBlobs
			.filter((b): b is { name: string; path: string } => b?.path != null)
			.map((b) => b.path)

		const blobByPath = new Map<string, string>()
		const assets: Array<{ path: string; name: string; rawUrl: string }> = []

		for (let i = 0; i < filePaths.length; i += CHUNK_SIZE) {
			const chunk = filePaths.slice(i, i + CHUNK_SIZE)
			const blobsCacheKey = `gl:${this.host}:${this.projectPath}:intentBlobs:${slug}:${effectiveRef || "HEAD"}:${i}`
			try {
				const blobsData = await this.cachedQuery<operationsBatchBlobsQuery$data>(
					BatchBlobsQuery,
					{ fullPath: this.projectPath, paths: chunk, ref: effectiveRef },
					blobsCacheKey,
				)
				for (const blob of blobsData?.project?.repository?.blobs?.nodes ?? []) {
					if (!blob?.path) continue
					if (blob.rawTextBlob != null) {
						blobByPath.set(blob.path, blob.rawTextBlob)
					} else {
						// Binary file — use REST API for CORS-compatible authenticated download
						const ref = intentBranch || this.branch || "HEAD"
						const encodedFilePath = encodeURIComponent(blob.path)
						const rawUrl = `https://${this.host}/api/v4/projects/${this.encodedProject}/repository/files/${encodedFilePath}/raw?ref=${encodeURIComponent(ref)}`
						assets.push({ path: blob.path, name: blob.name || blob.path.split("/").pop() || "", rawUrl })
					}
				}
			} catch {
				for (const path of chunk) {
					const raw = await this.readFile(path)
					if (raw) blobByPath.set(path, raw)
				}
			}
		}

		// Parse intent.md
		const rawText = blobByPath.get(`${basePath}/intent.md`)
		if (!rawText) return null

		const { data: frontmatter, content } = parseFrontmatter(rawText)
		const studio = (frontmatter.studio as string) || "ideation"
		const stageNames = (frontmatter.stages as string[]) || []
		const activeStage = (frontmatter.active_stage as string) || ""

		// Derive stage directories from the tree
		const stagesPrefix = `${basePath}/stages/`
		const stageDirNames = allTrees
			.filter(
				(t): t is { name: string; path: string } =>
					!!t?.path.startsWith(stagesPrefix) &&
					!t.path.slice(stagesPrefix.length).includes("/"),
			)
			.map((t) => t.name)
			.sort()

		const stages: HaikuStageState[] = []

		for (const stageName of stageNames.length > 0
			? stageNames
			: stageDirNames) {
			const stagePath = `${basePath}/stages/${stageName}`

			// Parse units
			const units: HaikuUnit[] = []
			const unitPrefix = `${stagePath}/units/`

			for (const blob of allBlobs) {
				if (!blob?.path || !blob.path.startsWith(unitPrefix)) continue
				const fileName = blob.path.slice(unitPrefix.length)
				// Only direct children (no sub-paths), must be .md
				if (fileName.includes("/") || !fileName.endsWith(".md")) continue

				const unitRaw = blobByPath.get(blob.path)
				if (!unitRaw) continue

				units.push(parseUnit(fileName, stageName, unitRaw))
			}

			// Parse stage artifacts
			const stageArtifacts: HaikuArtifact[] = []
			const artifactsPrefix = `${stagePath}/artifacts/`
			for (const blob of allBlobs) {
				if (!blob?.path || !blob.path.startsWith(artifactsPrefix)) continue
				const fileName = blob.path.slice(artifactsPrefix.length)
				if (fileName.includes("/")) continue // direct children only

				const artType = classifyArtifact(fileName)
				const textContent = blobByPath.get(blob.path)
				if (textContent != null) {
					stageArtifacts.push({ name: fileName, content: textContent, type: artType })
				} else {
					// Binary — build rawUrl
					const ref = intentBranch || this.branch || "HEAD"
					const encodedFilePath = encodeURIComponent(blob.path)
					const rawUrl = `https://${this.host}/api/v4/projects/${this.encodedProject}/repository/files/${encodedFilePath}/raw?ref=${encodeURIComponent(ref)}`
					stageArtifacts.push({ name: fileName, rawUrl, type: artType })
				}
			}

			// Parse state.json
			const stateRaw = blobByPath.get(`${stagePath}/state.json`)
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
				} catch {
					/* ignore */
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

		// Knowledge files (from the tree listing — include content from blobByPath)
		const knowledgePrefix = `${basePath}/knowledge/`
		const knowledgeFiles: HaikuKnowledgeFile[] = allBlobs
			.filter(
				(b): b is { name: string; path: string } =>
					!!b?.path.startsWith(knowledgePrefix) &&
					!b.path.slice(knowledgePrefix.length).includes("/") &&
					b.name.endsWith(".md"),
			)
			.map((b) => ({
				name: b.name,
				content: blobByPath.get(b.path) || "",
			}))

		// Operations files (include content)
		const operationsPrefix = `${basePath}/operations/`
		const operationsFiles: HaikuKnowledgeFile[] = allBlobs
			.filter(
				(b): b is { name: string; path: string } =>
					!!b?.path.startsWith(operationsPrefix) &&
					!b.path.slice(operationsPrefix.length).includes("/") &&
					b.name.endsWith(".md"),
			)
			.map((b) => ({
				name: b.name,
				content: blobByPath.get(b.path) || "",
			}))

		// Reflection
		const reflection = blobByPath.get(`${basePath}/reflection.md`) ?? null

		// Carry forward branch/MR metadata from the listing scan, or fetch if missing
		// (happens on deeplinks where listIntents hasn't run yet)
		const meta = await this.getOrFetchMeta(slug, intentBranch)

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
			assets,
			...meta,
		}
	}

	async getSettings(): Promise<Record<string, unknown> | null> {
		const raw = await this.readFile(".haiku/settings.yml")
		if (!raw) return null
		return parseSettingsYaml(raw)
	}

	/** Write a file via REST API (mutations stay REST -- they're rare). */
	async writeFile(
		path: string,
		content: string,
		message: string,
	): Promise<boolean> {
		const encodedPath = encodeURIComponent(path)
		const branch = this.branch || "main"

		// Base64 encode content (handle Unicode correctly)
		const encoded = btoa(
			Array.from(new TextEncoder().encode(content))
				.map((b) => String.fromCharCode(b))
				.join(""),
		)

		// Try update first (PUT), fall back to create (POST) if file doesn't exist
		const res = await this.restApi(`/repository/files/${encodedPath}`, {
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
			const createRes = await this.restApi(`/repository/files/${encodedPath}`, {
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

	/** Check if haiku branches have changed since last poll using ETags. Returns true if changed. */
	async checkForBranchChanges(): Promise<boolean> {
		// Only useful in scan mode (no explicit branch)
		if (this.branch) return false

		const headers = new Headers(this.restHeaders())
		if (this.lastBranchesEtag) {
			headers.set("If-None-Match", this.lastBranchesEtag)
		}

		const res = await fetch(
			`https://${this.host}/api/v4/projects/${this.encodedProject}/repository/branches?search=haiku/`,
			{ headers },
		)

		if (res.status === 304) return false // Not modified

		const etag = res.headers.get("etag")
		if (etag) this.lastBranchesEtag = etag

		return res.ok // true = changed, re-fetch needed
	}

	/** Clear cached branch and intent data so the next fetch gets fresh results. */
	clearBranchCache(): void {
		for (const key of glCache.keys()) {
			if (
				key.includes("listHaikuBranches") ||
				key.includes("listIntents") ||
				key.includes("getIntent") ||
				key.includes("intentTree") ||
				key.includes("intentBlobs")
			) {
				glCache.delete(key)
			}
		}
		this.intentBranchMap.clear()
		this.intentMetaMap.clear()
	}

	async isAccessible(): Promise<boolean> {
		const res = await this.restApi("")
		return res.ok
	}

	static getOAuthUrl(
		host: string,
		clientId: string,
		redirectUri: string,
	): string {
		// Scope: `api` — full read/write access to the GitLab API.
		// Required because the browse UI:
		//   - Reads `.haiku/intents/` contents
		//   - Reads branches and merge requests (including closed/merged)
		//   - Writes stage gate approvals via `writeFile` (external review buttons)
		// `read_api` alone is insufficient because it does not grant write access
		// needed for the gate-approval and commit mutations the UI performs.
		return `https://${host}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=api`
	}
}
