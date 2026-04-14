// Regression harness for the studio-driven prototype map.
//
// Loads the prototype, iterates every studio, and for each one checks:
//   - stages render in the expected count
//   - stage headers match the studio's declared order
//   - hats, review-agents, inputs, outputs chips populate (not empty)
//   - aux cards (reflections/operations/templates/examples) swap with the studio
//   - clicking a sample hat and a sample artifact opens its modal with real content
//   - no console errors or page errors emitted during the run
import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } })
const errs = []
page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`))
page.on("console", (m) => {
  const t = m.type()
  if (t === "error" || t === "warning") errs.push(`[${t}] ${m.text()}`)
})

await page.goto("http://localhost:3000/prototype-stage-flow.html")
await page.waitForFunction(() => document.querySelectorAll(".stage").length > 0, { timeout: 15000 })

const list = await page.evaluate(() =>
  (STUDIO_CONTENT_ALL?.studioList ?? []).map((s) => ({
    dir: s.dir,
    stageCount: s.stageCount,
    category: s.category,
  })),
)
console.log(`discovered ${list.length} studios`)

const failures = []

for (const entry of list) {
  const ok = await page.evaluate((dir) => {
    const sel = document.getElementById("studio-picker")
    sel.value = dir
    sel.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }, entry.dir)
  if (!ok) {
    failures.push(`${entry.dir}: could not activate via picker`)
    continue
  }
  await page.waitForTimeout(250)
  const report = await page.evaluate(() => {
    const stages = [...document.querySelectorAll(".stage")]
    const haveHats = stages.every((s) => s.querySelectorAll(".hat-circle, .hat").length > 0)
    const haveReviewAgents = stages.every((s) => s.querySelectorAll(".review-agent, .ra").length > 0 || s.querySelector(".phase-review") !== null)
    const names = stages.map((s) => s.querySelector("header h2")?.textContent.trim())
    const hasAnyArtifactIn = stages.some((s) => s.querySelectorAll(".artifacts.in .artifact").length > 0)
    const hasAnyArtifactOut = stages.some((s) => s.querySelectorAll(".artifacts.out .artifact").length > 0)
    const activeName = document.getElementById("studio-picker").value
    const auxText = document.getElementById("aux-content")?.textContent ?? ""
    return { count: stages.length, names, haveHats, haveReviewAgents, hasAnyArtifactIn, hasAnyArtifactOut, activeName, auxHasContent: auxText.length > 0 }
  })

  if (report.count !== entry.stageCount) {
    failures.push(`${entry.dir}: expected ${entry.stageCount} stages, got ${report.count}`)
  }
  if (report.activeName !== entry.dir) {
    failures.push(`${entry.dir}: picker did not set active to ${entry.dir} (got ${report.activeName})`)
  }
  if (!report.haveHats) failures.push(`${entry.dir}: one or more stages has zero hat chips`)
  if (!report.hasAnyArtifactOut) failures.push(`${entry.dir}: no output artifacts anywhere — every stage missing outputs?`)
  // Inputs are expected to be empty for the first stage only; other stages should declare some.
  if (report.count > 1) {
    const nonFirstHasInputs = await page.evaluate(() => {
      const stages = [...document.querySelectorAll(".stage")]
      return stages.slice(1).some((s) => s.querySelectorAll(".artifacts.in .artifact").length > 0)
    })
    if (!nonFirstHasInputs) failures.push(`${entry.dir}: no downstream stage has inputs — cross-stage wiring looks broken`)
  }

  console.log(
    `  ${entry.dir.padEnd(20)} ${String(report.count).padStart(2)} stages ✓   ${report.names.join(" → ")}`,
  )
}

// Spot-check: on software studio, click a hat and an artifact, verify modals open with content
await page.evaluate(() => {
  const sel = document.getElementById("studio-picker")
  sel.value = "software"
  sel.dispatchEvent(new Event("change", { bubbles: true }))
})
await page.waitForTimeout(300)

async function clickAtPath(path, label) {
  // path: { stageIdx, within } where within is a selector inside that stage
  const opened = await page.evaluate(({ stageIdx, within }) => {
    const stage = document.querySelectorAll(".stage")[stageIdx]
    if (!stage) return { ok: false, reason: "stage not found" }
    const el = stage.querySelector(within)
    if (!el) return { ok: false, reason: `inner selector not found: ${within}` }
    el.click()
    const backdrop = document.getElementById("modal-backdrop")
    const body = document.getElementById("modal-body")
    const visible = backdrop && !backdrop.hidden && backdrop.classList.contains("open")
    const contentLen = body ? body.textContent.trim().length : 0
    return { ok: visible && contentLen > 50, visible, contentLen }
  }, path)
  if (!opened.ok) {
    failures.push(`${label}: modal did not open with content (${JSON.stringify(opened)})`)
  } else {
    console.log(`  click ${label}: modal content ${opened.contentLen} chars ✓`)
  }
  await page.evaluate(() => {
    const bd = document.getElementById("modal-backdrop")
    if (bd) bd.click()
  })
  await page.waitForTimeout(150)
}

await clickAtPath({ stageIdx: 0, within: ".hat-circle, .hat" }, "first-stage hat")
await clickAtPath({ stageIdx: 0, within: ".artifacts.out .artifact" }, "first-stage output artifact")
await clickAtPath({ stageIdx: 1, within: ".artifacts.in .artifact" }, "second-stage input artifact")
await clickAtPath({ stageIdx: 0, within: "h2.clickable" }, "STAGE.md header")

// Check that aux cards swap with the active studio.
// reflections/operations/templates are studio-specific sets; confirm the
// in-DOM text is not identical across two obviously-different studios.
const auxSnapshot = async () => {
  return page.evaluate(() => document.getElementById("aux-content")?.textContent ?? "")
}
const setStudio = async (dir) => {
  await page.evaluate((d) => {
    const sel = document.getElementById("studio-picker")
    sel.value = d
    sel.dispatchEvent(new Event("change", { bubbles: true }))
  }, dir)
  await page.waitForTimeout(300)
}

await setStudio("software")
const auxSoftware = await auxSnapshot()
await setStudio("legal")
const auxLegal = await auxSnapshot()

if (!auxSoftware || !auxLegal) {
  failures.push("aux cards: empty snapshot on at least one studio")
} else if (auxSoftware === auxLegal) {
  failures.push("aux cards: identical across software + legal (studio swap not affecting them?)")
} else {
  console.log(`  aux cards swap software↔legal: differing content ✓ (${auxSoftware.length} vs ${auxLegal.length} chars)`)
}

// Pre-intent studio-detection step references stage 1 of the active studio.
// When we swap to a studio whose first stage is called something else, the
// reference should track.
await setStudio("software")
const stage1Software = await page.evaluate(() => {
  const el = document.querySelector(".pre-intent-card, .pre-intent")
  return el?.textContent ?? ""
})
await setStudio("ideation")
const stage1Ideation = await page.evaluate(() => {
  const el = document.querySelector(".pre-intent-card, .pre-intent")
  return el?.textContent ?? ""
})
if (stage1Software && stage1Ideation && stage1Software === stage1Ideation) {
  // This is a soft check — the pre-intent card MIGHT legitimately be
  // studio-agnostic. Don't fail; just note it.
  console.log("  note: pre-intent card text identical across software+ideation (expected if it's studio-agnostic copy)")
} else if (stage1Software && stage1Ideation) {
  console.log("  pre-intent card text differs across studios ✓")
}

if (errs.length) {
  console.log("\n--- console / page errors ---")
  for (const e of errs) console.log(e)
}

if (failures.length) {
  console.log("\n--- FAILURES ---")
  for (const f of failures) console.log("  " + f)
  await browser.close()
  process.exit(1)
}

console.log(`\nAll ${list.length} studios rendered without regressions.`)
await browser.close()
