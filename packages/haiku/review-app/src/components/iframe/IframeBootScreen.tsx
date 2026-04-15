import { useEffect, useReducer, useRef } from "react";

export type BootPhase = "loading" | "connecting" | "ready" | "done";

interface Props {
  /** The current boot phase driven by the parent */
  phase: BootPhase;
  /** Called when the fade-out animation completes and the screen should unmount */
  onDone?: () => void;
}

/**
 * Three-phase loading screen shown before session data hydrates in MCP Apps iframe mode.
 * Phases: loading → connecting → ready → (fade out) → done (parent unmounts).
 *
 * Respects prefers-reduced-motion: no spinner animation, no fade transition.
 */
export function IframeBootScreen({ phase, onDone }: Props) {
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  // When phase becomes "ready", trigger fade-out then notify done
  // biome-ignore lint/correctness/useExhaustiveDependencies: onDone is stable
  useEffect(() => {
    if (phase !== "ready") return;
    if (prefersReducedMotion.current) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => onDone?.(), 220);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "done") return null;

  const isFadingOut = phase === "ready" && !prefersReducedMotion.current;

  const phaseLabel =
    phase === "loading" ? "Loading\u2026" :
    phase === "connecting" ? "Connecting\u2026" :
    "Ready";

  const phaseColor =
    phase === "loading" ? "text-stone-300" :
    phase === "connecting" ? "text-teal-400" :
    "text-teal-500";

  return (
    <div
      role="status"
      aria-label={phaseLabel}
      aria-live="polite"
      className={[
        "absolute inset-0 z-50 flex flex-col items-center justify-center bg-stone-950",
        isFadingOut ? "opacity-0 transition-opacity duration-200 ease-out" : "opacity-100",
      ].join(" ")}
    >
      {prefersReducedMotion.current ? (
        <p className="text-sm text-stone-300">Loading\u2026</p>
      ) : (
        <>
          <div
            className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-stone-800 border-t-teal-500"
            aria-hidden="true"
          />
          <p className={`text-sm ${phaseColor} transition-colors`}>{phaseLabel}</p>
        </>
      )}
    </div>
  );
}
