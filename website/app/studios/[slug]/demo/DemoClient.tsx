"use client"

import { useDemoEngine } from "@/lib/demo/engine"
import type { DemoConfig } from "@/lib/demo/types"
import { useCallback, useEffect, useRef } from "react"

interface Props {
  config: DemoConfig
}

// ── File Tree Helpers ──

interface TreeNode {
  [key: string]: TreeNode | null
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = {}
  for (const p of files) {
    const parts = p.split("/")
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (i === parts.length - 1) {
        if (!node[seg]) node[seg] = null
      } else {
        if (!node[seg]) node[seg] = {}
        node = node[seg] as TreeNode
      }
    }
  }
  return root
}

function renderTreeNodes(
  node: TreeNode,
  depth: number,
  parentPath: string,
  highlightedFile: string | null,
): React.ReactNode[] {
  const keys = Object.keys(node).sort((a, b) => {
    const aDir = node[a] !== null
    const bDir = node[b] !== null
    if (aDir && !bDir) return -1
    if (!aDir && bDir) return 1
    return a.localeCompare(b)
  })
  const items: React.ReactNode[] = []
  for (const key of keys) {
    const fullPath = parentPath ? `${parentPath}/${key}` : key
    const isDir = node[key] !== null
    const isHighlighted = fullPath === highlightedFile
    items.push(
      <div
        key={fullPath}
        data-path={fullPath}
        className={`whitespace-nowrap demo-animate-in ${isDir ? "text-stone-500" : "text-stone-400"} ${isHighlighted ? "demo-highlight-glow" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <span className="mr-1.5 inline-block w-4 text-center">
          {isDir ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}
        </span>
        {key}
      </div>,
    )
    if (isDir) {
      items.push(
        ...renderTreeNodes(node[key] as TreeNode, depth + 1, fullPath, highlightedFile),
      )
    }
  }
  return items
}

// ── Escape HTML for safe rendering ──

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ── Main Component ──

export function DemoClient({ config }: Props) {
  const {
    state,
    togglePlayPause,
    reset,
    setSpeed,
    setMobileTab,
    stepForward,
    stepBackward,
    totalSteps,
  } = useDemoEngine(config)

  const terminalRef = useRef<HTMLDivElement>(null)

  // Auto-scroll terminal on new messages
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [state.messages.length, state.typing, state.fastForward])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      switch (e.key) {
        case " ":
          e.preventDefault()
          togglePlayPause()
          break
        case "r":
        case "R":
          reset()
          break
        case "1":
          setSpeed(1)
          break
        case "2":
          setSpeed(2)
          break
        case "4":
          setSpeed(4)
          break
        case "ArrowRight":
          e.preventDefault()
          stepForward()
          break
        case "ArrowLeft":
          e.preventDefault()
          stepBackward()
          break
      }
    },
    [togglePlayPause, reset, setSpeed, stepForward, stepBackward],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Handle completion overlay trigger from __SHOW_COMPLETION__ system message
  const isComplete =
    state.messages.some((m) => m.text === "__SHOW_COMPLETION__") ||
    state.completed

  // Filter out the __SHOW_COMPLETION__ sentinel from displayed messages
  const displayMessages = state.messages.filter(
    (m) => m.text !== "__SHOW_COMPLETION__",
  )

  const tree = buildTree(state.files)
  const progressPct = Math.min(100, (state.stepIndex / totalSteps) * 100)

  // Board columns data
  const boardColumns = config.stages.map((stage) => {
    const cards = state.cards.filter((c) => c.stage === stage)
    let colStatus: "dimmed" | "active" | "completed" | "none" = "dimmed"
    if (state.allStagesComplete || state.completedStages.includes(stage)) {
      colStatus = "completed"
    } else if (state.activeStage === stage) {
      colStatus = "active"
    } else if (
      state.activeStage &&
      config.stages.indexOf(stage) < config.stages.indexOf(state.activeStage)
    ) {
      colStatus = "completed"
    }
    return { stage, cards, colStatus }
  })

  // Stage badge display
  const stageBadgeText = state.allStagesComplete
    ? "complete"
    : state.activeStage || "ready"
  const stageBadgeIsComplete = state.allStagesComplete
  const stageBadgeIsIdle = !state.activeStage && !state.allStagesComplete

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-950 font-sans text-stone-200">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-stone-800 bg-stone-950 px-5 py-3 max-[600px]:px-3 max-[600px]:py-2.5">
        <h1 className="text-base font-semibold tracking-wide text-teal-400 max-[600px]:text-[13px]">
          H&#183;AI&#183;K&#183;U{" "}
          <span className="font-normal text-stone-400 max-[600px]:hidden">
            in Action
          </span>
        </h1>
        <div className="flex items-center gap-3 max-[600px]:gap-1.5">
          {/* Step counter */}
          <span className="font-mono text-xs tracking-wide text-stone-500">
            {state.stepIndex}/{totalSteps}
            {state.activeStage && !state.allStagesComplete && (
              <span className="ml-2 font-semibold text-teal-400">
                {state.activeStage}
              </span>
            )}
            {state.allStagesComplete && (
              <span className="ml-2 font-semibold text-green-500">
                complete
              </span>
            )}
          </span>

          {/* Play/Pause button */}
          <button
            onClick={togglePlayPause}
            title="Play / Pause (Space)"
            className={`cursor-pointer rounded-md border px-3.5 py-1.5 font-sans text-[13px] transition-all max-[600px]:px-2 max-[600px]:py-1 max-[600px]:text-[11px] ${
              state.playing
                ? "border-teal-400 bg-teal-400 text-stone-950"
                : "border-stone-700 bg-stone-900 text-stone-200 hover:border-teal-400 hover:text-teal-400"
            }`}
          >
            {state.playing ? "\u23F8 Pause" : "\u25B6 Play"}
          </button>

          {/* Step backward/forward */}
          <button
            onClick={stepBackward}
            title="Step Back"
            disabled={state.stepIndex === 0}
            className="cursor-pointer rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 font-sans text-[13px] text-stone-200 transition-all hover:border-teal-400 hover:text-teal-400 disabled:opacity-30 disabled:cursor-default max-[600px]:px-1.5 max-[600px]:py-1 max-[600px]:text-[11px]"
          >
            &#9664;
          </button>
          <button
            onClick={stepForward}
            title="Step Forward"
            disabled={state.stepIndex >= totalSteps}
            className="cursor-pointer rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 font-sans text-[13px] text-stone-200 transition-all hover:border-teal-400 hover:text-teal-400 disabled:opacity-30 disabled:cursor-default max-[600px]:px-1.5 max-[600px]:py-1 max-[600px]:text-[11px]"
          >
            &#9654;
          </button>

          {/* Speed buttons */}
          <div className="flex gap-1 max-[900px]:hidden">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`cursor-pointer rounded border px-2.5 py-1 font-sans text-xs transition-all ${
                  state.speed === s
                    ? "border-teal-400 bg-teal-400 text-stone-950"
                    : "border-stone-700 bg-stone-900 text-stone-200 hover:border-teal-400 hover:text-teal-400"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Restart button */}
          <button
            onClick={reset}
            title="Restart (R)"
            className="cursor-pointer rounded-md border border-stone-700 bg-stone-900 px-3.5 py-1.5 font-sans text-[13px] text-stone-200 transition-all hover:border-teal-400 hover:text-teal-400 max-[600px]:px-2 max-[600px]:py-1 max-[600px]:text-[11px]"
          >
            &#8634;
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] shrink-0 bg-stone-800">
        <div
          className="h-full bg-gradient-to-r from-teal-600 to-teal-400 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Mobile tabs */}
      <div className="hidden shrink-0 border-b border-stone-800 bg-stone-950 max-[600px]:flex">
        {(["terminal", "artifacts", "board"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 cursor-pointer border-b-2 bg-transparent py-2 font-sans text-xs font-semibold transition-all ${
              state.mobileTab === tab
                ? "border-teal-400 text-teal-400"
                : "border-transparent text-stone-500"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        {/* Terminal panel */}
        <div
          className={`flex flex-[0_0_60%] flex-col border-r border-stone-800 bg-stone-950 max-[900px]:flex-1 max-[900px]:border-b max-[900px]:border-r-0 max-[600px]:flex-1 max-[600px]:border-b-0 max-[600px]:border-r-0 ${
            state.mobileTab !== "terminal" ? "max-[600px]:hidden" : ""
          }`}
        >
          {/* Terminal header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-stone-800 px-4 py-2.5 text-xs text-stone-500">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
            </div>
            <span>claude &mdash; ~/my-app</span>
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                stageBadgeIsComplete
                  ? "border-green-500 bg-green-500/10 text-green-500"
                  : stageBadgeIsIdle
                    ? "border-stone-700 bg-transparent text-stone-500"
                    : "border-teal-600 bg-teal-400/15 text-teal-400"
              }`}
            >
              {stageBadgeText}
            </span>
          </div>

          {/* Terminal body */}
          <div
            ref={terminalRef}
            className="flex-1 overflow-y-auto scroll-smooth p-4 font-mono text-[13px] leading-[1.7] max-[600px]:p-3 max-[600px]:text-xs max-[600px]:leading-[1.6] [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-stone-700 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
          >
            {displayMessages.map((msg, i) => (
              <div key={i} className="mb-3 demo-animate-in">
                <div
                  className={`text-[11px] font-semibold uppercase tracking-widest ${
                    msg.role === "user"
                      ? "text-indigo-400"
                      : msg.role === "agent"
                        ? "text-teal-400"
                        : "text-amber-400"
                  }`}
                >
                  {msg.label}
                </div>
                <div
                  className={`whitespace-pre-wrap ${
                    msg.role === "system"
                      ? "italic text-amber-400"
                      : "text-stone-200"
                  }`}
                  dangerouslySetInnerHTML={{ __html: escapeHtml(msg.text) }}
                />
              </div>
            ))}

            {/* Typing indicator */}
            {state.typing && (
              <div className="mb-3 demo-animate-in">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-teal-400">
                  agent
                </div>
                <div className="inline-flex gap-1 py-1">
                  <span className="demo-typing-dot h-1.5 w-1.5 rounded-full bg-teal-400" />
                  <span className="demo-typing-dot h-1.5 w-1.5 rounded-full bg-teal-400" />
                  <span className="demo-typing-dot h-1.5 w-1.5 rounded-full bg-teal-400" />
                </div>
              </div>
            )}

            {/* Fast-forward indicator */}
            {state.fastForward && (
              <div className="demo-ff-pulse my-2 inline-flex items-center gap-1.5 rounded-md bg-stone-800 px-3 py-1.5 text-xs text-amber-400">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-3.5 w-3.5"
                >
                  <polygon points="13 19 22 12 13 5" />
                  <polygon points="2 19 11 12 2 5" />
                </svg>
                Fast-forwarding {state.fastForward}s of deep work...
              </div>
            )}
          </div>
        </div>

        {/* Right panels */}
        <div
          className={`flex flex-[0_0_40%] flex-col overflow-hidden max-[900px]:flex-1 ${
            state.mobileTab === "terminal" ? "max-[600px]:hidden" : ""
          }`}
        >
          {/* Artifact panel */}
          <div
            className={`flex flex-1 flex-col overflow-hidden border-b border-stone-800 bg-stone-900 ${
              state.mobileTab === "board" ? "max-[600px]:hidden" : ""
            }`}
          >
            <div className="shrink-0 border-b border-stone-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500 max-[600px]:px-3 max-[600px]:py-2 max-[600px]:text-[11px]">
              Artifacts
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-[1.8] max-[600px]:p-2 max-[600px]:text-[11px] max-[600px]:leading-[1.6] [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-stone-700 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
              {renderTreeNodes(tree, 0, "", state.highlightedFile)}
            </div>
          </div>

          {/* Board panel */}
          <div
            className={`flex min-h-[200px] max-h-[260px] flex-[0_0_auto] flex-col overflow-hidden bg-stone-900 ${
              state.mobileTab === "artifacts" ? "max-[600px]:hidden" : ""
            }`}
          >
            <div className="shrink-0 border-b border-stone-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500 max-[600px]:px-3 max-[600px]:py-2 max-[600px]:text-[11px]">
              Lifecycle Board
            </div>
            <div className="flex flex-1 gap-2.5 overflow-x-auto overflow-y-hidden p-3 [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-stone-700 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5">
              {boardColumns.map(({ stage, cards, colStatus }) => (
                <div
                  key={stage}
                  className={`flex flex-[0_0_130px] flex-col gap-1.5 transition-opacity duration-300 max-[900px]:flex-[0_0_110px] max-[600px]:flex-[0_0_100px] ${
                    colStatus === "dimmed" ? "opacity-35" : ""
                  } ${colStatus === "active" ? "demo-stage-flash" : ""}`}
                >
                  <div
                    className={`border-b-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider transition-all max-[600px]:text-[9px] ${
                      colStatus === "active"
                        ? "border-teal-400 text-teal-400"
                        : colStatus === "completed"
                          ? "border-green-500 text-green-500"
                          : "border-stone-700 text-stone-500"
                    }`}
                  >
                    {stage}
                  </div>
                  <div className="flex min-h-[30px] flex-col gap-1">
                    {cards.map((card) => (
                      <div
                        key={card.name}
                        className={`rounded border p-1.5 font-mono text-[11px] transition-all duration-300 demo-animate-in max-[600px]:p-1 max-[600px]:text-[10px] ${
                          card.status === "in-progress"
                            ? "border-teal-400 bg-teal-400/[0.08] text-teal-400"
                            : card.status === "completed"
                              ? "border-green-500 bg-green-500/[0.08] text-green-500"
                              : "border-stone-700 bg-stone-800 text-stone-400"
                        }`}
                      >
                        {card.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Review overlay */}
      {state.review.visible && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/[0.92] transition-opacity duration-400">
          <div className="w-[480px] max-w-[90vw] overflow-hidden rounded-2xl border border-teal-600 bg-stone-900 shadow-[0_0_60px_rgba(45,212,191,0.12)] demo-animate-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
              <h3 className="text-base font-bold text-teal-400">
                {state.review.title} Review
              </h3>
              <span className="rounded-xl border border-teal-600 bg-teal-400/15 px-2.5 py-0.5 text-[11px] text-teal-400">
                {state.review.gateType}
              </span>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <h4 className="mb-3 text-[13px] font-semibold text-stone-200">
                {state.review.intent}
              </h4>

              {/* Design review wireframe */}
              {state.review.isDesignReview && (
                <div className="mb-4 flex flex-col items-center gap-3 rounded-lg border border-stone-700 bg-stone-800 p-5">
                  <div className="w-full max-w-[220px] rounded-md border border-teal-600 p-3.5 text-center text-[13px] font-semibold text-teal-400">
                    Logo
                  </div>
                  <div className="w-full max-w-[220px] rounded-md border border-dashed border-teal-600 bg-teal-400/[0.08] p-2 text-center text-[11px] text-teal-400">
                    Sign in with Google
                  </div>
                  <div className="w-full max-w-[220px] rounded-md border border-dashed border-teal-600 bg-teal-400/[0.08] p-2 text-center text-[11px] text-teal-400">
                    Sign in with GitHub
                  </div>
                  <div className="w-full max-w-[220px] text-center text-[10px] text-stone-500 underline">
                    Forgot password?
                  </div>
                </div>
              )}

              {/* Criteria checklist */}
              {state.review.criteria.length > 0 && (
                <ul className="mb-4 space-y-1">
                  {state.review.criteria.map((criterion, i) => {
                    const isChecked =
                      state.review.checkedIndexes.includes(i)
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-2 font-mono text-xs text-stone-400"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] transition-all duration-300 ${
                            isChecked
                              ? "border-green-500 bg-green-500/15 text-green-500"
                              : "border-stone-700"
                          }`}
                          style={{
                            transitionDelay: isChecked
                              ? `${(i + 1) * 400}ms`
                              : "0ms",
                          }}
                        >
                          {isChecked && "\u2713"}
                        </span>
                        {criterion}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 border-t border-stone-800 px-6 py-4">
              <div className="flex-1 rounded-lg border border-stone-700 bg-stone-800 py-2.5 text-center text-[13px] font-semibold text-stone-400">
                Request Changes
              </div>
              <div
                className={`flex-1 rounded-lg bg-green-500 py-2.5 text-center text-[13px] font-semibold text-stone-950 transition-all duration-300 ${
                  state.review.approveHighlighted
                    ? "scale-[1.03] shadow-[0_0_16px_rgba(34,197,94,0.4)]"
                    : ""
                }`}
              >
                Approve Stage
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion overlay */}
      {/* Completion shows inline, not as overlay */}

      {/* Keyboard hint */}
      <div className="pointer-events-none fixed bottom-3 left-1/2 z-[5] -translate-x-1/2 font-mono text-[11px] text-stone-500 opacity-50 max-[900px]:hidden">
        <kbd className="mx-0.5 inline-block rounded border border-stone-700 bg-stone-800 px-1.5 py-px text-[10px]">
          Space
        </kbd>{" "}
        play/pause{" "}
        <kbd className="mx-0.5 inline-block rounded border border-stone-700 bg-stone-800 px-1.5 py-px text-[10px]">
          R
        </kbd>{" "}
        restart{" "}
        <kbd className="mx-0.5 inline-block rounded border border-stone-700 bg-stone-800 px-1.5 py-px text-[10px]">
          1
        </kbd>
        <kbd className="mx-0.5 inline-block rounded border border-stone-700 bg-stone-800 px-1.5 py-px text-[10px]">
          2
        </kbd>
        <kbd className="mx-0.5 inline-block rounded border border-stone-700 bg-stone-800 px-1.5 py-px text-[10px]">
          4
        </kbd>{" "}
        speed{" "}
        <kbd className="mx-0.5 inline-block rounded border border-stone-700 bg-stone-800 px-1.5 py-px text-[10px]">
          ← →
        </kbd>{" "}
        step
      </div>
    </div>
  )
}
