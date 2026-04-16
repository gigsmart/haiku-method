import { useState } from "react";
import type { FeedbackItemData } from "../types";

// ── Design tokens from DESIGN-TOKENS.md ─────────────────────────────────

const feedbackStatusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  addressed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
};

const originColors: Record<string, string> = {
  "adversarial-review": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "external-pr": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "external-mr": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "user-visual": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  "user-chat": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  agent: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

const statusBorderLeft: Record<string, string> = {
  pending: "border-l-[3px] border-l-amber-400 dark:border-l-amber-500",
  addressed: "border-l-[3px] border-l-blue-400 dark:border-l-blue-500",
  closed: "border-l-[3px] border-l-green-400 dark:border-l-green-500",
  rejected: "border-l-[3px] border-l-stone-300 dark:border-l-stone-600",
};

const statusBackground: Record<string, string> = {
  pending: "bg-amber-50/50 dark:bg-amber-950/20",
  addressed: "bg-blue-50/50 dark:bg-blue-950/20",
  closed: "bg-green-50/30 dark:bg-green-950/15",
  rejected: "bg-stone-50 dark:bg-stone-800/30",
};

function visitCounterClasses(visits: number): string {
  if (visits <= 1) return "hidden";
  if (visits <= 3) return "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300";
  if (visits <= 5) return "bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}

// ── Component ───────────────────────────────────────────────────────────

interface Props {
  items: FeedbackItemData[];
  loading: boolean;
  onUpdate?: (feedbackId: string, fields: { status?: string }) => void;
  onDelete?: (feedbackId: string) => void;
}

type FilterMode = "all" | "pending" | "addressed";
type TabMode = "feedback" | "mine";

export function FeedbackPanel({ items, loading, onUpdate, onDelete }: Props) {
  const [tab, setTab] = useState<TabMode>("feedback");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = items.filter((item) => {
    if (tab === "mine" && item.author_type !== "human") return false;
    if (filter === "pending" && item.status !== "pending") return false;
    if (filter === "addressed" && item.status !== "addressed") return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Segmented toggle */}
      <div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
        <div className="flex gap-1 p-0.5 rounded-lg bg-stone-100 dark:bg-stone-800">
          <button
            type="button"
            onClick={() => setTab("feedback")}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === "feedback"
                ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm"
                : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
            }`}
          >
            Feedback ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === "mine"
                ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm"
                : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
            }`}
          >
            Mine ({items.filter((i) => i.author_type === "human").length})
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5 mt-2">
          {(["all", "pending", "addressed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
                filter === f
                  ? "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700"
                  : "border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-600"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-xs text-stone-400 dark:text-stone-500 italic p-4 text-center">
            No feedback items match the current filter.
          </p>
        )}

        {!loading &&
          filtered.map((item) => {
            const isExpanded = expandedId === item.feedback_id;
            return (
              <div
                key={item.feedback_id}
                className={`p-2.5 rounded-lg border ${statusBorderLeft[item.status] || ""} ${statusBackground[item.status] || ""} hover:border-teal-400 dark:hover:border-teal-500 transition-colors cursor-pointer group`}
                onClick={() => setExpandedId(isExpanded ? null : item.feedback_id)}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${feedbackStatusColors[item.status] || ""}`}
                  >
                    {item.status}
                  </span>

                  {/* Origin badge */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${originColors[item.origin] || originColors.agent}`}
                  >
                    {item.origin}
                  </span>

                  {/* Visit counter */}
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none ${visitCounterClasses(item.visit)}`}
                  >
                    {item.visit}x
                  </span>
                </div>

                <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                  {item.title}
                </p>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="mt-2">
                    <p className="text-xs text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
                      {item.body}
                    </p>

                    {item.addressed_by && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Addressed by: {item.addressed_by}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-1 mt-2">
                      {item.status === "pending" && onUpdate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdate(item.feedback_id, { status: "closed" });
                          }}
                          className="text-xs font-medium px-2 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors"
                        >
                          Close
                        </button>
                      )}
                      {item.status === "pending" && onUpdate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdate(item.feedback_id, { status: "rejected" });
                          }}
                          className="text-xs font-medium px-2 py-1 rounded-md bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 transition-colors"
                        >
                          Reject
                        </button>
                      )}
                      {(item.status === "closed" || item.status === "rejected") && onUpdate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdate(item.feedback_id, { status: "pending" });
                          }}
                          className="text-xs font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 transition-colors"
                        >
                          Reopen
                        </button>
                      )}
                      {item.status !== "pending" && onDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.feedback_id);
                          }}
                          className="text-xs font-medium px-2 py-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
