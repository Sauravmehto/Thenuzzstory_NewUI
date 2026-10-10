import type { BrowserContext, Page } from "@playwright/test";

export interface Demo {
  latencyMs?: number;
  failNextCart?: boolean;
  priceBump?: { id: string; percent: number };
  stockDrop?: { id: string; stock: number };
  walletLow?: boolean;
}

/** Sets the same cookie the in-app demo panel writes (see lib/server/demo.ts). */
export async function setDemo(context: BrowserContext, baseURL: string, demo: Demo) {
  await context.addCookies([
    {
      name: "cp-demo",
      value: encodeURIComponent(JSON.stringify({ latencyMs: 0, failNextCart: false, ...demo })),
      url: baseURL,
    },
  ]);
}

export async function fillShipping(page: Page) {
  await page.getByLabel("Full name").fill("Jane Doe");
  await page.getByLabel("Email").fill("jane@example.com");
  await page.getByLabel("Address").fill("12 Maple Street");
  await page.getByLabel("City").fill("London");
  await page.getByLabel("Postal code").fill("N1 7GU");
}

export const cartDialog = (page: Page) => page.getByRole("dialog", { name: "your cart" });
