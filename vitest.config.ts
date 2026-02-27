import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/__tests__/**", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
