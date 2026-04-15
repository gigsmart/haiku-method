import { useEffect, useRef } from "react";

export type DecisionVariant = "approved" | "changes_requested" | "external_review";

interface Props {
  variant: DecisionVariant;
}

const VARIANT_CONFIG: Record<DecisionVariant, { label: string; icon: string; color: string; bg: string }> = {
  approved: {
    label: "Approved",
    icon: "✓",
    color: "text-teal-400",
    bg: "bg-teal-950/40",
  },
  changes_requested: {
    label: "Changes Requested",
    icon: "↩",
    color: "text-amber-400",
    bg: "bg-amber-950/40",
  },
  external_review: {
    label: "Submitted for External Review",
    icon: "↗",
    color: "text-indigo-400",
    bg: "bg-indigo-950/40",
  },
};

/**
 * Success state shown after a decision is submitted in iframe mode.
 * Stays visible until the host unmounts the iframe.
 * Focus moves to the heading on mount.
 * No window.close, no navigation.
 */
export function DecisionSuccess({ variant }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const config = VARIANT_CONFIG[variant];

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-xl p-6 flex flex-col items-center gap-4 text-center">
        {/* Icon */}
        <div className={`w-14 h-14 rounded-full ${config.bg} flex items-center justify-center`} aria-hidden="true">
          <span className={`text-2xl font-bold ${config.color}`}>{config.icon}</span>
        </div>

        {/* Heading — receives focus on mount */}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className={`text-lg font-semibold ${config.color} focus:outline-none`}
        >
          {config.label}
        </h2>

        <p className="text-sm text-stone-400">
          Your decision has been submitted. This panel will close automatically.
        </p>
      </div>
    </div>
  );
}
