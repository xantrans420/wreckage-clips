import { getDb } from '../database';
import { Exercise, LiftSet, TrainingDay } from '../../types';
import { shouldAddWeight } from '../../domain/progression';

export async function getExercises(day: TrainingDay): Promise<Exercise[]> {
  const db = await getDb();
  return db.getAllAsync<Exercise>('SELECT * FROM exercise WHERE day = ? ORDER BY order_no', day);
}

export async function getAllExercises(): Promise<Exercise[]> {
  const db = await getDb();
  return db.getAllAsync<Exercise>('SELECT * FROM exercise ORDER BY day, order_no');
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

/** The most recent date on which this exercise was logged (its "last session"). */
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
        'INSERT INTO lift_log (date, exercise_id, set_no, weight_kg, reps) VALUES (?, ?, ?, ?, ?)',
        date,
        exerciseId,
        n++,
        s.weight_kg,
        s.reps,
      );
    }
  });
}

// --- Session completion / rotation ---

export async function markSessionDone(date: string, day: TrainingDay, source: 'manual' | 'watch' = 'manual'): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM session_log WHERE date = ? AND day = ?', date, day);
  if (existing) return;
  await db.runAsync('INSERT INTO session_log (date, day, source) VALUES (?, ?, ?)', date, day, source);
}

export async function completedSessionCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM session_log');
  return row?.c ?? 0;
}

export async function lastCompletedDay(): Promise<TrainingDay | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ day: string }>('SELECT day FROM session_log ORDER BY date DESC, id DESC LIMIT 1');
  return (row?.day as TrainingDay) ?? null;
}

export async function isSessionDone(date: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM session_log WHERE date = ?', date);
  return (row?.c ?? 0) > 0;
}
