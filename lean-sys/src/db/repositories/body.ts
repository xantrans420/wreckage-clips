import { getDb } from '../database';
import { Photo, PhotoAngle, WeightLog } from '../../types';

// --- Weight ---

export async function logWeight(date: string, kg: number): Promise<void> {
  const db = await getDb();
  // One weigh-in per date; re-logging overwrites (same day, morning, empty).
  await db.runAsync(
    'INSERT INTO weight_log (date, kg) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg',
    date,
    kg,
  );
}

export async function getWeightHistory(): Promise<WeightLog[]> {
  const db = await getDb();
  return db.getAllAsync<WeightLog>('SELECT * FROM weight_log ORDER BY date ASC');
}

export async function getLatestWeight(): Promise<WeightLog | null> {
  const db = await getDb();
  return (await db.getFirstAsync<WeightLog>('SELECT * FROM weight_log ORDER BY date DESC LIMIT 1')) ?? null;
}

export async function getFirstWeight(): Promise<WeightLog | null> {
  const db = await getDb();
  return (await db.getFirstAsync<WeightLog>('SELECT * FROM weight_log ORDER BY date ASC LIMIT 1')) ?? null;
}

export async function deleteWeight(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM weight_log WHERE id = ?', id);
}

// --- Photos ---

export async function savePhoto(entry: Omit<Photo, 'id'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO photo (date, angle, file_uri, weight_kg) VALUES (?, ?, ?, ?)',
    entry.date,
    entry.angle,
    entry.file_uri,
    entry.weight_kg,
  );
}

export async function getPhotos(): Promise<Photo[]> {
  const db = await getDb();
  return db.getAllAsync<Photo>('SELECT * FROM photo ORDER BY date DESC, angle');
}

export async function getPhotoDates(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string }>('SELECT DISTINCT date FROM photo ORDER BY date DESC');
  return rows.map((r) => r.date);
}

export async function getPhotosForDate(date: string): Promise<Photo[]> {
  const db = await getDb();
  return db.getAllAsync<Photo>('SELECT * FROM photo WHERE date = ?', date);
}

export async function getPhoto(date: string, angle: PhotoAngle): Promise<Photo | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<Photo>('SELECT * FROM photo WHERE date = ? AND angle = ? ORDER BY id DESC LIMIT 1', date, angle)) ??
    null
  );
}

export async function deletePhoto(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM photo WHERE id = ?', id);
}
