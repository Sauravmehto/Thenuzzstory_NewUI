import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fillShipping, stubWhatsapp } from "./helpers";

const ORDERS_DIR = path.join(process.cwd(), ".data-e2e", "orders");
const ADMIN_PASSWORD = "e2e-admin-password";

async function adminLogin(page: Page) {
  await page.goto("/admin/login?next=/admin/orders");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
}

test("a customer order is saved and shows up in the admin, with status changes that persist", async ({ page, context, request }) => {
  await stubWhatsapp(context);

  // 1. Customer places an order.
  await page.goto("/shop/cozy-dog-house");
  await page.getByRole("button", { name: /add to cart/ }).click();
  await page.getByRole("link", { name: "go to checkout" }).click();
  await fillShipping(page, { name: "Admin Check", phone: "98765 43210", email: "admin.check@example.com" });
  await page.getByRole("button", { name: /place order/ }).first().click();
  await expect(page).toHaveURL(/\/order\/confirmed$/);
  const orderId = (await page.locator(".order-confirm__id code").innerText()).trim();

  // 2. It is on disk, written by the server (not browser state).
  const saved = JSON.parse(await readFile(path.join(ORDERS_DIR, `${orderId}.json`), "utf8"));
  expect(saved).toMatchObject({ orderId, status: "pending_confirmation", paymentStatus: "payment_pending" });

  // 3. Orders API is closed to visitors who haven't logged in.
  expect((await request.get("/api/admin/orders")).status()).toBe(401);

  // 4. Admin sees it, with matching details.
  const admin = await context.newPage();
  await adminLogin(admin);
  const row = admin.locator(`[data-order-id="${orderId}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("Admin Check");
  await expect(row).toContainText("+91 98765 43210");
  await expect(row).toContainText("cozy dog house");
  await expect(row).toContainText("Pending Confirmation");
  await expect(row).toContainText("Payment Pending");

  // 5. Status change is saved to the server and survives a reload and a fresh login.
  await row.getByLabel("Order status").selectOption("confirmed");
  await expect(admin.locator(".admin-count")).toContainText(`${orderId} updated`);
  await admin.reload();
  await expect(admin.locator(`[data-order-id="${orderId}"]`)).toContainText("Confirmed");
  expect(JSON.parse(await readFile(path.join(ORDERS_DIR, `${orderId}.json`), "utf8")).status).toBe("confirmed");

  await admin.getByRole("button", { name: "Log out" }).click();
  await expect(admin).toHaveURL(/\/admin\/login/);
  await adminLogin(admin);
  await expect(admin.locator(`[data-order-id="${orderId}"]`)).toContainText("Confirmed");

  // 6. Bad changes are refused.
  const bad = await admin.request.patch(`/api/admin/orders/${orderId}`, {
    data: { status: "shipped-to-the-moon" },
    headers: { Origin: new URL(admin.url()).origin },
  });
  expect(bad.status()).toBe(400);
});

test("the orders page needs a login, and shows an honest error with a retry when loading fails", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.route("**/api/admin/orders", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, message: "Couldn't load orders from storage." }) }));
  await adminLogin(page);
  await expect(page.locator(".admin-empty[role=alert]")).toContainText("Couldn't load orders from storage.");
  await page.unroute("**/api/admin/orders");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".admin-count")).toContainText("orders");
});
