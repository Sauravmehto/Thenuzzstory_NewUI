import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { stubWhatsapp } from "./helpers";

/*
 * Grooming: the customer request → admin confirmation flow, on the real app.
 * Test data only: the e2e server stores everything under .data-e2e (see
 * playwright.config.ts), and this file starts from an empty grooming store.
 */

const GROOMING_DIR = path.join(process.cwd(), ".data-e2e", "grooming");
const ADMIN_PASSWORD = "e2e-admin-password";

test.describe.configure({ mode: "serial" });

/** The store's date (IST) plus `days`, as YYYY-MM-DD. */
function storeDate(days: number) {
  return new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
}
const TOMORROW = storeDate(1);
const DAY_AFTER = storeDate(2);

async function adminLogin(page: Page, next = "/admin/grooming") {
  await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith(next));
}

/** Same-origin JSON call from inside the page (admin writes need the Origin header). */
async function api<T = Record<string, unknown>>(page: Page, url: string, init: { method?: string; json?: unknown; headers?: Record<string, string> } = {}) {
  return page.evaluate(
    async ({ url, init }) => {
      const res = await fetch(url, {
        method: init.method ?? "GET",
        headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      });
      return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
    },
    { url, init },
  ) as Promise<{ status: number; body: T }>;
}

/** Opening hours every day, 10:00-19:00, 1-hour slots, one pet at a time; every service takes one slot (spa takes two). */
async function openBooking(page: Page, enabled = true) {
  const pricing = (await api<{ pricing: { services: { id: string; slotsNeeded: number | null }[] } }>(page, "/api/admin/grooming/pricing")).body.pricing;
  for (const s of pricing.services) s.slotsNeeded = s.id === "dog-spa" ? 2 : 1;
  expect((await api(page, "/api/admin/grooming/pricing", { method: "PUT", json: { pricing } })).status).toBe(200);
  await setAvailability(page, enabled);
}

async function setAvailability(page: Page, enabled = true) {
  const hours = [{ open: "10:00", close: "19:00" }];
  const availability = {
    bookingEnabled: enabled,
    slotMinutes: 60,
    weekly: { mon: hours, tue: hours, wed: hours, thu: hours, fri: hours, sat: hours, sun: hours },
    capacityPerSlot: 1,
    capacityOverrides: [],
    closedDates: [],
    blockedSlots: [],
    minNoticeMinutes: 0,
    maxDaysAhead: 30,
  };
  const res = await api(page, "/api/admin/grooming/availability", { method: "PUT", json: { availability } });
  expect(res.status).toBe(200);
}

async function pickDate(page: Page, date: string) {
  const day = page.locator(`.gr-cal__day[data-date="${date}"]`);
  if (!(await day.isVisible().catch(() => false))) await page.getByRole("button", { name: "Next month" }).click();
  await expect(day).toBeEnabled();
  await day.click();
}

function bookingBody(start: string, phone: string, date = TOMORROW) {
  return {
    pet: { species: "dog", name: "Racer", breedId: "beagle", weightKg: 12 },
    selection: { mainId: "maintenance", extraIds: [] },
    slot: { date, start },
    customer: { name: "Race Tester", phone },
    seen: { estimate: { lines: [{ serviceId: "maintenance", name: "Maintenance", cents: 34900, role: "main" }], totalCents: 34900 } },
  };
}

let bookingId = "";
let statusUrl = "";

test.beforeAll(async () => {
  await rm(GROOMING_DIR, { recursive: true, force: true });
});

test("admin APIs and pages are closed to visitors", async ({ page, request }) => {
  expect((await request.get("/api/admin/grooming/bookings")).status()).toBe(401);
  expect((await request.get("/api/admin/grooming/pricing")).status()).toBe(401);
  await page.goto("/admin/grooming");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("customers reach date and time even when the old booking switch is off", async ({ page }) => {
  await adminLogin(page);
  await openBooking(page, false);
  await page.goto("/grooming");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("deserves the best");
  // The printed menu, in rupees.
  const table = page.locator(".gr-table");
  await expect(table).toContainText("₹750");
  await expect(table).toContainText("₹2,200");
  await expect(page.locator(".gr-prices")).toContainText("(under 3 months puppy & vaccination records required)");
  // Choose a service from the menu: the booking flow picks it up.
  await page.locator(".gr-svc", { hasText: "Maintenance" }).getByRole("button", { name: /Book this/ }).click();
  await page.getByLabel("Pet's name").fill("Coco");
  await page.getByRole("combobox", { name: "Breed" }).fill("pug");
  await page.getByRole("option", { name: "Pug" }).click();
  await page.getByLabel(/^Weight/).fill("8");
  await page.getByRole("button", { name: "Continue to services" }).click();
  await expect(page.getByText("Online booking for this service opens soon.")).toHaveCount(0);
  await page.getByRole("button", { name: /Continue to date/ }).click();
  await expect(page.locator(".gr-cal")).toBeVisible();
});

test("legacy all-null pricing does not hard-disable booking when availability is on", async ({ page }) => {
  await adminLogin(page);
  // Keep legacy pricing untouched (all service durations null), only enable availability.
  await setAvailability(page, true);
  await page.goto("/grooming");
  await page.locator(".gr-svc", { hasText: "Maintenance" }).getByRole("button", { name: /Book this/ }).click();
  await page.getByLabel("Pet's name").fill("Coco");
  await page.getByRole("combobox", { name: "Breed" }).fill("pug");
  await page.getByRole("option", { name: "Pug" }).click();
  await page.getByLabel(/^Weight/).fill("8");
  await page.getByRole("button", { name: "Continue to services" }).click();
  await page.getByRole("button", { name: /Continue to date/ }).click();
  await expect(page.locator(".gr-cal")).toBeVisible();
});

test("a customer gets a live estimate, picks a time and sends a request (saved as pending)", async ({ page, context }) => {
  await stubWhatsapp(context);
  await adminLogin(page);
  await openBooking(page);

  await page.goto("/grooming#book");
  const book = page.locator("#book");
  await book.getByLabel("Pet's name").fill("Bruno");
  await book.getByRole("combobox", { name: "Breed" }).fill("lab");
  await book.getByRole("option", { name: "Labrador Retriever" }).click();
  await book.getByLabel(/^Weight/).fill("30");
  await expect(book.getByText("That's Large (25–40 kg).")).toBeVisible();
  await book.getByRole("button", { name: "Continue to services" }).click();

  await book.getByText("Dogs Spa Grooming", { exact: true }).click();
  const estimate = page.getByRole("complementary", { name: "Your estimate" });
  await expect(estimate).toContainText("₹1,000");
  await book.locator(".gr-extra", { hasText: "Calming Massage" }).click();
  await expect(estimate.locator(".gr-estimate__total")).toContainText("₹1,499");
  await book.getByRole("button", { name: /Continue to date/ }).click();

  await pickDate(page, TOMORROW);
  await book.getByRole("button", { name: "10 am", exact: true }).click();
  await book.getByRole("button", { name: /Continue to your details/ }).click();

  // Validation explains what's missing, on the field.
  await book.getByRole("button", { name: "Request Grooming Appointment" }).click();
  await expect(book.getByText("Enter your full name.")).toBeVisible();
  await book.getByLabel("Your full name").fill("Asha Verma");
  await book.getByLabel("Mobile number").fill("98765 43210");
  await book.getByRole("button", { name: "Request Grooming Appointment" }).click();

  await expect(page.getByRole("heading", { name: "Request received!" })).toBeVisible();
  await expect(page.getByText("Your grooming appointment request has been received! Our team will contact you shortly to confirm your appointment.")).toBeVisible();
  await expect(page.locator(".gr-done")).toContainText("Pending confirmation");
  bookingId = (await page.locator(".gr-done__facts code").innerText()).trim();
  expect(bookingId).toMatch(/^GR-\d{6}-[2-9A-HJ-NP-Z]{6}$/);
  statusUrl = (await page.getByRole("link", { name: "View request status" }).getAttribute("href")) ?? "";

  // Written by the server, priced by the server.
  const saved = JSON.parse(await readFile(path.join(GROOMING_DIR, "bookings", bookingId), "utf8"));
  expect(saved).toMatchObject({
    status: "pending_confirmation",
    estimate: { totalCents: 149900 },
    pet: { name: "Bruno", sizeBand: "large", breedName: "Labrador Retriever" },
    services: { mainId: "dog-spa", extraIds: ["massage-calming"] },
    requested: { date: TOMORROW, start: "10:00", slots: 3 },
    customer: { phone: "9876543210" },
  });

  // The slot is now held: the calendar no longer offers 10, 11 or 12 o'clock that day.
  const avail = await api<{ days: { date: string; starts: string[] }[] }>(page, `/api/grooming/availability?from=${TOMORROW}&to=${TOMORROW}&main=maintenance`);
  expect(avail.body.days[0]!.starts).not.toContain("10:00");
  expect(avail.body.days[0]!.starts).not.toContain("12:00");
  expect(avail.body.days[0]!.starts).toContain("13:00");
});

test("two people racing for the last seat: exactly one gets it", async ({ page }) => {
  await page.goto("/grooming");
  const [a, b] = await Promise.all([
    api(page, "/api/grooming/bookings", { method: "POST", json: bookingBody("15:00", "9876500001"), headers: { "Idempotency-Key": "race-key-aaaa1" } }),
    api(page, "/api/grooming/bookings", { method: "POST", json: bookingBody("15:00", "9876500002"), headers: { "Idempotency-Key": "race-key-bbbb2" } }),
  ]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  expect(([a, b].find((r) => r.status === 409)!.body as { code: string }).code).toBe("slot_unavailable");
});

test("a double submit (same key) creates one booking", async ({ page }) => {
  await page.goto("/grooming");
  const body = bookingBody("17:00", "9876500003");
  const [a, b] = await Promise.all([
    api<{ booking: { bookingId: string } }>(page, "/api/grooming/bookings", { method: "POST", json: body, headers: { "Idempotency-Key": "double-key-1234" } }),
    api<{ booking: { bookingId: string } }>(page, "/api/grooming/bookings", { method: "POST", json: body, headers: { "Idempotency-Key": "double-key-1234" } }),
  ]);
  expect([a.status, b.status].every((s) => s === 200 || s === 201)).toBe(true);
  expect(a.body.booking.bookingId).toBe(b.body.booking.bookingId);
});

test("the server refuses a price the customer didn't see", async ({ page }) => {
  await page.goto("/grooming");
  const body = bookingBody("18:00", "9876500004");
  body.seen.estimate = { lines: [{ serviceId: "maintenance", name: "Maintenance", cents: 100, role: "main" }], totalCents: 100 };
  const res = await api<{ code: string; estimate: { totalCents: number } }>(page, "/api/grooming/bookings", { method: "POST", json: body });
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ code: "quote_changed", estimate: { totalCents: 34900 } });
});

test("admin confirms, reschedules and cancels; the customer's status page follows", async ({ page, context }) => {
  await stubWhatsapp(context);
  expect(bookingId).not.toBe("");
  await adminLogin(page);

  const row = page.locator(`[data-booking-id="${bookingId}"]`);
  await expect(row).toContainText("Asha Verma");
  await expect(row).toContainText("Bruno");
  await expect(row).toContainText("Dogs Spa Grooming + Calming Massage");
  await expect(row).toContainText("₹1,499");
  await expect(row).toContainText("Pending confirmation");
  await row.getByRole("link", { name: bookingId }).click();

  // Confirm after the call, with a note.
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await page.getByLabel(/Internal note/).fill("Called, confirmed by phone");
  await page.locator(".admin-gr-panel").getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page.getByTestId("booking-status")).toHaveText("Confirmed");

  const customer = await context.newPage();
  await customer.goto(statusUrl);
  await expect(customer.locator(".gr-status")).toHaveText("Confirmed");

  // Reschedule to the day after: the original request stays in the history.
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  await pickDate(page, DAY_AFTER);
  await page.locator(".admin-gr-panel").getByRole("button", { name: "2 pm", exact: true }).click();
  await page.locator(".admin-gr-panel").getByRole("button", { name: "Save new time" }).click();
  await expect(page.locator(".admin-message")).toContainText("Moved to");
  await expect(page.locator(".admin-gr-dl").first()).toContainText("Originally requested");
  await expect(page.locator(".admin-gr-history").first()).toContainText("Rescheduled");

  // WhatsApp: opens a pre-filled message, logged as "opened", never "sent".
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "WhatsApp: Rescheduled" }).click();
  const wa = await popup;
  expect(decodeURIComponent(wa.url())).toContain(bookingId);
  await expect(page.locator(".admin-message")).toContainText("WhatsApp opened");

  // Cancel with a reason: the slot opens up again.
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByLabel(/Reason/).fill("Customer travelling");
  await page.locator(".admin-gr-panel").getByRole("button", { name: "Cancel appointment" }).click();
  await expect(page.getByTestId("booking-status")).toHaveText("Cancelled");
  const avail = await api<{ days: { starts: string[] }[] }>(page, `/api/grooming/availability?from=${DAY_AFTER}&to=${DAY_AFTER}&main=maintenance`);
  expect(avail.body.days[0]!.starts).toContain("14:00");

  await customer.reload();
  await expect(customer.locator(".gr-status")).toHaveText("Cancelled");
  const saved = JSON.parse(await readFile(path.join(GROOMING_DIR, "bookings", bookingId), "utf8"));
  expect(saved.history.map((h: { action: string }) => h.action)).toEqual(["created", "confirm", "reschedule", "cancel"]);
  expect(saved.whatsappLog).toHaveLength(1);
  expect(saved.requested).toMatchObject({ date: TOMORROW, start: "10:00" });
});

test("a status link with the wrong token shows nothing", async ({ page }) => {
  await page.goto(`/grooming/booking/${bookingId}?t=not-the-token`);
  await expect(page.getByRole("heading", { name: "We couldn't find that request" })).toBeVisible();
});

test("Instagram videos: added in admin, nothing loads from Instagram until play", async ({ page }) => {
  await adminLogin(page, "/admin/grooming/videos");
  const add = await api(page, "/api/admin/grooming/content/videos", {
    method: "POST",
    json: { url: "https://www.instagram.com/reel/C0ffeeTest1/", title: "Spa day for Bruno", petName: "Bruno", breed: "Labrador" },
  });
  expect(add.status).toBe(201);
  expect((await api(page, "/api/admin/grooming/content/videos", { method: "POST", json: { url: "https://evil.example/reel/x", title: "Bad" } })).status).toBe(422);

  const instagram: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("instagram.com")) instagram.push(r.url());
  });
  await page.goto("/grooming");
  const card = page.locator(".gr-reel", { hasText: "Spa day for Bruno" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: /Watch on Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/reel/C0ffeeTest1/");
  expect(instagram).toEqual([]);
  await page.route("https://www.instagram.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>embed (test)</p>" }));
  await card.getByRole("button", { name: /Play video/ }).click();
  await expect(card.locator("iframe")).toHaveAttribute("src", "https://www.instagram.com/reel/C0ffeeTest1/embed/");
});

test("gallery: an uploaded photo appears once published, and disappears when unpublished", async ({ page }) => {
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp({ create: { width: 800, height: 900, channels: 3, background: "#e7a44d" } }).jpeg().toBuffer();
  await adminLogin(page, "/admin/grooming/gallery");
  const upload = await page.evaluate(async (bytes) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "test.jpg");
    const res = await fetch("/api/admin/grooming/media", { method: "POST", body: form });
    return { status: res.status, body: (await res.json()) as { src?: string } };
  }, [...jpeg]);
  expect(upload.status).toBe(201);
  expect(upload.body.src).toMatch(/^\/api\/grooming\/media\/[a-f0-9]{64}\.jpg$/);
  // A text file pretending to be an image is refused (decoded, not trusted by name).
  const fake = await page.evaluate(async () => {
    const form = new FormData();
    form.append("file", new Blob(["not an image"], { type: "image/jpeg" }), "fake.jpg");
    return (await fetch("/api/admin/grooming/media", { method: "POST", body: form })).status;
  });
  expect(fake).toBe(422);

  const add = await api<{ items: { id: string; petName?: string }[] }>(page, "/api/admin/grooming/content/gallery", {
    method: "POST",
    json: { src: upload.body.src, alt: "Mango the beagle after a spa bath", petName: "Mango", breed: "Beagle", service: "Dogs Spa Grooming" },
  });
  expect(add.status).toBe(201);
  const mango = add.body.items.find((i) => i.petName === "Mango")!;

  await page.goto("/grooming");
  const tile = page.locator(".gr-gallery__item", { hasText: "Mango" });
  await expect(tile).toBeVisible();
  await expect(tile).toContainText("Beagle");
  await expect(tile.locator(".gr-gallery__sample")).toHaveCount(0); // a real photo isn't labelled as a sample
  const img = await page.request.get(upload.body.src!);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/jpeg");

  expect((await api(page, `/api/admin/grooming/content/gallery/${mango.id}`, { method: "PATCH", json: { active: false } })).status).toBe(200);
  await page.goto("/grooming");
  await expect(page.locator(".gr-gallery__item", { hasText: "Mango" })).toHaveCount(0);
});

test("no serious axe violations on /grooming", async ({ page }) => {
  await page.goto("/grooming");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
});

test("phone layout: no sideways scroll, sticky book bar after the hero", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/grooming");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.locator("#prices").scrollIntoViewIfNeeded();
  await expect(page.locator(".gr-sticky")).toHaveAttribute("data-show", "true");
  await ctx.close();
});
