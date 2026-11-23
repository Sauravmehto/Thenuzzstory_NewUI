import "server-only";
import { addDays, daysBetween, isDate } from "@/lib/grooming/availability";

/** "from".."to" inclusive, at most `maxDays` days; null when invalid. */
export function dateRange(from: string | null, to: string | null, maxDays = 62): string[] | null {
  if (!isDate(from) || !isDate(to)) return null;
  const span = daysBetween(from, to);
  if (span < 0 || span >= maxDays) return null;
  return Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}
