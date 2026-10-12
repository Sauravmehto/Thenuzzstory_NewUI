import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { cartDialog } from "./helpers";

test("cart drawer is a real modal dialog", async ({ page }) => {
  await page.goto("/shop");
  const trigger = page.getByRole("button", { name: "Open cart" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = cartDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close cart" })).toBeFocused();

  // Focus stays trapped inside.
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("no serious axe violations on the order confirmation", async ({ page }) => {
  await page.goto("/shop/cozy-dog-house");
  await page.getByRole("button", { name: /add to cart/ }).click();
  await page.getByRole("link", { name: "go to checkout" }).click();
  await page.getByLabel("Full name").fill("Jane Doe");
  await page.getByLabel("Email").fill("jane@example.com");
  await page.getByLabel("Address").fill("12 Maple Street");
  await page.getByLabel("City").fill("London");
  await page.getByLabel("Postal code").fill("N1 7GU");
  await page.getByRole("button", { name: /place order/ }).click();
  await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
});

test("no serious axe violations on checkout with an item in the cart", async ({ page }) => {
  await page.goto("/shop/cozy-dog-house");
  await page.getByRole("button", { name: /add to cart/ }).click();
  await page.getByRole("link", { name: "go to checkout" }).click();
  await expect(page.getByRole("heading", { name: "checkout", level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
});

for (const path of ["/shop", "/shop/cozy-dog-house", "/cart", "/about", "/contact"]) {
  test(`no serious axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });
}
