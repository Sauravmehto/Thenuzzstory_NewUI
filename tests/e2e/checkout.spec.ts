import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fillShipping, setDemo, stubWhatsapp } from "./helpers";

/** Orders are saved here by the e2e server (see DATA_DIR in playwright.config.ts). */
const ORDERS_DIR = path.join(process.cwd(), ".data-e2e", "orders");
const readSavedOrder = async (orderId: string) => JSON.parse(await readFile(path.join(ORDERS_DIR, `${orderId}.json`), "utf8"));

async function addDogHouseAndOpenCheckout(page: Page) {
  await page.goto("/shop/cozy-dog-house");
  await page.getByRole("button", { name: /add to cart/ }).click();
  await page.getByRole("link", { name: "go to checkout" }).click();
  await expect(page.getByRole("heading", { name: "checkout", level: 1 })).toBeVisible();
}

const placeOrderButton = (page: Page) => page.getByRole("button", { name: /place order|try again/ }).first();

test.describe("WhatsApp checkout", () => {
  test.beforeEach(async ({ page, context }) => {
    await stubWhatsapp(context);
    await addDogHouseAndOpenCheckout(page);
  });

  test("WhatsApp is the only way to order, and it says what that means", async ({ page }) => {
    const method = page.locator("fieldset.pay-method");
    await expect(method.getByRole("radio")).toHaveCount(1);
    await expect(method.getByRole("radio", { name: /Order via WhatsApp — Pay as arranged/ })).toBeChecked();
    await expect(method).toContainText("Nothing is charged on this website");
    await expect(page.getByText(/card|UPI|crypto|wallet/i)).toHaveCount(0);
  });

  test("every field is required: nothing is sent, the cart is kept, each field says what's wrong", async ({ page }) => {
    let orderRequests = 0;
    page.on("request", (req) => req.url().endsWith("/api/orders") && (orderRequests += 1));

    await placeOrderButton(page).click();

    for (const label of ["Full name", "Mobile number", "Email address", "Complete delivery address", "City", "PIN code"]) {
      const field = page.getByLabel(label === "City" ? /^City\b/ : label);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(field).toHaveAttribute("required", "");
    }
    await expect(page.getByLabel("State")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(".contact-error")).toHaveCount(7);
    await expect(page.getByLabel("Full name")).toBeFocused();
    expect(orderRequests).toBe(0);

    // The cart is untouched.
    await expect(page.getByRole("list").filter({ hasText: "cozy dog house" })).toBeVisible();
    await expect(page).toHaveURL(/\/cart$/);
  });

  test("checks mobile number, email and PIN code, and clears each message as it's fixed", async ({ page }) => {
    await fillShipping(page, { phone: "12345", email: "jane@", pin: "1100" });
    await placeOrderButton(page).click();

    await expect(page.getByText("Enter a valid 10-digit Indian mobile number, like 98765 43210.")).toBeVisible();
    await expect(page.getByText("Enter a valid email, like name@example.com.")).toBeVisible();
    await expect(page.getByText("Enter a valid 6-digit PIN code, like 110070.")).toBeVisible();
    await expect(page.getByLabel("Mobile number")).toBeFocused();

    await page.getByLabel("Mobile number").fill("+91 98765-43210");
    await expect(page.getByText(/valid 10-digit Indian mobile/)).toBeHidden();
    await page.getByLabel("Email address").fill("jane@example.com");
    await expect(page.getByText(/valid email, like/)).toBeHidden();
    await page.getByLabel("PIN code").fill("110016");
    await expect(page.getByText(/valid 6-digit PIN/)).toBeHidden();
  });

  test("saves the order on the server FIRST, then opens WhatsApp with the order in the message", async ({ page, context }) => {
    await fillShipping(page);
    const popupPromise = context.waitForEvent("page");
    const order = page.waitForResponse((r) => r.url().endsWith("/api/orders") && r.request().method() === "POST");

    await placeOrderButton(page).click();
    const response = await order;
    const saved = await response.json();
    expect(response.status()).toBe(200);
    expect(saved).toMatchObject({ ok: true, status: "pending_confirmation", paymentStatus: "payment_pending", paymentMethod: "whatsapp" });

    // WhatsApp opens in a NEW tab, on the official click-to-chat link for the team's number.
    const popup = await popupPromise;
    await popup.waitForURL(/^https:\/\/wa\.me\/918130699818\?text=/);
    const message = new URL(popup.url()).searchParams.get("text")!;
    for (const part of [saved.orderId, "Jane Doe", "+91 98765 43210", "12 Maple Street, Hauz Khas", "New Delhi, Delhi 110016", "cozy dog house", "× 1", "$49.99", "Total: $54.98", "Payment method: WhatsApp"])
      expect(message).toContain(part);

    // The order really exists in the backend, priced by the server.
    const file = await readSavedOrder(saved.orderId);
    expect(file).toMatchObject({
      status: "pending_confirmation",
      paymentStatus: "payment_pending",
      paymentMethod: "whatsapp",
      totalCents: 5498,
      customer: { name: "Jane Doe", phone: "9876543210", email: "jane@example.com", state: "Delhi", pin: "110016" },
    });
    expect(file.lines).toEqual([expect.objectContaining({ id: "cozy-dog-house", qty: 1, unitCents: 4999 })]);

    // The customer lands on a clear confirmation: recorded, not confirmed, not paid.
    await expect(page).toHaveURL(/\/order\/confirmed$/);
    await expect(page.getByRole("heading", { name: /Your order is recorded, Jane/ })).toBeFocused();
    await expect(page.getByText(saved.orderId, { exact: true })).toBeVisible();
    await expect(page.getByText("Please send the pre-filled WhatsApp message to confirm your order.")).toBeVisible();
    await expect(page.getByText(/Our team will contact you regarding payment and delivery/)).toBeVisible();
    await expect(page.getByText(/doesn't send anything/)).toBeVisible();
    await expect(page.locator(".order-status")).toContainText("Pending Confirmation");
    await expect(page.locator(".order-status")).toContainText("Payment Pending");
    await expect(page.locator(".order-status")).not.toContainText(/paid\b(?!.*pending)/i);
    await expect(page.locator(".checkout-steps [aria-current=step]")).toContainText("done");

    // The cart was emptied only after the order was saved.
    await expect(page.getByRole("button", { name: "Open cart" })).not.toContainText("1");
  });

  test("if the browser blocks the pop-up, the confirmation page still has the WhatsApp button", async ({ page, context }) => {
    await context.addInitScript(() => {
      window.open = () => null; // what a pop-up blocker does
    });
    await page.reload();
    await fillShipping(page);
    await placeOrderButton(page).click();

    await expect(page).toHaveURL(/\/order\/confirmed$/);
    await expect(page.getByText(/didn't open WhatsApp automatically/)).toBeVisible();
    const button = page.getByRole("link", { name: /^open WhatsApp/ });
    await expect(button).toHaveAttribute("href", /^https:\/\/wa\.me\/918130699818\?text=/);
    await expect(button).toHaveAttribute("target", "_blank");

    // Using the button works, and the note changes to remind them to press send.
    const popup = context.waitForEvent("page");
    await button.click();
    await (await popup).waitForURL(/wa\.me/);
    await expect(page.getByText(/please check that you pressed send/)).toBeVisible();
    await expect(page.getByRole("link", { name: "open WhatsApp again" })).toBeVisible();
  });

  test("when saving fails: an actionable error, the cart is kept, and WhatsApp is NOT opened", async ({ page, context }) => {
    await fillShipping(page);
    let opened = 0;
    context.on("page", () => (opened += 1));
    await page.route("**/api/orders", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: "storage_failed", message: "We couldn't save your order. Nothing was sent and your cart is safe: please try again in a moment." }),
      }),
    );

    await placeOrderButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Nothing was sent and your cart is safe" })).toBeVisible();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("button", { name: /try again/ }).first()).toBeEnabled();
    await expect(page.getByRole("list").filter({ hasText: "cozy dog house" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Jane Doe"); // what they typed is kept
    await page.waitForTimeout(500);
    expect(opened).toBe(0);
    await expect(page.getByText(/order is recorded/i)).toHaveCount(0);

    // Trying again once the server is back works.
    await page.unroute("**/api/orders");
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: /try again/ }).first().click();
    await (await popup).waitForURL(/wa\.me/);
    await expect(page).toHaveURL(/\/order\/confirmed$/);
  });

  test("a dropped connection is reported honestly: not placed, cart safe", async ({ page, context }) => {
    await fillShipping(page);
    await page.route("**/api/orders", (route) => route.abort("connectionrefused"));
    let opened = 0;
    context.on("page", () => (opened += 1));

    await placeOrderButton(page).click();
    await expect(page.locator("#place-order-error")).toContainText("your order was not placed");
    await expect(page).toHaveURL(/\/cart$/);
    await page.waitForTimeout(400);
    expect(opened).toBe(0);
  });

  test("a price change is shown for review, never saved silently", async ({ page, context, baseURL }) => {
    await fillShipping(page);
    await setDemo(context, baseURL!, { priceBump: { id: "cozy-dog-house", percent: 15 } });

    await placeOrderButton(page).click();

    const review = page.getByRole("region", { name: "Your total changed" });
    await expect(review).toBeVisible();
    await expect(review).toContainText("$49.99 → $57.49");
    await expect(page.getByRole("heading", { name: "Your total changed" })).toBeFocused();

    const order = page.waitForResponse((r) => r.url().endsWith("/api/orders") && r.status() === 200);
    await review.getByRole("button", { name: /confirm new total · \$57\.49/ }).click();
    const saved = await (await order).json();
    await expect(page).toHaveURL(/\/order\/confirmed$/);
    await expect(page.locator(".order-totals__total")).toContainText("$57.49");
    expect((await readSavedOrder(saved.orderId)).totalCents).toBe(5749); // free delivery now: the cart is over the line
  });

  test("double-clicking place order saves exactly one order", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { latencyMs: 600 });
    await fillShipping(page);
    const ids: string[] = [];
    page.on("response", async (r) => {
      if (r.url().endsWith("/api/orders") && r.status() === 200) ids.push((await r.json()).orderId);
    });
    let requests = 0;
    page.on("request", (req) => req.url().endsWith("/api/orders") && (requests += 1));

    await placeOrderButton(page).dblclick();
    await expect(page.getByRole("heading", { name: /Your order is recorded/ })).toBeVisible();
    expect(requests).toBe(1);
    expect(ids).toHaveLength(1);
  });

  test("the confirmation survives a refresh", async ({ page }) => {
    await fillShipping(page);
    await placeOrderButton(page).click();
    await expect(page).toHaveURL(/\/order\/confirmed$/);
    await expect(page.getByRole("region", { name: "what you ordered" })).toContainText("cozy dog house");

    await page.reload();
    await expect(page.getByRole("heading", { name: /Your order is recorded, Jane/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^open WhatsApp/ })).toBeVisible();
  });
});

test("an empty cart can't be checked out", async ({ page }) => {
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  await expect(page.locator("#checkout-form")).toHaveCount(0);

  // Even a hand-made request is refused by the server.
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: { name: "Jane Doe", phone: "9876543210", email: "jane@example.com", address: "12 Maple Street, Hauz Khas", city: "Delhi", state: "Delhi", pin: "110016" },
        items: [],
        expected: { lines: [], totalCents: 0 },
        paymentMethod: "whatsapp",
      }),
    });
    return res.status;
  });
  expect(status).toBe(422);
});

async function createAccount(page: Page, name = "Priya Sharma") {
  await page.goto("/shop");
  await page.getByRole("button", { name: /^Account/ }).click();
  await page.getByRole("menuitem", { name: /Create an account/ }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(`e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("walkies12");
  await page.getByRole("button", { name: "create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();
  await page.waitForTimeout(1200);
}

test("signed-in customers see the order in their history", async ({ page, context }: { page: Page; context: BrowserContext }) => {
  await stubWhatsapp(context);
  await createAccount(page);

  await addDogHouseAndOpenCheckout(page);
  await fillShipping(page, { name: "Priya Sharma" });
  await placeOrderButton(page).click();
  await expect(page).toHaveURL(/\/order\/confirmed$/);

  await page.getByRole("button", { name: /^Account/ }).click();
  await page.getByRole("menuitem", { name: "Order history" }).click();
  const panel = page.getByRole("dialog", { name: "your orders" });
  await expect(panel).toContainText(/Order NS-\d{6}-/);
  await expect(panel).toContainText("Pending Confirmation");
  await expect(panel).toContainText("Payment Pending");
});

test("adding to the cart while the account is still loading keeps the item", async ({ page }) => {
  await createAccount(page);

  // A slow connection: the "who is signed in?" answer arrives 2 seconds late.
  await page.route("**/api/account/session", async (route) => {
    if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.goto("/shop/cozy-dog-house");
  await page.getByRole("button", { name: /add to cart/ }).click(); // happens BEFORE the answer arrives
  await page.waitForTimeout(3000); // ...the answer arrives and is applied

  await expect(page.getByRole("button", { name: "Open cart, 1 item" })).toBeAttached();
  await expect(page.getByRole("dialog", { name: "your cart" })).toContainText("cozy dog house");

  // And it was saved to the account, so another device would see it too.
  await page.unroute("**/api/account/session");
  const saved = await page.evaluate(async () => (await (await fetch("/api/account/session")).json()).session.cart);
  expect(saved).toEqual([{ id: "cozy-dog-house", qty: 1 }]);
});
