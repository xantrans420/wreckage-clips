import { TrainingDay, Weekday, WEEKDAYS } from '../types';

/**
 * A -> B -> C rotation. The rotation follows *completed sessions*, not the
 * calendar: whichever session you did last, the next gym day gets the next
 * letter. This survives missed days without desyncing.
 */
const ORDER: TrainingDay[] = ['A', 'B', 'C'];

export function nextDay(last: TrainingDay | null): TrainingDay {
  if (last === null) return 'A';
  const i = ORDER.indexOf(last);
  return ORDER[(i + 1) % ORDER.length]!;
}

/** How many sessions completed so far maps to the next letter. */
export function dayFromCompletedCount(count: number): TrainingDay {
  return ORDER[count % ORDER.length]!;
}

/** Is `date` a configured gym day? date is YYYY-MM-DD. */
export function isGymDay(date: string, gymDays: Weekday[]): boolean {
  return gymDays.includes(weekdayOf(date));
}

/** Weekday label for a YYYY-MM-DD string, computed in local time. */
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(y!, (m ?? 1) - 1, d ?? 1).getDay(); // 0 = Sun
  // Map JS Sun..Sat (0..6) to our Mon..Sun array.
  const idx = js === 0 ? 6 : js - 1;
  return WEEKDAYS[idx]!;
}
