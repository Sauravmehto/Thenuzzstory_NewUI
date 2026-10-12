import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  // Pricing tests use the frozen demo products (US cents) and the demo money settings.
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node", env: { NEXT_PUBLIC_STORE_PROFILE: "demo-usd" } },
});
