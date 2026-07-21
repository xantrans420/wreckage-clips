import { DailyMetrics, HealthProvider, WatchWorkout, emptyMetrics, looksLikeStrength } from './HealthProvider';

/**
 * Android Health Connect provider. Backed by `react-native-health-connect`,
 * loaded lazily — absent in Expo Go, present only in a dev build. Degrades to
 * manual-only when unavailable.
 */

type HC = any;

let hc: HC | null | undefined;

function loadModule(): HC | null {
  if (hc !== undefined) return hc;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    hc = require('react-native-health-connect');
  } catch {
    hc = null;
  }
  return hc;
}

function timeFilter(date: string) {
  return {
    timeRangeFilter: {
      operator: 'between',
      startTime: `${date}T00:00:00.000Z`,
      endTime: `${date}T23:59:59.999Z`,
    },
  };
}

export class HealthConnectProvider implements HealthProvider {
  readonly platformName = 'Health Connect';

  async isAvailable(): Promise<boolean> {
    const m = loadModule();
    if (!m) return false;
    try {
      const status = await m.getSdkStatus();
      return status === m.SdkAvailabilityStatus?.SDK_AVAILABLE;
    } catch {
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    const m = loadModule();
    if (!m) return false;
    try {
      await m.initialize();
      const granted = await m.requestPermission([
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'RestingHeartRate' },
        { accessType: 'read', recordType: 'SleepSession' },
        { accessType: 'read', recordType: 'ExerciseSession' },
      ]);
      return Array.isArray(granted) && granted.length > 0;
    } catch {
      return false;
    }
  }

  async getDailyMetrics(date: string): Promise<DailyMetrics> {
    const m = loadModule();
    if (!m) return emptyMetrics(date);
    try {
      await m.initialize();
    } catch {
      return emptyMetrics(date);
    }

    const steps = await sum(m, 'Steps', date, (r: any) => r.count ?? 0);
    const activeKcal = await sum(m, 'ActiveCaloriesBurned', date, (r: any) => r.energy?.inKilocalories ?? 0);
    const restingHR = await latest(m, 'RestingHeartRate', date, (r: any) => r.beatsPerMinute ?? null);
    const sleepHours = await sleep(m, date);
    const workouts = await exercises(m, date);

    return { date, steps, activeKcal, restingHR, sleepHours, workouts };
  }
}

async function read(m: HC, recordType: string, date: string): Promise<any[]> {
  try {
    const res = await m.readRecords(recordType, timeFilter(date));
    return res?.records ?? [];
  } catch {
    return [];
  }
}

async function sum(m: HC, type: string, date: string, pick: (r: any) => number): Promise<number | null> {
  const rows = await read(m, type, date);
  if (rows.length === 0) return null;
  return Math.round(rows.reduce((a, r) => a + pick(r), 0));
}

async function latest(m: HC, type: string, date: string, pick: (r: any) => number | null): Promise<number | null> {
  const rows = await read(m, type, date);
  if (rows.length === 0) return null;
  return pick(rows[rows.length - 1]);
}

async function sleep(m: HC, date: string): Promise<number | null> {
  const rows = await read(m, 'SleepSession', date);
  if (rows.length === 0) return null;
  const ms = rows.reduce((a, r) => a + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()), 0);
  return Math.round((ms / 3600000) * 10) / 10;
}

async function exercises(m: HC, date: string): Promise<WatchWorkout[]> {
  const rows = await read(m, 'ExerciseSession', date);
  return rows.map((r: any): WatchWorkout => {
    const type = String(r.exerciseType ?? r.title ?? 'Exercise');
    const durationMin = r.startTime && r.endTime
      ? Math.round((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000)
      : 0;
    return { type, start: String(r.startTime ?? ''), durationMin, activeKcal: null, isStrength: looksLikeStrength(type) };
  });
}
