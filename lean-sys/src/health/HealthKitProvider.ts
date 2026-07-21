import { DailyMetrics, HealthProvider, WatchWorkout, emptyMetrics, looksLikeStrength } from './HealthProvider';

/**
 * Apple HealthKit provider (iOS). Backed by `react-native-health`, which needs
 * a dev build / config plugin — it is NOT present in Expo Go. We load it
 * lazily and degrade to manual-only if it isn't linked, so the app never
 * hard-crashes on a managed build.
 */

// react-native-health is optional at build time; typed loosely on purpose.
type AppleHealthKit = any;

let healthKit: AppleHealthKit | null | undefined;

function loadModule(): AppleHealthKit | null {
  if (healthKit !== undefined) return healthKit;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    healthKit = require('react-native-health').default ?? require('react-native-health');
  } catch {
    healthKit = null;
  }
  return healthKit;
}

function dayBounds(date: string): { start: string; end: string } {
  return { start: `${date}T00:00:00.000`, end: `${date}T23:59:59.999` };
}

export class HealthKitProvider implements HealthProvider {
  readonly platformName = 'Apple Health';

  async isAvailable(): Promise<boolean> {
    return loadModule() !== null;
  }

  async requestPermissions(): Promise<boolean> {
    const hk = loadModule();
    if (!hk) return false;
    const perms = {
      permissions: {
        read: [
          hk.Constants?.Permissions?.StepCount,
          hk.Constants?.Permissions?.ActiveEnergyBurned,
          hk.Constants?.Permissions?.RestingHeartRate,
          hk.Constants?.Permissions?.SleepAnalysis,
          hk.Constants?.Permissions?.Workout,
        ].filter(Boolean),
        write: [],
      },
    };
    return new Promise<boolean>((resolve) => {
      hk.initHealthKit(perms, (err: unknown) => resolve(!err));
    });
  }

  async getDailyMetrics(date: string): Promise<DailyMetrics> {
    const hk = loadModule();
    if (!hk) return emptyMetrics(date);
    const { start, end } = dayBounds(date);
    const opts = { startDate: start, endDate: end };

    const steps = await call<{ value: number }>((cb) => hk.getStepCount(opts, cb)).then((r) => r?.value ?? null);
    const activeKcal = await call<{ value: number }[]>((cb) => hk.getActiveEnergyBurned(opts, cb)).then((rows) =>
      rows ? rows.reduce((a, b) => a + (b.value ?? 0), 0) : null,
    );
    const restingHR = await call<{ value: number }[]>((cb) => hk.getRestingHeartRateSamples(opts, cb)).then((rows) =>
      rows && rows.length ? rows[rows.length - 1]!.value : null,
    );
    const sleepHours = await call<{ startDate: string; endDate: string; value: string }[]>((cb) =>
      hk.getSleepSamples(opts, cb),
    ).then((rows) => sleepFromSamples(rows));
    const workouts = await call<any[]>((cb) => hk.getSamples({ ...opts, type: 'Workout' }, cb)).then((rows) =>
      (rows ?? []).map(mapWorkout),
    );

    return { date, steps, activeKcal, restingHR, sleepHours, workouts };
  }
}

function call<T>(fn: (cb: (err: unknown, res: T) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      fn((err, res) => resolve(err ? null : res));
    } catch {
      resolve(null);
    }
  });
}

function sleepFromSamples(rows: { startDate: string; endDate: string; value: string }[] | null): number | null {
  if (!rows || rows.length === 0) return null;
  const asleep = rows.filter((r) => (r.value ?? '').toUpperCase().includes('ASLEEP'));
  const use = asleep.length ? asleep : rows;
  const ms = use.reduce((a, r) => a + (new Date(r.endDate).getTime() - new Date(r.startDate).getTime()), 0);
  return Math.round((ms / 3600000) * 10) / 10;
}

function mapWorkout(w: any): WatchWorkout {
  const type = String(w.activityName ?? w.activityId ?? 'Workout');
  const start = String(w.start ?? w.startDate ?? '');
  const durationMin = w.duration ? Math.round(Number(w.duration) / 60) : 0;
  return {
    type,
    start,
    durationMin,
    activeKcal: w.calories != null ? Number(w.calories) : null,
    isStrength: looksLikeStrength(type),
  };
}
