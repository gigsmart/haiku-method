interface Props {
  value: number;
  max: number;
  className?: string;
}

export function ProgressBar({ value, max, className = "" }: Props) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const isComplete = pct >= 100;

  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800 ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${isComplete ? "bg-green-500" : "bg-teal-500"}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}
