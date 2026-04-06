/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/templates/*.ts"],
  darkMode: "class",
  // Dynamic class names constructed at runtime (e.g. lg:grid-cols-${N})
  safelist: ["lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3"],
  theme: {
    extend: {
      colors: {
        status: {
          completed: { DEFAULT: "#16a34a", light: "#dcfce7", dark: "#166534" },
          in_progress: { DEFAULT: "#2563eb", light: "#dbeafe", dark: "#1e40af" },
          pending: { DEFAULT: "#6b7280", light: "#f3f4f6", dark: "#374151" },
          blocked: { DEFAULT: "#dc2626", light: "#fee2e2", dark: "#991b1b" },
        },
        approve: { DEFAULT: "#16a34a", hover: "#15803d" },
        changes: { DEFAULT: "#d97706", hover: "#b45309" },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
