/** Adds business days (Mon–Fri), skipping weekends. */
export function addBusinessDays(from: Date, days: number): Date {
  const date = new Date(from);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "Tue 29 Sep – Thu 1 Oct" for a 2–4 business-day window. */
export function deliveryWindow(from: Date, minDays = 2, maxDays = 4): string {
  return `${dayFormat.format(addBusinessDays(from, minDays))} – ${dayFormat.format(addBusinessDays(from, maxDays))}`;
}
