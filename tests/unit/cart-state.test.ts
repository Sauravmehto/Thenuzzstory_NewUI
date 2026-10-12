import { describe, expect, it } from "vitest";
import { cartReducer, initialCartState, selectVisibleLines, type CartState } from "@/lib/cart-state";

const run = (...actions: Parameters<typeof cartReducer>[1][]): CartState =>
  actions.reduce(cartReducer, initialCartState);

describe("cartReducer", () => {
  it("shows optimistic changes before the server confirms", () => {
    const state = run({ type: "request", id: "a", qty: 2, seq: 1 });
    expect(selectVisibleLines(state)).toEqual([{ id: "a", qty: 2 }]);
    expect(state.confirmed).toEqual([]);
  });

  it("promotes a confirmed change", () => {
    const state = run(
      { type: "request", id: "a", qty: 2, seq: 1 },
      { type: "confirm", id: "a", qty: 2, seq: 1 },
    );
    expect(state.confirmed).toEqual([{ id: "a", qty: 2 }]);
    expect(state.pending).toEqual({});
  });

  it("rolls back on a network failure", () => {
    const state = run(
      { type: "hydrate", lines: [{ id: "a", qty: 1 }] },
      { type: "request", id: "a", qty: 2, seq: 1 },
      { type: "reject", id: "a", seq: 1 },
    );
    expect(selectVisibleLines(state)).toEqual([{ id: "a", qty: 1 }]);
  });

  it("clamps to available stock on a stock rejection", () => {
    const state = run(
      { type: "request", id: "a", qty: 5, seq: 1 },
      { type: "reject", id: "a", seq: 1, available: 2 },
    );
    expect(selectVisibleLines(state)).toEqual([{ id: "a", qty: 2 }]);
  });

  it("ignores stale responses that arrive out of order", () => {
    const state = run(
      { type: "request", id: "a", qty: 2, seq: 1 },
      { type: "request", id: "a", qty: 3, seq: 2 },
      { type: "confirm", id: "a", qty: 3, seq: 2 }, // newer lands first
      { type: "confirm", id: "a", qty: 2, seq: 1 }, // older arrives late: ignored
    );
    expect(state.confirmed).toEqual([{ id: "a", qty: 3 }]);
    expect(selectVisibleLines(state)).toEqual([{ id: "a", qty: 3 }]);
  });

  it("keeps a newer pending value when an older request settles", () => {
    const state = run(
      { type: "request", id: "a", qty: 2, seq: 1 },
      { type: "request", id: "a", qty: 3, seq: 2 },
      { type: "confirm", id: "a", qty: 2, seq: 1 },
    );
    expect(selectVisibleLines(state)).toEqual([{ id: "a", qty: 3 }]);
    expect(state.pending.a).toEqual({ qty: 3, seq: 2 });
  });

  it("puts an undone line back in its old position", () => {
    const lines = [
      { id: "a", qty: 1 },
      { id: "b", qty: 2 },
      { id: "c", qty: 1 },
    ];
    let state: CartState = cartReducer(initialCartState, { type: "hydrate", lines });
    state = cartReducer(state, { type: "request", id: "b", qty: 0, seq: 1 });
    state = cartReducer(state, { type: "confirm", id: "b", qty: 0, seq: 1 });
    expect(selectVisibleLines(state).map((l) => l.id)).toEqual(["a", "c"]);

    state = cartReducer(state, { type: "request", id: "b", qty: 2, seq: 2, at: 1 });
    expect(selectVisibleLines(state).map((l) => l.id)).toEqual(["a", "b", "c"]); // optimistic
    state = cartReducer(state, { type: "confirm", id: "b", qty: 2, seq: 2 });
    expect(state.confirmed).toEqual(lines); // and it stays there once confirmed
  });
});
