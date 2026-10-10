import { expect, test } from "@playwright/test";
import { cartDialog, setDemo } from "./helpers";

test.describe("optimistic cart", () => {
  test("updates instantly, before the server answers", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { latencyMs: 3000 });
    await page.goto("/shop/cloud-nine-bed");

    const confirmed = page.waitForResponse("**/api/cart");
    await page.getByRole("button", { name: /add to cart/ }).click();

    // The count updates immediately, while the request is still in flight.
    await expect(page.getByRole("button", { name: "Open cart" })).toContainText("1", { timeout: 500 });
    // The drawer opens once the image has flown into the cart icon.
    await expect(cartDialog(page).getByText("cloud nine bed")).toBeVisible();

    // Slow network: the "saving…" hint appears after the 300ms threshold.
    await expect(cartDialog(page).getByText("saving…")).toBeVisible();
    await confirmed;
    await expect(cartDialog(page).getByText("saving…")).toBeHidden();
  });

  test("rolls back to live stock when someone else bought it", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { stockDrop: { id: "cozy-dog-house", stock: 1 } });
    await page.goto("/shop/cozy-dog-house");

    await page.getByRole("button", { name: "Increase quantity" }).click();
    await page.getByRole("button", { name: /add to cart/ }).click();

    const status = page.locator(".cart-toast-region");
    await expect(status).toContainText("Only 1 left");
    await expect(cartDialog(page).locator(".qty-number")).toHaveText("1");
    // The row itself says why its number changed, not only the toast.
    await expect(cartDialog(page).locator(".cart-line__note")).toHaveText(/only 1 left/);
  });

  test("rolls back completely when the request fails", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { failNextCart: true });
    await page.goto("/shop/everyday-leash");
    await page.getByRole("button", { name: /add to cart/ }).click();

    await expect(page.locator(".cart-toast-region")).toContainText("Couldn't reach the store");
    await expect(cartDialog(page).getByText("Your cart is feeling a little lonely.")).toBeVisible();
  });

  test("rapid clicks settle on the last value", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { latencyMs: 400 });
    await page.goto("/shop/peanut-butter-bites");
    await page.getByRole("button", { name: /add to cart/ }).click();

    const plus = cartDialog(page).getByRole("button", { name: "Increase quantity of peanut butter bites" });
    for (let i = 0; i < 4; i++) await plus.click();

    await expect(cartDialog(page).locator(".qty-number")).toHaveText("5");
    await page.waitForTimeout(1200); // let every response land, in any order
    await expect(cartDialog(page).locator(".qty-number")).toHaveText("5");
    await page.reload();
    await page.getByRole("button", { name: "Open cart" }).click();
    await expect(cartDialog(page).locator(".qty-number")).toHaveText("5");
  });
});

test.describe("add to cart feedback", () => {
  test("button confirms, badge counts, drawer highlights the new line", async ({ page }) => {
    await page.goto("/shop/cloud-nine-bed");
    const add = page.getByRole("button", { name: /add to cart/ });
    await add.click();

    await expect(page.locator(".product-add")).toHaveClass(/is-added/);
    await expect(page.getByRole("button", { name: "Open cart, 1 item" })).toBeAttached();
    await expect(cartDialog(page).locator("[data-just-added]")).toContainText("cloud nine bed");
    await expect(cartDialog(page).getByRole("heading", { name: "pairs well with" })).toBeVisible();
  });

  test("mobile: sticky buy bar appears once the buy button scrolls away", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto("/shop/cloud-nine-bed");
    await page.waitForLoadState("networkidle"); // hydrated, so the observer is attached
    const bar = page.locator(".product-sticky");
    await expect(bar).not.toHaveAttribute("data-visible");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(bar).toHaveAttribute("data-visible", { timeout: 10_000 });
    await bar.getByRole("button", { name: "add to cart" }).click();
    await expect(cartDialog(page).getByText("cloud nine bed")).toBeVisible();
    await context.close();
  });
});

test("fly-to-cart: a copy of the photo flies, then the drawer opens", async ({ page }) => {
  await page.goto("/shop/cloud-nine-bed");
  await page.waitForLoadState("networkidle");
  const flying = page.locator("body > div[aria-hidden=true][style*='position: fixed']");
  await page.getByRole("button", { name: /add to cart/ }).click();
  await expect(flying).toHaveCount(1);
  await expect(cartDialog(page)).toBeVisible();
  await expect(flying).toHaveCount(0); // cleaned up after landing
});

test("fly-to-cart is skipped with reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/shop/cloud-nine-bed");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /add to cart/ }).click();
  await expect(cartDialog(page)).toBeVisible({ timeout: 500 });
  await expect(page.locator("body > div[aria-hidden=true][style*='position: fixed']")).toHaveCount(0);
  await context.close();
});

test.describe("motion and microinteractions", () => {
  test("shop card photo morphs into the product page (view transition)", async ({ page }) => {
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    const vtStarted = page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const observer = new MutationObserver(() => {
            if (document.documentElement.dataset.vt) resolve(true);
          });
          observer.observe(document.documentElement, { attributes: true });
          setTimeout(() => resolve(false), 3000);
        }),
    );
    await page.getByRole("link", { name: "cloud nine bed" }).first().click();
    expect(await vtStarted).toBe(true);
    await expect(page).toHaveURL(/\/shop\/cloud-nine-bed$/);
    await expect(page.getByRole("heading", { name: "cloud nine bed", level: 1 })).toBeVisible();
  });

  test("filter highlight slides to the active pill", async ({ page }) => {
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    const indicator = page.locator(".shop-filters__indicator");
    await expect(indicator).toBeVisible();
    const before = await indicator.boundingBox();
    await page.getByRole("button", { name: "toys & play" }).click();
    const pill = await page.getByRole("button", { name: "toys & play" }).boundingBox();
    await expect.poll(async () => Math.round((await indicator.boundingBox())!.x)).toBe(Math.round(pill!.x));
    expect(before!.x).not.toBe(pill!.x);
  });

  test("quantity rolls in the direction it changed", async ({ page }) => {
    await page.goto("/shop/peanut-butter-bites");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await expect(page.locator(".product-qty .qty-number__value")).toHaveAttribute("data-dir", "up");
    await page.getByRole("button", { name: "Decrease quantity" }).click();
    await expect(page.locator(".product-qty .qty-number__value")).toHaveAttribute("data-dir", "down");
  });
});

test.describe("removing and correcting rows", () => {
  const seed = [
    { id: "peanut-butter-bites", qty: 1 },
    { id: "cloud-nine-bed", qty: 1 },
    { id: "everyday-leash", qty: 1 },
  ];

  test.beforeEach(async ({ page }) => {
    await page.goto("/cart");
    // Wait for hydration: it persists the (empty) cart, which would overwrite the seed.
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate((lines) => localStorage.setItem("cozypaws-cart", JSON.stringify(lines)), seed);
    await page.reload();
    await expect(page.locator(".cart-line")).toHaveCount(3);
  });

  test("a removed row collapses, and Undo puts it back where it was", async ({ page }) => {
    await page.getByRole("button", { name: "Remove cloud nine bed" }).click();

    // It animates out instead of vanishing…
    await expect(page.locator(".cart-line[data-exiting]")).toHaveCount(1);
    await expect(page.locator(".cart-line")).toHaveCount(2);

    // …and the toast offers Undo, with keyboard focus already on it.
    const undo = page.locator(".cart-toast-region").getByRole("button", { name: "Undo" });
    await expect(page.locator(".cart-toast-region")).toContainText("Removed cloud nine bed.");
    await expect(undo).toBeFocused();
    await undo.click();

    await expect(page.locator(".cart-line .cart-line__name")).toHaveText([
      "peanut butter bites",
      "cloud nine bed",
      "everyday leash",
    ]);
  });

  test("the toast animates out when dismissed", async ({ page }) => {
    await page.getByRole("button", { name: "Remove everyday leash" }).click();
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.locator(".cart-toast[data-leaving]")).toHaveCount(1);
    await expect(page.locator(".cart-toast")).toHaveCount(0);
  });

  test("a rolled-back row shows the reason on the row", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { failNextCart: true });
    await page.getByRole("button", { name: "Increase quantity of everyday leash" }).click();
    const row = page.locator(".cart-line", { hasText: "everyday leash" });
    await expect(row.locator(".cart-line__note")).toHaveText(/not saved, back to 1/);
    await expect(row.locator(".qty-number")).toHaveText("1");
  });
});
