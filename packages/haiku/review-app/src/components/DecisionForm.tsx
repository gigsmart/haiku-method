import { useRef, useState } from "react";
import type { ReviewAnnotations } from "../types";
import { submitDecision, tryCloseTab } from "../hooks/useSession";
import { SubmitSuccess } from "./SubmitSuccess";

interface Props {
  sessionId: string;
  collectAnnotations?: boolean;
  getAnnotations?: () => ReviewAnnotations | undefined;
}

export function DecisionForm({ sessionId, collectAnnotations = false, getAnnotations }: Props) {
  const [mode, setMode] = useState<"buttons" | "feedback">("buttons");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (showClose) {
    return <SubmitSuccess message="Decision submitted!" />;
  }

  async function handleSubmit(decision: "approved" | "changes_requested", feedback: string) {
    setSubmitting(true);
    try {
      const annotations = collectAnnotations && getAnnotations ? getAnnotations() : undefined;
      await submitDecision(sessionId, decision, feedback, annotations);

      const parts: string[] = [];
      if (annotations?.screenshot) parts.push("annotated screenshot");
      if (annotations?.pins?.length) parts.push(`${annotations.pins.length} pin(s)`);
      if (annotations?.comments?.length) parts.push(`${annotations.comments.length} inline comment(s)`);

      setResult({
        success: true,
        message: `Decision submitted: ${decision.replace(/_/g, " ")}${parts.length > 0 ? `. Included: ${parts.join(", ")}` : ""}`,
      });

      tryCloseTab(setShowClose);
    } catch (err) {
      setResult({
        success: false,
        message: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      setSubmitting(false);
    }
  }

  function handleApprove() {
    handleSubmit("approved", "");
  }

  function handleRequestChanges() {
    const text = textareaRef.current?.value.trim() || "";
    if (!text) {
      setFeedbackError(true);
      textareaRef.current?.focus();
      return;
    }
    setFeedbackError(false);
    handleSubmit("changes_requested", text);
  }

  return (
    <div className="mt-8 p-6 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Review Decision</h2>

      {collectAnnotations && (
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          Annotations (pins, drawings, inline comments) will be included with your decision.
        </p>
      )}

      {mode === "buttons" && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Approve
          </button>
          <button
            onClick={() => setMode("feedback")}
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Request Changes
          </button>
        </div>
      )}

      {mode === "feedback" && (
        <div className="mt-4">
          <label htmlFor="feedback-text" className="block text-sm font-medium mb-2 text-stone-700 dark:text-stone-300">
            Describe the changes needed:
          </label>
          <textarea
            ref={textareaRef}
            id="feedback-text"
            className="w-full min-h-[120px] p-3 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-y"
            placeholder="What needs to change?"
            autoFocus
          />
          {feedbackError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              Please describe the changes needed before submitting.
            </p>
          )}
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleRequestChanges}
              disabled={submitting}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Feedback"}
            </button>
            <button
              onClick={() => { setMode("buttons"); setFeedbackError(false); }}
              disabled={submitting}
              className="px-6 py-2.5 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}
