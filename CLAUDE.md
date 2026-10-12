# CozyPaws: project notes for AI coding assistants

Next.js 15 (App Router) + React 19 dog store. Motion-heavy homepage (GSAP, Lenis),
and a cart → checkout flow built around "instant but never wrong about money".

## Structure
- `lib/types.ts`: shared domain + API types. Money is integer **cents** everywhere.
- `data/catalog.json`: the full catalog (draft / active / archived), edited via `/admin` or `npm run catalog`.
  `data/catalog.public.json` (card data: names, prices, packs, images; in every page's bundle via the cart) and
  `data/catalog.details.json` (description + printed label; read only server-side by `lib/server/catalog-details.ts` for
  the product page) are GENERATED from it, published products only. Never hand-edit them.
- `lib/catalog.ts`: the shop's catalog = `catalog.public.json` (client snapshot). `lib/server/catalog.ts` = server's live view.
  Drafts are not in the public file, so cart/quote/checkout treat them as unknown: they can't be bought.
- `lib/catalog-core/`: plain-Node modules (explicit `.ts` imports, no `@/` aliases, so `node scripts/catalog.ts` runs them):
  `schema.ts` (model, validation, publish rules), `file-store.ts` (storage interface + file implementation: swap here to
  move to hosted storage), `importer.ts` (manifest → drafts, idempotent), `admin-ops.ts` (create/edit/status/delete).
- `data/import/product-list.manifest.json`: reviewed list of products made from `source-assets/product_list` (source photos,
  never modified). Label text is verbatim; unknowns go in `flags`. `npm run catalog:images` builds the 1600px copies in
  `public/assets/products/<id>/<view>.jpg`.
- `/admin` (`app/admin`, `components/admin`, `app/api/admin`): local admin. Needs `ADMIN_PASSWORD` in `.env.local`; off in
  production builds. Every admin API route calls `guardAdminApi` (session + same-origin).
- `lib/store-config.ts`: currency + shipping, switched together. `lib/shop-filters.ts`: the /shop filter row.
- Pack sizes: a product's `variants` are sold as SKUs `<id>--<pack>` (e.g. `prey-anchovies--70g`); the product id alone
  can't be bought. `lib/catalog.ts` `getProduct(sku)` resolves a pack, `purchasableId()` picks the default pack.
- `source-assets/`: original product photos and the pricing workbook. Not in `public/`, so never deployed.
  `npm run catalog -- prices "source-assets/product price/<file>.xlsx" [--stock 50] [--apply] [--publish]`.
- Homepage service cards (`lib/data.js` `CARDS_DATA`): a card with a `photo` flips to show it (`FlipCard` in
  `components/ServiceCards.jsx`); the turn is on an inner layer because GSAP transforms `.card`.
- `lib/pricing.ts`: `buildQuote`, `diffQuotes`, shipping rules (pure, unit-tested).
- `lib/cart-state.ts`: pure reducer: `confirmed` vs `pending`, seq numbers for races.
- `lib/cart.tsx`: provider; optimistic updates → `POST /api/cart` → confirm / rollback.
- `app/api/checkout/route.ts`: re-prices server-side; 409 `quote_changed` with a diff; idempotency key.
- `lib/server/demo.ts` + `components/DemoPanel.tsx`: cookie-driven latency / failure / price / stock demo.
- Styles: plain CSS per section in `app/styles/`; flow states in `app/styles/flow.css`.

## Rules
- TypeScript strict for anything in the cart/checkout flow. Homepage motion components are still JS.
- The server is the source of truth for price and stock. The client may be optimistic but must reconcile.
- Never let the client send a price to be charged; send what was *shown* so the server can detect drift.
- Decorative motion must respect `prefers-reduced-motion` (`lib/motion.ts`, `gsap.matchMedia`).
- Prefer refs over `document.querySelector` in new code.
- No new UI libraries.
- Motion: use the tokens in `app/styles/base.css` (`--dur-*`, `--ease-*`), put hover effects behind `@media (hover: hover)`, and give every animation a reduced-motion fallback.
- Homepage: gate non-critical GSAP setup behind `useIdleReady`; pin with `pinType: "transform"` (no layout shift); give below-the-fold images `loading="lazy"`. Final homepage polish lives in `app/styles/home-polish.css` (imported last).
- Images in the flow use `components/SmartImage` (next/image + fade-in); always pass width, height and `sizes`.

## Commands
- `npm run dev` · `npm run build` · `npm run typecheck`
- `npm test` (Vitest) · `npm run test:e2e` (Playwright; run `npm run build:e2e` first: it builds into `.next-e2e`
  with the frozen demo-product fixture `tests/fixtures/catalog.public.e2e.json`, independent of what's published)
- `npm run catalog -- status | import [--apply] | sync-public [--check]` · `npm run catalog:images [-- --check]`
- Never invent prices, stock, weights or specs for imported products; label MRP is a hint only, never the selling price.
