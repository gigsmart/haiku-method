#!/usr/bin/env node
// capture-playwright-worker.js — Playwright screenshot capture worker for AI-DLC
//
// Accepts a JSON config as the first CLI argument and captures full-page
// screenshots at each breakpoint for each route.
//
// Usage:
//   node capture-playwright-worker.js '{"url":"http://localhost:3000","routes":"/,/about",...}'

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BREAKPOINT_NAMES = {
  375: "mobile",
  768: "tablet",
  1280: "desktop",
};

function breakpointName(width) {
  return BREAKPOINT_NAMES[width] || String(width);
}

function viewName(route) {
  if (route === "/") return "home";
  // Strip leading slash, replace remaining slashes with dashes
  return route.replace(/^\//, "").replace(/\//g, "-");
}

async function main() {
  const rawArgs = process.argv[2];
  if (!rawArgs) {
    console.error("ai-dlc: capture-playwright-worker: no arguments provided");
    process.exit(1);
  }

  let args;
  try {
    args = JSON.parse(rawArgs);
  } catch (e) {
    console.error(
      "ai-dlc: capture-playwright-worker: invalid JSON arguments:",
      e.message
    );
    process.exit(1);
  }

  const {
    url,
    static: staticPath,
    routes: routesStr,
    outputDir,
    breakpoints: breakpointsStr,
    prefix,
    waitFor,
  } = args;

  const routes = routesStr.split(",").map((r) => r.trim());
  const breakpoints = breakpointsStr.split(",").map((b) => parseInt(b.trim()));
  const screenshots = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    for (const bp of breakpoints) {
      const context = await browser.newContext({
        viewport: { width: bp, height: 900 },
      });
      const page = await context.newPage();

      for (const route of routes) {
        let targetUrl;
        if (staticPath) {
          targetUrl = `file://${staticPath}`;
        } else {
          // Join base URL with route, avoiding double slashes
          const base = url.replace(/\/$/, "");
          targetUrl = route === "/" ? base : `${base}${route}`;
        }

        await page.goto(targetUrl, { waitUntil: "networkidle" });

        if (waitFor) {
          await page.waitForSelector(waitFor, { timeout: 10000 });
        }

        const bpName = breakpointName(bp);
        const view = viewName(route);
        const filename = prefix
          ? `${prefix}${bpName}-${view}.png`
          : `${bpName}-${view}.png`;
        const filepath = path.join(outputDir, filename);

        await page.screenshot({ path: filepath, fullPage: true });

        screenshots.push({
          breakpoint: bp,
          view: view,
          path: filename,
        });

        console.log(`  captured: ${filename} (${bp}px)`);
      }

      await context.close();
    }

    // Write manifest
    const manifest = {
      provider: "playwright",
      captured_at: new Date().toISOString(),
      breakpoints: breakpoints,
      screenshots: screenshots,
    };

    const manifestPath = path.join(outputDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`  manifest: ${manifestPath}`);
  } catch (err) {
    console.error("ai-dlc: capture-playwright-worker: capture failed:", err.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
