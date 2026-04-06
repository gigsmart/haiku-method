import { fetchQuery } from "relay-runtime"
import { createRelayEnvironment } from "./graphql/environment"
import type {
	BrowseProvider,
	HaikuIntent,
	HaikuIntentDetail,
	HaikuStageState,
	HaikuUnit,
} from "./types"
import { parseCriteria, parseFrontmatter } from "./types"
import { parseSettingsYaml } from "./resolve-links"

import type { operationsBatchBlobsQuery$data } from "./graphql/gitlab/__generated__/operationsBatchBlobsQuery.graphql"
import BatchBlobsQuery from "./graphql/gitlab/__generated__/operationsBatchBlobsQuery.graphql"
import type { operationsIntentTreeQuery$data } from "./graphql/gitlab/__generated__/operationsIntentTreeQuery.graphql"
import IntentTreeQuery from "./graphql/gitlab/__generated__/operationsIntentTreeQuery.graphql"
import ListFilesQueryArtifact from "./graphql/gitlab/__generated__/operationsListFilesQuery.graphql"
// Relay-compiled query artifacts (schema-validated, fully typed)
import type { operationsListIntentsTreeQuery$data } from "./graphql/gitlab/__generated__/operationsListIntentsTreeQuery.graphql"
import ListIntentsTreeQuery from "./graphql/gitlab/__generated__/operationsListIntentsTreeQuery.graphql"
import ReadFileQuery from "./graphql/gitlab/__generated__/operationsReadFileQuery.graphql"

const glCache = new Map<string, { data: unknown; ts: number }>()
const GL_CACHE_TTL = 5 * 60 * 1000

export class GitLabProvider implements BrowseProvider {
	readonly name = "GitLab"
	private host: string
	private projectPath: string
	private branch: string
	private token: string | null
	private env: ReturnType<typeof createRelayEnvironment>

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
						nodes: Array<{ path: string; rawBlob: string | null } | null> | null
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
		return nodes[0]?.rawBlob ?? null
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

	/**
	 * List all intents using two GraphQL queries:
	 * 1. List intent directories from .haiku/intents/
	 * 2. Batch-fetch all intent.md files in one request
	 *
	 * This replaces N+1 REST calls with exactly 2 GraphQL queries.
	 */
	async listIntents(
		onProgress?: (intent: HaikuIntent) => void,
	): Promise<HaikuIntent[]> {
		// Step 1: Get intent directory listing
		const treeCacheKey = `gl:${this.host}:${this.projectPath}:listIntentsTree`
		const treeData =
			await this.cachedQuery<operationsListIntentsTreeQuery$data>(
				ListIntentsTreeQuery,
				{ fullPath: this.projectPath, path: ".haiku/intents", ref: this.ref },
				treeCacheKey,
			)

		const intentDirs = treeData?.project?.repository?.tree?.trees?.nodes
		if (!intentDirs || intentDirs.length === 0) return []

		// Step 2: Batch-fetch all intent.md files
		const paths = intentDirs
			.filter((n): n is { name: string; path: string } => n != null)
			.map((n) => `${n.path}/intent.md`)

		const blobsCacheKey = `gl:${this.host}:${this.projectPath}:listIntentsBlobs`
		const blobsData = await this.cachedQuery<operationsBatchBlobsQuery$data>(
			BatchBlobsQuery,
			{ fullPath: this.projectPath, paths, ref: this.ref },
			blobsCacheKey,
		)

		const blobs = blobsData?.project?.repository?.blobs?.nodes ?? []
		const intents: HaikuIntent[] = []

		// Map blobs by path for O(1) lookup
		const blobByPath = new Map<string, string>()
		for (const blob of blobs) {
			if (blob?.rawBlob && blob.path) {
				blobByPath.set(blob.path, blob.rawBlob)
			}
		}

		for (const dir of intentDirs) {
			if (!dir) continue
			const slug = dir.name
			const rawText = blobByPath.get(`${dir.path}/intent.md`)
			if (!rawText) continue

			const { data } = parseFrontmatter(rawText)
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
				composite:
					(data.composite as Array<{ studio: string; stages: string[] }>) ||
					null,
				stagesComplete:
					stages.length > 0 ? stages.indexOf(data.active_stage as string) : 0,
				stagesTotal: stages.length,
				status: (data.status as string) || "active",
				follows: (data.follows as string) || null,
				raw: data,
			}
			intents.push(intent)
			onProgress?.(intent)
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
	 */
	async getIntent(slug: string): Promise<HaikuIntentDetail | null> {
		const basePath = `.haiku/intents/${slug}`

		// Step 1: Get the recursive tree for the intent directory
		const treeCacheKey = `gl:${this.host}:${this.projectPath}:intentTree:${slug}`
		const treeData = await this.cachedQuery<operationsIntentTreeQuery$data>(
			IntentTreeQuery,
			{ fullPath: this.projectPath, path: basePath, ref: this.ref },
			treeCacheKey,
		)

		const allBlobs = treeData?.project?.repository?.tree?.blobs?.nodes ?? []
		const allTrees = treeData?.project?.repository?.tree?.trees?.nodes ?? []

		// Collect all file paths we need to read
		const filePaths: string[] = []

		// Always need intent.md
		filePaths.push(`${basePath}/intent.md`)

		// Add reflection.md
		filePaths.push(`${basePath}/reflection.md`)

		// Add all blob paths from the recursive tree
		for (const blob of allBlobs) {
			if (blob?.path && !filePaths.includes(blob.path)) {
				filePaths.push(blob.path)
			}
		}

		// Step 2: Batch-fetch all file contents
		const blobsCacheKey = `gl:${this.host}:${this.projectPath}:intentBlobs:${slug}`
		const blobsData = await this.cachedQuery<operationsBatchBlobsQuery$data>(
			BatchBlobsQuery,
			{ fullPath: this.projectPath, paths: filePaths, ref: this.ref },
			blobsCacheKey,
		)

		const blobs = blobsData?.project?.repository?.blobs?.nodes ?? []
		const blobByPath = new Map<string, string>()
		for (const blob of blobs) {
			if (blob?.rawBlob != null && blob.path) {
				blobByPath.set(blob.path, blob.rawBlob)
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

				const { data: unitData, content: unitContent } =
					parseFrontmatter(unitRaw)
				units.push({
					name: fileName.replace(".md", ""),
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
			})
		}

		// Knowledge files (from the tree listing)
		const knowledgePrefix = `${basePath}/knowledge/`
		const knowledgeFiles = allBlobs
			.filter(
				(b): b is { name: string; path: string } =>
					!!b?.path.startsWith(knowledgePrefix) &&
					!b.path.slice(knowledgePrefix.length).includes("/") &&
					b.name.endsWith(".md"),
			)
			.map((b) => b.name)

		// Operations files
		const operationsPrefix = `${basePath}/operations/`
		const operationsFiles = allBlobs
			.filter(
				(b): b is { name: string; path: string } =>
					!!b?.path.startsWith(operationsPrefix) &&
					!b.path.slice(operationsPrefix.length).includes("/") &&
					b.name.endsWith(".md"),
			)
			.map((b) => b.name)

		// Reflection
		const reflection = blobByPath.get(`${basePath}/reflection.md`) ?? null

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
			stagesComplete: stageNames.indexOf(activeStage),
			stagesTotal: stageNames.length,
			status: (frontmatter.status as string) || "active",
			follows: (frontmatter.follows as string) || null,
			raw: frontmatter,
			stages,
			knowledge: knowledgeFiles,
			operations: operationsFiles,
			reflection,
			content,
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

	async isAccessible(): Promise<boolean> {
		const res = await this.restApi("")
		return res.ok
	}

	static getOAuthUrl(
		host: string,
		clientId: string,
		redirectUri: string,
	): string {
		return `https://${host}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read_api`
	}
}
