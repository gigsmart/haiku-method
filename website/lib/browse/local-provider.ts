import {
	deriveStageStatusFromUnits,
	deriveV4ActiveStage,
	parseIntentFromRaw,
	parseStageStateJson,
} from "./intent-parsing"
import { parseSettingsYaml } from "./resolve-links"
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

// File System Access API types (not in all TS DOM libs)
interface FSDirectoryHandle {
	getDirectoryHandle(name: string): Promise<FSDirectoryHandle>
	getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>
	entries(): AsyncIterable<[string, { kind: "file" | "directory" }]>
}

export class LocalProvider implements BrowseProvider {
	readonly name = "Local Directory"
	private root: FSDirectoryHandle

	constructor(root: FileSystemDirectoryHandle) {
		this.root = root as unknown as FSDirectoryHandle
	}

	async init(): Promise<boolean> {
		try {
			await this.root.getDirectoryHandle(".haiku")
			return true
		} catch {
			return false
		}
	}

	async readFile(path: string): Promise<string | null> {
		try {
			const parts = path.split("/").filter(Boolean)
			let dir: FSDirectoryHandle = this.root
			for (const part of parts.slice(0, -1)) {
				dir = await dir.getDirectoryHandle(part)
			}
			const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
			const file = await fileHandle.getFile()
			return await file.text()
		} catch {
			return null
		}
	}

	async listFiles(dir: string): Promise<string[]> {
		try {
			const parts = dir.split("/").filter(Boolean)
			let handle: FSDirectoryHandle = this.root
			for (const part of parts) {
				handle = await handle.getDirectoryHandle(part)
			}
			const files: string[] = []
			for await (const [name, entry] of handle.entries()) {
				if (entry.kind === "file") files.push(name)
			}
			return files.sort()
		} catch {
			return []
		}
	}

	private async listDirs(dir: string): Promise<string[]> {
		try {
			const parts = dir.split("/").filter(Boolean)
			let handle: FSDirectoryHandle = this.root
			for (const part of parts) {
				handle = await handle.getDirectoryHandle(part)
			}
			const dirs: string[] = []
			for await (const [name, entry] of handle.entries()) {
				if (entry.kind === "directory") dirs.push(name)
			}
			return dirs.sort()
		} catch {
			return []
		}
	}

	async getSettings(): Promise<Record<string, unknown> | null> {
		const raw = await this.readFile(".haiku/settings.yml")
		if (!raw) return null
		return parseSettingsYaml(raw)
	}

	async listIntents(): Promise<HaikuIntent[]> {
		const intentDirs = await this.listDirs(".haiku/intents")
		const intents: HaikuIntent[] = []

		for (const slug of intentDirs) {
			const raw = await this.readFile(`.haiku/intents/${slug}/intent.md`)
			if (!raw) continue
			// Route through the shared parser so v3↔v4 dual-pathing
			// (sealed_at-derived status, plugin_version detection,
			// activeStage default) lands consistently across providers.
			intents.push(parseIntentFromRaw("local", slug, raw))
		}

		return intents
	}

	async getIntent(slug: string): Promise<HaikuIntentDetail | null> {
		const raw = await this.readFile(`.haiku/intents/${slug}/intent.md`)
		if (!raw) return null

		const { data, content } = parseFrontmatter(raw, {
			provider: "local",
			path: `.haiku/intents/${slug}/intent.md`,
			slug,
		})
		const studio = (data.studio as string) || "ideation"
		const stageNames = (data.stages as string[]) || []
		const activeStage = (data.active_stage as string) || ""

		// Load stages
		const stageDirs = await this.listDirs(`.haiku/intents/${slug}/stages`)
		const stages: HaikuStageState[] = []

		for (const stageName of stageNames.length > 0 ? stageNames : stageDirs) {
			const unitFiles = await this.listFiles(
				`.haiku/intents/${slug}/stages/${stageName}/units`,
			)
			const units: HaikuUnit[] = []

			for (const unitFile of unitFiles) {
				if (!unitFile.endsWith(".md")) continue
				const unitPath = `.haiku/intents/${slug}/stages/${stageName}/units/${unitFile}`
				const unitRaw = await this.readFile(unitPath)
				if (!unitRaw) continue
				units.push(
					parseUnit(unitFile, stageName, unitRaw, {
						provider: "local",
						path: unitPath,
						slug,
					}),
				)
			}

			// Read stage state.json (v3 only — v4 deletes it during
			// migration. Absence is normal for v4 intents.)
			const stateRaw = await this.readFile(
				`.haiku/intents/${slug}/stages/${stageName}/state.json`,
			)
			const {
				phase: stagePhase,
				startedAt: stageStartedAt,
				completedAt: stageCompletedAt,
				gateOutcome,
				stateStatus,
			} = parseStageStateJson(stateRaw)

			// Status resolution priority:
			//   1. v3 state.json.status (when present, authoritative)
			//   2. v4 derived from per-unit iterations[] + approvals
			//   3. v3 active_stage / stage-order fallback (un-migrated
			//      intents where state.json is missing for whatever reason)
			let status: "pending" | "active" | "complete" = "pending"
			if (stateStatus === "active") status = "active"
			else if (stateStatus === "completed") status = "complete"
			else if (units.length > 0 || stateRaw == null) {
				// v4 path: state.json was missing AND we have units to
				// inspect. Fold per-unit FMs into a single status.
				status = deriveStageStatusFromUnits(units)
			} else if (stageName === activeStage) status = "active"
			else if (stageNames.indexOf(stageName) < stageNames.indexOf(activeStage))
				status = "complete"

			// Read stage artifacts
			const artifactFiles = await this.listFiles(
				`.haiku/intents/${slug}/stages/${stageName}/artifacts`,
			)
			const stageArtifacts: HaikuArtifact[] = []
			for (const af of artifactFiles) {
				const lower = af.toLowerCase()
				const artType: HaikuArtifact["type"] = lower.endsWith(".md")
					? "markdown"
					: lower.endsWith(".html") || lower.endsWith(".htm")
						? "html"
						: /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/.test(lower)
							? "image"
							: "other"
				// For local FS, read text content (images won't work inline — would need object URLs)
				const artContent = await this.readFile(
					`.haiku/intents/${slug}/stages/${stageName}/artifacts/${af}`,
				)
				if (artContent != null) {
					stageArtifacts.push({ name: af, content: artContent, type: artType })
				} else {
					stageArtifacts.push({ name: af, type: artType })
				}
			}

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

		// Load knowledge files with content
		const knowledgeFileNames = await this.listFiles(
			`.haiku/intents/${slug}/knowledge`,
		)
		const knowledge: HaikuKnowledgeFile[] = []
		for (const name of knowledgeFileNames) {
			if (!name.endsWith(".md")) continue
			const kContent = await this.readFile(
				`.haiku/intents/${slug}/knowledge/${name}`,
			)
			knowledge.push({ name, content: kContent || "" })
		}

		// Load operations files with content
		const operationsFileNames = await this.listFiles(
			`.haiku/intents/${slug}/operations`,
		)
		const operations: HaikuKnowledgeFile[] = []
		for (const name of operationsFileNames) {
			if (!name.endsWith(".md")) continue
			const oContent = await this.readFile(
				`.haiku/intents/${slug}/operations/${name}`,
			)
			operations.push({ name, content: oContent || "" })
		}

		// v4 active-stage refinement: when intent.md has no
		// active_stage (v4 dropped the field), walk the loaded stages
		// in declaration order and pick the first one that isn't
		// "complete." Keeps v3 behavior intact when active_stage is
		// stamped on intent.md.
		const stageStatusByName: Record<
			string,
			"pending" | "active" | "complete"
		> = {}
		for (const s of stages) stageStatusByName[s.name] = s.status
		const refinedActiveStage = activeStage
			? activeStage
			: deriveV4ActiveStage(stageNames, stageStatusByName)

		return {
			slug,
			title: (data.title as string) || slug,
			studio,
			activeStage: refinedActiveStage,
			mode: (data.mode as string) || "continuous",
			createdAt:
				(data.created_at as string) || (data.created as string) || null,
			startedAt: (data.started_at as string) || null,
			completedAt: (data.completed_at as string) || null,
			studioStages: (data.stages as string[]) || [],
			composite:
				(data.composite as Array<{ studio: string; stages: string[] }>) || null,
			...normalizeIntentStatus(
				(data.status as string) || "active",
				(data.completed_at as string) || null,
				stageNames.indexOf(refinedActiveStage),
				stageNames.length,
			),
			stagesTotal: stageNames.length,
			archived: data.archived === true,
			follows: (data.follows as string) || null,
			raw: data,
			stages,
			knowledge,
			operations,
			reflection: await this.readFile(`.haiku/intents/${slug}/reflection.md`),
			content,
			assets: [],
		}
	}
}
