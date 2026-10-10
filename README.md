# CozyPaws

A playful dog store built with Next.js 15 and React 19, used to explore one question:

**How do you make a checkout feel instant without ever being wrong about money?**

Live: [cozy-paws-beta.vercel.app](https://cozy-paws-beta.vercel.app). Add `?demo=1` to the URL to get the demo controls (slow network, failed requests, price and stock changes).

<!-- TODO: add a GIF of the cart → price-change → confirm flow here -->

---

## The problem

Shopping flows have two jobs that pull against each other:

- **Feel instant.** Waiting for a spinner on every "+" tap feels broken.
- **Be correct.** Prices and stock change on the server. The customer should never be charged an amount they didn't see.

The same tension shows up anywhere money moves: a wallet showing a pending transaction, or a swap quote that moves before you confirm.

## Key decisions

### 1. Optimistic cart, but the server owns price and stock

Every cart change updates the UI immediately, then `POST /api/cart` validates it against live stock.

- **Confirmed**: the pending value becomes the real one.
- **Out of stock**: the line drops back to what's actually available and a polite toast explains why ("Only 1 left…").
- **Network failure**: full rollback plus an error toast. Nothing is persisted until the server agrees.

State is split into `confirmed` (persisted) and `pending` (in flight) in a pure reducer (`lib/cart-state.ts`). Rapid taps send **absolute** quantities with increasing sequence numbers, so responses that arrive out of order are ignored rather than overwriting newer state.

*Rejected:* waiting for the server on every tap (slow), or trusting the client (wrong totals). Also rejected React's `useOptimistic`: it's scoped to a transition, and this cart needs optimistic state that outlives any one request and survives several of them overlapping.

### 2. A stale-quote review instead of silently re-pricing

The checkout sends what the customer **saw** (lines and total), never a price to charge. The server re-prices from its own catalog. If anything moved, it returns `409 quote_changed` with a per-line diff, and the UI shows **"Your total changed"** with `$49.99 → $57.49` and an explicit *confirm new total* button.

Orders carry an `Idempotency-Key`, so a double-click or a retry after a network blip can't create two orders. The button is also locked synchronously on the first click.

*Rejected:* charging the new price silently (breaks trust), or failing with a generic error (loses the order).

### 3. Search with no network request

The catalog is local, so live search filters on the client. `useDeferredValue` keeps typing responsive while the grid re-renders. The URL updates with `router.replace` on a 250ms debounce: links are shareable and back-button history stays clean. With a server-side catalog I'd debounce the fetch and cancel stale requests with `AbortController`; here that would be complexity for nothing.

### 4. Wallet checkout as a state machine (simulated)

"Pay with wallet" walks through connect → review → sign → pending (confirmations) → confirmed, plus the paths that matter just as much: **signature rejected** (nothing sent, retry with the same price), **insufficient funds** (caught before asking for a signature) and **price moved** (shown in review before signing).

- The price is locked with `POST /api/quote` **before** the signature, because a wallet user signs an exact amount; a card flow can re-confirm after, a wallet flow can't.
- The flow is one discriminated union + pure reducer (`lib/wallet-machine.ts`), so impossible states (e.g. "pending" without a signature) can't be represented. Unit-tested.
- The dialog can't be dismissed while a transaction is confirming.
- **Everything is simulated** (`lib/sim-wallet.ts`) and labelled as such in the UI. A real build would swap that file for wagmi/viem.

## Craft details

- **Feedback where you're looking.** The product photo flies into the cart icon (Web Animations API on a throwaway clone, skipped for reduced motion), "add to cart" turns into "added ✓", the cart badge bumps, and the new line is highlighted in the drawer. On phones a sticky buy bar appears once the main button scrolls away.
- **Pages with a point of view.** The About page swaps the usual stat tiles for "the Biscuit test" (products that failed, stamped REJECTED, with a chew-o-meter), a timeline whose scribble draws itself as you scroll (CSS scroll-driven animation), and team cards that flip to show each dog's file. The Contact page adds fields for the topic you pick (order number, company, a pet photo), ends with a stamp, and shows the store's address, phone and directions next to an embedded Google map.
- **A map that doesn't cost the page anything.** The Contact page uses the store's Google Maps embed with `loading="lazy"`, so it only loads when you scroll near it. Next to it: the address (with a copy button), a tap-to-call phone link and a Get directions button.
- **Mistakes are cheap.** Removing an item collapses the row (it slides out and the gap closes, instead of the list jumping) and the toast offers **Undo**, which puts the item back in its old position. Keyboard focus lands on Undo, then back on the restored row. The toast pauses while you hover or focus it and animates out. When the server corrects a row (stock) or a request fails, the row itself flashes and says why ("only 1 left", "not saved, back to 1"), not only the toast.
- **Checkout that doesn't punish.** One set of validation rules runs on the client and the server. Fields are checked when you leave them and re-checked as you fix them, so no round trip to find a typo. No example values as placeholders.
- **Every button state is deliberate.** Place order goes idle → placing (spinner, disabled) → "order placed ✓" for a beat → receipt. Failures shake the button (motion only; the reason is always in text next to it) and the label becomes "try again". Totals count to their new value instead of jumping.
- **One motion system.** Durations and easings are tokens (`--dur-fast/base/slow`, `--ease-out/in-out/spring` in `base.css`). Hover lifts only apply on devices that really hover, so nothing "sticks" after a tap.
- **Loading that keeps its shape.** Route skeletons (`loading.tsx`), a checkout skeleton until the saved cart is read, and images that fade in over a shimmer. Images go through `next/image`, so phones get right-sized files: product-page LCP on a throttled mobile connection went from ~4.6s to ~1.4s, with zero layout shift.
- **Transitions with meaning.** The shop photo morphs into the product page (View Transitions API, with a plain navigation as fallback), pages fade in, the filter highlight slides between pills, quantities roll in the direction they changed, the wishlist star pops, and crossing the free-delivery line gets a small celebration. All of it is skipped under reduced motion.
- **Every screen size.** Checked at 320–1920px: no horizontal scroll, 2-up product grid on phones, 44px tap areas on small links and remove buttons, a sticky "place order" bar wherever checkout is one column, and dialogs that scroll on short landscape phones.
- **A real confirmation page.** `/order/confirmed` survives a refresh and "back" never re-shows the filled checkout. The receipt has items, totals, the ship-to address, a delivery window and what happens next.
- **No flicker on fast networks.** "Saving…" only appears if a request takes longer than 300ms (`useDelayedFlag`).
- **Accessible drawers.** Real modal dialogs: focus moves in and returns to the trigger, Tab is trapped, Esc closes, and the page behind is `inert`.
- **Announced changes.** Toasts, result counts and checkout errors use live regions. Validation errors set `aria-invalid` and focus the first bad field.
- **A homepage that loads light.** Pet photos go through `next/image` and lazy-load below the fold (image data for a full scroll went from 1.65MB to ~150KB). Scroll-effect setup waits for idle time (`useIdleReady`), and the pinned "we wanna be where the dogs are" section pins with a transform, so there's no layout shift (CLS 1.9 → 0). Throttled mobile LCP is under a second.
- **Scroll that feels alive, not busy.** Subtle parallax on the hero pets, a navbar that tucks away when you scroll down and comes back (with a blurred backdrop) when you scroll up, service cards that stack as you scroll on phones, a scroll progress bar (CSS scroll-driven animation, skipped where unsupported), a magnetic "Explore Products" button, and a pause button on the brand marquee.
- **A hero that reacts to the mouse.** The pet you point at pops up and "talks" while the others duck, a soft spotlight follows the cursor, the side cards tilt with a glare, headline letters ripple, the 98K+ stat counts up, and the rating star spins. Pointer effects write CSS variables from one rAF-throttled listener (`useHeroPointer`), so React never re-renders on mouse move; they only run with a real mouse and motion allowed. The headline wraps by word, never mid-word.
- **Reduced motion.** Decorative motion (wiggles, marquee, inertia cards, custom cursor, smooth scroll) is skipped. Functional feedback stays, just without movement.
- **Contrast.** Button and badge orange darkened slightly to reach WCAG AA (4.8:1).
- **Money as integer cents**, formatted only at the edge with `Intl.NumberFormat`.

## Testing

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | pricing, quote diffs, cart reducer (rollback, stale responses, races) |
| End-to-end | Playwright | optimistic update before the response, stock rollback, network failure, rapid clicks, price-change review, double-submit → one order, validation focus, dialog focus trap, live search, reduced motion |
| Accessibility | axe-core | no serious/critical WCAG 2.1 AA violations on the homepage, `/shop`, product pages, `/cart`, `/about` and `/contact` |

GitHub Actions runs typecheck, unit and e2e tests on every PR.

## What I'd do next

- Move the rest of the homepage motion components to TypeScript and refs (they still coordinate across sections with `document.querySelector`).
- Put the idempotency store and demo state somewhere shared (Redis) if this ran on real serverless traffic.
- Measure INP on search and the cart stepper in the field rather than by feel.
- Add Storybook stories for the cart line states (idle, pending, max stock, rolled back).
- Replace the simulated wallet with wagmi/viem on a testnet, and verify the transaction on the server (amount, recipient, confirmations) before fulfilling.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict, for the cart/checkout flow) · GSAP + ScrollTrigger + InertiaPlugin · Lenis · plain per-component CSS · Vitest · Playwright · axe-core

```bash
npm install
npm run dev            # http://localhost:3000 (demo controls show in dev)
npm run typecheck
npm test               # unit
npm run build && npm run test:e2e
```

## Structure

```
app/
  api/cart/          validate one cart change against live stock
  api/checkout/      re-price, detect stale quotes, idempotent orders
  cart/ shop/ about/ contact/
  styles/            per-section CSS; flow.css = cart/checkout states
components/          CartDrawer, CartLineItem, CartPage, CartToast, ShopPage, DemoPanel, homepage motion sections…
lib/
  types.ts money.ts catalog.ts pricing.ts cart-state.ts cart.tsx wishlist.tsx motion.ts
  hooks/             useDialog, useDelayedFlag
  server/            server catalog view + demo cookie
tests/unit/  tests/e2e/
```

## Credits

Product photos are a mix of the project's own images and Unsplash photos (Unsplash License). Newer product photos: ceramic slow bowl by FLOUFFY, cloud nine bed by Brett Wharton, everyday leash by Pozva, fetch ball trio by Ethan Richardson, puddle-proof raincoat by charlesdeluvio, quick-dry spa towel by Hayffield L, snuggle travel blanket by Jessica Bulling, woven basket bed by Jordan Bigelow. The store's contact details live in `lib/contact-places.ts`; the map is the store's official Google Maps embed. Pet-brand logos are fictional. The online shop is a demo: no payments are taken.
