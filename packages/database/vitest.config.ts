import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: [],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
      ],
    },
  },
  resolve: {
    alias: {
      "@repo/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@repo/database": path.resolve(__dirname, "./src/index.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
