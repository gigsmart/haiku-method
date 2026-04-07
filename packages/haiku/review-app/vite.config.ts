import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const pluginVersion = (() => {
  try {
    return JSON.parse(readFileSync("../../plugin/.claude-plugin/plugin.json", "utf8")).version;
  } catch { return "dev"; }
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(
      process.env.SENTRY_DSN_REVIEW_SPA || "",
    ),
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(`haiku-spa@${pluginVersion}`),
  },
  build: {
    // Inline everything into a single HTML file
    sourcemap: true,
    cssCodeSplit: false,
    assetsInlineLimit: Infinity,
    rollupOptions: {
      output: {
        // Single JS bundle
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
});
