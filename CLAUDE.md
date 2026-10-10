# CozyPaws: project notes for AI coding assistants

Next.js 15 (App Router) + React 19 dog store. Motion-heavy homepage (GSAP, Lenis),
and a cart → checkout flow built around "instant but never wrong about money".

## Structure
- `lib/types.ts`: shared domain + API types. Money is integer **cents** everywhere.
- `lib/catalog.ts`: product catalog (client snapshot). `lib/server/catalog.ts` = server's live view.
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
- `npm test` (Vitest) · `npm run test:e2e` (Playwright; builds must exist: `npm run build` first)
