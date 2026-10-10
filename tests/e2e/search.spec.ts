import { expect, test } from "@playwright/test";

test("live search filters as you type and syncs the URL", async ({ page }) => {
  await page.goto("/shop");
  await page.waitForLoadState("networkidle"); // shortcut listener attaches on hydration
  await page.keyboard.press("/");
  const input = page.getByRole("searchbox", { name: "Search products" });
  await expect(input).toBeFocused();

  await input.pressSequentially("bed", { delay: 40 });
  await expect(page.getByRole("status").filter({ hasText: "for “bed”" })).toHaveText("3 products for “bed”");
  await expect(page.locator(".shop-card__name mark")).toHaveText(["bed", "bed"]);
  await expect(page).toHaveURL(/\?q=bed$/);

  await input.press("Escape");
  await expect(page.getByText("18 products", { exact: true })).toBeVisible();
});

test("reduced motion: product grid is visible without scroll animations", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/shop");
  const card = page.locator(".shop-card").first();
  await expect(card).toHaveCSS("opacity", "1");
  await context.close();
});
