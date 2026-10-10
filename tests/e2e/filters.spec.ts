import { expect, test } from "@playwright/test";

test("category filter is shareable via the URL", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("button", { name: "comfy beds", pressed: false }).click();
  await expect(page).toHaveURL(/category=comfy\+beds/);
  await expect(page.getByText("3 products", { exact: true })).toBeVisible();

  // Reloading (or opening a shared link) keeps the filter.
  await page.reload();
  await expect(page.getByRole("button", { name: "comfy beds" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("3 products", { exact: true })).toBeVisible();
});
