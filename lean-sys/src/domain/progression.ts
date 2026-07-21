/**
 * Progression cue: when every logged set hit the TOP of the prescribed rep
 * range, flag "add weight next time." Bodyweight / time-based schemes (max,
 * 40s planks) are never flagged.
 */

export interface RepRange {
  low: number;
  high: number | null; // null = "max" or a time hold, no ceiling
}

/** Parse "3x8-10", "3x10", "3xmax", "3x40s", "3x10/leg" into a rep range. */
export function parseScheme(scheme: string): RepRange {
  const rhs = scheme.toLowerCase().split('x')[1] ?? '';
  if (rhs.includes('max') || rhs.includes('s')) return { low: 0, high: null };
  const nums = rhs.replace(/\/.*/, '').match(/\d+/g);
  if (!nums || nums.length === 0) return { low: 0, high: null };
  if (nums.length === 1) return { low: Number(nums[0]), high: Number(nums[0]) };
  return { low: Number(nums[0]), high: Number(nums[1]) };
}

/**
 * Given the reps achieved on each set of the last session and the scheme,
 * decide whether to flag "add weight."
 */
export function shouldAddWeight(lastSessionReps: number[], scheme: string): boolean {
  const range = parseScheme(scheme);
  if (range.high === null) return false; // uncapped / time hold — never auto-flag
  if (lastSessionReps.length === 0) return false;
  return lastSessionReps.every((r) => r >= (range.high as number));
}
