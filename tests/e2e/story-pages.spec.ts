import { expect, test } from "@playwright/test";

test.describe("contact page", () => {
  test("shows the store's address, phone and directions", async ({ page }) => {
    await page.goto("/contact");
    const visit = page.locator("#visit");
    await expect(visit.getByText("Chittaranjan Park,")).toBeVisible();
    await expect(visit.getByRole("link", { name: "096677 07716" })).toHaveAttribute("href", "tel:+919667707716");
    await expect(visit.getByRole("link", { name: /get directions/ })).toHaveAttribute(
      "href",
      "https://maps.app.goo.gl/56mzcdxAwx34DR487",
    );
  });

  test("the Google map is embedded, lazy-loaded and fits the screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/contact");
    const map = page.locator('iframe[title="The Nuzz Story on Google Maps"]');
    await expect(map).toHaveAttribute("src", /^https:\/\/www\.google\.com\/maps\/embed\?pb=/);
    await expect(map).toHaveAttribute("loading", "lazy");
    await page.locator("#visit").scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });

  test("topic-specific fields appear, and are validated", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "My order" }).click();
    const order = page.getByLabel("Order number");
    await expect(order).toBeVisible();

    await page.getByLabel("Your name").fill("Jane Doe");
    await page.getByLabel("Email").fill("jane@example.com");
    await page.getByLabel("Message").fill("My leash hasn't arrived yet.");
    await order.fill("12345");
    await page.getByRole("button", { name: "send message" }).click();
    await expect(page.getByText("Order numbers start with CP-")).toBeVisible();
    await expect(order).toBeFocused();

    await order.fill("CP-M1ABCD");
    await page.getByRole("button", { name: "send message" }).click();
    await expect(page.getByRole("status").filter({ hasText: "CP-M1ABCD" })).toBeVisible();

    // Wholesale swaps in a company field instead.
    await page.getByRole("button", { name: "send another" }).click();
    await page.getByRole("button", { name: "Wholesale" }).click();
    await expect(page.getByLabel("Shop or company name")).toBeVisible();
    await expect(page.getByLabel("Order number")).toHaveCount(0);
  });
});

test.describe("about page", () => {
  test("team cards flip to show the pet's stats (keyboard too)", async ({ page }) => {
    await page.goto("/about");
    const card = page.getByRole("button", { name: /Maya & Biscuit/ });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByText("chief destroyer")).toBeVisible();
  });

  test("the Biscuit test links approved products to the shop", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("link", { name: /rope tug bundle/ }).click();
    await expect(page).toHaveURL(/\/shop\/rope-tug-bundle$/);
  });
});
