import { useState } from "react";

export interface TrayComment {
  type: "inline" | "pin";
  text: string;
  comment: string;
  id: string;
}

interface Props {
  comments: TrayComment[];
  onDelete: (id: string) => void;
  onEdit?: (id: string, newComment: string) => void;
  onClearAll: () => void;
  onScrollTo: (id: string) => void;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + "...";
}

export function CommentTray({ comments, onDelete, onEdit, onClearAll, onScrollTo }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  if (comments.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Expanded list */}
      {expanded && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="bg-white dark:bg-stone-900 border border-b-0 border-stone-200 dark:border-stone-700 rounded-t-xl shadow-xl max-h-64 overflow-y-auto">
            <div className="p-3 space-y-2">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer group transition-colors"
                  onClick={() => { if (editingId !== c.id) onScrollTo(c.id); }}
                >
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold inline-flex items-center justify-center mt-0.5 ${
                      c.type === "pin"
                        ? "bg-rose-600 text-white"
                        : "text-amber-900"
                    }`}
                    style={c.type === "inline" ? { background: "rgba(251,191,36,0.8)" } : undefined}
                  >
                    {c.type === "pin" ? "\u25CF" : "\u270E"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-500 dark:text-stone-400 italic truncate">
                      &ldquo;{truncate(c.text, 60)}&rdquo;
                    </p>
                    {editingId === c.id ? (
                      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          className="w-full min-h-[48px] p-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              onEdit?.(c.id, editText.trim());
                              setEditingId(null);
                              setEditText("");
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingId(null);
                              setEditText("");
                            }
                          }}
                        />
                        <div className="flex justify-end gap-2 mt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(null);
                              setEditText("");
                            }}
                            className="px-2 py-0.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit?.(c.id, editText.trim());
                              setEditingId(null);
                              setEditText("");
                            }}
                            className="px-2 py-0.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      c.comment && (
                        <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5 line-clamp-2">
                          {c.comment}
                        </p>
                      )
                    )}
                  </div>
                  {editingId !== c.id && (
                    <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onEdit && (
                        <button
                          type="button"
                          className="text-stone-400 hover:text-teal-500 text-sm"
                          aria-label="Edit comment"
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(c.id);
                            setEditText(c.comment);
                          }}
                        >
                          &#9998;
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-stone-400 hover:text-red-500 text-sm"
                        aria-label="Delete comment"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c.id);
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Collapsed bar */}
      <div className="bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-bold"
            >
              {comments.length}
            </span>
            <span>{comments.length === 1 ? "1 comment" : `${comments.length} comments`}</span>
            <span
              className="text-stone-400 transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
              aria-hidden="true"
            >
              &#9650;
            </span>
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={onClearAll}
            className="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
