// orchestrator/prompts/design_direction_required.ts — Stage needs a
// design direction before proceeding. Intake-first: open the picker
// with NO archetypes so the user can either upload finished designs
// or signal they want the agent to generate variants. Generation only
// happens after the user explicitly asks for it — that way we don't
// burn tokens producing variants the user is going to throw away.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug }) => {
	return [
		`## Design Direction Required`,
		``,
		`This stage requires a design direction before proceeding. Start in **intake mode** — the user may already have designs to upload, in which case generating archetypes is wasted work.`,
		``,
		`1. Call \`pick_design_direction\` **with no \`archetypes\` field** (or an empty array). The picker opens in intake mode and asks the user whether they have designs to upload.`,
		`2. Call \`haiku_await_design_direction\` and wait for the response.`,
		`3. The user's response branches:`,
		`   - **Upload** — they uploaded design files. The next \`haiku_run_next\` tick will surface the file paths via a \`design_direction_uploaded\` action; \`Read\` each one and incorporate into elaboration. **Do not generate archetypes.**`,
		`   - **Generate** — they want you to produce variants. Generate 2-3 distinct design approaches as HTML wireframe snippets (different layouts, interaction patterns, or visual hierarchies) and call \`pick_design_direction\` again with \`archetypes\` populated.`,
		`4. After a final selection lands, call \`haiku_run_next { intent: "${slug}", design_direction_selected: true }\`.`,
		``,
		`Check for design provider MCPs (\`mcp__pencil__*\`, \`mcp__openpencil__*\`) and use them when generation is needed.`,
	].join("\n")
})
