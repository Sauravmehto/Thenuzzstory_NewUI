import type { Category, Product } from "./types";
import { REMOTE_ASSETS } from "./remote-assets";

export const PRODUCTS: readonly Product[] = [
  { id: "peanut-butter-bites", name: "peanut butter bites", priceCents: 999, category: "food & treats", img: "/assets/pets/cat3.avif", badge: "bestseller", stock: 40 },
  { id: "superfood-kibble", name: "superfood kibble", priceCents: 3499, category: "food & treats", img: REMOTE_ASSETS.superfoodKibble, stock: 25 },
  { id: "dental-chew-pack", name: "dental chew pack", priceCents: 1299, category: "food & treats", img: REMOTE_ASSETS.dentalChewPack, stock: 30 },
  { id: "ceramic-slow-bowl", name: "ceramic slow bowl", priceCents: 1899, category: "food & treats", img: "/assets/products/ceramic-slow-bowl.jpg", stock: 16 },
  { id: "rope-tug-bundle", name: "rope tug bundle", priceCents: 1199, category: "toys & play", img: "/assets/pets/toy1.avif", badge: "bestseller", stock: 18 },
  { id: "squeaky-friends-set", name: "squeaky friends set", priceCents: 899, category: "toys & play", img: "/assets/pets/toy2.avif", stock: 22 },
  { id: "puzzle-feeder-pro", name: "puzzle feeder pro", priceCents: 2499, category: "toys & play", img: "/assets/pets/toy3.avif", badge: "only 3 left", stock: 3 },
  { id: "fetch-ball-trio", name: "fetch ball trio", priceCents: 999, category: "toys & play", img: "/assets/products/fetch-ball-trio.jpg", stock: 35 },
  { id: "cozy-dog-house", name: "cozy dog house", priceCents: 4999, category: "comfy beds", img: "/assets/pets/house1.avif", badge: "bestseller", stock: 2 },
  { id: "cloud-nine-bed", name: "cloud nine bed", priceCents: 7999, category: "comfy beds", img: "/assets/products/cloud-nine-bed.jpg", stock: 6 },
  { id: "woven-basket-bed", name: "woven basket bed", priceCents: 5999, category: "comfy beds", img: "/assets/products/woven-basket-bed.jpg", badge: "new", stock: 8 },
  { id: "adventure-harness", name: "adventure harness", priceCents: 2999, category: "walk & travel", img: REMOTE_ASSETS.adventureHarness, stock: 12 },
  { id: "everyday-leash", name: "everyday leash", priceCents: 1999, category: "walk & travel", img: "/assets/products/everyday-leash.jpg", stock: 20 },
  { id: "puddle-proof-raincoat", name: "puddle-proof raincoat", priceCents: 3499, category: "walk & travel", img: "/assets/products/puddle-proof-raincoat.jpg", badge: "new", stock: 10 },
  { id: "snuggle-travel-blanket", name: "snuggle travel blanket", priceCents: 2499, category: "walk & travel", img: "/assets/products/snuggle-travel-blanket.jpg", stock: 14 },
  { id: "gentle-grooming-kit", name: "gentle grooming kit", priceCents: 2799, category: "grooming & care", img: "/assets/pets/gromming.avif", stock: 9 },
  { id: "paw-balm-duo", name: "paw balm duo", priceCents: 1599, category: "grooming & care", img: REMOTE_ASSETS.pawBalmDuo, stock: 15 },
  { id: "quick-dry-spa-towel", name: "quick-dry spa towel", priceCents: 1499, category: "grooming & care", img: "/assets/products/quick-dry-spa-towel.jpg", stock: 20 },
];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export const getProduct = (id: string): Product | undefined => byId.get(id);

export const CATEGORY_ACCENT: Record<Category, string> = {
  "food & treats": "var(--color-green)",
  "toys & play": "var(--color-darkblue)",
  "comfy beds": "var(--color-orange)",
  "walk & travel": "var(--color-maroon)",
  "grooming & care": "var(--color-pink)",
};
