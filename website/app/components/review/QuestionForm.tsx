"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { SessionData } from "./hooks/useReviewSession"

interface Question {
  question: string
  options: string[]
  multiSelect?: boolean
}

interface Props {
  session: SessionData
  onSubmit: (
    answers: Array<{ question: string; selectedOptions: string[]; otherText?: string }>,
    feedback?: string,
  ) => Promise<boolean>
}

export function QuestionForm({ session, onSubmit }: Props) {
  const questions = (session.questions ?? []) as unknown as Question[]
  const context = (session.context as string) ?? ""

  const [selections, setSelections] = useState<Map<number, Set<string>>>(
    () => new Map(questions.map((_, i) => [i, new Set<string>()])),
  )
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(
    () => new Map(questions.map((_, i) => [i, ""])),
  )
  const [feedback, setFeedback] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function handleOptionChange(qIndex: number, option: string, checked: boolean) {
    setSelections((prev) => {
      const next = new Map(prev)
      const current = new Set(prev.get(qIndex) ?? [])
      const q = questions[qIndex]

      if (q.multiSelect) {
        if (checked) current.add(option)
        else current.delete(option)
      } else {
        current.clear()
        if (checked) current.add(option)
      }

      next.set(qIndex, current)
      return next
    })
  }

  function handleOtherText(qIndex: number, text: string) {
    setOtherTexts((prev) => {
      const next = new Map(prev)
      next.set(qIndex, text)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const answers = questions.map((q, i) => {
      const selected = selections.get(i) ?? new Set()
      const selectedOptions = Array.from(selected).filter((o) => o !== "__other__")
      const hasOther = selected.has("__other__")
      return {
        question: q.question,
        selectedOptions,
        otherText: hasOther ? (otherTexts.get(i) ?? "").trim() || undefined : undefined,
      }
    })

    const ok = await onSubmit(answers, feedback || undefined)
    setSubmitting(false)
    if (ok) setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="mb-3 text-3xl">{"\u2705"}</div>
          <p className="text-sm text-stone-300">Answers submitted. You can close this tab.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2">
        <span className="text-xs uppercase tracking-widest font-medium text-amber-500">
          Question {questions.length > 1 ? `(${questions.length} questions)` : ""}
        </span>
      </div>

      {context && (
        <div className="mb-8 prose prose-invert prose-stone max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{context}</ReactMarkdown>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {questions.map((q, qIdx) => (
          <div key={qIdx} className="rounded-xl border border-stone-700 bg-stone-800 p-6">
            <h3 className="mb-4 text-base font-semibold text-stone-200">{q.question}</h3>
            <div className="flex flex-col gap-2">
              {q.options.map((opt) => {
                const selected = selections.get(qIdx)?.has(opt) ?? false
                return (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                      selected
                        ? "border-amber-600 bg-amber-900/20 text-stone-200"
                        : "border-stone-700 bg-stone-900 text-stone-300 hover:border-stone-600"
                    }`}
                  >
                    <input
                      type={q.multiSelect ? "checkbox" : "radio"}
                      name={`q-${qIdx}`}
                      checked={selected}
                      onChange={(e) => handleOptionChange(qIdx, opt, e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded ${
                        q.multiSelect ? "rounded" : "rounded-full"
                      } ${
                        selected
                          ? "bg-amber-500 text-amber-950"
                          : "border border-stone-600"
                      }`}
                    >
                      {selected && <span className="text-[10px] font-bold">{"\u2713"}</span>}
                    </div>
                    {opt}
                  </label>
                )
              })}
              {/* Other option */}
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                  selections.get(qIdx)?.has("__other__")
                    ? "border-amber-600 bg-amber-900/20 text-stone-200"
                    : "border-stone-700 bg-stone-900 text-stone-300 hover:border-stone-600"
                }`}
              >
                <input
                  type={q.multiSelect ? "checkbox" : "radio"}
                  name={`q-${qIdx}`}
                  checked={selections.get(qIdx)?.has("__other__") ?? false}
                  onChange={(e) => handleOptionChange(qIdx, "__other__", e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center ${
                    q.multiSelect ? "rounded" : "rounded-full"
                  } ${
                    selections.get(qIdx)?.has("__other__")
                      ? "bg-amber-500 text-amber-950"
                      : "border border-stone-600"
                  }`}
                >
                  {selections.get(qIdx)?.has("__other__") && (
                    <span className="text-[10px] font-bold">{"\u2713"}</span>
                  )}
                </div>
                Other
              </label>
              {selections.get(qIdx)?.has("__other__") && (
                <textarea
                  className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
                  placeholder="Type your answer..."
                  value={otherTexts.get(qIdx) ?? ""}
                  onChange={(e) => handleOtherText(qIdx, e.target.value)}
                  rows={2}
                />
              )}
            </div>
          </div>
        ))}

        <div>
          <label className="mb-2 block text-xs text-stone-500">Additional feedback (optional)</label>
          <textarea
            className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
            placeholder="Any additional context..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Answers"}
        </button>
      </form>
    </div>
  )
}
