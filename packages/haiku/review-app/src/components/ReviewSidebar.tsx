import { useRef, useState } from "react";
import type { ReviewAnnotations } from "../types";
import { submitDecision, tryCloseTab } from "../hooks/useSession";
import { SubmitSuccess } from "./SubmitSuccess";

export interface SidebarComment {
  type: "inline" | "pin" | "general";
  text: string;
  comment: string;
  id: string;
}

interface Props {
  sessionId: string;
  comments: SidebarComment[];
  getAnnotations: () => ReviewAnnotations | undefined;
  wsRef?: React.RefObject<WebSocket | null>;
  onDelete: (id: string) => void;
  onEdit: (id: string, newComment: string) => void;
  onClearAll: () => void;
  onScrollTo: (id: string) => void;
  onAddGeneral: (comment: string) => void;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + "\u2026";
}

function typeIcon(type: string): string {
  if (type === "pin") return "\u{1F4CC}";
  if (type === "inline") return "\u270E";
  return "\u{1F4AC}";
}

export function ReviewSidebar({ sessionId, comments, getAnnotations, wsRef, onDelete, onEdit, onClearAll, onScrollTo, onAddGeneral }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [generalText, setGeneralText] = useState("");
  const [promptForComment, setPromptForComment] = useState(false);
  const generalRef = useRef<HTMLTextAreaElement>(null);

  const hasComments = comments.length > 0;

  if (showClose) {
    return (
      <aside className="w-80 lg:w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700">
        <div className="flex-1 flex items-center justify-center p-6">
          <SubmitSuccess message="Decision submitted!" />
        </div>
      </aside>
    );
  }

  async function handleApprove() {
    if (hasComments) return; // should be disabled
    setSubmitting(true);
    setError(null);
    try {
      const annotations = getAnnotations();
      await submitDecision(sessionId, "approved", "", annotations, wsRef);
      tryCloseTab(setShowClose, { url: `/review/${sessionId}/decide`, body: { decision: "approved", feedback: "" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  async function handleRequestChanges() {
    // Must have at least one comment or general text
    if (!hasComments && !generalText.trim()) {
      setPromptForComment(true);
      generalRef.current?.focus();
      return;
    }
    // If general text was typed but not added as a comment, add it
    if (generalText.trim()) {
      onAddGeneral(generalText.trim());
      setGeneralText("");
    }
    setSubmitting(true);
    setError(null);
    try {
      const annotations = getAnnotations();
      // Build feedback from all comments
      const allComments = [...comments];
      if (generalText.trim()) {
        allComments.push({ type: "general", text: "", comment: generalText.trim(), id: "pending-general" });
      }
      const feedback = allComments
        .map((c) => c.type === "general" ? c.comment : `[${c.type}] "${truncate(c.text, 40)}": ${c.comment}`)
        .filter((s) => s.length > 0)
        .join("\n\n");

      await submitDecision(sessionId, "changes_requested", feedback, annotations, wsRef);
      tryCloseTab(setShowClose, { url: `/review/${sessionId}/decide`, body: { decision: "changes_requested", feedback } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  function handleAddGeneral() {
    const text = generalText.trim();
    if (!text) return;
    onAddGeneral(text);
    setGeneralText("");
    setPromptForComment(false);
  }

  return (
    <aside className="hidden md:flex w-80 lg:w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">
          Review
          {comments.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold">
              {comments.length}
            </span>
          )}
        </h2>
        {comments.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {comments.length === 0 && (
          <p className="text-xs text-stone-400 dark:text-stone-500 italic p-2 text-center">
            No comments yet. Select text or drop pins to add feedback.
          </p>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className="p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-transparent hover:border-teal-400 dark:hover:border-teal-500 transition-colors cursor-pointer group"
            onClick={() => { if (editingId !== c.id && c.type !== "general") onScrollTo(c.id); }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm" aria-hidden="true">{typeIcon(c.type)}</span>
              <span className="text-xs font-medium text-stone-600 dark:text-stone-400 flex-1 truncate">
                {c.type === "general" ? "General comment" : c.type === "pin" ? "Pin annotation" : `"${truncate(c.text, 30)}"`}
              </span>
              <button
                type="button"
                className="text-stone-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete"
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              >
                &times;
              </button>
            </div>

            {editingId === c.id ? (
              <div onClick={(e) => e.stopPropagation()}>
                <textarea
                  className="w-full text-xs p-1.5 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 resize-none focus:ring-1 focus:ring-teal-500"
                  rows={2}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      onEdit(c.id, editText.trim());
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <div className="flex justify-end gap-1 mt-1">
                  <button type="button" onClick={() => setEditingId(null)} className="px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded">Cancel</button>
                  <button type="button" onClick={() => { onEdit(c.id, editText.trim()); setEditingId(null); }} className="px-2 py-0.5 text-xs text-white bg-teal-600 hover:bg-teal-700 rounded">Save</button>
                </div>
              </div>
            ) : (
              <>
                {c.comment && (
                  <p className="text-xs text-stone-700 dark:text-stone-300 mt-0.5 line-clamp-3">{c.comment}</p>
                )}
                {!c.comment && c.type !== "general" && (
                  <button
                    type="button"
                    className="text-xs text-teal-600 dark:text-teal-400 mt-0.5 hover:underline"
                    onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditText(""); }}
                  >
                    Add comment...
                  </button>
                )}
                {c.comment && (
                  <button
                    type="button"
                    className="text-xs text-stone-400 hover:text-teal-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditText(c.comment); }}
                  >
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Footer: general comment input + decision buttons */}
      <div className="shrink-0 border-t border-stone-200 dark:border-stone-700 p-3 space-y-3 bg-stone-50/50 dark:bg-stone-800/50">
        {/* General comment input */}
        <div className="flex gap-2">
          <textarea
            ref={generalRef}
            className={`flex-1 text-xs p-2 border rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 resize-none focus:ring-1 focus:ring-teal-500 ${
              promptForComment ? "border-amber-500 ring-1 ring-amber-500" : "border-stone-300 dark:border-stone-600"
            }`}
            rows={2}
            placeholder="Add a comment..."
            value={generalText}
            onChange={(e) => { setGeneralText(e.target.value); setPromptForComment(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAddGeneral();
              }
            }}
            disabled={submitting}
          />
          <button
            type="button"
            onClick={handleAddGeneral}
            disabled={!generalText.trim() || submitting}
            className="self-end px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
        {promptForComment && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Add at least one comment before requesting changes.</p>
        )}

        {/* Decision buttons */}
        <div className="space-y-2">
          {hasComments ? (
            <>
              <button
                onClick={handleRequestChanges}
                disabled={submitting}
                className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting\u2026" : "Request Changes"}
              </button>
              <p className="text-xs text-stone-500 dark:text-stone-400 text-center">
                Clear all comments to approve instead.
              </p>
            </>
          ) : (
            <>
              <button
                onClick={handleApprove}
                disabled={submitting}
                className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting\u2026" : "Approve"}
              </button>
              <button
                onClick={handleRequestChanges}
                disabled={submitting}
                className="w-full px-4 py-2 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Request Changes
              </button>
            </>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </aside>
  );
}
