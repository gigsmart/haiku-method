import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pluginVersion = (() => {
  try {
    return JSON.parse(readFileSync("../../plugin/.claude-plugin/plugin.json", "utf8")).version;
  } catch { return "dev"; }
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Use the lightweight shim instead of the full ext-apps package in the SPA
      // bundle. The real package is used for TypeScript types and in vitest tests
      // (vitest has its own module resolution that bypasses this alias via test.env).
      "@modelcontextprotocol/ext-apps": resolve(__dirname, "src/ext-apps-shim.ts"),
    },
  },
  define: {
    "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(
      process.env.SENTRY_DSN_REVIEW_SPA || "",
    ),
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(`haiku-spa@${pluginVersion}`),
  },
  build: {
    // Inline everything into a single HTML file
    minify: false,
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
