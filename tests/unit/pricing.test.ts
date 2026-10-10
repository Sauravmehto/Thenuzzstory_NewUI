import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/catalog";
import { addBusinessDays } from "@/lib/delivery";
import { formatPrice } from "@/lib/money";
import { buildQuote, diffQuotes, SHIPPING_CENTS } from "@/lib/pricing";
import type { Product } from "@/lib/types";

describe("buildQuote", () => {
  it("sums in integer cents (no float drift)", () => {
    const quote = buildQuote([{ id: "peanut-butter-bites", qty: 3 }], getProduct);
    expect(quote.subtotalCents).toBe(2997);
    expect(formatPrice(quote.totalCents)).toBe("$34.96");
  });

  it("charges shipping under $50 and waives it at $50+", () => {
    expect(buildQuote([{ id: "rope-tug-bundle", qty: 1 }], getProduct).shippingCents).toBe(SHIPPING_CENTS);
    expect(buildQuote([{ id: "cloud-nine-bed", qty: 1 }], getProduct).shippingCents).toBe(0);
  });

  it("drops unknown products and clamps to stock", () => {
    const quote = buildQuote(
      [
        { id: "not-a-product", qty: 1 },
        { id: "cozy-dog-house", qty: 9 },
      ],
      getProduct,
    );
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0]).toMatchObject({ id: "cozy-dog-house", qty: 2 });
  });
});

describe("diffQuotes", () => {
  const base = getProduct("cozy-dog-house")!;
  const expected = buildQuote([{ id: base.id, qty: 2 }], getProduct).lines;

  it("reports a price move", () => {
    const moved: Product = { ...base, priceCents: 5749 };
    const actual = buildQuote([{ id: base.id, qty: 2 }], () => moved);
    expect(diffQuotes(expected, actual)).toEqual([
      { kind: "price", id: base.id, name: base.name, fromCents: 4999, toCents: 5749 },
    ]);
  });

  it("reports a stock drop and a removal", () => {
    const lowStock = buildQuote([{ id: base.id, qty: 2 }], () => ({ ...base, stock: 1 }));
    expect(diffQuotes(expected, lowStock)).toEqual([
      { kind: "qty", id: base.id, name: base.name, fromQty: 2, toQty: 1 },
    ]);
    const gone = buildQuote([{ id: base.id, qty: 2 }], () => undefined);
    expect(diffQuotes(expected, gone)).toEqual([{ kind: "removed", id: base.id, name: base.name }]);
  });

  it("is empty when nothing changed", () => {
    expect(diffQuotes(expected, buildQuote([{ id: base.id, qty: 2 }], getProduct))).toEqual([]);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    const friday = new Date(2026, 8, 25); // Fri 25 Sep 2026
    expect(addBusinessDays(friday, 1).getDay()).toBe(1); // Monday
    expect(addBusinessDays(friday, 2).getDate()).toBe(29); // Tuesday 29th
  });
});
