import { Platform } from 'react-native';
import { HealthProvider } from './HealthProvider';
import { HealthKitProvider } from './HealthKitProvider';
import { HealthConnectProvider } from './HealthConnectProvider';
import { completedSessionCount, markSessionDone } from '../db/repositories/train';
import { upsertHealthDaily } from '../db/repositories/health';
import { dayFromCompletedCount } from '../domain/rotation';

export * from './HealthProvider';

/** Picks the right store for the OS. iOS -> HealthKit, Android -> Health Connect. */
export function getHealthProvider(): HealthProvider {
  return Platform.OS === 'ios' ? new HealthKitProvider() : new HealthConnectProvider();
}

/**
 * Sync one day's metrics into the active profile's cache, and auto-complete a
 * training session if the watch recorded a strength workout. Safe to call when
 * no provider is available — it simply no-ops.
 *
 * Health data is one physical device/watch per person, so it maps to whichever
 * profile is currently active (the operator wearing the watch).
 */
export async function syncHealthForDate(profileId: number, date: string): Promise<void> {
  const provider = getHealthProvider();
  if (!(await provider.isAvailable())) return;
  const m = await provider.getDailyMetrics(date);
  await upsertHealthDaily(profileId, {
    date: m.date,
    steps: m.steps,
    active_kcal: m.activeKcal,
    resting_hr: m.restingHR,
    sleep_hours: m.sleepHours,
  });
  if (m.workouts.some((w) => w.isStrength)) {
    const nextDay = dayFromCompletedCount(await completedSessionCount(profileId));
    await markSessionDone(profileId, date, nextDay, 'watch');
  }
}
