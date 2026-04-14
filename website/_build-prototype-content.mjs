// Build sidecar JSON bundling every studio's definitions for the prototype map.
//
// The prototype (website/public/prototype-stage-flow.html) is data-driven — it
// reads the `studios.<dir>` entry for the active studio and renders stages,
// hats, review-agents, inputs/outputs, gate types, and artifact defs from it.
// Re-run this script whenever plugin/studios/ changes.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import matter from "gray-matter"
import yaml from "js-yaml"

const ROOT = join(import.meta.dirname, "..")
const STUDIOS_DIR = join(ROOT, "plugin/studios")
const OUT = join(import.meta.dirname, "public/prototype-stage-content.json")

function tryRead(p) {
  try { return readFileSync(p, "utf8") } catch { return null }
}
function listMd(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
}
function frontmatter(path) {
  const raw = tryRead(path)
  if (!raw) return null
  try { return matter(raw).data } catch { return null }
}
function listMdFiles(dir, repoPathPrefix) {
  if (!existsSync(dir)) return {}
  const out = {}
  for (const f of listMd(dir)) {
    const slug = f.replace(/\.md$/, "").toLowerCase()
    const raw = tryRead(join(dir, f))
    let fm = {}
    let body = raw ?? ""
    if (raw) {
      try {
        const parsed = matter(raw)
        fm = parsed.data ?? {}
        body = parsed.content ?? ""
      } catch {
        /* fall back to the raw content if parsing fails */
      }
    }
    out[slug] = {
      content: raw,
      frontmatter: fm,
      body,
      path: `${repoPathPrefix}/${f}`,
    }
  }
  return out
}

function buildStage(studioDir, stageName) {
  const stageDir = join(studioDir, "stages", stageName)
  if (!existsSync(stageDir)) return null
  const repoPrefix = `plugin/studios/${basename(studioDir)}/stages/${stageName}`
  return {
    frontmatter: frontmatter(join(stageDir, "STAGE.md")) ?? {},
    stageMd: tryRead(join(stageDir, "STAGE.md")),
    stagePath: `${repoPrefix}/STAGE.md`,
    hats: listMdFiles(join(stageDir, "hats"), `${repoPrefix}/hats`),
    reviewAgents: listMdFiles(
      join(stageDir, "review-agents"),
      `${repoPrefix}/review-agents`,
    ),
    discoveryDefs: listMdFiles(
      join(stageDir, "discovery"),
      `${repoPrefix}/discovery`,
    ),
    outputDefs: listMdFiles(join(stageDir, "outputs"), `${repoPrefix}/outputs`),
  }
}

function buildStudio(dir) {
  const studioDir = join(STUDIOS_DIR, dir)
  const studioMdPath = join(studioDir, "STUDIO.md")
  if (!existsSync(studioMdPath)) return null
  const fm = frontmatter(studioMdPath) ?? {}
  const declared = Array.isArray(fm.stages) ? fm.stages : []
  const onDisk = existsSync(join(studioDir, "stages"))
    ? readdirSync(join(studioDir, "stages"))
        .filter((s) => existsSync(join(studioDir, "stages", s, "STAGE.md")))
        .sort()
    : []
  // Prefer declared order; fall back to directory order for anything not declared.
  const order = [...declared.filter((s) => onDisk.includes(s))]
  for (const s of onDisk) if (!order.includes(s)) order.push(s)

  const stages = {}
  for (const s of order) {
    const stage = buildStage(studioDir, s)
    if (stage) stages[s] = stage
  }

  const repoPrefix = `plugin/studios/${dir}`
  return {
    dir,
    frontmatter: fm,
    studioMd: tryRead(studioMdPath),
    studioPath: `${repoPrefix}/STUDIO.md`,
    stagesOrder: order,
    reflections: listMdFiles(
      join(studioDir, "reflections"),
      `${repoPrefix}/reflections`,
    ),
    operations: listMdFiles(
      join(studioDir, "operations"),
      `${repoPrefix}/operations`,
    ),
    templates: listMdFiles(
      join(studioDir, "templates"),
      `${repoPrefix}/templates`,
    ),
    examples: listMdFiles(
      join(studioDir, "examples"),
      `${repoPrefix}/examples`,
    ),
    preIntents: collectPreIntents(studioDir, dir),
    stages,
  }
}

// examples/{slug}/pre-intent.yml + examples/{slug}/intent.md together feed the
// prototype's collapsed intent-creation card and its expanded modal. The split:
//   - intent.md: the intent itself (frontmatter.title, .studio, .stages;
//     body is the narrative seed). Source of truth for what the intent IS.
//   - pre-intent.yml: ONLY the conversation turns + related/suggested studios.
//     Source of truth for what the pre-intent conversation LOOKED LIKE.
// The build merges both so the prototype has everything it needs in one record.
function collectPreIntents(studioDir, dirName) {
  const examplesDir = join(studioDir, "examples")
  if (!existsSync(examplesDir)) return {}
  const out = {}
  for (const slug of readdirSync(examplesDir)) {
    const yamlPath = join(examplesDir, slug, "pre-intent.yml")
    if (!existsSync(yamlPath)) continue
    let preIntent
    try {
      preIntent = yaml.load(readFileSync(yamlPath, "utf8"))
    } catch (e) {
      console.warn(`[pre-intent] failed to parse ${yamlPath}: ${e.message}`)
      continue
    }
    if (!preIntent || typeof preIntent !== "object") continue

    // Pull title/studio/seed from the sibling intent.md (the real intent doc).
    const intentMdPath = join(examplesDir, slug, "intent.md")
    let intentFm = {}
    let intentBody = ""
    if (existsSync(intentMdPath)) {
      try {
        const parsed = matter(readFileSync(intentMdPath, "utf8"))
        intentFm = parsed.data ?? {}
        intentBody = parsed.content ?? ""
      } catch (e) {
        console.warn(`[pre-intent] failed to parse ${intentMdPath}: ${e.message}`)
      }
    }

    // Seed = first paragraph of the intent.md body, skipping the H1.
    const paragraphs = intentBody
      .replace(/^#\s.+$/m, "") // drop H1
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
    const seed = paragraphs[0] ?? ""

    // Human-readable title: prefer the H1 text if present, else frontmatter.title.
    const h1 = /^#\s+(.+)$/m.exec(intentBody)
    const title = h1?.[1]?.trim() || intentFm.title || slug

    out[slug] = {
      slug,
      title,
      studio: intentFm.studio ?? dirName,
      related: Array.isArray(preIntent.related) ? preIntent.related : [],
      turns: Array.isArray(preIntent.turns) ? preIntent.turns : [],
      seed,
      preIntentPath: `plugin/studios/${dirName}/examples/${slug}/pre-intent.yml`,
      intentPath: existsSync(intentMdPath)
        ? `plugin/studios/${dirName}/examples/${slug}/intent.md`
        : null,
    }
  }
  return out
}

const dirs = readdirSync(STUDIOS_DIR)
  .filter((d) => existsSync(join(STUDIOS_DIR, d, "STUDIO.md")))
  .sort()

const studios = {}
for (const d of dirs) {
  const studio = buildStudio(d)
  if (studio) studios[d] = studio
}

const studioList = Object.values(studios).map((s) => ({
  dir: s.dir,
  slug: s.frontmatter.slug ?? s.dir,
  name: s.frontmatter.name ?? s.dir,
  description: s.frontmatter.description ?? "",
  category: s.frontmatter.category ?? "",
  stageCount: s.stagesOrder.length,
}))

const payload = {
  defaultStudio: "software",
  studioList,
  studios,
}

writeFileSync(OUT, JSON.stringify(payload, null, 2))
console.log(`wrote ${OUT}`)
console.log(`studios: ${studioList.length}`)
for (const s of studioList) {
  console.log(`  ${s.dir}: ${s.stageCount} stages (${s.category || "-"})`)
}
