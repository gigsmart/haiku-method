"use client"

import { useState, useCallback } from "react"
import type { SessionData } from "./hooks/useReviewSession"

interface ReviewSidebarProps {
  sessionType: string
  accentColor: string
  // `null` = not yet checked (suppresses reconnecting indicator on first render)
  isConnected: boolean | null
  session: SessionData
  onSubmitDecision: (
    decision: "approved" | "changes_requested",
    feedback: string,
    annotations?: { comments?: Array<{ selectedText: string; comment: string; paragraph: number }> },
  ) => Promise<boolean>
}

interface Step {
  label: string
  key: string
}

function getSteps(session: SessionData): Step[] {
  if (session.session_type === "review") {
    const steps: Step[] = []
    if (session.intent) {
      // Intent review sections
      steps.push({ label: "Overview", key: "overview" })
      if (session.units?.length) steps.push({ label: "Units", key: "units" })
      if (session.mermaid) steps.push({ label: "Dependencies", key: "dag" })
      if (session.criteria?.length) steps.push({ label: "Criteria", key: "criteria" })
      if (session.knowledge_files?.length) steps.push({ label: "Knowledge", key: "knowledge" })
      if (session.output_artifacts?.length) steps.push({ label: "Artifacts", key: "artifacts" })
    }
    steps.push({ label: "Decision", key: "decision" })
    return steps
  }
  // Question and direction sessions don't use stepped navigation
  return []
}

export function ReviewSidebar({
  sessionType,
  accentColor,
  isConnected,
  session,
  onSubmitDecision,
}: ReviewSidebarProps) {
  const steps = getSteps(session)
  const [currentStep, setCurrentStep] = useState(0)
  const [seenSteps, setSeenSteps] = useState<Set<number>>(() => new Set([0]))
  const [comments, setComments] = useState<Map<number, string>>(() => new Map())
  const [currentComment, setCurrentComment] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const totalComments = Array.from(comments.values()).filter((c) => c.trim()).length
  const isDecisionStep = steps[currentStep]?.key === "decision"

  const navigateToStep = useCallback(
    (index: number) => {
      // Save current comment before navigating
      if (currentComment.trim()) {
        setComments((prev) => new Map(prev).set(currentStep, currentComment))
      } else {
        setComments((prev) => {
          const next = new Map(prev)
          next.delete(currentStep)
          return next
        })
      }
      setCurrentStep(index)
      setSeenSteps((prev) => new Set(prev).add(index))
      setCurrentComment(comments.get(index) ?? "")
    },
    [currentStep, currentComment, comments],
  )

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      navigateToStep(currentStep + 1)
    }
  }, [currentStep, steps.length, navigateToStep])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      navigateToStep(currentStep - 1)
    }
  }, [currentStep, navigateToStep])

  const handleSubmit = useCallback(
    async (decision: "approved" | "changes_requested") => {
      setSubmitting(true)
      // Collect all comments
      const allComments = Array.from(comments.entries())
        .filter(([, text]) => text.trim())
        .map(([stepIdx, text]) => ({
          selectedText: steps[stepIdx]?.label ?? `Step ${stepIdx}`,
          comment: text,
          paragraph: stepIdx,
        }))

      const feedback = allComments.map((c) => `**${c.selectedText}:** ${c.comment}`).join("\n\n")
      const annotations = allComments.length > 0 ? { comments: allComments } : undefined

      const ok = await onSubmitDecision(decision, feedback, annotations)
      setSubmitting(false)
      if (ok) setSubmitted(true)
    },
    [comments, steps, onSubmitDecision],
  )

  if (submitted) {
    return (
      <aside className="flex w-[280px] flex-shrink-0 flex-col items-center justify-center border-r border-stone-800 bg-stone-950 p-6">
        <div className="mb-3 text-3xl">{"\u2705"}</div>
        <p className="text-sm text-stone-300">Review submitted. You can close this tab.</p>
      </aside>
    )
  }

  // Collapsed sidebar
  if (collapsed) {
    return (
      <aside className="flex w-16 flex-shrink-0 flex-col items-center border-r border-stone-800 bg-stone-950 py-6">
        <button
          onClick={() => setCollapsed(false)}
          className="mb-4 flex h-6 w-6 items-center justify-center rounded border border-stone-800 text-xs text-stone-500 hover:bg-stone-800"
        >
          {"\u00BB"}
        </button>
        <div className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <button
              key={step.key}
              onClick={() => { setCollapsed(false); navigateToStep(i) }}
              className="group"
              title={step.label}
            >
              <div
                className={`h-3 w-3 rounded-full transition-colors ${
                  i === currentStep
                    ? "ring-2 ring-offset-1 ring-offset-stone-950"
                    : seenSteps.has(i)
                    ? ""
                    : "border-2 border-stone-700"
                }`}
                style={{
                  backgroundColor: i === currentStep || seenSteps.has(i) ? accentColor : undefined,
                  outlineColor: i === currentStep ? accentColor : undefined,
                  outlineWidth: i === currentStep ? 2 : undefined,
                  outlineOffset: 1,
                  outlineStyle: i === currentStep ? "solid" : undefined,
                }}
              />
            </button>
          ))}
        </div>
        <div className="mt-auto">
          <div
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: isConnected === false ? "#dc2626" : accentColor,
            }}
          />
        </div>
      </aside>
    )
  }

  // Expanded sidebar
  return (
    <aside className="flex w-[280px] flex-shrink-0 flex-col border-r border-stone-800 bg-stone-950 p-6">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <div className="text-lg font-bold tracking-wide text-stone-200">H·AI·K·U</div>
          <div className="text-xs uppercase tracking-widest" style={{ color: accentColor }}>
            {sessionType === "review"
              ? session.review_type === "unit"
                ? "Unit Review"
                : "Intent Review"
              : sessionType === "question"
              ? "Question Session"
              : "Design Direction"}
          </div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="flex h-6 w-6 items-center justify-center rounded border border-stone-800 text-xs text-stone-500 hover:bg-stone-800"
        >
          {"\u00AB"}
        </button>
      </div>

      <div className="mb-5 flex items-center gap-1.5 text-xs text-stone-600">
        <div
          className={`h-1.5 w-1.5 rounded-full ${isConnected === false ? "animate-pulse" : ""}`}
          style={{
            backgroundColor: isConnected === false ? "#fbbf24" : accentColor,
          }}
        />
        {isConnected === false ? "Reconnecting..." : "Connected"}
      </div>

      {steps.length > 0 && (
        <>
          <div className="mb-3 text-xs uppercase tracking-widest text-stone-500">
            Review Steps
          </div>
          <div className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <button
                key={step.key}
                onClick={() => navigateToStep(i)}
                className="flex items-start gap-2.5 text-left"
              >
                <div
                  className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={
                    seenSteps.has(i) && i !== currentStep
                      ? { backgroundColor: accentColor, color: "#042f2e" }
                      : i === currentStep
                      ? { border: `2px solid ${accentColor}`, color: accentColor }
                      : { border: "2px solid #44403c", color: "#78716c" }
                  }
                >
                  {seenSteps.has(i) && i !== currentStep ? "\u2713" : i + 1}
                </div>
                <div>
                  <div
                    className={`text-sm ${
                      i === currentStep ? "font-medium text-stone-200" : "text-stone-400"
                    }`}
                  >
                    {step.label}
                  </div>
                  {seenSteps.has(i) && i !== currentStep && (
                    <div className={`text-xs ${comments.has(i) ? "text-yellow-400" : "text-stone-600"}`}>
                      {comments.has(i) ? "1 comment" : "No comments"}
                    </div>
                  )}
                  {i === currentStep && (
                    <div className="text-xs" style={{ color: accentColor }}>
                      Current step
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-auto border-t border-stone-800 pt-4">
        {isDecisionStep ? (
          <DecisionPanel
            totalComments={totalComments}
            seenSteps={seenSteps.size}
            totalSteps={steps.length - 1}
            accentColor={accentColor}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        ) : (
          <>
            <div className="mb-2 text-xs text-stone-500">Comment on this section:</div>
            <textarea
              className="w-full resize-y rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-teal-500 focus:outline-none"
              style={{ minHeight: 60 }}
              placeholder="Add a comment..."
              value={currentComment}
              onChange={(e) => setCurrentComment(e.target.value)}
            />
            <div className="mt-2 flex justify-between">
              <button
                onClick={handleBack}
                disabled={currentStep === 0}
                className="rounded-md border border-stone-700 px-4 py-1.5 text-xs text-stone-400 hover:bg-stone-800 disabled:opacity-30"
              >
                {"\u2190"} Back
              </button>
              <button
                onClick={handleNext}
                className="rounded-md px-4 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: accentColor, color: "#042f2e" }}
              >
                Next {"\u2192"}
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

function DecisionPanel({
  totalComments,
  seenSteps,
  totalSteps,
  accentColor,
  submitting,
  onSubmit,
}: {
  totalComments: number
  seenSteps: number
  totalSteps: number
  accentColor: string
  submitting: boolean
  onSubmit: (decision: "approved" | "changes_requested") => void
}) {
  const hasComments = totalComments > 0

  return (
    <div>
      <div className={`mb-3 text-xs ${hasComments ? "text-yellow-400" : "text-teal-400"}`}>
        {hasComments
          ? `${totalComments} comment${totalComments > 1 ? "s" : ""} left \u2014 suggesting changes`
          : "No comments \u2014 looks good!"}
      </div>
      {seenSteps < totalSteps && (
        <div className="mb-3 text-xs text-stone-600">
          {seenSteps} of {totalSteps} sections reviewed
        </div>
      )}
      <div className="flex flex-col gap-2">
        {hasComments ? (
          <>
            <button
              onClick={() => onSubmit("changes_requested")}
              disabled={submitting}
              className="w-full rounded-lg border border-red-600 px-5 py-2 text-sm text-red-300 hover:bg-red-900/20 disabled:opacity-50"
            >
              Request Changes
            </button>
            <button
              onClick={() => onSubmit("approved")}
              disabled={submitting}
              className="w-full rounded-lg px-5 py-2 text-sm font-semibold opacity-60 hover:opacity-100 disabled:opacity-30"
              style={{ backgroundColor: accentColor, color: "#042f2e" }}
            >
              Approve Anyway
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onSubmit("approved")}
              disabled={submitting}
              className="w-full rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: accentColor, color: "#042f2e" }}
            >
              Approve
            </button>
            <button
              onClick={() => onSubmit("changes_requested")}
              disabled={submitting}
              className="w-full rounded-lg border border-red-600 px-5 py-2 text-sm text-red-300 opacity-60 hover:opacity-100 disabled:opacity-50"
            >
              Request Changes
            </button>
          </>
        )}
      </div>
    </div>
  )
}
