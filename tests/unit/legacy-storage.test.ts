import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CART_KEY,
  LEGACY_CART_KEY,
  readStoredWithLegacy,
  writeStoredAndDropLegacy,
} from "@/lib/legacy-storage";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

let storage: ReturnType<typeof fakeStorage>;
const install = (initial?: Record<string, string>) => {
  storage = fakeStorage(initial);
  vi.stubGlobal("window", { localStorage: storage });
};

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

describe("legacy storage keys (cozypaws-* → nuzz-*)", () => {
  it("reads a cart saved under the old key", () => {
    install({ [LEGACY_CART_KEY]: '[{"id":"a","qty":2}]' });
    expect(readStoredWithLegacy(CART_KEY, LEGACY_CART_KEY)).toBe('[{"id":"a","qty":2}]');
  });

  it("prefers the new key when both exist", () => {
    install({ [CART_KEY]: "new", [LEGACY_CART_KEY]: "old" });
    expect(readStoredWithLegacy(CART_KEY, LEGACY_CART_KEY)).toBe("new");
  });

  it("returns null when nothing is stored", () => {
    expect(readStoredWithLegacy(CART_KEY, LEGACY_CART_KEY)).toBeNull();
  });

  it("saving writes the new key and removes the old one", () => {
    install({ [LEGACY_CART_KEY]: "old" });
    writeStoredAndDropLegacy(CART_KEY, LEGACY_CART_KEY, "fresh");
    expect(storage.data.get(CART_KEY)).toBe("fresh");
    expect(storage.data.has(LEGACY_CART_KEY)).toBe(false);
  });

  it("returns null instead of throwing when storage is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked");
      },
    });
    expect(readStoredWithLegacy(CART_KEY, LEGACY_CART_KEY)).toBeNull();
  });
});
