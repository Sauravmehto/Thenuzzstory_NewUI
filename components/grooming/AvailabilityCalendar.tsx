"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, daysBetween, storeNow, weekdayOf } from "@/lib/grooming/availability";
import { formatDate, formatTime } from "@/lib/grooming/messages";
import type { DayAvailability } from "@/lib/grooming/types";

export interface SlotState {
  time: string;
  status: "available" | "booked" | "unavailable";
  taken: number;
  capacity: number;
}

export type LoadDays = (
  from: string,
  to: string,
) => Promise<{ open: boolean; days: DayAvailability[]; slotStates?: Record<string, SlotState[]> } | { error: string }>;

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const monthEnd = (date: string) => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const nextMonth = (date: string, delta: number) => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
};

/**
 * Month calendar + time slots. Days without a free start time are disabled;
 * times shown are only ones with free capacity for the whole service length.
 * Keyboard: arrow keys move between days (roving tabindex), Enter picks.
 */
export default function AvailabilityCalendar({
  loadDays,
  value,
  onChange,
  maxDaysAhead,
  reloadKey,
  label = "Choose a date",
}: {
  loadDays: LoadDays;
  value: { date: string; start: string } | null;
  onChange: (v: { date: string; start: string } | null) => void;
  maxDaysAhead: number;
  /** Change it to refetch (e.g. after a "slot just taken" answer). */
  reloadKey?: number;
  label?: string;
}) {
  const today = useMemo(() => storeNow().date, []);
  const lastDay = addDays(today, maxDaysAhead);
  const [month, setMonth] = useState(() => monthStart(value?.date ?? today));
  const [days, setDays] = useState<Map<string, DayAvailability>>(new Map());
  const [slotStates, setSlotStates] = useState<Map<string, SlotState[]>>(new Map());
  const [state, setState] = useState<"loading" | "ready" | "closed" | "error">("loading");
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(value?.date ?? null);
  const [focusDate, setFocusDate] = useState<string>(value?.date ?? today);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const from = month < today ? today : month;
    const to = monthEnd(month) > lastDay ? lastDay : monthEnd(month);
    if (to < from) {
      setDays(new Map());
      setSlotStates(new Map());
      setState("ready");
      return;
    }
    setState("loading");
    const res = await loadDays(from, to);
    if ("error" in res) {
      setError(res.error);
      setState("error");
      return;
    }
    if (!res.open) {
      setSlotStates(new Map());
      setState("closed");
      return;
    }
    setDays(new Map(res.days.map((d) => [d.date, d])));
    setSlotStates(new Map(Object.entries(res.slotStates ?? {})));
    setState("ready");
  }, [month, today, lastDay, loadDays]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // The chosen time disappeared (just taken): clear it.
  useEffect(() => {
    if (state !== "ready" || !value) return;
    const d = days.get(value.date);
    if (d && !d.starts.includes(value.start)) onChange(null);
  }, [days, state, value, onChange]);

  const first = monthStart(month);
  const lead = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(weekdayOf(first));
  const count = daysBetween(first, monthEnd(month)) + 1;
  const cells = Array.from({ length: count }, (_, i) => addDays(first, i));
  const canPrev = month > monthStart(today);
  const canNext = nextMonth(month, 1) <= lastDay;
  const bookable = (d: string) => (days.get(d)?.starts.length ?? 0) > 0;

  const moveFocus = (date: string) => {
    if (date.slice(0, 7) !== month.slice(0, 7)) {
      if (date < today || date > lastDay) return;
      setMonth(monthStart(date));
    }
    setFocusDate(date);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus());
  };

  const onKey = (e: React.KeyboardEvent, date: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      moveFocus(addDays(date, step));
    }
  };

  const slotsForDay =
    selectedDate && slotStates.has(selectedDate)
      ? slotStates.get(selectedDate) ?? []
      : selectedDate
        ? (days.get(selectedDate)?.starts ?? []).map((time) => ({ time, status: "available", taken: 0, capacity: 1 } satisfies SlotState))
        : [];
  const showLoad = slotsForDay.some((s) => s.capacity > 1);
  const focusable = cells.includes(focusDate) ? focusDate : (cells.find(bookable) ?? cells[0]!);

  return (
    <div className="gr-cal">
      <div className="gr-cal__month">
        <div className="gr-cal__head">
          <button type="button" className="gr-cal__nav" onClick={() => setMonth(nextMonth(month, -1))} disabled={!canPrev} aria-label="Previous month">
            ‹
          </button>
          <p className="gr-cal__title" aria-live="polite">
            {MONTH.format(new Date(`${month}T00:00:00Z`))}
          </p>
          <button type="button" className="gr-cal__nav" onClick={() => setMonth(nextMonth(month, 1))} disabled={!canNext} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="gr-cal__grid" role="grid" aria-label={label} ref={gridRef} aria-busy={state === "loading"}>
          <div role="row" className="gr-cal__row gr-cal__row--head">
            {WEEK.map((w) => (
              <span role="columnheader" key={w} className="gr-cal__dow">
                {w}
              </span>
            ))}
          </div>
          <div role="row" className="gr-cal__row">
            {Array.from({ length: lead }, (_, i) => (
              <span key={`pad-${i}`} role="gridcell" className="gr-cal__pad" />
            ))}
            {cells.map((date) => {
              const ok = bookable(date);
              const count = days.get(date)?.starts.length ?? 0;
              const isSel = date === selectedDate;
              return (
                <span role="gridcell" key={date}>
                  <button
                    type="button"
                    className="gr-cal__day"
                    data-date={date}
                    data-today={date === today || undefined}
                    data-selected={isSel || undefined}
                    disabled={!ok}
                    aria-disabled={!ok || undefined}
                    aria-pressed={isSel}
                    tabIndex={date === focusable ? 0 : -1}
                    aria-label={`${formatDate(date)}${ok ? `, ${count} time${count === 1 ? "" : "s"} available` : ", not available"}`}
                    onKeyDown={(e) => onKey(e, date)}
                    onFocus={() => setFocusDate(date)}
                    onClick={() => {
                      setSelectedDate(date);
                      if (value?.date !== date) onChange(null);
                    }}
                  >
                    {Number(date.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
        {state === "loading" && <p className="gr-cal__status">Loading available times…</p>}
        {state === "error" && (
          <p className="gr-cal__status gr-cal__status--error" role="alert">
            {error}{" "}
            <button type="button" className="gr-link" onClick={() => void load()}>
              Try again
            </button>
          </p>
        )}
        {state === "ready" && cells.every((d) => !bookable(d)) && <p className="gr-cal__status">No free times this month. Try the next month.</p>}
      </div>

      <div className="gr-cal__slots" aria-live="polite">
        {state === "closed" ? (
          <p className="gr-cal__status">Online booking isn&apos;t open for this service yet.</p>
        ) : !selectedDate ? (
          <p className="gr-cal__hint">Pick a highlighted date to see the times.</p>
        ) : slotsForDay.length === 0 ? (
          <p className="gr-cal__hint">No free times on {formatDate(selectedDate)}.</p>
        ) : (
          <>
            <p className="gr-cal__slots-title">{formatDate(selectedDate)}</p>
            <div className="gr-cal__times" role="group" aria-label={`Times on ${formatDate(selectedDate)}`}>
              {slotsForDay.map((slot) => {
                const t = slot.time;
                const isSel = value?.date === selectedDate && value.start === t;
                const disabled = slot.status !== "available";
                const occupancy = slot.capacity > 1 ? `${slot.taken}/${slot.capacity}` : null;
                const metaText =
                  slot.status === "booked"
                    ? "Booked"
                    : slot.status === "unavailable"
                      ? "Unavailable"
                      : showLoad && occupancy
                        ? `${occupancy} booked`
                        : null;
                const label =
                  slot.status === "booked"
                    ? `${formatTime(t)} (booked)`
                    : slot.status === "unavailable"
                      ? `${formatTime(t)} (not available)`
                      : showLoad && occupancy
                        ? `${formatTime(t)} (${occupancy} booked)`
                        : formatTime(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className="gr-cal__time"
                    aria-pressed={isSel}
                    data-selected={isSel || undefined}
                    data-booked={slot.status === "booked" || undefined}
                    data-unavailable={slot.status === "unavailable" || undefined}
                    aria-label={label}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      onChange({ date: selectedDate, start: t });
                    }}
                  >
                    <span className="gr-cal__time-main">{formatTime(t)}</span>
                    {metaText && (
                      <span className="gr-cal__time-meta">
                        {slot.status === "booked" && (
                          <span className="gr-cal__time-lock" aria-hidden="true">
                            🔒
                          </span>
                        )}
                        {metaText}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="gr-cal__legend">
              <span className="gr-cal__legend-dot gr-cal__legend-dot--free" aria-hidden="true" /> Available
              <span className="gr-cal__legend-dot gr-cal__legend-dot--booked" aria-hidden="true" /> Booked
            </p>
          </>
        )}
      </div>
    </div>
  );
}
