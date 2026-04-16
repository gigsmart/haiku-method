interface Props {
  reviewType: "intent" | "elaboration" | "stage" | "final";
  stageName?: string;
  intentTitle?: string;
  gateType?: "ask" | "external" | "auto";
}

const reviewTypeLabels: Record<string, string> = {
  intent: "Review Intent",
  elaboration: "Review Elaboration",
  stage: "Review Stage",
  final: "Final Review",
};

const gateTypeBadge: Record<string, { label: string; classes: string }> = {
  ask: {
    label: "Local Review",
    classes: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
  external: {
    label: "External Review",
    classes: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  auto: {
    label: "Auto Gate",
    classes: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  },
};

export function ReviewContextHeader({ reviewType, stageName, intentTitle, gateType }: Props) {
  const baseLabel = reviewTypeLabels[reviewType] || "Review";
  const suffix =
    reviewType === "elaboration" && stageName
      ? `: ${stageName}`
      : reviewType === "stage" && stageName
        ? `: ${stageName}`
        : reviewType === "final" && intentTitle
          ? `: ${intentTitle}`
          : "";

  const badge = gateType ? gateTypeBadge[gateType] : null;

  return (
    <div className="flex items-center gap-4 px-4 py-3 mb-4 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700">
      <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
        {baseLabel}
        {suffix}
      </h2>
      {badge && (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.classes}`}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
