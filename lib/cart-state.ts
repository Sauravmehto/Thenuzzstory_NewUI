import type { CartLine } from "./types";

/*
 * Cart state is split in two:
 *
 *  - `confirmed`: what the server has accepted. This is what we persist.
 *  - `pending`:   what the user asked for and is still in flight.
 *
 * The UI renders confirmed + pending (optimistic), so every tap feels instant.
 * When the server answers we either promote the pending value or roll back.
 *
 * Race conditions: each request gets an increasing `seq`. Tapping "+" three
 * times fast sends qty 2, 3, 4 with seq 1, 2, 3. Responses can arrive in any
 * order, so we remember the newest seq we've settled per item and ignore
 * anything older. The client also sends ABSOLUTE quantities, never "+1", so
 * a late or retried response can't double-count.
 */

export interface PendingChange {
  qty: number;
  seq: number;
  /** Where a re-added line goes (Undo puts it back in its old spot). */
  at?: number;
}

export interface CartState {
  confirmed: CartLine[];
  pending: Record<string, PendingChange>;
  lastSettledSeq: Record<string, number>;
}

export type CartAction =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "request"; id: string; qty: number; seq: number; at?: number }
  | { type: "confirm"; id: string; qty: number; seq: number }
  /** `available` set → clamp to it (stock). Omitted → roll back (network error). */
  | { type: "reject"; id: string; seq: number; available?: number }
  | { type: "replace"; lines: CartLine[] }
  | { type: "clear" };

export const initialCartState: CartState = {
  confirmed: [],
  pending: {},
  lastSettledSeq: {},
};

function withQty(lines: CartLine[], id: string, qty: number, at?: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.id !== id);
  const exists = lines.some((l) => l.id === id);
  if (exists) return lines.map((l) => (l.id === id ? { ...l, qty } : l));
  if (at === undefined || at >= lines.length) return [...lines, { id, qty }];
  const index = Math.max(0, at);
  return [...lines.slice(0, index), { id, qty }, ...lines.slice(index)];
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
    case "replace":
      return { ...initialCartState, confirmed: action.lines };

    case "clear":
      return initialCartState;

    case "request":
      return {
        ...state,
        pending: {
          ...state.pending,
          [action.id]: { qty: action.qty, seq: action.seq, at: action.at },
        },
      };

    case "confirm": {
      const settled = state.lastSettledSeq[action.id] ?? 0;
      if (action.seq < settled) return state; // stale response, a newer one already landed
      const pending = state.pending[action.id];
      return {
        confirmed: withQty(state.confirmed, action.id, action.qty, pending?.at),
        pending: pending?.seq === action.seq ? withoutKey(state.pending, action.id) : state.pending,
        lastSettledSeq: { ...state.lastSettledSeq, [action.id]: action.seq },
      };
    }

    case "reject": {
      const settled = state.lastSettledSeq[action.id] ?? 0;
      if (action.seq < settled) return state;
      const pending = state.pending[action.id];
      const isLatest = pending?.seq === action.seq;
      let confirmed = state.confirmed;
      if (action.available !== undefined) {
        const current = confirmed.find((l) => l.id === action.id)?.qty ?? 0;
        const wanted = isLatest ? pending.qty : current;
        confirmed = withQty(confirmed, action.id, Math.min(wanted, action.available));
      }
      return {
        confirmed,
        pending: isLatest ? withoutKey(state.pending, action.id) : state.pending,
        lastSettledSeq: { ...state.lastSettledSeq, [action.id]: action.seq },
      };
    }
  }
}

/** What the user sees: confirmed lines with in-flight changes applied on top. */
export function selectVisibleLines(state: CartState): CartLine[] {
  let lines = state.confirmed;
  for (const [id, change] of Object.entries(state.pending)) {
    lines = withQty(lines, id, change.qty, change.at);
  }
  return lines;
}

export const selectQty = (state: CartState, id: string): number =>
  state.pending[id]?.qty ?? state.confirmed.find((l) => l.id === id)?.qty ?? 0;
