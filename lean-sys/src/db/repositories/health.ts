import { getDb } from '../database';
import { HealthDaily } from '../../types';

/** Cache of the day's metrics pulled from the OS health store, per profile. */
export async function upsertHealthDaily(profileId: number, entry: HealthDaily): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO health_daily (profile_id, date, steps, active_kcal, resting_hr, sleep_hours)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, date) DO UPDATE SET
       steps = excluded.steps,
       active_kcal = excluded.active_kcal,
       resting_hr = excluded.resting_hr,
       sleep_hours = excluded.sleep_hours`,
    profileId,
    entry.date,
    entry.steps,
    entry.active_kcal,
    entry.resting_hr,
    entry.sleep_hours,
  );
}

export async function getHealthDaily(profileId: number, date: string): Promise<HealthDaily | null> {
  const db = await getDb();
  return (await db.getFirstAsync<HealthDaily>('SELECT * FROM health_daily WHERE profile_id = ? AND date = ?', profileId, date)) ?? null;
}
