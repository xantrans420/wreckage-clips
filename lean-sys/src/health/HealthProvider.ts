/**
 * One interface over Apple HealthKit (iOS) and Health Connect (Android).
 *
 * Garmin integration is deliberately indirect: Garmin Connect syncs to the OS
 * health store automatically once the user enables it, and we read from there.
 * No Garmin credentials, no Garmin API, nothing to break on Garmin's side.
 *
 * Health data is ENRICHMENT, never a hard dependency. If permission is denied
 * or no provider exists, the app runs fully on manual entry.
 */

export interface WatchWorkout {
  /** HealthKit / Health Connect activity label, e.g. "TraditionalStrengthTraining". */
  type: string;
  start: string; // ISO
  durationMin: number;
  activeKcal: number | null;
  /** True when this looks like a gym/strength session we can auto-complete from. */
  isStrength: boolean;
}

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  steps: number | null;
  activeKcal: number | null;
  restingHR: number | null;
  sleepHours: number | null;
  workouts: WatchWorkout[];
}

export interface HealthProvider {
  /** Human label for the underlying store, for the setup screen. */
  readonly platformName: string;
  /** Is this provider usable on the current device/build at all? */
  isAvailable(): Promise<boolean>;
  /** Prompt for read permissions. Returns whether they were granted. */
  requestPermissions(): Promise<boolean>;
  getDailyMetrics(date: string): Promise<DailyMetrics>;
}

/** Empty metrics for the manual-only fallback. */
export function emptyMetrics(date: string): DailyMetrics {
  return { date, steps: null, activeKcal: null, restingHR: null, sleepHours: null, workouts: [] };
}

/**
 * Whether a workout type from the health store looks like a strength/gym
 * session — matched loosely so it works across HealthKit's PascalCase names
 * ("TraditionalStrengthTraining") and Health Connect's UPPER_SNAKE
 * ("STRENGTH_TRAINING", "WEIGHTLIFTING"). A match auto-completes that day's
 * training session.
 */
export function looksLikeStrength(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('strength') || t.includes('weight') || t.includes('functional') || t.includes('crosstraining') || t.includes('hiit') || t.includes('interval');
}
