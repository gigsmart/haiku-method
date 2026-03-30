/** Tailwind CDN config script — extends theme with status colors and design tokens. */
export const tailwindConfig = `<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          status: {
            completed: { DEFAULT: '#16a34a', light: '#dcfce7', dark: '#166534' },
            in_progress: { DEFAULT: '#2563eb', light: '#dbeafe', dark: '#1e40af' },
            pending: { DEFAULT: '#6b7280', light: '#f3f4f6', dark: '#374151' },
            blocked: { DEFAULT: '#dc2626', light: '#fee2e2', dark: '#991b1b' },
          },
          approve: { DEFAULT: '#16a34a', hover: '#15803d' },
          changes: { DEFAULT: '#d97706', hover: '#b45309' },
        },
      },
    },
  }
</script>`;

/** Status → Tailwind class mappings for badges. */
export const statusColors: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  completed: { bg: "bg-green-100", text: "text-green-800", darkBg: "dark:bg-green-900/40", darkText: "dark:text-green-300" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-800", darkBg: "dark:bg-blue-900/40", darkText: "dark:text-blue-300" },
  pending: { bg: "bg-gray-100", text: "text-gray-800", darkBg: "dark:bg-gray-700/40", darkText: "dark:text-gray-300" },
  blocked: { bg: "bg-red-100", text: "text-red-800", darkBg: "dark:bg-red-900/40", darkText: "dark:text-red-300" },
};
