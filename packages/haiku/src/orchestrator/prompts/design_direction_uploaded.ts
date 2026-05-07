// orchestrator/prompts/design_direction_uploaded.ts — Surface
// designer-uploaded artefacts from a recent intake-mode submission.
//
// Mirrors `design_direction_complete.ts` but for the upload path: the
// user provided finished designs instead of picking an archetype, so
// no `archetype` field is involved. The HTTP submit route decoded the
// uploads to disk under `stages/<stage>/artifacts/design-direction/
// uploads/`; the elaborate handler emits this action exactly once per
// fresh upload set, then flips `design_direction_surfaced=true` so we
// don't re-emit on every tick.

import { definePromptBuilder } from "./define.js"

interface SurfacedUpload {
	filename: string
	path: string
	caption?: string
}

export default definePromptBuilder(({ action }) => {
	const a = action as unknown as Record<string, unknown>
	const uploads = (a.uploads as SurfacedUpload[] | undefined) ?? []
	const comments = a.comments as string | undefined

	const lines: string[] = []
	lines.push(`## Designer Uploaded Direction\n`)
	lines.push(
		`The user provided ${uploads.length} design file${uploads.length === 1 ? "" : "s"} as the chosen direction. **No archetypes were generated** — these uploads ARE the direction. Incorporate them into elaboration as-is.\n`,
	)
	if (comments) {
		lines.push(`### Designer notes\n`)
		lines.push(`${comments}\n`)
	}
	if (uploads.length > 0) {
		lines.push(`### Uploaded files (${uploads.length})\n`)
		lines.push(
			`Each entry below is a designer-supplied artefact. Use the \`Read\` tool on each \`path\` to view the file — paths are intent-relative under \`.haiku/intents/<slug>/\`.\n`,
		)
		uploads.forEach((u, i) => {
			lines.push(
				`${i + 1}. **${u.filename}**${u.caption ? ` — ${u.caption}` : ""} — \`${u.path}\``,
			)
		})
		lines.push("")
	}
	lines.push(
		`Treat the uploads as the source of truth for the visual direction. Then call \`haiku_run_next\` to continue.`,
	)
	return lines.join("\n")
})
