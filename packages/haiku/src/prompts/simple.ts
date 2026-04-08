// prompts/simple.ts — Simple prompt handlers (state-reading, instruction-returning)

import { registerPrompt } from "./index.js"
import { completeIntentSlug, completeStudio } from "./completions.js"
import { singleMessage, readJson } from "./helpers.js"
import { findHaikuRoot, parseFrontmatter } from "../state-tools.js"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// ── haiku:dashboard ─────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:dashboard",
	title: "Dashboard",
	description: "Show active intents and their status overview",
	arguments: [],
	handler: async () => {
		let root: string
		try {
			root = findHaikuRoot()
		} catch {
			return singleMessage("No .haiku/ directory found. Run /haiku:setup to initialize.")
		}

		const intentsDir = join(root, "intents")
		if (!existsSync(intentsDir)) {
			return singleMessage("No intents found. Use /haiku:new to create one.")
		}

		const slugs = readdirSync(intentsDir, { withFileTypes: true })
			.filter(d => d.isDirectory() && existsSync(join(intentsDir, d.name, "intent.md")))
			.map(d => d.name)

		if (slugs.length === 0) {
			return singleMessage("No intents found. Use /haiku:new to create one.")
		}

		const lines: string[] = ["# H-AI-K-U Dashboard\n"]

		for (const slug of slugs) {
			const raw = readFileSync(join(intentsDir, slug, "intent.md"), "utf8")
			const { data } = parseFrontmatter(raw)
			const status = (data.status as string) || "unknown"
			const studio = (data.studio as string) || "—"
			const activeStage = (data.active_stage as string) || "—"
			const mode = (data.mode as string) || "continuous"
			const startedAt = (data.started_at as string) || "—"

			lines.push(`## ${slug}`)
			lines.push(`- **Status:** ${status}`)
			lines.push(`- **Studio:** ${studio}`)
			lines.push(`- **Active Stage:** ${activeStage}`)
			lines.push(`- **Mode:** ${mode}`)
			lines.push(`- **Started:** ${startedAt}`)

			// Read stage state if available
			const stagesDir = join(intentsDir, slug, "stages")
			if (existsSync(stagesDir)) {
				const stages = readdirSync(stagesDir, { withFileTypes: true })
					.filter(d => d.isDirectory())
					.map(d => d.name)
				if (stages.length > 0) {
					lines.push("\n| Stage | Status | Phase |")
					lines.push("|-------|--------|-------|")
					for (const stage of stages) {
						const state = readJson(join(stagesDir, stage, "state.json"))
						const sStatus = (state.status as string) || "pending"
						const sPhase = (state.phase as string) || "—"
						lines.push(`| ${stage} | ${sStatus} | ${sPhase} |`)
					}
				}
			}
			lines.push("")
		}

		return singleMessage(lines.join("\n"))
	},
})

// ── haiku:backlog ───────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:backlog",
	title: "Backlog",
	description: "Parking lot for ideas not ready for planning — add, list, review, or promote",
	arguments: [
		{
			name: "action",
			description: "Subcommand: add, list, review, or promote",
			required: false,
		},
		{
			name: "description",
			description: "Idea description (for add) or item ID (for promote)",
			required: false,
		},
	],
	handler: async (args) => {
		const action = args.action || "list"
		const desc = args.description || ""

		let root: string
		try {
			root = findHaikuRoot()
		} catch {
			return singleMessage("No .haiku/ directory found. Run /haiku:setup to initialize.")
		}

		const backlogDir = join(root, "backlog")

		switch (action) {
			case "add": {
				return singleMessage(
					`## Add Backlog Item\n\n` +
					`Create a new backlog item at \`.haiku/backlog/{slug}.md\` with this structure:\n\n` +
					"```yaml\n---\nid: {slug}\npriority: medium\ntags: []\ncreated: {today's date YYYY-MM-DD}\n---\n\n# {Title}\n\n{Description}\n```\n\n" +
					`Derive the slug from the description (lowercase, hyphens, max 50 chars).\n` +
					(desc ? `\n**Idea:** ${desc}\n` : "\nAsk the user for the idea description.\n") +
					`After creating, confirm: "Added to backlog: {slug} (priority: medium)"`
				)
			}
			case "review": {
				if (!existsSync(backlogDir)) {
					return singleMessage("Backlog is empty. Use /haiku:backlog add <idea> to add one.")
				}
				const items = readdirSync(backlogDir).filter(f => f.endsWith(".md"))
				if (items.length === 0) {
					return singleMessage("Backlog is empty. Use /haiku:backlog add <idea> to add one.")
				}

				const lines: string[] = ["## Backlog Review\n\nFor each item, present it and ask the user to:\n- **Keep** — leave as-is\n- **Reprioritize** — change priority\n- **Drop** — delete the item\n- **Promote** — promote to intent via /haiku:new\n- **Skip** — move to next\n\n### Items to review:\n"]
				for (const file of items) {
					const raw = readFileSync(join(backlogDir, file), "utf8")
					const { data, body } = parseFrontmatter(raw)
					lines.push(`#### ${data.id || file.replace(".md", "")}`)
					lines.push(`Priority: ${data.priority || "medium"} | Tags: ${Array.isArray(data.tags) ? (data.tags as string[]).join(", ") : "—"} | Created: ${data.created || "—"}`)
					lines.push(body.slice(0, 200))
					lines.push("")
				}
				return singleMessage(lines.join("\n"))
			}
			case "promote": {
				const id = desc
				return singleMessage(
					`## Promote Backlog Item\n\n` +
					(id
						? `Promote backlog item \`${id}\` to a full intent:\n\n1. Read \`.haiku/backlog/${id}.md\`\n2. Confirm with user\n3. Run /haiku:new with the item's description\n4. Delete the backlog file\n5. Confirm: "Promoted ${id} to intent."`
						: "Specify the item ID to promote. Use /haiku:backlog list to see available items.")
				)
			}
			case "list":
			default: {
				if (!existsSync(backlogDir)) {
					return singleMessage("Backlog is empty. Use /haiku:backlog add <idea> to add one.")
				}
				const items = readdirSync(backlogDir).filter(f => f.endsWith(".md"))
				if (items.length === 0) {
					return singleMessage("Backlog is empty. Use /haiku:backlog add <idea> to add one.")
				}

				const lines: string[] = ["## Backlog\n\n| ID | Priority | Tags | Created |\n|---|---|---|---|"]
				for (const file of items) {
					const raw = readFileSync(join(backlogDir, file), "utf8")
					const { data } = parseFrontmatter(raw)
					const id = (data.id as string) || file.replace(".md", "")
					const priority = (data.priority as string) || "medium"
					const tags = Array.isArray(data.tags) ? (data.tags as string[]).join(", ") : "—"
					const created = (data.created as string) || "—"
					lines.push(`| ${id} | ${priority} | ${tags} | ${created} |`)
				}
				return singleMessage(lines.join("\n"))
			}
		}
	},
})

// ── haiku:capacity ──────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:capacity",
	title: "Capacity",
	description: "Historical throughput — bolt counts, stage durations, patterns",
	arguments: [
		{
			name: "studio",
			description: "Filter by studio name",
			required: false,
			completer: completeStudio,
		},
	],
	handler: async (args) => {
		const studioFilter = args.studio || ""

		let root: string
		try {
			root = findHaikuRoot()
		} catch {
			return singleMessage("No .haiku/ directory found. Run /haiku:setup to initialize.")
		}

		const intentsDir = join(root, "intents")
		if (!existsSync(intentsDir)) {
			return singleMessage("No intents found. Complete an intent to see capacity data.")
		}

		const slugs = readdirSync(intentsDir, { withFileTypes: true })
			.filter(d => d.isDirectory() && existsSync(join(intentsDir, d.name, "intent.md")))
			.map(d => d.name)

		if (slugs.length === 0) {
			return singleMessage("No intents found. Complete an intent to see capacity data.")
		}

		// Group intents by studio
		const byStudio = new Map<string, Array<{ slug: string; data: Record<string, unknown> }>>()
		for (const slug of slugs) {
			const raw = readFileSync(join(intentsDir, slug, "intent.md"), "utf8")
			const { data } = parseFrontmatter(raw)
			const studio = (data.studio as string) || "unknown"
			if (studioFilter && studio !== studioFilter) continue
			if (!byStudio.has(studio)) byStudio.set(studio, [])
			byStudio.get(studio)!.push({ slug, data })
		}

		if (byStudio.size === 0) {
			return singleMessage(
				studioFilter
					? `Studio '${studioFilter}' not found or has no intents.`
					: "No intents found."
			)
		}

		const lines: string[] = ["# Capacity Report\n"]

		for (const [studio, intents] of byStudio) {
			const completed = intents.filter(i => i.data.status === "completed")
			const active = intents.filter(i => i.data.status === "active")

			lines.push(`## ${studio} Studio`)
			lines.push(`**Completed:** ${completed.length} intents | **Active:** ${active.length} intents\n`)

			// Collect stage metrics from all intents
			const stageMetrics = new Map<string, { bolts: number[]; durations: number[] }>()

			for (const intent of intents) {
				const stagesDir = join(intentsDir, intent.slug, "stages")
				if (!existsSync(stagesDir)) continue
				const stages = readdirSync(stagesDir, { withFileTypes: true })
					.filter(d => d.isDirectory())
					.map(d => d.name)

				for (const stage of stages) {
					if (!stageMetrics.has(stage)) stageMetrics.set(stage, { bolts: [], durations: [] })
					const metrics = stageMetrics.get(stage)!

					// Read stage state for duration
					const state = readJson(join(stagesDir, stage, "state.json"))
					if (state.started_at && state.completed_at) {
						const start = new Date(state.started_at as string).getTime()
						const end = new Date(state.completed_at as string).getTime()
						if (!isNaN(start) && !isNaN(end)) {
							metrics.durations.push(end - start)
						}
					}

					// Read units for bolt counts
					const unitsDir = join(stagesDir, stage, "units")
					if (existsSync(unitsDir)) {
						const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
						for (const uf of unitFiles) {
							const uRaw = readFileSync(join(unitsDir, uf), "utf8")
							const { data: uData } = parseFrontmatter(uRaw)
							const bolt = typeof uData.bolt === "number" ? uData.bolt : 0
							if (bolt > 0) metrics.bolts.push(bolt)
						}
					}
				}
			}

			if (stageMetrics.size > 0) {
				lines.push("| Stage | Median Bolts/Unit | Completed Stages |")
				lines.push("|-------|-------------------|------------------|")
				for (const [stage, metrics] of stageMetrics) {
					const medianBolt = metrics.bolts.length > 0
						? median(metrics.bolts)
						: "—"
					lines.push(`| ${stage} | ${medianBolt} | ${metrics.durations.length} |`)
				}
			}
			lines.push("")
		}

		return singleMessage(lines.join("\n"))
	},
})

function median(arr: number[]): number {
	const sorted = [...arr].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

// ── haiku:release-notes ─────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:release-notes",
	title: "Release Notes",
	description: "Show the project changelog / release notes",
	arguments: [
		{
			name: "version",
			description: "Specific version to show (e.g. 1.82.13), or omit for recent releases",
			required: false,
		},
	],
	handler: async (args) => {
		const version = args.version || ""

		// Walk up from cwd to find repo root (directory containing CHANGELOG.md)
		let dir = process.cwd()
		let changelogPath = ""
		for (let i = 0; i < 20; i++) {
			const candidate = join(dir, "CHANGELOG.md")
			if (existsSync(candidate)) {
				changelogPath = candidate
				break
			}
			const parent = join(dir, "..")
			if (parent === dir) break
			dir = parent
		}

		if (!changelogPath) {
			return singleMessage("No CHANGELOG.md found in the repository root.")
		}

		const content = readFileSync(changelogPath, "utf8")

		if (version) {
			// Find the specific version section — escape all regex metacharacters
			const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			const versionPattern = version.startsWith("v") ? escaped : `v?${escaped}`
			const regex = new RegExp(`^## \\[?${versionPattern}\\]?.*$`, "m")
			const match = content.match(regex)
			if (!match || match.index === undefined) {
				return singleMessage(`Version ${version} not found in CHANGELOG.md.`)
			}
			// Extract until next ## heading
			const startIdx = match.index
			const nextHeading = content.indexOf("\n## ", startIdx + 1)
			const section = nextHeading === -1
				? content.slice(startIdx)
				: content.slice(startIdx, nextHeading)
			return singleMessage(section.trim())
		}

		// Show the 5 most recent version entries
		const headingRegex = /^## /gm
		const headings: number[] = []
		let m: RegExpExecArray | null
		while ((m = headingRegex.exec(content)) !== null) {
			headings.push(m.index)
		}

		const count = Math.min(5, headings.length)
		if (count === 0) {
			return singleMessage("CHANGELOG.md exists but contains no version entries.")
		}

		const endIdx = headings.length > count ? headings[count] : content.length
		const recent = content.slice(headings[0], endIdx).trim()

		const totalReleases = headings.length
		return singleMessage(
			`${recent}\n\n---\n` +
			`Total releases: ${totalReleases}\n` +
			`Full changelog: CHANGELOG.md\n` +
			`RSS: https://haikumethod.ai/changelog/feed.xml`
		)
	},
})

// ── haiku:scaffold ──────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:scaffold",
	title: "Scaffold",
	description: "Scaffold custom H-AI-K-U artifacts — studios, stages, hats, providers",
	arguments: [
		{
			name: "type",
			description: "Artifact type: studio, stage, hat, or provider",
			required: true,
		},
		{
			name: "name",
			description: "Name of the artifact to scaffold",
			required: true,
		},
		{
			name: "parent",
			description: "Parent artifact name (e.g. studio name for stage, studio/stage for hat)",
			required: false,
		},
	],
	handler: async (args) => {
		const type = args.type
		const name = args.name
		const parent = args.parent || ""

		const instructions: Record<string, string> = {
			studio:
				`## Scaffold Studio: ${name}\n\n` +
				`Create the following structure:\n\n` +
				"```\n" +
				`.haiku/studios/${name}/STUDIO.md\n` +
				`.haiku/studios/${name}/stages/\n` +
				"```\n\n" +
				`**STUDIO.md template:**\n\n` +
				"```yaml\n---\n" +
				`name: ${name}\n` +
				"description: TODO -- describe this studio's purpose\n" +
				"stages: []\n" +
				"persistence:\n  type: git\n  delivery: pull-request\n" +
				"---\n\n" +
				`# ${name} Studio\n\n` +
				"Describe the lifecycle this studio supports.\n" +
				"```\n\n" +
				`After creating, suggest: \`/haiku:scaffold stage ${name} <stage-name>\``,

			stage:
				`## Scaffold Stage: ${name}\n\n` +
				(parent ? `**Parent studio:** ${parent}\n\n` : "**Parent studio:** (specify via the parent argument)\n\n") +
				`Create:\n\n` +
				"```\n" +
				`.haiku/studios/${parent || "<studio>"}/stages/${name}/STAGE.md\n` +
				`.haiku/studios/${parent || "<studio>"}/stages/${name}/hats/\n` +
				`.haiku/studios/${parent || "<studio>"}/stages/${name}/review-agents/\n` +
				"```\n\n" +
				`**STAGE.md template:**\n\n` +
				"```yaml\n---\n" +
				`name: ${name}\n` +
				"description: TODO -- describe what this stage accomplishes\n" +
				"hats: []\nreview: ask\n" +
				"---\n\n## Criteria Guidance\n\nTODO\n\n## Completion Signal\n\nTODO\n" +
				"```\n\n" +
				"Remind the user to:\n" +
				"1. Add hat files in the hats/ directory\n" +
				"2. Add this stage name to the parent studio's stages list",

			hat:
				`## Scaffold Hat: ${name}\n\n` +
				(parent ? `**Parent:** ${parent}\n\n` : "**Parent:** (specify studio/stage via the parent argument)\n\n") +
				"Create the hat file with this template:\n\n" +
				"```markdown\n" +
				"**Focus:** TODO -- this hat's core responsibility.\n\n" +
				"**Produces:** TODO -- artifacts or outputs.\n\n" +
				"**Reads:** TODO -- inputs consumed.\n\n" +
				"**Anti-patterns:**\n- TODO -- common mistakes\n" +
				"```\n\n" +
				"Remind the user to add this hat name to the parent stage's hats list.",

			provider:
				`## Scaffold Provider Override: ${name}\n\n` +
				`Create \`.haiku/providers/${name}.md\` with the built-in defaults as a starting template.\n\n` +
				`1. Read the built-in provider from \`\${CLAUDE_PLUGIN_ROOT}/providers/{category}.md\`\n` +
				`2. Create the override file at \`.haiku/providers/${name}.md\`\n` +
				`3. Pre-populate with the built-in defaults\n` +
				`4. Commit: \`git add .haiku/providers/${name}.md && git commit -m "haiku: configure ${name} provider"\``,
		}

		const text = instructions[type]
		if (!text) {
			return singleMessage(
				`Unknown scaffold type: ${type}. Valid types: studio, stage, hat, provider.`
			)
		}

		return singleMessage(text)
	},
})

// ── haiku:migrate ───────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:migrate",
	title: "Migrate",
	description: "Migrate legacy AI-DLC intents to H-AI-K-U format",
	arguments: [
		{
			name: "intent",
			description: "Specific intent slug to migrate",
			required: false,
			completer: completeIntentSlug,
		},
	],
	handler: async (args) => {
		const slug = args.intent || ""

		return singleMessage(
			`## Migrate Legacy Intents\n\n` +
			`Run the haiku migration binary to convert legacy .ai-dlc/ intents to .haiku/ format.\n\n` +
			"### Steps\n\n" +
			`1. **Detect legacy intents:** Scan \`.ai-dlc/\` for directories containing \`intent.md\`\n` +
			(slug
				? `2. **Migrate:** Run \`haiku migrate ${slug}\`\n`
				: "2. **Select intent:** Choose which intent to migrate (or all)\n" +
				  "3. **Run migration:** `haiku migrate <slug>`\n") +
			`\n### What it does\n\n` +
			"- Moves files from `.ai-dlc/{slug}/` to `.haiku/intents/{slug}/`\n" +
			"- Transforms frontmatter (passes -> stages, adds studio/mode metadata)\n" +
			"- Maps units to stages based on their `pass:` field\n" +
			"- Creates backward-compat symlink\n" +
			"- Produces a MIGRATION-PLAN.md gap analysis\n\n" +
			"### Prerequisites\n\n" +
			"- `haiku` binary must be available on PATH\n" +
			"- Legacy intents must exist in `.ai-dlc/`\n\n" +
			"After migration, run `/haiku:resume <slug>` to continue execution."
		)
	},
})

// ── haiku:seed ──────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:seed",
	title: "Seed",
	description: "Plant, track, and surface forward-looking ideas at the right moment",
	arguments: [
		{
			name: "action",
			description: "Subcommand: plant, list, or check",
			required: false,
		},
	],
	handler: async (args) => {
		const action = args.action || "list"

		let root: string
		try {
			root = findHaikuRoot()
		} catch {
			return singleMessage("No .haiku/ directory found. Run /haiku:setup to initialize.")
		}

		const seedDir = join(root, "seeds")

		switch (action) {
			case "plant": {
				return singleMessage(
					"## Plant a Seed\n\n" +
					"Capture a forward-looking idea with a trigger condition.\n\n" +
					"1. Ask the user: What is the idea?\n" +
					"2. Ask the user: When should this surface? (the trigger condition)\n" +
					"3. Generate a slug from the title\n" +
					"4. Create `.haiku/seeds/{slug}.md`:\n\n" +
					"```yaml\n---\ntitle: \"{idea title}\"\nplanted: \"{today ISO date}\"\ntrigger: \"{trigger condition}\"\nstatus: planted\n---\n{Description}\n```\n\n" +
					"5. Commit: `git add .haiku/seeds/{slug}.md && git commit -m \"seed: plant {slug}\"`\n" +
					"6. Confirm to the user with the title, trigger, and file path."
				)
			}
			case "check": {
				if (!existsSync(seedDir)) {
					return singleMessage("No seeds directory found. Use /haiku:seed plant to capture an idea.")
				}
				const files = readdirSync(seedDir).filter(f => f.endsWith(".md"))
				const planted: string[] = []
				for (const file of files) {
					const raw = readFileSync(join(seedDir, file), "utf8")
					const { data, body } = parseFrontmatter(raw)
					if (data.status !== "planted") continue
					planted.push(
						`### ${data.title || file.replace(".md", "")}\n` +
						`**Trigger:** ${data.trigger || "—"}\n` +
						`**Planted:** ${data.planted || "—"}\n\n` +
						`${body.slice(0, 300)}\n`
					)
				}
				if (planted.length === 0) {
					return singleMessage("No planted seeds to check.")
				}
				return singleMessage(
					"## Seed Check\n\n" +
					"Review each planted seed against the current context. " +
					"For seeds whose trigger condition matches, ask the user: Harvest, Surface later, or Prune.\n\n" +
					planted.join("\n---\n\n")
				)
			}
			case "list":
			default: {
				if (!existsSync(seedDir)) {
					return singleMessage("No seeds planted yet. Use /haiku:seed plant to capture an idea.")
				}
				const files = readdirSync(seedDir).filter(f => f.endsWith(".md"))
				if (files.length === 0) {
					return singleMessage("No seeds planted yet. Use /haiku:seed plant to capture an idea.")
				}

				const grouped: Record<string, string[]> = { planted: [], surfaced: [], harvested: [], pruned: [] }
				for (const file of files) {
					const raw = readFileSync(join(seedDir, file), "utf8")
					const { data } = parseFrontmatter(raw)
					const status = (data.status as string) || "planted"
					const title = (data.title as string) || file.replace(".md", "")
					const trigger = (data.trigger as string) || "—"
					const planted = (data.planted as string) || "—"
					if (!grouped[status]) grouped[status] = []
					grouped[status].push(`| ${title} | ${trigger} | ${planted} |`)
				}

				const lines: string[] = ["## Seeds\n"]
				if (grouped.planted.length > 0) {
					lines.push("### Planted (awaiting trigger)\n| Title | Trigger | Planted |\n|---|---|---|")
					lines.push(...grouped.planted)
					lines.push("")
				}
				if (grouped.surfaced.length > 0) {
					lines.push("### Surfaced (trigger matched)\n| Title | Trigger | Planted |\n|---|---|---|")
					lines.push(...grouped.surfaced)
					lines.push("")
				}
				if (grouped.harvested.length > 0) {
					lines.push("### Harvested (acted on)\n| Title | Planted |\n|---|---|")
					lines.push(...grouped.harvested.map(r => { const parts = r.split("|"); return `| ${parts[1]} | ${parts[3]} |` }))
					lines.push("")
				}
				if (grouped.pruned.length > 0) {
					lines.push("### Pruned (discarded)\n| Title | Planted |\n|---|---|")
					lines.push(...grouped.pruned.map(r => { const parts = r.split("|"); return `| ${parts[1]} | ${parts[3]} |` }))
					lines.push("")
				}

				return singleMessage(lines.join("\n"))
			}
		}
	},
})

// ── haiku:ideate ────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:ideate",
	title: "Ideate",
	description: "Surface adversarially-filtered improvement ideas from the codebase",
	arguments: [
		{
			name: "area",
			description: "Focus area — directory path, conceptual area, or file pattern",
			required: false,
		},
	],
	handler: async (args) => {
		const area = args.area || ""

		return singleMessage(
			`## Ideate: ${area || "Full Codebase"}\n\n` +
			"Analyze the codebase and surface high-impact improvement ideas that survive adversarial scrutiny.\n\n" +
			"### Process\n\n" +
			"1. **Scope:** " + (area ? `Focus on \`${area}\`` : "Analyze full codebase (prioritize high-churn areas from recent commits)") + "\n" +
			"2. **Identify** opportunities across: Performance, Security, Maintainability, Test Coverage, Developer Experience\n" +
			"3. **Adversarial filter** each idea — argue against it on cost, prematurity, complexity, alternatives, risk\n" +
			"4. **Classify** survivors by impact (High/Medium/Low) and effort (Low/Medium/High)\n" +
			"5. **Present** with the strongest counter-argument for each idea\n\n" +
			"### Output Format\n\n" +
			"For each surviving idea:\n" +
			"- **{idea}** -- one-line description\n" +
			"  - Impact: what specifically improves\n" +
			"  - Effort: low/medium/high (never time estimates)\n" +
			"  - Adversarial: strongest argument against\n" +
			"  - Verdict: do it / park it\n\n" +
			"Also list discarded ideas with reasons.\n\n" +
			"### Principles\n\n" +
			"- Evidence over intuition -- point to specific code\n" +
			"- Be ruthless -- discard more than you keep\n" +
			"- Five strong ideas beat twenty weak ones\n" +
			"- Zero ideas is valid if nothing survives\n\n" +
			"### Next Steps\n\n" +
			"After presenting, offer: Elaborate (run /haiku:new), Deep-dive (/haiku:ideate <sub-area>), or Discard"
		)
	},
})

// ── haiku:setup ─────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:setup",
	title: "Setup",
	description: "Configure H-AI-K-U for this project — auto-detect VCS, hosting, CI/CD, and providers",
	arguments: [],
	handler: async () => {
		return singleMessage(
			"## H-AI-K-U Setup\n\n" +
			"Configure this project's `.haiku/settings.yml` by auto-detecting the environment.\n\n" +
			"### Phase 1: Auto-Detect Environment\n\n" +
			"Run these detections:\n" +
			"```bash\n" +
			"# VCS\nif git rev-parse --git-dir &>/dev/null; then echo 'git'; elif jj root &>/dev/null; then echo 'jj'; fi\n" +
			"# Hosting\ngit remote get-url origin 2>/dev/null\n" +
			"# CI/CD\nls -d .github/workflows .gitlab-ci.yml Jenkinsfile .circleci 2>/dev/null\n" +
			"# Default branch\ngit symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'\n" +
			"```\n\n" +
			"### Phase 2: Probe MCP Tools for Providers\n\n" +
			"Use ToolSearch to discover available MCP providers for ticketing, spec, design, and comms.\n\n" +
			"### Phase 3: Confirm Settings\n\n" +
			"Present detected settings and ask for confirmation via `ask_user_visual_question`.\n" +
			"Allow the user to adjust any category. Use elicitation (visual questions) for provider selection.\n\n" +
			"### Phase 4: Provider Configuration\n\n" +
			"For each confirmed provider, collect required config (project keys, space IDs, etc.).\n" +
			"Read schemas from `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`.\n\n" +
			"### Phase 5: Workflow Tuning\n\n" +
			"Ask about:\n" +
			"- Workflow mode (interactive vs autonomous)\n" +
			"- Granularity (coarse/standard/fine)\n" +
			"- Default studio\n" +
			"- Announcement formats\n" +
			"- Visual review (browser-based review UI)\n" +
			"- Review agents (core + optional)\n\n" +
			"### Phase 6: VCS Strategy\n\n" +
			"Ask about change strategy (intent/unit/trunk) and source branch.\n\n" +
			"### Phase 7: Write Settings\n\n" +
			"Write `.haiku/settings.yml` preserving any existing fields.\n" +
			"Commit: `git add .haiku/settings.yml && git commit -m 'haiku: configure project settings'`\n\n" +
			"### Phase 8: Confirmation\n\n" +
			"Display summary table and suggest: `/haiku:new` to start first intent."
		)
	},
})
