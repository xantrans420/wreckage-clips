/** Local-date helpers. All persisted dates are YYYY-MM-DD in the device's
 * local timezone (a morning weigh-in should read as the day you weighed). */

export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

export function daysBetween(a: string, b: string): number {
  const MS = 86400000;
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / MS);
}

/** Short human label, e.g. "21 Jul". */
export function shortLabel(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = fromIso(iso);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
