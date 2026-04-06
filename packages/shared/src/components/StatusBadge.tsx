const colors: Record<string, string> = {
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  complete: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  in_progress: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  active: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  pending: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  unit: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  intent: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

interface Props {
  label?: string;
  status: string;
  className?: string;
}

export function StatusBadge({ label, status, className = "" }: Props) {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  const colorClass = colors[normalized] ?? colors.pending;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass} ${className}`}
      aria-label={label ? `${label}: ${status}` : status}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
