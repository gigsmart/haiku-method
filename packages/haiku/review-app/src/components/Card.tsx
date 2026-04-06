import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: Props) {
  return (
    <div className={`bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6 mb-6 ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({ children, level = 2 }: { children: ReactNode; level?: 2 | 3 }) {
  const Tag = level === 2 ? "h2" : "h3";
  const size = level === 2 ? "text-lg" : "text-base";
  return (
    <Tag className={`${size} font-semibold mb-3 text-stone-900 dark:text-stone-100`}>
      {children}
    </Tag>
  );
}
