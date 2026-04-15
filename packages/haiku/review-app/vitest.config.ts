import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    // Use a separate resolver that does NOT alias ext-apps to the shim.
    // Tests mock @modelcontextprotocol/ext-apps via vi.doMock() directly.
    alias: {
      // Explicitly override the vite.config.ts alias so vitest resolves the
      // real ext-apps package for accurate type-level testing. Tests that need
      // to control the App class use vi.doMock("@modelcontextprotocol/ext-apps").
    },
  },
});
