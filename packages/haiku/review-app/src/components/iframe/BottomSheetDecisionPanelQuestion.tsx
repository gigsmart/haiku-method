import { useEffect, useRef, useState } from "react";
import type { QuestionAnswer } from "../../types";
import { submitAnswers } from "../../host-bridge";
import { DecisionSuccess } from "./DecisionSuccess";

export type SheetSnap = "collapsed" | "half-pane";

interface Props {
  sessionId: string;
  answers: QuestionAnswer[];
  feedback?: string;
  annotations?: { comments?: Array<{ selectedText: string; comment: string; paragraph: number }> };
  wsRef?: React.RefObject<WebSocket | null>;
}

const MIN_DRAG_PX = 24;
const FLING_VELOCITY = 0.5;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Bottom-sheet submit panel for question sessions in MCP Apps iframe mode.
 */
export function BottomSheetDecisionPanelQuestion({ sessionId, answers, feedback, annotations, wsRef }: Props) {
  const [snap, setSnap] = useState<SheetSnap>("collapsed");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dragStart = useRef<{ y: number; time: number } | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const noTransition = prefersReducedMotion();

  useEffect(() => {
    handleRef.current?.focus();
  }, []);

  function expand() { setSnap("half-pane"); }
  function collapse() {
    setSnap("collapsed");
    handleRef.current?.focus();
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { y: e.clientY, time: e.timeStamp };
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const deltaY = dragStart.current.y - e.clientY;
    const dt = e.timeStamp - dragStart.current.time;
    const velocity = dt > 0 ? Math.abs(deltaY) / dt : 0;
    dragStart.current = null;
    if (Math.abs(deltaY) >= MIN_DRAG_PX || velocity >= FLING_VELOCITY) {
      if (deltaY > 0) expand();
      else collapse();
    }
  }

  function onHandleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") { e.preventDefault(); expand(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); collapse(); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitAnswers(sessionId, answers, wsRef, feedback, annotations);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setSubmitting(false);
    }
  }

  if (done) return <DecisionSuccess variant="approved" />;

  const transitionClass = noTransition ? "" : "transition-all duration-200 ease-out";

  return (
    <div
      className={[
        "sticky bottom-0 z-30 bg-stone-900",
        "border-t-2 border-teal-500",
        transitionClass,
      ].join(" ")}
      style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.4)" }}
      data-snap={snap}
    >
      <h3 id="question-form-heading" className="sr-only">Submit Your Answers</h3>

      {/* Drag handle */}
      <div
        ref={handleRef}
        role="slider"
        aria-label="Submit panel — drag to expand"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={snap === "half-pane" ? 1 : 0}
        tabIndex={0}
        className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing min-h-[44px] items-center"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onHandleKeyDown}
      >
        <div className="w-8 h-1 rounded-full bg-stone-600 hover:bg-stone-400 transition-colors" aria-hidden="true" />
      </div>

      <div className="px-3 pb-3" aria-labelledby="question-form-heading">
        {error && (
          <p role="alert" className="text-xs text-red-400 mb-2">{error}</p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="min-h-[44px] w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-teal-500 text-stone-950 hover:bg-teal-400 active:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Answers"}
        </button>
      </div>
    </div>
  );
}
