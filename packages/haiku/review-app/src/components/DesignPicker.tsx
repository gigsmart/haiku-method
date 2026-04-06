import { useState } from "react";
import type { SessionData, DesignArchetypeData, DesignParameterData } from "../types";
import { submitDesignDirection, tryCloseTab } from "../hooks/useSession";
import { Card, SectionHeading } from "./Card";
import { SubmitSuccess } from "./SubmitSuccess";

interface Props {
  session: SessionData;
  sessionId: string;
}

export function DesignPicker({ session, sessionId }: Props) {
  const archetypes = session.archetypes ?? [];
  const parameters = session.parameters ?? [];

  const [selectedArchetype, setSelectedArchetype] = useState(archetypes[0]?.name ?? "");
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {};
    for (const p of parameters) {
      defaults[p.name] = p.default;
    }
    // Apply first archetype's defaults
    if (archetypes[0]) {
      for (const [k, v] of Object.entries(archetypes[0].default_parameters)) {
        defaults[k] = v;
      }
    }
    return defaults;
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showClose, setShowClose] = useState(false);

  function selectArchetype(name: string) {
    setSelectedArchetype(name);
    const arch = archetypes.find((a) => a.name === name);
    if (arch) {
      setParamValues((prev) => ({ ...prev, ...arch.default_parameters }));
    }
  }

  function setParam(name: string, value: number) {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit() {
    if (!selectedArchetype) return;
    setSubmitting(true);

    try {
      await submitDesignDirection(sessionId, selectedArchetype, paramValues);
      setResult({ success: true, message: `Direction selected: ${selectedArchetype}` });
      tryCloseTab(setShowClose);
    } catch (err) {
      setResult({
        success: false,
        message: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      setSubmitting(false);
    }
  }

  if (showClose) {
    return <SubmitSuccess message={`Direction selected: ${selectedArchetype}`} />;
  }

  const gridCols =
    archetypes.length <= 1 ? "sm:grid-cols-1" :
    archetypes.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <>
      {/* Archetype Gallery */}
      <Card>
        <SectionHeading>Design Direction</SectionHeading>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          Select an archetype, tune the parameters, then submit your choice.
        </p>

        <div
          role="radiogroup"
          aria-label="Design archetypes"
          className={`grid gap-4 ${gridCols}`}
          onKeyDown={(e) => {
            const names = archetypes.map((a) => a.name);
            const idx = names.indexOf(selectedArchetype);
            let nextIdx: number | undefined;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (idx + 1) % names.length;
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIdx = (idx - 1 + names.length) % names.length;
            if (nextIdx !== undefined) {
              e.preventDefault();
              selectArchetype(names[nextIdx]);
            }
          }}
        >
          {archetypes.map((arch) => {
            const isSelected = arch.name === selectedArchetype;
            return (
              <div
                key={arch.name}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectArchetype(arch.name)}
                className={`group relative rounded-xl border-2 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-stone-900 ${
                  isSelected
                    ? "border-teal-600 dark:border-teal-400 bg-teal-50 dark:bg-teal-900/20"
                    : "border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? "border-teal-600 dark:border-teal-400"
                          : "border-stone-300 dark:border-stone-600"
                      }`}
                    >
                      {isSelected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-teal-600 dark:bg-teal-400" />
                      )}
                    </span>
                    <h3 className="font-semibold text-stone-900 dark:text-stone-100">{arch.name}</h3>
                  </div>
                  <p className="text-sm text-stone-600 dark:text-stone-400 mb-3">{arch.description}</p>
                  <iframe
                    srcDoc={arch.preview_html}
                    sandbox=""
                    title={`Preview: ${arch.name}`}
                    className="w-full h-32 rounded-lg border border-stone-200 dark:border-stone-700 bg-white pointer-events-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Parameter Tuners */}
      {parameters.length > 0 && (
        <Card>
          <SectionHeading>Parameters</SectionHeading>
          <div className="space-y-5">
            {parameters.map((p) => (
              <div key={p.name}>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor={`param-${p.name}`}
                    className="text-sm font-medium text-stone-900 dark:text-stone-100"
                  >
                    {p.label}
                  </label>
                  <output
                    htmlFor={`param-${p.name}`}
                    className="text-sm font-mono text-teal-600 dark:text-teal-400"
                  >
                    {paramValues[p.name] ?? p.default}
                  </output>
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 mb-2">{p.description}</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-500 dark:text-stone-400 w-16 text-right shrink-0">
                    {p.labels.low}
                  </span>
                  <input
                    type="range"
                    id={`param-${p.name}`}
                    name={p.name}
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={paramValues[p.name] ?? p.default}
                    onChange={(e) => setParam(p.name, Number.parseFloat(e.target.value))}
                    aria-label={p.label}
                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-stone-200 dark:bg-stone-700 accent-teal-600 dark:accent-teal-400"
                  />
                  <span className="text-xs text-stone-500 dark:text-stone-400 w-16 shrink-0">
                    {p.labels.high}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !selectedArchetype}
        className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting..." : "Choose This Direction"}
      </button>

      {result && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            result.success
              ? "bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
          }`}
        >
          <p className="font-semibold">{result.message}</p>
          {result.success && <p className="text-sm mt-1">You can close this tab.</p>}
        </div>
      )}
    </>
  );
}
