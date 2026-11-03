import type { BrowserContext, Page } from "@playwright/test";

export interface Demo {
  latencyMs?: number;
  failNextCart?: boolean;
  priceBump?: { id: string; percent: number };
  stockDrop?: { id: string; stock: number };
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

/** WhatsApp opens in a new tab. In tests, answer for wa.me ourselves: no real network, nothing is sent. */
export async function stubWhatsapp(context: BrowserContext) {
  await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp (test)</title>" }));
}

/** Fills every required checkout field. Override any field to test a bad value. */
export async function fillShipping(page: Page, over: Partial<Record<"name" | "phone" | "email" | "address" | "city" | "state" | "pin", string>> = {}) {
  const v = {
    name: "Jane Doe",
    phone: "98765 43210",
    email: "jane@example.com",
    address: "12 Maple Street, Hauz Khas",
    city: "New Delhi",
    state: "Delhi",
    pin: "110016",
    ...over,
  };
  await page.getByLabel("Full name").fill(v.name);
  await page.getByLabel("Mobile number").fill(v.phone);
  await page.getByLabel("Email address").fill(v.email);
  await page.getByLabel("Complete delivery address").fill(v.address);
  await page.getByLabel(/^City\b/).fill(v.city);
  await page.getByLabel("State").selectOption(v.state);
  await page.getByLabel("PIN code").fill(v.pin);
}

export const cartDialog = (page: Page) => page.getByRole("dialog", { name: "your cart" });
