import { useCallback, useEffect, useRef, useState } from "react";

export interface InlineComment {
  selectedText: string;
  comment: string;
  paragraph: number;
  /** File or section this comment is in — set by parent component */
  location?: string;
}

interface Props {
  htmlContent: string;
  /** Location context passed to each comment (e.g., "knowledge/DISCOVERY.md" or "Unit 01: Login Screen") */
  location?: string;
  /** Called whenever the comments list changes, so the parent can track them */
  onCommentsChange?: (comments: InlineComment[]) => void;
}

export function InlineComments({ htmlContent, location, onCommentsChange }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [comments, setComments] = useState<InlineCommentEntry[]>([]);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const pendingSelectionRef = useRef<{
    text: string;
    range: Range;
    paragraph: number;
  } | null>(null);
  const [activeComment, setActiveComment] = useState<number | null>(null);

  interface InlineCommentEntry extends InlineComment {
    highlightEl: HTMLElement | null;
  }

  function getParagraphIndex(node: Node): number {
    const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
    if (!el || !contentRef.current) return 0;
    let block: HTMLElement | null = el;
    while (block && block.parentElement !== contentRef.current) {
      block = block.parentElement;
    }
    if (!block) return 0;
    return Array.from(contentRef.current.children).indexOf(block);
  }

  function handleMouseUp() {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setPopoverPos(null);
        return;
      }

      const range = sel.getRangeAt(0);
      if (!contentRef.current?.contains(range.commonAncestorContainer)) {
        setPopoverPos(null);
        return;
      }

      const text = sel.toString().trim();
      if (!text) {
        setPopoverPos(null);
        return;
      }

      pendingSelectionRef.current = {
        text,
        range: range.cloneRange(),
        paragraph: getParagraphIndex(range.startContainer),
      };

      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        setPopoverPos({
          x: rect.left + rect.width / 2 - containerRect.left - 40,
          y: rect.top - containerRect.top - 40,
        });
      }
    }, 10);
  }

  function handleAddComment() {
    const selData = pendingSelectionRef.current;
    if (!selData) return;

    // Wrap selection in highlight span
    let highlightEl: HTMLElement | null = document.createElement("span");
    highlightEl.className = "inline-highlight";
    highlightEl.setAttribute("role", "mark");
    highlightEl.setAttribute("aria-label", `Commented text, annotation ${comments.length + 1}`);

    try {
      selData.range.surroundContents(highlightEl);
    } catch {
      try {
        const fragment = selData.range.extractContents();
        highlightEl.appendChild(fragment);
        selData.range.insertNode(highlightEl);
      } catch {
        highlightEl = null;
      }
    }

    const entry: InlineCommentEntry = {
      selectedText: selData.text,
      comment: "",
      paragraph: selData.paragraph,
      location,
      highlightEl,
    };

    setComments((prev) => {
      const next = [...prev, entry];
      onCommentsChange?.(next);
      return next;
    });
    setPopoverPos(null);
    pendingSelectionRef.current = null;
    // Don't clear selection — keep the text highlighted via the span
  }

  function updateCommentText(index: number, text: string) {
    setComments((prev) => {
      const next = prev.map((c, i) => (i === index ? { ...c, comment: text } : c));
      onCommentsChange?.(next);
      return next;
    });
  }

  function removeComment(index: number) {
    const comment = comments[index];
    // Unwrap highlight
    if (comment.highlightEl?.parentNode) {
      const parent = comment.highlightEl.parentNode;
      while (comment.highlightEl.firstChild) {
        parent.insertBefore(comment.highlightEl.firstChild, comment.highlightEl);
      }
      parent.removeChild(comment.highlightEl);
      (parent as Element).normalize?.();
    }
    setComments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      onCommentsChange?.(next);
      return next;
    });
    setActiveComment(null);
  }

  // Close popover on outside clicks
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        setPopoverPos(null);
      }
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, []);

  // Cross-highlighting: manage hover effects on highlight elements
  useEffect(() => {
    comments.forEach((c, i) => {
      if (c.highlightEl) {
        const el = c.highlightEl;
        el.setAttribute("data-comment-idx", String(i));
      }
    });
  }, [comments]);

  function truncate(text: string, max: number) {
    if (text.length <= max) return text;
    return text.substring(0, max) + "...";
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-4">
        {/* Content area */}
        <div className="flex-1 min-w-0">
          <div
            ref={contentRef}
            className="prose prose-sm prose-stone dark:prose-invert max-w-none
              prose-code:bg-stone-100 prose-code:dark:bg-stone-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-stone-100 prose-pre:dark:bg-stone-800 prose-pre:rounded-lg
              prose-table:border-collapse prose-th:border prose-th:border-stone-300 prose-th:dark:border-stone-600 prose-th:px-3 prose-th:py-1.5
              prose-td:border prose-td:border-stone-300 prose-td:dark:border-stone-600 prose-td:px-3 prose-td:py-1.5
              selection:bg-amber-200 dark:selection:bg-amber-700/50"
            onMouseUp={handleMouseUp}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>

        {/* Margin comments panel */}
        <div className="w-64 shrink-0 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 600 }}>
          <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800">
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              Comments <span className="text-stone-400 dark:text-stone-500">({comments.length})</span>
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {comments.length === 0 && (
              <p className="text-xs text-stone-400 dark:text-stone-500 italic p-2">
                Select text in the content to add a comment.
              </p>
            )}
            {comments.map((c, i) => (
              <div
                key={i}
                className={`margin-comment bg-stone-50 dark:bg-stone-800/50 ${activeComment === i ? "active" : ""}`}
                onMouseEnter={() => {
                  setActiveComment(i);
                  c.highlightEl?.classList.add("active");
                }}
                onMouseLeave={() => {
                  setActiveComment(null);
                  c.highlightEl?.classList.remove("active");
                }}
              >
                <div className="flex items-start gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full text-[10px] font-bold inline-flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(251,191,36,0.8)", color: "#78350f" }}>
                    {i + 1}
                  </span>
                  <p
                    className="text-xs text-stone-500 dark:text-stone-400 italic truncate flex-1"
                    title={c.selectedText}
                  >
                    &ldquo;{truncate(c.selectedText, 50)}&rdquo;
                  </p>
                  <button
                    type="button"
                    className="text-stone-400 hover:text-red-500 text-xs"
                    aria-label={`Delete comment ${i + 1}`}
                    title="Delete"
                    onClick={() => removeComment(i)}
                  >
                    &times;
                  </button>
                </div>
                <textarea
                  className="w-full text-xs p-1.5 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 resize-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  rows={2}
                  placeholder="Add your comment..."
                  aria-label={`Comment for highlighted text: ${truncate(c.selectedText, 30)}`}
                  value={c.comment}
                  onChange={(e) => updateCommentText(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating "Add Comment" button */}
      {popoverPos && (
        <div
          ref={popoverRef}
          className="absolute z-50 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-lg shadow-lg px-3 py-1.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
          style={{ left: popoverPos.x, top: popoverPos.y }}
          role="button"
          tabIndex={0}
          aria-label="Add comment on selected text"
          onClick={handleAddComment}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleAddComment();
            }
          }}
        >
          <span className="text-sm font-medium text-teal-600 dark:text-teal-400">+ Comment</span>
        </div>
      )}
    </div>
  );
}

/** Get current inline comments for capture */
export function getInlineComments(comments: InlineComment[]): InlineComment[] {
  return comments.map((c) => ({
    selectedText: c.selectedText,
    comment: c.comment,
    paragraph: c.paragraph,
  }));
}
