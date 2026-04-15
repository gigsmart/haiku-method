import { useState } from "react";

interface Props {
  feature: string;
  errorCode: string;
}

/**
 * Sandbox-restriction error card.
 * Shown when the iframe sandbox blocks a feature the SPA needs
 * (e.g. clipboard-write).
 */
export function SandboxErrorScreen({ feature, errorCode }: Props) {
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-xl p-5 flex flex-col gap-4"
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-amber-950/40 flex items-center justify-center" aria-hidden="true">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v-4m0-4h.01M3 7l9-4 9 4v10l-9 4-9-4V7z" />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-base font-semibold text-stone-100 mb-1">Feature Blocked</h2>
          <p className="text-sm text-stone-300">
            The iframe sandbox blocked: <code className="font-mono text-amber-400">{feature}</code>
          </p>
        </div>

        {/* Error code */}
        <div className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-center">
          <code className="text-xs font-mono text-amber-400">{errorCode}</code>
        </div>

        {/* "Why this happens" disclosure */}
        <details
          open={disclosureOpen}
          onToggle={(e) => setDisclosureOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="bg-stone-950 border border-stone-800 rounded-lg"
        >
          <summary
            aria-expanded={disclosureOpen}
            className="px-3 py-2.5 text-sm text-stone-400 cursor-pointer hover:text-stone-200 transition-colors list-none flex items-center justify-between min-h-[44px]"
          >
            Why this happens
            <span aria-hidden="true" className={`text-xs transition-transform ${disclosureOpen ? "rotate-180" : ""}`}>▼</span>
          </summary>
          <div className="px-3 pb-3 pt-1 text-xs text-stone-400 leading-relaxed">
            <p>
              The host application runs this review UI inside a sandboxed iframe. The sandbox
              policy restricts certain browser APIs (like clipboard access) to prevent cross-frame
              data leaks.
            </p>
            <p className="mt-2">
              To resolve this, ask the host application to include{" "}
              <code className="font-mono text-stone-300">allow-{feature}</code> in its iframe
              sandbox attribute.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
