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
import { normalizeIntentStatus, parseFrontmatter, parseUnit, safeParseFrontmatter } from "./types"
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

/** Resolved intent tree data from a single ref — used for three-level merge. */
interface GitLabIntentRefData {
	blobByPath: Map<string, string>
	allBlobs: Array<{ name: string; path: string }>
	allTrees: Array<{ name: string; path: string }>
	assets: Array<{ path: string; name: string; rawUrl: string }>
}

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
	/** Maps "slug/stageName" → branch/MR metadata for stage-level branches */
	private stageBranchMap = new Map<string, { branch: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null }>()
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

	/** Parse raw intent.md text into a HaikuIntent with optional branch/MR metadata.
	 *  Returns null if the frontmatter is malformed — the parse error is reported to Sentry
	 *  so broken intent files surface in monitoring without breaking the whole portfolio view. */
	private parseIntentFromRaw(
		slug: string,
		rawText: string,
		meta?: { branch?: string; prUrl?: string | null; prStatus?: string | null; prNumber?: number | null },
	): HaikuIntent | null {
		const parsed = safeParseFrontmatter(rawText, {
			provider: "gitlab",
			path: `.haiku/intents/${slug}/intent.md`,
			slug,
			branch: meta?.branch,
		})
		if (!parsed) return null
		const { data, content } = parsed
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
			archived: data.archived === true,
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

		// Capture stage-level branches (haiku/{slug}/{stageName}, where stageName != "main")
		const stageBranchNames = branchNames.filter((name: string) => {
			const parts = name.split("/")
			return parts.length >= 3 && parts[0] === "haiku" && parts[parts.length - 1] !== "main"
		})

		// Fetch MR data for stage branches in parallel
		const stageBranchPromises = stageBranchNames.map(async (branchName: string) => {
			const parts = branchName.split("/")
			const slug = parts.slice(1, -1).join("/")
			const stageName = parts[parts.length - 1]
			if (!slug || !stageName) return

			const { prUrl, prStatus, prNumber } = await this.fetchMrForBranch(branchName)

			this.stageBranchMap.set(`${slug}/${stageName}`, {
				branch: branchName,
				prUrl,
				prStatus,
				prNumber,
			})
		})

		// Filter to haiku/*/main branches and extract slugs
		const mainBranches = branchNames.filter((name: string) => {
			const parts = name.split("/")
			return parts.length >= 2 && parts[parts.length - 1] === "main"
		})

		// Step 2: Load ALL intents from default branch — the canonical catalog
		const defaultIntents = await this.listIntentsFromRef(null)
		for (const intent of defaultIntents) {
			intentsBySlug.set(intent.slug, intent)
		}

		// Step 3: For each haiku/{slug}/main branch, read ONLY the matching intent
		// and merge it over the default branch baseline. Branch version is more
		// current for active work and carries branch/MR metadata.
		const branchReadPromises = mainBranches.map(async (branchName) => {
			const parts = branchName.split("/")
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
			if (!intent) return
			intentsBySlug.set(slug, intent)
			this.intentBranchMap.set(slug, branchName)
			this.intentMetaMap.set(slug, { branch: branchName, prUrl, prStatus, prNumber })
		})

		// Stream default-branch intents immediately so the UI renders progressively
		for (const [, intent] of intentsBySlug) {
			onProgress?.(intent)
		}

		// Branch reads may update existing entries — re-emit after they resolve
		await Promise.all([...branchReadPromises, ...stageBranchPromises])

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
			if (!intent) continue
			intents.push(intent)
		}

		return intents
	}

	// ── Three-level merge helpers ────────────────────────────────────────

	/** Data returned by fetchIntentTreeFromRef — all blobs, trees, and resolved assets for one ref. */
	private static readonly EMPTY_REF_DATA: GitLabIntentRefData = {
		blobByPath: new Map(),
		allBlobs: [],
		allTrees: [],
		assets: [],
	}

	/** Fetch the full intent tree + blob contents from a specific ref. Pass null for default branch. */
	private async fetchIntentTreeFromRef(
		slug: string,
		ref: string | null,
	): Promise<GitLabIntentRefData | null> {
		const basePath = `.haiku/intents/${slug}`
		const refLabel = ref || "HEAD"

		// Step 1: Recursive tree listing
		const treeCacheKey = `gl:${this.host}:${this.projectPath}:intentTree:${slug}:${refLabel}`
		const treeData = await this.cachedQuery<operationsIntentTreeQuery$data>(
			IntentTreeQuery,
			{ fullPath: this.projectPath, path: basePath, ref },
			treeCacheKey,
		)

		const allBlobs = (treeData?.project?.repository?.tree?.blobs?.nodes ?? [])
			.filter((b): b is { name: string; path: string } => b?.path != null)
		const allTrees = (treeData?.project?.repository?.tree?.trees?.nodes ?? [])
			.filter((t): t is { name: string; path: string } => t?.path != null)

		if (allBlobs.length === 0 && allTrees.length === 0) return null

		// Step 2: Batch-fetch blob contents
		const filePaths = allBlobs.map((b) => b.path)
		const blobByPath = new Map<string, string>()
		const assets: Array<{ path: string; name: string; rawUrl: string }> = []

		for (let i = 0; i < filePaths.length; i += CHUNK_SIZE) {
			const chunk = filePaths.slice(i, i + CHUNK_SIZE)
			const blobsCacheKey = `gl:${this.host}:${this.projectPath}:intentBlobs:${slug}:${refLabel}:${i}`
			try {
				const blobsData = await this.cachedQuery<operationsBatchBlobsQuery$data>(
					BatchBlobsQuery,
					{ fullPath: this.projectPath, paths: chunk, ref },
					blobsCacheKey,
				)
				for (const blob of blobsData?.project?.repository?.blobs?.nodes ?? []) {
					if (!blob?.path) continue
					if (blob.rawTextBlob != null) {
						blobByPath.set(blob.path, blob.rawTextBlob)
					} else {
						// Binary file — REST API for CORS-compatible authenticated download
						const encodedFilePath = encodeURIComponent(blob.path)
						const rawUrl = `https://${this.host}/api/v4/projects/${this.encodedProject}/repository/files/${encodedFilePath}/raw?ref=${encodeURIComponent(ref || "HEAD")}`
						assets.push({ path: blob.path, name: blob.name || blob.path.split("/").pop() || "", rawUrl })
					}
				}
			} catch {
				for (const path of chunk) {
					const raw = ref ? await this.readFileFromRef(ref, path) : await this.readFile(path)
					if (raw) blobByPath.set(path, raw)
				}
			}
		}

		return { blobByPath, allBlobs, allTrees, assets }
	}

	/** Parse a single stage from fetched blob data. Returns null if the stage has no content. */
	private parseStageFromBlobs(
		slug: string,
		stageName: string,
		data: GitLabIntentRefData,
		activeStage: string,
		stageNames: string[],
		ref: string,
	): HaikuStageState | null {
		const basePath = `.haiku/intents/${slug}`
		const stagePath = `${basePath}/stages/${stageName}`

		// Check if this stage has any blobs at all
		const hasStageContent = data.allBlobs.some((b) => b.path.startsWith(`${stagePath}/`))
		if (!hasStageContent) return null

		// Parse units
		const units: HaikuUnit[] = []
		const unitPrefix = `${stagePath}/units/`
		for (const blob of data.allBlobs) {
			if (!blob.path.startsWith(unitPrefix)) continue
			const fileName = blob.path.slice(unitPrefix.length)
			if (fileName.includes("/") || !fileName.endsWith(".md")) continue
			const unitRaw = data.blobByPath.get(blob.path)
			if (!unitRaw) continue
			units.push(parseUnit(fileName, stageName, unitRaw))
		}

		// Parse artifacts
		const artifacts: HaikuArtifact[] = []
		const artifactsPrefix = `${stagePath}/artifacts/`
		for (const blob of data.allBlobs) {
			if (!blob.path.startsWith(artifactsPrefix)) continue
			const fileName = blob.path.slice(artifactsPrefix.length)
			if (fileName.includes("/")) continue
			const artType = classifyArtifact(fileName)
			const textContent = data.blobByPath.get(blob.path)
			if (textContent != null) {
				artifacts.push({ name: fileName, content: textContent, type: artType })
			} else {
				const encodedFilePath = encodeURIComponent(blob.path)
				const rawUrl = `https://${this.host}/api/v4/projects/${this.encodedProject}/repository/files/${encodedFilePath}/raw?ref=${encodeURIComponent(ref)}`
				artifacts.push({ name: fileName, rawUrl, type: artType })
			}
		}

		// state.json
		const stateRaw = data.blobByPath.get(`${stagePath}/state.json`)
		let phase = ""
		let startedAt: string | null = null
		let completedAt: string | null = null
		let gateOutcome: string | null = null
		if (stateRaw) {
			try {
				const s = JSON.parse(stateRaw)
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

	/** Extract knowledge files from fetched blob data. */
	private parseKnowledgeFromBlobs(
		slug: string,
		data: GitLabIntentRefData,
	): HaikuKnowledgeFile[] {
		const knowledgePrefix = `.haiku/intents/${slug}/knowledge/`
		return data.allBlobs
			.filter(
				(b) =>
					b.path.startsWith(knowledgePrefix) &&
					!b.path.slice(knowledgePrefix.length).includes("/") &&
					b.name.endsWith(".md"),
			)
			.map((b) => ({
				name: b.name,
				content: data.blobByPath.get(b.path) || "",
			}))
	}

	/** Extract operations files from fetched blob data. */
	private parseOperationsFromBlobs(
		slug: string,
		data: GitLabIntentRefData,
	): HaikuKnowledgeFile[] {
		const operationsPrefix = `.haiku/intents/${slug}/operations/`
		return data.allBlobs
			.filter(
				(b) =>
					b.path.startsWith(operationsPrefix) &&
					!b.path.slice(operationsPrefix.length).includes("/") &&
					b.name.endsWith(".md"),
			)
			.map((b) => ({
				name: b.name,
				content: data.blobByPath.get(b.path) || "",
			}))
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

	/** Derive ordered stage dir names from tree listing. */
	private deriveStageDirNames(
		slug: string,
		data: GitLabIntentRefData,
	): string[] {
		const stagesPrefix = `.haiku/intents/${slug}/stages/`
		return data.allTrees
			.filter(
				(t) =>
					t.path.startsWith(stagesPrefix) &&
					!t.path.slice(stagesPrefix.length).includes("/"),
			)
			.map((t) => t.name)
			.sort()
	}

	/** Deep-link probe: discover intent branch + stage branches when maps aren't populated. */
	private async probeIntentBranch(slug: string): Promise<string | undefined> {
		const branchName = `haiku/${slug}/main`
		const testRead = await this.readFileFromRef(branchName, `.haiku/intents/${slug}/intent.md`)
		if (!testRead) return undefined

		this.intentBranchMap.set(slug, branchName)

		// Discover stage branches and MR metadata
		try {
			const branchesCacheKey = `gl:${this.host}:${this.projectPath}:listHaikuBranches:${slug}`
			const branchesData = await this.cachedQuery<operationsListBranchNamesQuery$data>(
				ListBranchNamesQuery,
				{ fullPath: this.projectPath, searchPattern: `haiku/${slug}/*`, offset: 0, limit: 100 },
				branchesCacheKey,
			)

			const branchNames = branchesData?.project?.repository?.branchNames ?? []

			// Fetch MR data for intent branch
			const intentMr = await this.fetchMrForBranch(branchName)
			this.intentMetaMap.set(slug, { branch: branchName, ...intentMr })

			// Discover stage branches (non-main) — fetch MR data in parallel
			const stageBranchEntries = branchNames
				.map((name: string) => {
					const parts = name.split("/")
					if (parts.length < 3 || parts[0] !== "haiku" || parts[parts.length - 1] === "main") return null
					const stageSlug = parts.slice(1, -1).join("/")
					if (stageSlug !== slug) return null
					return { name, stageName: parts[parts.length - 1] }
				})
				.filter(Boolean) as Array<{ name: string; stageName: string }>

			await Promise.all(stageBranchEntries.map(async ({ name, stageName }) => {
				const stageMr = await this.fetchMrForBranch(name)
				this.stageBranchMap.set(`${slug}/${stageName}`, {
					branch: name,
					...stageMr,
				})
			}))
		} catch {
			this.intentMetaMap.set(slug, { branch: branchName, prUrl: null, prStatus: null, prNumber: null })
		}

		return branchName
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

		// Deep-link resolution: probe for branch + MR data if maps aren't populated yet
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
		const stageBranchPromises = new Map<string, Promise<GitLabIntentRefData | null>>()
		for (const [stageName, meta] of stageBranches) {
			stageBranchPromises.set(stageName, this.fetchIntentTreeFromRef(slug, meta.branch))
		}

		const [defaultData, intentData] = await Promise.all([
			this.fetchIntentTreeFromRef(slug, null),
			intentBranch ? this.fetchIntentTreeFromRef(slug, intentBranch) : null,
		])

		// Resolve stage branch fetches (they ran in parallel with the above)
		const stageBranchData = new Map<string, GitLabIntentRefData | null>()
		for (const [stageName, promise] of stageBranchPromises) {
			stageBranchData.set(stageName, await promise)
		}

		// intent.md: intent branch wins, fallback to default
		const basePath = `.haiku/intents/${slug}`
		const intentRaw = intentData?.blobByPath.get(`${basePath}/intent.md`)
			?? defaultData?.blobByPath.get(`${basePath}/intent.md`)
		if (!intentRaw) return null

		const { data: frontmatter, content } = parseFrontmatter(intentRaw)
		const studio = (frontmatter.studio as string) || "ideation"
		const stageNames = (frontmatter.stages as string[]) || []
		const activeStage = (frontmatter.active_stage as string) || ""

		// Determine ordered stage list from frontmatter or directory listing
		const fallbackDirNames = this.deriveStageDirNames(
			slug,
			intentData ?? defaultData ?? GitLabProvider.EMPTY_REF_DATA,
		)
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
			if (stageBranchResult) {
				parsed = this.parseStageFromBlobs(
					slug, stageName,
					stageBranchResult,
					activeStage, stageNames,
					stageBranchRef!.branch,
				)
			}

			// Level 2: Intent branch
			if (!parsed && intentData) {
				parsed = this.parseStageFromBlobs(
					slug, stageName,
					intentData,
					activeStage, stageNames,
					intentBranch!,
				)
			}

			// Level 1: Default branch (baseline)
			if (!parsed && defaultData) {
				parsed = this.parseStageFromBlobs(
					slug, stageName,
					defaultData,
					activeStage, stageNames,
					"HEAD",
				)
			}

			if (!parsed) {
				// Stage declared in frontmatter but not found on any branch
				parsed = { name: stageName, status: "pending", phase: "", startedAt: null, completedAt: null, gateOutcome: null, units: [] }
			}

			// Attach stage branch/MR metadata
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
		let knowledge = defaultData ? this.parseKnowledgeFromBlobs(slug, defaultData) : []
		if (intentData) {
			knowledge = this.mergeKnowledge(knowledge, this.parseKnowledgeFromBlobs(slug, intentData))
		}
		for (const [, data] of stageBranchData) {
			if (data) knowledge = this.mergeKnowledge(knowledge, this.parseKnowledgeFromBlobs(slug, data))
		}

		// Operations: intent branch wins, fallback to default (stage branches cannot touch)
		const opsSource = intentData ?? defaultData
		const operations = opsSource ? this.parseOperationsFromBlobs(slug, opsSource) : []

		// Reflection: intent branch wins (stage branches cannot touch)
		const reflection = intentData?.blobByPath.get(`${basePath}/reflection.md`)
			?? defaultData?.blobByPath.get(`${basePath}/reflection.md`)
			?? null

		// Assets: merge from all levels, de-duplicating by path (higher trust wins)
		const assetsByPath = new Map<string, { path: string; name: string; rawUrl: string }>()
		for (const a of defaultData?.assets ?? []) assetsByPath.set(a.path, a)
		for (const a of intentData?.assets ?? []) assetsByPath.set(a.path, a)
		for (const d of stageBranchData.values()) {
			for (const a of d?.assets ?? []) assetsByPath.set(a.path, a)
		}
		const assets = Array.from(assetsByPath.values())

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
			archived: frontmatter.archived === true,
			follows: (frontmatter.follows as string) || null,
			raw: frontmatter,
			stages,
			knowledge,
			operations,
			reflection,
			content,
			assets,
			...(this.intentMetaMap.get(slug) || {}),
		}
	}

	/** Single-ref fallback for explicit branch mode (no three-level merge). */
	private async getIntentSingleRef(slug: string): Promise<HaikuIntentDetail | null> {
		const data = await this.fetchIntentTreeFromRef(slug, this.ref)
		if (!data) return null

		const basePath = `.haiku/intents/${slug}`
		const rawText = data.blobByPath.get(`${basePath}/intent.md`)
		if (!rawText) return null

		const { data: frontmatter, content } = parseFrontmatter(rawText)
		const studio = (frontmatter.studio as string) || "ideation"
		const stageNames = (frontmatter.stages as string[]) || []
		const activeStage = (frontmatter.active_stage as string) || ""
		const ref = this.branch || "HEAD"

		const fallbackDirNames = this.deriveStageDirNames(slug, data)

		const stages: HaikuStageState[] = []
		for (const stageName of stageNames.length > 0 ? stageNames : fallbackDirNames) {
			const parsed = this.parseStageFromBlobs(
				slug, stageName, data,
				activeStage, stageNames, ref,
			)
			if (parsed) stages.push(parsed)
		}

		const knowledge = this.parseKnowledgeFromBlobs(slug, data)
		const operations = this.parseOperationsFromBlobs(slug, data)
		const reflection = data.blobByPath.get(`${basePath}/reflection.md`) ?? null

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
			archived: frontmatter.archived === true,
			follows: (frontmatter.follows as string) || null,
			raw: frontmatter,
			stages,
			knowledge,
			operations,
			reflection,
			content,
			assets: data.assets,
			branch: this.branch,
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
		this.stageBranchMap.clear()
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
		// Scope: `api` — full access to the GitLab API.
		// Required because the browse UI:
		//   - Reads `.haiku/intents/` contents
		//   - Reads branches and merge requests (including closed/merged)
		return `https://${host}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=api`
	}
}
