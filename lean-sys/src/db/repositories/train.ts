import { getDb } from '../database';
import { Exercise, LiftSet, TrainingDay } from '../../types';
import { shouldAddWeight } from '../../domain/progression';

export async function getExercises(profileId: number, day: TrainingDay): Promise<Exercise[]> {
  const db = await getDb();
  return db.getAllAsync<Exercise>('SELECT * FROM exercise WHERE profile_id = ? AND day = ? ORDER BY order_no', profileId, day);
}

export async function getAllExercises(profileId: number): Promise<Exercise[]> {
  const db = await getDb();
  return db.getAllAsync<Exercise>('SELECT * FROM exercise WHERE profile_id = ? ORDER BY day, order_no', profileId);
}

export async function updateExercise(id: number, patch: Partial<Pick<Exercise, 'name' | 'scheme' | 'note'>>): Promise<void> {
  const db = await getDb();
  const ex = await db.getFirstAsync<Exercise>('SELECT * FROM exercise WHERE id = ?', id);
  if (!ex) return;
  await db.runAsync(
    'UPDATE exercise SET name = ?, scheme = ?, note = ? WHERE id = ?',
    patch.name ?? ex.name,
    patch.scheme ?? ex.scheme,
    patch.note !== undefined ? patch.note : ex.note,
    id,
  );
}

/** The most recent date on which this exercise was logged (its "last session").
 * Exercise ids are already per-profile, so no extra profile filter is needed. */
export async function lastSessionDate(exerciseId: number, before?: string): Promise<string | null> {
  const db = await getDb();
  const row = before
    ? await db.getFirstAsync<{ date: string }>(
        'SELECT MAX(date) AS date FROM lift_log WHERE exercise_id = ? AND date < ?',
        exerciseId,
        before,
      )
    : await db.getFirstAsync<{ date: string }>('SELECT MAX(date) AS date FROM lift_log WHERE exercise_id = ?', exerciseId);
  return row?.date ?? null;
}

export async function getSetsFor(exerciseId: number, date: string): Promise<LiftSet[]> {
  const db = await getDb();
  return db.getAllAsync<LiftSet>(
    'SELECT * FROM lift_log WHERE exercise_id = ? AND date = ? ORDER BY set_no',
    exerciseId,
    date,
  );
}

export interface LastSession {
  date: string;
  sets: LiftSet[];
  /** Progression flag: last session hit the top of the rep range on every set. */
  addWeight: boolean;
}

/** Numbers to beat: the previous logged session for this exercise. */
export async function getLastSession(exercise: Exercise, before: string): Promise<LastSession | null> {
  const date = await lastSessionDate(exercise.id, before);
  if (!date) return null;
  const sets = await getSetsFor(exercise.id, date);
  const addWeight = shouldAddWeight(sets.map((s) => s.reps), exercise.scheme);
  return { date, sets, addWeight };
}

/** Replace the full set list for one exercise on one date (idempotent save). */
export async function saveSets(
  profileId: number,
  exerciseId: number,
  date: string,
  sets: { weight_kg: number; reps: number }[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM lift_log WHERE exercise_id = ? AND date = ?', exerciseId, date);
    let n = 1;
    for (const s of sets) {
      await db.runAsync(
        'INSERT INTO lift_log (profile_id, date, exercise_id, set_no, weight_kg, reps) VALUES (?, ?, ?, ?, ?, ?)',
        profileId,
        date,
        exerciseId,
        n++,
        s.weight_kg,
        s.reps,
      );
    }
  });
}

// --- Session completion / rotation (per profile) ---

export async function markSessionDone(
  profileId: number,
  date: string,
  day: TrainingDay,
  source: 'manual' | 'watch' = 'manual',
): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM session_log WHERE profile_id = ? AND date = ? AND day = ?',
    profileId,
    date,
    day,
  );
  if (existing) return;
  await db.runAsync('INSERT INTO session_log (profile_id, date, day, source) VALUES (?, ?, ?, ?)', profileId, date, day, source);
}

export async function completedSessionCount(profileId: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM session_log WHERE profile_id = ?', profileId);
  return row?.c ?? 0;
}

export async function lastCompletedDay(profileId: number): Promise<TrainingDay | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ day: string }>(
    'SELECT day FROM session_log WHERE profile_id = ? ORDER BY date DESC, id DESC LIMIT 1',
    profileId,
  );
  return (row?.day as TrainingDay) ?? null;
}

export async function isSessionDone(profileId: number, date: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM session_log WHERE profile_id = ? AND date = ?',
    profileId,
    date,
  );
  return (row?.c ?? 0) > 0;
}
