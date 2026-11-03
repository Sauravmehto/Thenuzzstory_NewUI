import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // Server modules import "server-only" (a guard for client bundles); tests run them directly.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  // Pricing tests use the frozen demo products (US cents) and the demo money settings.
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node", env: { NEXT_PUBLIC_STORE_PROFILE: "demo-usd" } },
});
