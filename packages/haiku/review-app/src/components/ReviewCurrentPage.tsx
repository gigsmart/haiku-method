import type { ReviewCurrentResponse } from "../types";
import { StageProgressStrip } from "./StageProgressStrip";
import { ReviewContextHeader } from "./ReviewContextHeader";
import { FeedbackPanel } from "./FeedbackPanel";
import { useFeedback } from "../hooks/useFeedback";
import { useCallback } from "react";
import { StatusBadge } from "@haiku/shared";

interface Props {
  data: ReviewCurrentResponse;
}

export function ReviewCurrentPage({ data }: Props) {
  const { items, loading, updateFeedback, deleteFeedback } = useFeedback(
    data.intent,
    data.stage,
  );

  const handleUpdate = useCallback(
    (feedbackId: string, fields: { status?: string }) => {
      updateFeedback(feedbackId, fields).catch(() => {});
    },
    [updateFeedback],
  );

  const handleDelete = useCallback(
    (feedbackId: string) => {
      deleteFeedback(feedbackId).catch(() => {});
    },
    [deleteFeedback],
  );

  const summary = data.feedback_summary;

  return (
    <div>
      {/* Stage progress strip */}
      {data.stages.length > 0 && (
        <div className="mb-4">
          <StageProgressStrip
            stages={data.stages}
            currentStage={data.stage ?? ""}
          />
        </div>
      )}

      {/* Review context header (read-only: no gate since not at a gate) */}
      <ReviewContextHeader
        reviewType="stage"
        stageName={data.stage ?? undefined}
        intentTitle={data.intent}
        gateType="auto"
      />

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Feedback summary */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm p-4 mb-4 bg-white dark:bg-stone-900">
            <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-3">
              Feedback Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryCard label="Pending" count={summary.pending} color="amber" />
              <SummaryCard label="Addressed" count={summary.addressed} color="blue" />
              <SummaryCard label="Closed" count={summary.closed} color="green" />
              <SummaryCard label="Rejected" count={summary.rejected} color="stone" />
            </div>
          </div>

          {/* Units list */}
          {data.units.length > 0 && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm p-4 mb-4 bg-white dark:bg-stone-900">
              <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-3">
                Units ({data.units.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-stone-200 dark:border-stone-700">
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        Unit
                      </th>
                      <th className="py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.units.map((u) => (
                      <tr
                        key={u.slug}
                        className="border-b border-stone-100 dark:border-stone-800"
                      >
                        <td className="py-3 pr-3 font-medium text-sm">
                          {u.title}
                        </td>
                        <td className="py-3">
                          <StatusBadge label="Status" status={u.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stage details */}
          {data.stages.length > 0 && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm p-4 bg-white dark:bg-stone-900">
              <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-3">
                Stages
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-stone-200 dark:border-stone-700">
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        Stage
                      </th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        Status
                      </th>
                      <th className="py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        Phase
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stages.map((s) => (
                      <tr
                        key={s.name}
                        className="border-b border-stone-100 dark:border-stone-800"
                      >
                        <td className="py-3 pr-3 font-medium capitalize text-sm">
                          {s.name}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge label="Status" status={s.status} />
                        </td>
                        <td className="py-3 text-sm text-stone-500 dark:text-stone-400">
                          {s.phase ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-stone-400 dark:text-stone-500 mt-4 text-center italic">
            Read-only overview. Open during a gate review for decision buttons.
          </p>
        </div>

        {/* Feedback sidebar */}
        <aside className="hidden md:flex w-80 lg:w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700">
          <FeedbackPanel
            items={items}
            loading={loading}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  color,
}: { label: string; count: number; color: string }) {
  const bgMap: Record<string, string> = {
    amber: "bg-amber-50 dark:bg-amber-950/20",
    blue: "bg-blue-50 dark:bg-blue-950/20",
    green: "bg-green-50 dark:bg-green-950/20",
    stone: "bg-stone-50 dark:bg-stone-800/30",
  };
  const textMap: Record<string, string> = {
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-green-700 dark:text-green-300",
    stone: "text-stone-500 dark:text-stone-400",
  };
  return (
    <div
      className={`rounded-lg p-4 text-center ${bgMap[color] || bgMap.stone}`}
    >
      <p className={`text-2xl font-bold ${textMap[color] || textMap.stone}`}>
        {count}
      </p>
      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
        {label}
      </p>
    </div>
  );
}
