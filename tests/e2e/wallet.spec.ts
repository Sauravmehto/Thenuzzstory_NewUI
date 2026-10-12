import { expect, test, type Page } from "@playwright/test";
import { fillShipping, setDemo } from "./helpers";

async function goToWalletCheckout(page: Page) {
  await page.goto("/shop/cozy-dog-house");
  await page.getByRole("button", { name: /add to cart/ }).click();
  await page.getByRole("link", { name: "go to checkout" }).click();
  await fillShipping(page);
  await page.getByRole("radio", { name: /crypto wallet/ }).check();
  await page.getByRole("button", { name: /pay with wallet/ }).first().click();
}

const wallet = (page: Page) => page.getByRole("dialog", { name: /connect a wallet|review payment|check your wallet|signature rejected|not enough funds|payment/ });

test.describe("simulated wallet payment", () => {
  test("connect → review → approve → confirmations → receipt", async ({ page }) => {
    await goToWalletCheckout(page);
    await expect(page.getByRole("heading", { name: "connect a wallet" })).toBeFocused();
    await page.getByRole("button", { name: /Pawprint Wallet/ }).click();

    await expect(page.getByRole("heading", { name: "review payment" })).toBeVisible();
    // $49.99 + $4.99 shipping + $0.02 network fee
    await expect(wallet(page)).toContainText("you'll send$55.00");
    await page.getByRole("button", { name: "confirm in wallet" }).click();

    await expect(page.getByRole("heading", { name: "check your wallet" })).toBeVisible();
    await page.getByRole("button", { name: "approve" }).click();
    await expect(page.getByText(/waiting for confirmations: 0 of 2/)).toBeVisible();
    // Money in flight: the dialog can't be dismissed.
    await expect(page.getByRole("button", { name: "Close" }).last()).toBeDisabled();

    await expect(page).toHaveURL(/\/order\/confirmed$/, { timeout: 10_000 });
    await expect(page.getByText(/paid with wallet/)).toBeVisible();
  });

  test("rejecting the signature sends nothing and can be retried", async ({ page }) => {
    await goToWalletCheckout(page);
    await page.getByRole("button", { name: /Pawprint Wallet/ }).click();
    await page.getByRole("button", { name: "confirm in wallet" }).click();
    await page.getByRole("button", { name: "reject" }).click();

    await expect(page.getByRole("heading", { name: "signature rejected" })).toBeVisible();
    await expect(page.getByText(/nothing was sent/i)).toBeVisible();
    await page.getByRole("button", { name: "try again" }).click();
    await expect(page.getByRole("heading", { name: "review payment" })).toBeVisible();
  });

  test("insufficient funds is caught before asking for a signature", async ({ page, context, baseURL }) => {
    await setDemo(context, baseURL!, { walletLow: true });
    await goToWalletCheckout(page);
    await page.getByRole("button", { name: /Kennel Key/ }).click();

    await expect(page.getByRole("heading", { name: "not enough funds" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Your wallet has" })).toContainText("Your wallet has $25.00");
    await expect(page.getByRole("button", { name: "confirm in wallet" })).toHaveCount(0);
  });

  test("the price is locked before signing: a price move shows up in review", async ({ page, context, baseURL }) => {
    await goToWalletCheckout(page);
    await setDemo(context, baseURL!, { priceBump: { id: "cozy-dog-house", percent: 15 } });
    await page.getByRole("button", { name: /Pawprint Wallet/ }).click();

    await expect(page.getByText("your total changed")).toBeVisible();
    await expect(wallet(page)).toContainText("$49.99 → $57.49");
    await expect(wallet(page)).toContainText("you'll send$57.51");
  });
});

test.describe("place order button moments", () => {
  test("success: 'order placed' beat, then the receipt", async ({ page }) => {
    await page.goto("/shop/cozy-dog-house");
    await page.getByRole("button", { name: /add to cart/ }).click();
    await page.getByRole("link", { name: "go to checkout" }).click();
    await fillShipping(page);
    await page.getByRole("button", { name: /place order/ }).first().click();
    await expect(page.getByRole("button", { name: /order placed/ })).toBeVisible();
    await expect(page).toHaveURL(/\/order\/confirmed$/);
  });

  test("network error: message next to the button, form kept, 'try again'", async ({ page }) => {
    await page.goto("/shop/cozy-dog-house");
    await page.getByRole("button", { name: /add to cart/ }).click();
    await page.getByRole("link", { name: "go to checkout" }).click();
    await fillShipping(page);
    await page.route("**/api/checkout", (route) => route.abort());

    await page.getByRole("button", { name: /place order/ }).first().click();
    await expect(page.getByRole("alert").filter({ hasText: "Network hiccup" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Jane Doe");
    await expect(page.getByRole("button", { name: /try again/ }).first()).toBeEnabled();
  });
});
