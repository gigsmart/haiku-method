import type { BrowseProvider, HaikuIntent, HaikuIntentDetail, HaikuStageState, HaikuUnit } from "./types"
import { parseCriteria, parseFrontmatter } from "./types"

// File System Access API types (not in all TS DOM libs)
interface FSDirectoryHandle {
	getDirectoryHandle(name: string): Promise<FSDirectoryHandle>
	getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>
	entries(): AsyncIterable<[string, { kind: "file" | "directory" }]>
}

export class LocalProvider implements BrowseProvider {
	readonly name = "Local Directory"
	private root: FSDirectoryHandle
	private haikuDir: FSDirectoryHandle | null = null

	constructor(root: FileSystemDirectoryHandle) {
		this.root = root as unknown as FSDirectoryHandle
	}

	async init(): Promise<boolean> {
		try {
			this.haikuDir = await this.root.getDirectoryHandle(".haiku")
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

		// Load stages
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

			// Read stage state.json
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

		// Load knowledge files
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
}
