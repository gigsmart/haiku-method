import { chromium } from "playwright"

const modes = ["discrete", "continuous", "hybrid", "auto"]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } })

for (const m of modes) {
  await page.goto("http://localhost:3000/prototype-stage-flow.html")
  await page.evaluate((mode) => {
    const el = document.getElementById(`mode-${mode}`)
    el.checked = true
    el.dispatchEvent(new Event("change", { bubbles: true }))
  }, m)
  await page.waitForFunction(() => document.querySelectorAll(".stage").length > 0, { timeout: 5000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `/tmp/proto-${m}.png`, fullPage: true })
  console.log(`captured /tmp/proto-${m}.png`)
}

await browser.close()
