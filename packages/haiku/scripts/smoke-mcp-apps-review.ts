#!/usr/bin/env tsx
// End-to-end smoke test for the MCP Apps review gate path.
//
// Exercises the REAL openReviewMcpApps function through the orchestrator's
// handleOrchestratorTool call path — the same path that runs in production.
//
// Usage:
//   npx tsx scripts/smoke-mcp-apps-review.ts
//
// Exits 0 and prints "PASS" on success.
// Exits 1 on any failure.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chdir, cwd as getCwd } from "node:process"
import { setTimeout as delay } from "node:timers/promises"

import {
  handleOrchestratorTool,
  setOpenReviewHandler,
} from "../src/orchestrator.ts"
import { openReviewMcpApps } from "../src/open-review-mcp-apps.ts"
import { listSessions, updateSession } from "../src/sessions.ts"
import { setMcpServerInstance } from "../src/state-tools.ts"
import { clearStudioCache } from "../src/studio-reader.ts"

// ── Helpers ────────────────────────────────────────────────────────────────

const SLUG = "smoke-mcp-apps-review-fixture"
const STAGE = "inception"
const STUDIO = "smoke-studio"

/** Build a minimal stub MCP server that advertises experimental.apps */
function makeMcpAppsServer() {
  return {
    getClientCapabilities() {
      return { experimental: { apps: {} } }
    },
    async listRoots() {
      return { roots: [] }
    },
    async elicitInput(_params: unknown) {
      throw new Error("elicitInput not expected in this smoke test")
    },
  }
}

/** Set up a minimal fixture intent directory in a temp dir outside the git repo.
 *  Returns the temp root and a cleanup function. */
function setupFixture(): { root: string; cleanup: () => void } {
  const root = join(
    tmpdir(),
    `haiku-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )

  // .haiku/intents/<slug>/
  const intentDir = join(root, ".haiku", "intents", SLUG)
  mkdirSync(intentDir, { recursive: true })

  // intent.md — minimal valid frontmatter
  writeFileSync(
    join(intentDir, "intent.md"),
    [
      "---",
      `title: Smoke MCP Apps Review`,
      `status: active`,
      `studio: ${STUDIO}`,
      `active_stage: ${STAGE}`,
      `mode: continuous`,
      "---",
      "",
      "# Smoke MCP Apps Review",
      "",
      "## Completion Criteria",
      "",
      "- [ ] The review gate advances the phase to execute",
      "",
    ].join("\n"),
  )

  // stages/inception/state.json — elaborate phase, enough turns to skip
  // the collaborative-turns gate (elaboration_turns >= 3 → updatedTurns = 4)
  const stageDir = join(intentDir, "stages", STAGE)
  mkdirSync(stageDir, { recursive: true })
  writeFileSync(
    join(stageDir, "state.json"),
    JSON.stringify({
      phase: "elaborate",
      status: "active",
      elaboration_turns: 3,
      started_at: new Date().toISOString(),
    }),
  )

  // stages/inception/units/unit-01-smoke.md — minimal valid unit
  const unitsDir = join(stageDir, "units")
  mkdirSync(unitsDir, { recursive: true })
  writeFileSync(
    join(unitsDir, "unit-01-smoke.md"),
    [
      "---",
      "title: Smoke unit",
      "type: feature",
      "status: active",
      "inputs:",
      "  - intent.md",
      "---",
      "",
      "# Smoke unit",
      "",
    ].join("\n"),
  )

  // .haiku/studios/smoke-studio/STUDIO.md — minimal studio with one stage
  const studioDir = join(root, ".haiku", "studios", STUDIO)
  mkdirSync(studioDir, { recursive: true })
  writeFileSync(
    join(studioDir, "STUDIO.md"),
    [
      "---",
      `name: ${STUDIO}`,
      `slug: ${STUDIO}`,
      "stages:",
      `  - ${STAGE}`,
      "---",
      "",
      "# Smoke Studio",
      "",
    ].join("\n"),
  )

  // .haiku/studios/smoke-studio/stages/inception/STAGE.md — review: ask forces gate_review
  const stageDefDir = join(studioDir, "stages", STAGE)
  mkdirSync(stageDefDir, { recursive: true })
  writeFileSync(
    join(stageDefDir, "STAGE.md"),
    [
      "---",
      "review: ask",
      "hats:",
      "  - planner",
      "  - builder",
      "  - reviewer",
      "---",
      "",
      "# Inception",
      "",
    ].join("\n"),
  )

  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    },
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const origCwd = getCwd()
  let cleanup: (() => void) | undefined

  try {
    // 1. Set up fixture
    const fixture = setupFixture()
    cleanup = fixture.cleanup

    // 2. Switch cwd to fixture root so findHaikuRoot() and studioSearchPaths() resolve correctly.
    //    This temp dir is outside any git repo — isGitRepo() returns false,
    //    so gitCommitState() is a no-op and doesn't touch the repo.
    chdir(fixture.root)

    // 3. Clear studio cache so the new temp studio is discovered
    clearStudioCache()

    // 4. Inject stub MCP Apps server — hostSupportsMcpApps() will return true
    setMcpServerInstance(makeMcpAppsServer())

    // 5. Wire the REAL openReviewMcpApps as the _openReviewAndWait handler.
    //    This is NOT a reimplementation — it's the exact function from
    //    src/open-review-mcp-apps.ts that runs in production.
    setOpenReviewHandler(
      async (intentDirRel, reviewType, gateType) =>
        openReviewMcpApps({
          intentDirRel,
          reviewType,
          gateType,
          signal: undefined, // no AbortSignal in the smoke test
          setReviewResultMeta: () => {
            /* no-op — _meta.ui is a server.ts concern */
          },
        }),
    )

    // 6. Drive haiku_run_next — this will:
    //    a) Call runNext(SLUG) → elaborate phase with units + turns → gate_review action
    //    b) handleOrchestratorTool awaits _openReviewAndWait (= openReviewMcpApps)
    //    c) openReviewMcpApps creates a session and blocks on waitForSession()
    //
    // We fire the tool call and concurrently submit the decision.
    const runNextPromise = handleOrchestratorTool("haiku_run_next", {
      intent: SLUG,
    })

    // 7. Concurrently: wait one tick for the session to be registered, then
    //    submit an approval via updateSession (same as haiku_cowork_review_submit does).
    //    We poll listSessions() for up to 3s to handle async session registration.
    const submitDecision = async (): Promise<void> => {
      const deadline = Date.now() + 3000
      while (Date.now() < deadline) {
        await delay(20)
        const pending = listSessions().filter(
          (s) =>
            s.session_type === "review" &&
            s.status === "pending" &&
            s.intent_slug === SLUG,
        )
        if (pending.length > 0) {
          const session = pending[0]
          if (session.session_type !== "review") continue
          updateSession(session.session_id, {
            status: "decided",
            decision: "approved",
            feedback: "Smoke test LGTM — gate approved",
          })
          return
        }
      }
      throw new Error(
        "Timed out waiting for review session to appear in listSessions()",
      )
    }

    const [runNextResult] = await Promise.all([runNextPromise, submitDecision()])

    // 8. Verify the orchestrator returned an advance_phase action
    const resultText =
      runNextResult.content[0]?.type === "text"
        ? runNextResult.content[0].text
        : ""
    if (runNextResult.isError) {
      throw new Error(`handleOrchestratorTool returned isError: ${resultText}`)
    }
    if (!resultText.includes("advance_phase") && !resultText.includes("intent_approved")) {
      throw new Error(
        `Expected advance_phase or intent_approved action, got:\n${resultText.slice(0, 500)}`,
      )
    }

    // 9. Read state.json and confirm phase === "execute"
    const stateJsonPath = join(
      fixture.root,
      ".haiku",
      "intents",
      SLUG,
      "stages",
      STAGE,
      "state.json",
    )
    const stateRaw = readFileSync(stateJsonPath, "utf8")
    const state = JSON.parse(stateRaw) as Record<string, unknown>

    if (state.phase !== "execute") {
      throw new Error(
        `Expected phase === "execute" in state.json, got: ${JSON.stringify(state.phase)}\nFull state: ${stateRaw}`,
      )
    }

    console.log("PASS")
    process.exitCode = 0
  } catch (err) {
    console.error("FAIL:", err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  } finally {
    // Restore cwd before cleanup
    try {
      chdir(origCwd)
    } catch {
      /* best-effort */
    }
    cleanup?.()
  }
}

main()
