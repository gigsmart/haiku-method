import type { CriterionItem } from "../types";

interface Props {
  criteria: CriterionItem[];
  className?: string;
}

export function CriteriaChecklist({ criteria, className = "" }: Props) {
  if (criteria.length === 0) {
    return <p className="text-stone-500 dark:text-stone-400 italic">No criteria defined.</p>;
  }

  return (
    <ol className={`space-y-2 ${className}`}>
      {criteria.map((c, i) => (
        <li
          key={i}
          className={`flex items-start gap-3 px-5 py-3 rounded-lg ${
            c.checked
              ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
              : "bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700"
          }`}
        >
          <div
            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${
              c.checked
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "bg-stone-100 text-stone-400 dark:bg-stone-800"
            }`}
          >
            {c.checked ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <span className="h-3 w-3" />
            )}
          </div>
          <span
            className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
              c.checked
                ? "bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300"
                : "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-400"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={
              c.checked
                ? "text-green-800 dark:text-green-200"
                : "text-stone-700 dark:text-stone-300"
            }
          >
            {c.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
