"use client"

import { useState, useCallback, useRef } from "react"
import type { SessionData } from "./hooks/useReviewSession"

interface Archetype {
  name: string
  description: string
  preview_html: string
  default_parameters: Record<string, number>
}

interface Parameter {
  name: string
  label: string
  description: string
  min: number
  max: number
  step: number
  default: number
  labels: { low: string; high: string }
}

interface Props {
  session: SessionData
  onSubmit: (archetype: string, parameters: Record<string, number>, comments?: string) => Promise<boolean>
}

export function DirectionPicker({ session, onSubmit }: Props) {
  const archetypes = (session.archetypes ?? []) as unknown as Archetype[]
  const parameters = (session.parameters ?? []) as unknown as Parameter[]

  const [selectedArchetype, setSelectedArchetype] = useState(archetypes[0]?.name ?? "")
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {}
    for (const p of parameters) {
      defaults[p.name] = p.default
    }
    if (archetypes[0]) {
      for (const [k, v] of Object.entries(archetypes[0].default_parameters)) {
        defaults[k] = v
      }
    }
    return defaults
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [previewModal, setPreviewModal] = useState<{ name: string; html: string } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const selectArchetype = useCallback(
    (name: string) => {
      setSelectedArchetype(name)
      const arch = archetypes.find((a) => a.name === name)
      if (arch) {
        setParamValues((prev) => ({ ...prev, ...arch.default_parameters }))
      }
    },
    [archetypes],
  )

  async function handleSubmit() {
    if (!selectedArchetype) return
    setSubmitting(true)
    const ok = await onSubmit(selectedArchetype, paramValues)
    setSubmitting(false)
    if (ok) setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="mb-3 text-3xl">{"\u2705"}</div>
          <p className="text-sm text-stone-300">
            Direction selected: <strong>{selectedArchetype}</strong>. You can close this tab.
          </p>
        </div>
      </div>
    )
  }

  const gridCols =
    archetypes.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : archetypes.length === 3
      ? "grid-cols-1 sm:grid-cols-3"
      : "grid-cols-1 sm:grid-cols-2"

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2">
        <span className="text-xs uppercase tracking-widest font-medium text-indigo-400">
          Design Direction
        </span>
      </div>
      <h1 className="mb-6 text-xl font-semibold text-stone-200">Choose a direction</h1>

      {/* Archetype cards */}
      <div className={`grid ${gridCols} gap-4 mb-8`}>
        {archetypes.map((arch) => {
          const isSelected = selectedArchetype === arch.name
          return (
            <button
              key={arch.name}
              onClick={() => selectArchetype(arch.name)}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                isSelected
                  ? "border-indigo-500 bg-indigo-900/20"
                  : "border-stone-700 bg-stone-800 hover:border-stone-600"
              }`}
            >
              {/* Thumbnail preview */}
              <div
                className="mb-3 h-32 overflow-hidden rounded-lg border border-stone-700 bg-stone-900"
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewModal({ name: arch.name, html: arch.preview_html })
                }}
              >
                <iframe
                  srcDoc={arch.preview_html}
                  className="pointer-events-none h-[400px] w-[800px] origin-top-left scale-[0.25] sm:scale-[0.3]"
                  sandbox="allow-same-origin"
                  title={arch.name}
                />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded-full ${
                    isSelected
                      ? "bg-indigo-500 text-indigo-950"
                      : "border border-stone-600"
                  }`}
                >
                  {isSelected && <span className="text-[8px] font-bold">{"\u2713"}</span>}
                </div>
                <span className="text-sm font-semibold text-stone-200">{arch.name}</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">{arch.description}</p>
            </button>
          )
        })}
      </div>

      {/* Parameter sliders */}
      {parameters.length > 0 && (
        <div className="mb-8 rounded-xl border border-stone-700 bg-stone-800 p-6">
          <h2 className="mb-4 text-sm font-semibold text-stone-300">Tune Parameters</h2>
          <div className="flex flex-col gap-5">
            {parameters.map((p) => (
              <div key={p.name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-stone-300">{p.label}</span>
                  <span className="text-stone-500">{paramValues[p.name] ?? p.default}</span>
                </div>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={paramValues[p.name] ?? p.default}
                  onChange={(e) =>
                    setParamValues((prev) => ({ ...prev, [p.name]: Number(e.target.value) }))
                  }
                  className="w-full accent-indigo-500"
                />
                <div className="mt-0.5 flex justify-between text-[10px] text-stone-600">
                  <span>{p.labels.low}</span>
                  <span>{p.labels.high}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedArchetype}
        className="w-full rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : `Select "${selectedArchetype}"`}
      </button>

      {/* Fullscreen preview modal */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl border border-stone-700 bg-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-700 px-4 py-2">
              <span className="text-sm font-medium text-stone-300">{previewModal.name}</span>
              <button
                onClick={() => setPreviewModal(null)}
                className="text-stone-500 hover:text-stone-300"
              >
                {"\u2715"}
              </button>
            </div>
            <iframe
              ref={iframeRef}
              srcDoc={previewModal.html}
              className="h-[80vh] w-[80vw]"
              sandbox="allow-same-origin"
              title={previewModal.name}
            />
          </div>
        </div>
      )}
    </div>
  )
}
