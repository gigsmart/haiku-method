import { useRef, useState } from "react";
import type { SessionData, QuestionAnswer } from "../types";
import { MarkdownViewer } from "@haiku/shared";
import { submitAnswers, tryCloseTab } from "../hooks/useSession";
import { isMcpAppsHost } from "../host-bridge";
import { BottomSheetDecisionPanelQuestion } from "./iframe/BottomSheetDecisionPanelQuestion";
import { Card, SectionHeading } from "./Card";
import { SubmitSuccess } from "./SubmitSuccess";
import { InlineComments, type InlineComment } from "./InlineComments";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

interface Props {
  session: SessionData;
  sessionId: string;
  wsRef?: React.RefObject<WebSocket | null>;
}

export function QuestionPage({ session, sessionId, wsRef }: Props) {
  const isIframe = isMcpAppsHost();
  const questions = session.questions ?? [];
  const context = session.context ?? "";
  const imageUrls = session.image_urls ?? [];

  const [selections, setSelections] = useState<Map<number, Set<string>>>(
    () => new Map(questions.map((_, i) => [i, new Set<string>()])),
  );
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(
    () => new Map(questions.map((_, i) => [i, ""])),
  );
  const [feedback, setFeedback] = useState("");
  const inlineCommentsRef = useRef<InlineComment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showClose, setShowClose] = useState(false);

  function handleOptionChange(qIndex: number, option: string, checked: boolean) {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = new Set(prev.get(qIndex) ?? []);
      const q = questions[qIndex];

      if (q.multiSelect) {
        if (checked) current.add(option);
        else current.delete(option);
      } else {
        current.clear();
        if (checked) current.add(option);
      }

      next.set(qIndex, current);
      return next;
    });
  }

  function handleOtherText(qIndex: number, text: string) {
    setOtherTexts((prev) => {
      const next = new Map(prev);
      next.set(qIndex, text);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const answers: QuestionAnswer[] = questions.map((q, i) => {
      const selected = selections.get(i) ?? new Set();
      const selectedOptions = Array.from(selected).filter((o) => o !== "__other__");
      const hasOther = selected.has("__other__");
      return {
        question: q.question,
        selectedOptions,
        otherText: hasOther ? (otherTexts.get(i) ?? "").trim() || undefined : undefined,
      };
    });

    const annotations = inlineCommentsRef.current.length > 0
      ? { comments: inlineCommentsRef.current.map(c => ({
          selectedText: c.selectedText,
          comment: c.comment,
          paragraph: c.paragraph,
        })) }
      : undefined;

    try {
      await submitAnswers(sessionId, answers, wsRef, feedback, annotations);
      setResult({ success: true, message: "Answers submitted successfully." });
      tryCloseTab(setShowClose, {
        url: `/question/${sessionId}/answer`,
        body: { answers, feedback, annotations },
      });
    } catch (err) {
      setResult({
        success: false,
        message: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      setSubmitting(false);
    }
  }

  if (showClose) {
    return <SubmitSuccess message="Answers submitted!" />;
  }

  return (
    <>
      {/* Context block */}
      {context && (
        <Card>
          <SectionHeading>Context -- Comment on text</SectionHeading>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">Select text to add inline comments.</p>
          <InlineComments
            htmlContent={markdownToSimpleHtml(context)}
            onCommentsChange={(comments) => { inlineCommentsRef.current = comments; }}
          />
        </Card>
      )}

      {/* Image comparison block */}
      {imageUrls.length > 0 && (
        <Card>
          <SectionHeading>Visual Comparison</SectionHeading>
          {imageUrls.length >= 2 ? (
            // Pair images side-by-side
            Array.from({ length: Math.ceil(imageUrls.length / 2) }, (_, pairIdx) => {
              const refIdx = pairIdx * 2;
              const builtIdx = refIdx + 1;
              return (
                <div key={pairIdx} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-1">Reference</p>
                    <img
                      src={imageUrls[refIdx]}
                      alt={`Reference image ${pairIdx + 1}`}
                      className="w-full rounded-lg border border-stone-200 dark:border-stone-700"
                    />
                  </div>
                  {builtIdx < imageUrls.length && (
                    <div>
                      <p className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-1">Built Output</p>
                      <img
                        src={imageUrls[builtIdx]}
                        alt={`Built output image ${pairIdx + 1}`}
                        className="w-full rounded-lg border border-stone-200 dark:border-stone-700"
                      />
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            imageUrls.map((url, i) => (
              <div key={i} className="mb-4">
                <img
                  src={url}
                  alt={`Image ${i + 1}`}
                  className="w-full rounded-lg border border-stone-200 dark:border-stone-700"
                />
              </div>
            ))
          )}
        </Card>
      )}

      {/* Question form */}
      <form onSubmit={handleSubmit} noValidate>
        {questions.map((q, qIdx) => {
          const inputType = q.multiSelect ? "checkbox" : "radio";
          const selected = selections.get(qIdx) ?? new Set();
          const showOther = selected.has("__other__");

          return (
            <Card key={qIdx}>
              <fieldset>
                <legend className="text-base font-semibold mb-1 text-stone-900 dark:text-stone-100">
                  <MarkdownViewer id={`q-${qIdx}-question`}>{q.question}</MarkdownViewer>
                </legend>
                {q.header && (
                  <div className="text-sm text-stone-500 dark:text-stone-400 mb-3">
                    <MarkdownViewer id={`q-${qIdx}-header`}>{q.header}</MarkdownViewer>
                  </div>
                )}
                <div className="space-y-2">
                  {q.options.map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                    >
                      <input
                        type={inputType}
                        name={`q-${qIdx}`}
                        value={option}
                        checked={selected.has(option)}
                        onChange={(e) => handleOptionChange(qIdx, option, e.target.checked)}
                        className="w-4 h-4 text-teal-600 focus:ring-2 focus:ring-teal-500"
                        aria-label={option}
                        disabled={submitting}
                      />
                      <span className="text-stone-700 dark:text-stone-300">{option}</span>
                    </label>
                  ))}

                  {/* Other option */}
                  <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer transition-colors">
                    <input
                      type={inputType}
                      name={`q-${qIdx}`}
                      value="__other__"
                      checked={selected.has("__other__")}
                      onChange={(e) => handleOptionChange(qIdx, "__other__", e.target.checked)}
                      className="w-4 h-4 text-teal-600 focus:ring-2 focus:ring-teal-500"
                      aria-label="Other"
                      disabled={submitting}
                    />
                    <span className="text-stone-700 dark:text-stone-300">Other</span>
                  </label>

                  {showOther && (
                    <textarea
                      className="w-full ml-7 p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y text-sm"
                      rows={2}
                      placeholder="Please specify..."
                      aria-label={`Other answer for: ${q.question}`}
                      value={otherTexts.get(qIdx) ?? ""}
                      onChange={(e) => handleOtherText(qIdx, e.target.value)}
                      disabled={submitting}
                      autoFocus
                    />
                  )}
                </div>
              </fieldset>
            </Card>
          );
        })}

        <Card>
          <SectionHeading>Additional Feedback</SectionHeading>
          <textarea
            className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y text-sm"
            rows={3}
            placeholder="Any additional notes or feedback..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={submitting}
          />
        </Card>

        {!isIframe && (
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Answers"}
          </button>
        )}

        {!isIframe && result && (
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
      </form>

      {/* Iframe mode: bottom-sheet submit panel */}
      {isIframe && (
        <BottomSheetDecisionPanelQuestion
          sessionId={sessionId}
          answers={questions.map((q, i) => {
            const selected = selections.get(i) ?? new Set<string>();
            const selectedOptions = Array.from(selected).filter((o) => o !== "__other__");
            const hasOther = selected.has("__other__");
            return {
              question: q.question,
              selectedOptions,
              otherText: hasOther ? (otherTexts.get(i) ?? "").trim() || undefined : undefined,
            };
          })}
          feedback={feedback}
          annotations={inlineCommentsRef.current.length > 0 ? {
            comments: inlineCommentsRef.current.map((c) => ({
              selectedText: c.selectedText,
              comment: c.comment,
              paragraph: c.paragraph,
            })),
          } : undefined}
          wsRef={wsRef}
        />
      )}
    </>
  );
}

/** Simple client-side markdown to HTML using remark */
function markdownToSimpleHtml(md: string): string {
  return remark().use(remarkGfm).use(remarkHtml).processSync(md).toString();
}
