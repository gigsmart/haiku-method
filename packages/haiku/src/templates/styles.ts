import { tailwindCSS } from "./tailwind-generated.js";

/** Inline <style> block containing all Tailwind utilities used by the templates. */
export const inlineStyles = `<style>${tailwindCSS}</style>`;

/** Status -> class mappings for badges. */
export const statusColors: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  completed: { bg: "bg-green-100", text: "text-green-800", darkBg: "dark:bg-green-900/40", darkText: "dark:text-green-300" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-800", darkBg: "dark:bg-blue-900/40", darkText: "dark:text-blue-300" },
  pending: { bg: "bg-gray-100", text: "text-gray-800", darkBg: "dark:bg-gray-700/40", darkText: "dark:text-gray-300" },
  blocked: { bg: "bg-red-100", text: "text-red-800", darkBg: "dark:bg-red-900/40", darkText: "dark:text-red-300" },
  opus: { bg: "bg-purple-100", text: "text-purple-800", darkBg: "dark:bg-purple-900/40", darkText: "dark:text-purple-300" },
  sonnet: { bg: "bg-cyan-100", text: "text-cyan-800", darkBg: "dark:bg-cyan-900/40", darkText: "dark:text-cyan-300" },
  haiku: { bg: "bg-indigo-100", text: "text-indigo-800", darkBg: "dark:bg-indigo-900/40", darkText: "dark:text-indigo-300" },
};
