#!/usr/bin/env node
/**
 * Production build for the Playwright suite (`npm run build:e2e`, then `npm run test:e2e`).
 *
 * The real catalog may have nothing published yet, so the e2e build swaps in a
 * frozen fixture of the original demo products (tests/fixtures/catalog.public.e2e.json)
 * and writes to .next-e2e, leaving the real build in .next untouched.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, CATALOG_FIXTURE: "e2e" },
});
process.exit(result.status ?? 1);
