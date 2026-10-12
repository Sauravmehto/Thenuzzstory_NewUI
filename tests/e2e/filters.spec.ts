import { expect, test } from "@playwright/test";

test("filter is shareable via the URL", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("button", { name: "bed", exact: true, pressed: false }).click();
  await expect(page).toHaveURL(/filter=bed/);
  await expect(page.getByText("3 products", { exact: true })).toBeVisible();

  // Reloading (or opening a shared link) keeps the filter.
  await page.reload();
  await expect(page.getByRole("button", { name: "bed", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("3 products", { exact: true })).toBeVisible();
});

test("older ?category= links (e.g. the footer) still filter", async ({ page }) => {
  await page.goto("/shop?category=toys%20%26%20play");
  await expect(page.getByText("4 products", { exact: true })).toBeVisible();
  // Shown as a removable pill, since that category has no pill of its own.
  await page.getByRole("button", { name: "toys & play: remove filter" }).click();
  await expect(page.getByText("18 products", { exact: true })).toBeVisible();

  await page.goto("/shop?category=comfy%20beds");
  await expect(page.getByRole("button", { name: "bed", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("today's offers: tagged pill and an honest empty state", async ({ page }) => {
  await page.goto("/shop");
  const today = page.getByRole("button", { name: "today: today's offers" });
  await expect(today).toContainText("offer");
  await today.click();
  await expect(page).toHaveURL(/filter=today/);
  await expect(page.getByRole("heading", { name: "No offers today" })).toBeVisible();
});

test("sort by price", async ({ page }) => {
  await page.goto("/shop?filter=bed");
  await page.getByLabel("sort by").selectOption("price-asc");
  await expect(page).toHaveURL(/sort=price-asc/);
  await expect(page.locator(".shop-card__price")).toHaveText(["$49.99", "$59.99", "$79.99"]);
  await page.getByLabel("sort by").selectOption("price-desc");
  await expect(page.locator(".shop-card__price")).toHaveText(["$79.99", "$59.99", "$49.99"]);
});
