import { expect, test } from "@playwright/test";
import { fillShipping, setDemo } from "./helpers";

test.describe("checkout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/shop/cozy-dog-house");
    await page.getByRole("button", { name: /add to cart/ }).click();
    await page.getByRole("link", { name: "go to checkout" }).click();
    await expect(page.getByRole("heading", { name: "checkout", level: 1 })).toBeVisible();
  });

  test("a price change is shown for review, never charged silently", async ({ page, context, baseURL }) => {
    await fillShipping(page);
    await setDemo(context, baseURL!, { priceBump: { id: "cozy-dog-house", percent: 15 } });

    await page.getByRole("button", { name: /place order · \$54\.98/ }).click();

    const review = page.getByRole("region", { name: "Your total changed" });
    await expect(review).toBeVisible();
    await expect(review).toContainText("$49.99 → $57.49");
    await expect(page.getByRole("heading", { name: "Your total changed" })).toBeFocused();

    await review.getByRole("button", { name: /confirm new total · \$57\.49/ }).click();
    await expect(page).toHaveURL(/\/order\/confirmed$/);
    await expect(page.getByRole("heading", { name: /Thank you, Jane/ })).toBeVisible();
    await expect(page.locator(".order-totals__total")).toContainText("$57.49");
  });

  test("double-clicking place order creates exactly one order", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { latencyMs: 600 });
    await fillShipping(page);
    let requests = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/checkout")) requests += 1;
    });

    await page.getByRole("button", { name: /place order/ }).dblclick();
    await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible();
    expect(requests).toBe(1);
  });

  test("validation runs on the client first and focuses the first bad field", async ({ page }) => {
    let checkoutRequests = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/checkout")) checkoutRequests += 1;
    });
    await page.getByLabel("Full name").fill("Jane Doe");
    await page.getByRole("button", { name: /place order/ }).click();

    const email = page.getByLabel("Email");
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter a valid email.")).toBeVisible();
    expect(checkoutRequests).toBe(0); // no round trip to find a typo

    // The error clears the moment it's fixed, without another submit.
    await email.fill("jane@example.com");
    await expect(page.getByText("Enter a valid email.")).toBeHidden();
  });

  test("confirmation is its own page: survives refresh, receipt shows what was bought", async ({ page }) => {
    await fillShipping(page);
    await page.getByRole("button", { name: /place order/ }).click();

    await expect(page).toHaveURL(/\/order\/confirmed$/);
    await expect(page.getByRole("heading", { name: /Thank you, Jane/ })).toBeFocused();
    await expect(page.getByRole("region", { name: "what you ordered" })).toContainText("cozy dog house");
    await expect(page.getByText(/arriving/)).toBeVisible();
    await expect(page.locator(".checkout-steps [aria-current=step]")).toContainText("done");

    await page.reload();
    await expect(page.getByRole("heading", { name: /Thank you, Jane/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open cart" })).not.toContainText("1");
  });
});
