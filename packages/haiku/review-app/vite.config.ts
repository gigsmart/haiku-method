import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(
      process.env.SENTRY_DSN_REVIEW_SPA || "",
    ),
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
