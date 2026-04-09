"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { SessionData } from "./hooks/useReviewSession"

interface Props {
  session: SessionData
  baseUrl: string
}

export function IntentReview({ session, baseUrl }: Props) {
  const intent = session.intent as { sections?: Array<{ heading: string; content: string }> } | undefined
  const units = (session.units ?? []) as Array<Record<string, unknown>>
  const criteria = (session.criteria ?? []) as Array<{ text: string; checked: boolean }>
  const mermaid = session.mermaid as string | undefined
  const knowledgeFiles = session.knowledge_files ?? []
  const artifacts = session.output_artifacts ?? []

  return (
    <div className="mx-auto max-w-3xl">
      {/* Overview section */}
      {intent && (
        <section className="mb-8" id="section-overview">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Overview
          </h2>
          {intent.sections &&
            intent.sections.map((section, i) => (
              <div key={i} className="mb-6">
                <h3 className="mb-2 text-base font-semibold text-stone-200">{section.heading}</h3>
                <div className="prose prose-invert prose-stone max-w-none text-[15px] leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                </div>
              </div>
            ))}
        </section>
      )}

      {/* Units section */}
      {units.length > 0 && (
        <section className="mb-8" id="section-units">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Units
          </h2>
          <div className="flex flex-col gap-2">
            {units.map((unit, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-stone-800 px-4 py-3"
              >
                <span className="text-sm text-stone-200">
                  {(unit.title as string) ?? (unit.slug as string) ?? `Unit ${i + 1}`}
                </span>
                <span className="text-xs text-teal-500">
                  {(unit.status as string) ?? "pending"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DAG section */}
      {mermaid && (
        <section className="mb-8" id="section-dag">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Dependencies
          </h2>
          <div className="rounded-lg bg-stone-800 p-4">
            <pre className="overflow-x-auto text-xs text-stone-300">{mermaid}</pre>
          </div>
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
                    c.checked
                      ? "bg-teal-500 text-teal-950"
                      : "border border-stone-600"
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

      {/* Knowledge section */}
      {knowledgeFiles.length > 0 && (
        <section className="mb-8" id="section-knowledge">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Knowledge
          </h2>
          {knowledgeFiles.map((kf, i) => (
            <div key={i} className="mb-4 rounded-lg bg-stone-800 p-4">
              <h3 className="mb-2 text-sm font-medium text-stone-300">{kf.name}</h3>
              <div className="prose prose-invert prose-stone max-w-none text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{kf.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Artifacts section */}
      {artifacts.length > 0 && (
        <section className="mb-8" id="section-artifacts">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
            Output Artifacts
          </h2>
          <div className="flex flex-col gap-2">
            {artifacts.map((a, i) => {
              const artifact = a as Record<string, unknown>
              const relativePath = artifact.relativePath as string | undefined
              const imgSrc = relativePath ? `${baseUrl}${relativePath}` : undefined
              return (
                <div key={i} className="rounded-lg bg-stone-800 p-4">
                  <div className="text-sm font-medium text-stone-300">
                    {(artifact.name as string) ?? `Artifact ${i + 1}`}
                  </div>
                  {artifact.type === "image" && imgSrc && (
                    <img
                      src={imgSrc}
                      alt={(artifact.name as string) ?? "artifact"}
                      className="mt-2 max-h-64 rounded border border-stone-700"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
