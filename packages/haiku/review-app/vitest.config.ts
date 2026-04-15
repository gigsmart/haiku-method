import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // Use a separate resolver that does NOT alias ext-apps to the shim.
    // Tests mock @modelcontextprotocol/ext-apps via vi.doMock() directly.
    alias: {
      // Explicitly override the vite.config.ts alias so vitest resolves the
      // real ext-apps package for accurate type-level testing. Tests that need
      // to control the App class use vi.doMock("@modelcontextprotocol/ext-apps").
    },
  },
});
