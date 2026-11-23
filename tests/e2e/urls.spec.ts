import { expect, test } from "@playwright/test";

/*
 * A doubled slash (https://site//admin/login) used to crash the page: the
 * client router read "//admin/login" as another host and history.replaceState
 * threw a SecurityError. middleware.ts now collapses the slashes first.
 */

test("a doubled slash redirects to the clean URL (status and query kept)", async ({ request, baseURL }) => {
  for (const [path, expected] of [
    ["//admin/login", "/admin/login"],
    ["//admin/login?next=%2Fadmin%2Forders", "/admin/login?next=%2Fadmin%2Forders"],
    ["///shop//", "/shop/"],
    ["//grooming", "/grooming"],
  ]) {
    const res = await request.get(`${baseURL}${path}`, { maxRedirects: 0 });
    expect(res.status(), path).toBe(308);
    // Production sends a relative Location, dev an absolute one: both resolve the same.
    const location = new URL(res.headers()["location"] ?? "", baseURL);
    expect(location.pathname + location.search, path).toBe(expected);
    expect(location.origin, path).toBe(new URL(baseURL!).origin);
  }
  // Normal URLs are left alone.
  const ok = await request.get(`${baseURL}/grooming`, { maxRedirects: 0 });
  expect(ok.status()).toBe(200);
});

test("opening //admin/login in a browser lands on the login page without a crash", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseURL}//admin/login`);
  await expect(page).toHaveURL(`${baseURL}/admin/login`);
  await expect(page.getByLabel("Password")).toBeVisible();
  expect(errors).toEqual([]);
});

test("when the host serves //admin/login without redirecting (Netlify), the page still doesn't crash", async ({ page, baseURL }) => {
  // Netlify tidies the path on the server, so middleware never redirects and the
  // browser keeps "//admin/login" in the address bar. Reproduce that: answer the
  // doubled-slash URL with the normal page's HTML, no redirect.
  const html = await (await page.request.get(`${baseURL}/admin/login`)).text();
  await page.route(`${baseURL}//admin/login`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseURL}//admin/login`);
  await expect(page).toHaveURL(`${baseURL}/admin/login`);
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("a doubled slash on a shop page also recovers", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseURL}//grooming`);
  await expect(page).toHaveURL(`${baseURL}/grooming`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors.filter((m) => /SecurityError|replaceState/.test(m))).toEqual([]);
});
