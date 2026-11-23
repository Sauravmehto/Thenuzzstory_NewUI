# The Nuzz Story

An online pet store for dogs and cats, built with Next.js 15 and React 19. The shop sells in Indian rupees, takes orders through WhatsApp (no online payments), and is deployed on Netlify.

The checkout is built around one rule: **it should feel instant, but never be wrong about money.** The cart updates optimistically; the server stays the source of truth for price and stock.

> Store: The Nuzz Story, 40/42 UGF, Market No 1, Main Rd, Chittaranjan Park, New Delhi 110019 (details live in `lib/contact-places.ts`).

## 1. Overview

- A motion-heavy homepage, a shop with filters and search, product pages, a cart, and a WhatsApp checkout.
- Customer accounts (sign in, saved cart and wishlist, order history).
- A local admin for the catalog and orders at `/admin`.
- Money is always stored as **integer minor units** (paise, called `cents` in the code) and formatted only at the edge.

## 2. Technology stack

| Area | Tools |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19 |
| Language | TypeScript (strict) for the shop, cart, checkout, accounts and admin; JavaScript for the homepage motion components |
| Motion | GSAP (ScrollTrigger, Inertia), Lenis smooth scroll |
| Styling | Plain CSS per section in `app/styles/` (no UI library) |
| Storage | Netlify Blobs on Netlify; JSON files under `.data/` locally |
| Images | `next/image`, `sharp` for product image processing |
| Tests | Vitest (unit), Playwright (end-to-end), axe-core (accessibility) |
| Hosting | Netlify (`netlify.toml`, `@netlify/plugin-nextjs`) |

There is no ESLint configuration in the project; type checking (`npm run typecheck`) is the static check.

## 3. Main website features

- Homepage, `/shop` (grid, filter pills, live search, sort), product pages `/shop/[id]`, `/cart`, `/order/confirmed`, `/about`, `/contact`.
- **Premium grooming** at `/grooming`: price list, Instagram Reels, happy-pets gallery, a live price estimate and appointment requests (see section 9a).
- Wishlist drawer, cart drawer, account drawer, toasts with Undo.
- Contact form (`/api/contact`) with topic-specific fields; order numbers are checked against the `NS-…` format (older `CP-…` numbers are still accepted).
- Reduced-motion support: decorative motion is skipped when `prefers-reduced-motion` is set.

## 4. Homepage architecture

`app/page.jsx` composes the sections: `CozyHero`, `VimeoHero`, `HorizontalWords` (pinned section), `MotionCards`, `ServiceCards` (cards can flip to show a photo), `DoubleMarquee`, `Footer`, plus `SmoothScroll` (Lenis), `CursorBubble` and `TransitionScribble`. Content lives in `lib/data.js`. Non-critical GSAP setup waits for idle time (`useIdleReady`), the pinned section uses a transform pin (no layout shift), and below-the-fold images are lazy. Final polish lives in `app/styles/home-polish.css`, imported last.

## 5. Product catalog architecture

- `data/catalog.json` is the full catalog (draft, active, archived products), edited with `/admin` or `npm run catalog`.
- `data/catalog.public.json` (card data, bundled with every page) and `data/catalog.details.json` (description and printed label, read only on the server for product pages) are **generated** from it, published products only. Never edit them by hand.
- `lib/catalog.ts` is the client's snapshot; `lib/server/catalog.ts` is the server's view. Drafts are not in the public file, so the cart and checkout treat them as unknown and they cannot be bought.
- Pack sizes: a product's `variants` are sold as SKUs `<id>--<pack>` (e.g. `prey-anchovies--70g`). The product id alone cannot be bought.
- `lib/catalog-core/` is plain Node (`schema.ts`, `file-store.ts`, `importer.ts`, `admin-ops.ts`, `price-sheet.ts`, `xlsx.ts`) so the `catalog` CLI can run it without Next.js.
- `data/import/product-list.manifest.json` lists the products made from the photos in `source-assets/product_list`. Label text is verbatim; unknowns are flagged, never invented.

## 6. Cart and checkout workflow

1. **Optimistic cart.** `lib/cart-state.ts` is a pure reducer that keeps `confirmed` (accepted by the server) apart from `pending` (in flight). Every change shows immediately, then `POST /api/cart` checks stock. Confirmed → promoted; out of stock → clamped to what is available with a toast and a note on the row; network error → rolled back.
2. **Races.** The client sends absolute quantities with increasing sequence numbers, so late or reordered responses are ignored.
3. **Undo.** Removing a line offers Undo, which puts it back in its old position.
4. **Pricing.** `lib/pricing.ts` (`buildQuote`, `diffQuotes`) is pure and unit-tested. Delivery is ₹79 below ₹499 and free from ₹499 (`lib/store-config.ts`).
5. **Checkout validation.** One set of rules (`lib/validation.ts`: Indian mobile, email, 6-digit PIN, state list) runs on the client and the server.
6. **Quote check.** The client sends what it *showed*, never a price to charge. If the server's price differs, it answers `409 quote_changed` with a per-line diff and the customer confirms the new total.

## 7. WhatsApp ordering

`POST /api/orders` validates the customer, re-prices from the server catalog, compares with the quote the customer saw, **saves the order**, and only then returns a WhatsApp click-to-chat link built from the *saved* order (`lib/whatsapp-order.ts`).

- Order ids look like `NS-241014-7KQ3XM`; orders start as `pending_confirmation` / `payment_pending`.
- An `Idempotency-Key` header makes a double click or retry return the same order.
- If saving fails, no link is returned and the cart is kept.
- Signed-in customers also get the order in their history and their saved cart emptied.
- The team's WhatsApp number is `WHATSAPP_NUMBER` in `lib/store-config.ts`. Payment methods live in `lib/payment-methods.ts` (only WhatsApp today).

## 8. Customer authentication and accounts

- Passwords: scrypt with a random salt per user (`lib/server/auth.ts`).
- Session: httpOnly, SameSite=Lax cookie `nuzz_session` (30 days), signed with HMAC-SHA256 using `AUTH_SECRET`; a per-user `sessionVersion` can invalidate old cookies.
- Writes must pass an Origin check. Sign-in is throttled: 8 failures lock that IP + email for 5 minutes (kept per server instance).
- Carts and wishlists synced to the account are re-validated against the catalog (`lib/server/account-data.ts`).
- UI: `components/AccountDrawer.tsx` (sign in, create account, order history); state in `lib/account.tsx`.
- Production needs `AUTH_SECRET` (32+ characters). Without it, sign-in reports "unavailable" and shopping and guest checkout still work.
- Browser storage keys are `nuzz-cart` and `nuzz-wishlist`. A cart or wishlist saved under the earlier `cozypaws-*` keys is picked up once and moved (`lib/legacy-storage.ts`).

## 9. Admin dashboard

Local admin at `/admin`, protected by `ADMIN_PASSWORD` (cookie `nuzz_admin`, login throttled, every admin API route checks the session and Origin).

- **Catalog** (`/admin`): list, create (`/admin/products/new`), edit, change status (draft / active / archived), delete, upload images, preview a product and the shop as customers will see them.
- **Import** (`/admin/import`): turn the reviewed manifest into drafts (idempotent).
- **Orders** (`/admin/orders`): list saved orders and change the order status and the payment status (the PATCH only touches those two fields).
- The admin is **off in production builds** unless `ADMIN_ENABLE_IN_PRODUCTION=1`, because it writes `data/catalog.json` on disk. On Netlify the file system is read-only, so use it for **orders**; edit the catalog locally and deploy.

CLI equivalents: `npm run catalog -- status | import [--apply] | sync-public [--check] | prices <file> [--apply] [--publish] | show-coming-soon | prices-template`, and `npm run catalog:images [-- --check]` to build the 1600px product images.

## 9a. Grooming appointments

`/grooming` sells the store's grooming service and takes **appointment requests**: pet details → estimated price → shared calendar → request saved as **Pending confirmation**. The team calls the customer, then confirms, reschedules, cancels or rejects it in `/admin/grooming`. Grooming is separate from the product catalog, cart and orders.

- **Prices** come from the printed grooming menu, verbatim, in `data/grooming/pricing.seed.json` (paise). Admin edits are stored separately and every changed price shows "differs from printed menu". The engine is pure (`lib/grooming/pricing.ts`): one main service plus optional extras (quick services, massages), dog sizes by weight with a weight on the line counting as the smaller band (10 kg = Small). No price = "custom quote", never a guess.
- **Breeds** (`lib/grooming/breeds.ts`): popular Indian breeds first, aliases ("gsd", "desi", "lab"), Mixed Breed, Other / Not listed, cats separately. Not every breed in India.
- **Availability** (`lib/grooming/availability.ts`): opening hours per weekday (with breaks), slot length, pets at a time, holidays, blocked times, per-date capacity, minimum notice, days ahead. All in store time (IST). Each service has a duration in slots; **booking stays off** ("call or WhatsApp us") until the store sets hours, durations and turns it on.
- **No overbooking** (`lib/server/grooming-bookings.ts`): each slot has `capacity` seats stored as `claims/<date>/<HHMM>/<seat>`, claimed with "only if new" writes (Netlify Blobs `onlyIfNew` / file flag `wx`). Two people racing for the last seat can't both get it. Pending and confirmed requests hold their seats; cancel and reject free them; reschedule claims the new seats before releasing the old ones. The `Idempotency-Key` is claimed before any seat, so a double click returns the same booking.
- **Server is the source of truth**: every request is re-validated and re-priced; a changed price answers `409 quote_changed` with the new estimate.
- **Customer status page**: `/grooming/booking/<id>?t=<token>` (random token, stored hashed) shows Pending / Confirmed / Rescheduled / Cancelled.
- **WhatsApp**: optional "send details" link after booking, and admin template buttons (request received, confirmed, rescheduled, cancelled). Opening a link is logged as *opened*, never as *sent*.
- **Instagram Reels**: admin pastes a Reel link (only the shortcode is stored). The page shows a cover and loads Instagram's embed only after a click; "Watch on Instagram" is always shown because a private or deleted Reel can't be detected from outside the embed.
- **Gallery photos** are uploaded in admin (≤ 5 MB, shrunk in the browser first), checked and re-encoded with sharp, stored in Blobs and served from `/api/grooming/media/<hash>.jpg`. Sample/stock photos are labelled "Sample photo".
- **Testimonials** are hidden until a real one is published.
- **Storage**: Netlify Blobs store `grooming` on Netlify, `<DATA_DIR or .data>/grooming` locally (`lib/server/grooming-store.ts`). Admin changes go live straight away (on-demand revalidation of `/grooming`).
- **Admin** (`/admin/grooming`, same login): Appointments (status tabs, search, date range, day view, detail with history), Availability, Pricing, Videos, Gallery, Testimonials.

## 10. API routes

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/cart` | POST | Validate one cart change against stock |
| `/api/orders` | POST | Place an order (re-price, save, WhatsApp link) |
| `/api/contact` | POST | Contact form |
| `/api/account/signup`, `/login` | POST | Create account, sign in |
| `/api/account/session` | GET, DELETE | Current user, sign out |
| `/api/account/cart`, `/wishlist` | PUT | Sync the saved cart / wishlist |
| `/api/account/orders` | GET | Order history |
| `/api/admin/session` | POST, DELETE | Admin sign in / out |
| `/api/admin/products` | GET, POST | List / create products |
| `/api/admin/products/[id]` | GET, PATCH, DELETE | Read / edit / delete |
| `/api/admin/products/[id]/status` | POST | Change status |
| `/api/admin/products/[id]/images` | GET, POST | Product images |
| `/api/admin/import` | GET, POST | Preview / apply the manifest import |
| `/api/admin/orders`, `/orders/[id]` | GET, PATCH | List orders / change order or payment status |
| `/api/grooming/availability` | GET | Free start times for a service and date range |
| `/api/grooming/bookings` | POST | Request an appointment (validated, re-priced, seats claimed) |
| `/api/grooming/bookings/[id]?t=` | GET | Customer's booking status |
| `/api/grooming/media/[file]` | GET | Uploaded grooming photos |
| `/api/admin/grooming/bookings`, `/bookings/[id]` | GET, PATCH | List bookings / confirm, reschedule, cancel, reject, complete, note |
| `/api/admin/grooming/pricing`, `/availability` | GET, PUT | Grooming prices / availability |
| `/api/admin/grooming/content/[kind]`, `/[kind]/[id]` | GET, POST, PUT, PATCH, DELETE | Videos, gallery, testimonials (add, reorder, edit, delete) |
| `/api/admin/grooming/media` | POST | Upload a grooming photo |

## 11. Folder structure

```
app/
  api/                 route handlers (cart, orders, contact, account/*, grooming/*, admin/*)
  admin/               admin pages (catalog, import, orders, grooming, login)
  grooming/            grooming page + private booking status page
  shop/ cart/ order/ about/ contact/
  styles/              plain CSS per section; flow.css = cart/checkout states
components/            storefront, drawers, homepage motion sections
  grooming/            grooming sections, booking flow, calendar, breed picker
  admin/               admin UI (admin/grooming: appointments, availability, pricing, content)
lib/
  types.ts money.ts catalog.ts pricing.ts cart-state.ts cart.tsx wishlist.tsx
  validation.ts store-config.ts payment-methods.ts whatsapp-order.ts legacy-storage.ts
  catalog-core/        plain-Node catalog model, storage, importer, price sheet
  grooming/            grooming types, pricing engine, availability, breeds, validation, messages
  server/              catalog view, auth, admin auth, order/account/grooming stores, bookings, demo cookie
  hooks/               useDialog, useIdleReady, useDelayedFlag, …
data/                  catalog.json (+ generated public/details files), import manifest, grooming/pricing.seed.json
scripts/               catalog CLI, product image builder, e2e build
source-assets/         original product photos and pricing workbook (not deployed)
tests/                 unit (Vitest), e2e (Playwright), fixtures
```

## 12. Environment variables

Copy `.env.example` to `.env.local` (never committed).

| Variable | Needed | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | To use `/admin` | Admin login. Empty = admin disabled |
| `ADMIN_SESSION_SECRET` | Optional | Separate secret for admin sessions |
| `ADMIN_ENABLE_IN_PRODUCTION` | Optional | Set to `1` to allow the admin in a production build |
| `AUTH_SECRET` | **Production** | 32+ character secret that signs customer sessions (a dev secret is kept in `.data/` locally) |
| `ACCOUNT_STORE` | Optional | `blobs` or `file` (auto-detected) |
| `DATA_DIR` | Optional | Folder for local accounts, orders and grooming data (default `.data`) |

## 13. Local development

```bash
npm install
cp .env.example .env.local     # set ADMIN_PASSWORD to use /admin
npm run dev                    # http://localhost:3000
```

Add `?demo=1` to a URL to get the demo panel (slow network, failed requests, price and stock changes). The demo cookie only works in development and test builds, never on live prices.

## 14. Testing

```bash
npm run typecheck              # TypeScript
npm test                       # Vitest unit tests
npm run build:e2e              # build the e2e fixture into .next-e2e
npm run test:e2e               # Playwright (needs: npx playwright install chromium)
```

The e2e suite runs against a frozen demo catalog priced in US cents (`tests/fixtures/catalog.public.e2e.json`) with throwaway data in `.data-e2e`, so it never touches the published catalog or real orders. It covers the cart, checkout, filters, search, story pages, admin orders, grooming (booking journey, last-seat race, double submit, price drift, admin confirm / reschedule / cancel, gallery upload, Reel facade) and axe accessibility checks. There are no GitHub Actions workflows in this repository.

On Windows, run the tests from a shell whose working directory uses an uppercase drive letter (`D:\…`); a lowercase `d:\…` path makes Vitest fail with "failed to find the runner".

## 15. Production build

```bash
npm run build
npm run start
```

The Node version is 22 (`netlify.toml`); the catalog CLI needs Node 22.18 or newer.

## 16. Netlify deployment

1. Connect the repository to a Netlify site. `netlify.toml` already sets the build command (`npm run build`), `publish = ".next"`, Node 22 and the Next.js plugin. Do not set a static publish folder.
2. In Site configuration → Environment variables set `AUTH_SECRET` (32+ random characters). Optionally set `ADMIN_PASSWORD` and `ADMIN_ENABLE_IN_PRODUCTION=1` to use `/admin/orders` on the live site.
3. Orders and accounts are stored in Netlify Blobs automatically; no extra setup.
4. Catalog changes are made locally (admin or CLI), committed (`data/catalog*.json`, `public/assets/products/`), and deployed.

## Credits

Product photos in `public/assets/products/` are built from the originals in `source-assets/product_list` (see `npm run catalog:images`).
