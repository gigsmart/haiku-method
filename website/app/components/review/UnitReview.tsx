"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { SessionData } from "./hooks/useReviewSession"

interface Props {
  session: SessionData
  baseUrl: string
}

export function UnitReview({ session, baseUrl }: Props) {
  // For unit reviews, the target unit data is in the session
  const units = (session.units ?? []) as Array<Record<string, unknown>>
  const targetUnit = units[0] // Unit reviews typically focus on a single unit
  const criteria = (session.criteria ?? []) as Array<{ text: string; checked: boolean }>

  if (!targetUnit) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-stone-400">No unit data available.</p>
      </div>
    )
  }

  const title = (targetUnit.title as string) ?? (targetUnit.slug as string) ?? "Unit"
  const status = (targetUnit.status as string) ?? "pending"
  const sections = (targetUnit.sections as Array<{ heading: string; content: string }>) ?? []

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-stone-200">{title}</h1>
          <span className="rounded-full bg-teal-500/20 px-2.5 py-0.5 text-xs font-medium text-teal-400">
            {status}
          </span>
        </div>
      </header>

      {/* Spec sections */}
      {sections.length > 0 && (
        <section className="mb-8" id="section-spec">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Specification
          </h2>
          {sections.map((section, i) => (
            <div key={i} className="mb-6">
              <h3 className="mb-2 text-base font-semibold text-stone-200">{section.heading}</h3>
              <div className="prose prose-invert prose-stone max-w-none text-[15px] leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Criteria section */}
      {criteria.length > 0 && (
        <section className="mb-8" id="section-criteria">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Completion Criteria
          </h2>
          <div className="flex flex-col gap-2">
            {criteria.map((c, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-stone-800 px-4 py-3">
                <div
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${
                    c.checked ? "bg-teal-500 text-teal-950" : "border border-stone-600"
                  }`}
                >
                  {c.checked && <span className="text-xs font-bold">{"\u2713"}</span>}
                </div>
                <span className="text-sm text-stone-300">{c.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mockups */}
      {session.intent_mockups && (session.intent_mockups as Array<Record<string, unknown>>).length > 0 && (
        <section className="mb-8" id="section-mockups">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Mockups
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {(session.intent_mockups as Array<Record<string, unknown>>).map((m, i) => {
              const url = m.url as string | undefined
              const imgSrc = url ? `${baseUrl}${url}` : undefined
              return imgSrc ? (
                <img
                  key={i}
                  src={imgSrc}
                  alt={(m.name as string) ?? `Mockup ${i + 1}`}
                  className="rounded-lg border border-stone-700 cursor-pointer hover:opacity-80 transition-opacity"
                />
              ) : null
            })}
          </div>
        </section>
      )}
    </div>
  )
}
