import { getDb } from '../database';
import { Photo, PhotoAngle, WeightLog } from '../../types';

// --- Weight (per profile) ---

export async function logWeight(profileId: number, date: string, kg: number): Promise<void> {
  const db = await getDb();
  // One weigh-in per date per profile; re-logging overwrites.
  await db.runAsync(
    'INSERT INTO weight_log (profile_id, date, kg) VALUES (?, ?, ?) ON CONFLICT(profile_id, date) DO UPDATE SET kg = excluded.kg',
    profileId,
    date,
    kg,
  );
}

export async function getWeightHistory(profileId: number): Promise<WeightLog[]> {
  const db = await getDb();
  return db.getAllAsync<WeightLog>('SELECT * FROM weight_log WHERE profile_id = ? ORDER BY date ASC', profileId);
}

export async function getLatestWeight(profileId: number): Promise<WeightLog | null> {
  const db = await getDb();
  return (await db.getFirstAsync<WeightLog>('SELECT * FROM weight_log WHERE profile_id = ? ORDER BY date DESC LIMIT 1', profileId)) ?? null;
}

export async function getFirstWeight(profileId: number): Promise<WeightLog | null> {
  const db = await getDb();
  return (await db.getFirstAsync<WeightLog>('SELECT * FROM weight_log WHERE profile_id = ? ORDER BY date ASC LIMIT 1', profileId)) ?? null;
}

export async function deleteWeight(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM weight_log WHERE id = ?', id);
}

// --- Photos (per profile) ---

export async function savePhoto(profileId: number, entry: Omit<Photo, 'id'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO photo (profile_id, date, angle, file_uri, weight_kg) VALUES (?, ?, ?, ?, ?)',
    profileId,
    entry.date,
    entry.angle,
    entry.file_uri,
    entry.weight_kg,
  );
}

export async function getPhotos(profileId: number): Promise<Photo[]> {
  const db = await getDb();
  return db.getAllAsync<Photo>('SELECT * FROM photo WHERE profile_id = ? ORDER BY date DESC, angle', profileId);
}

export async function getPhoto(profileId: number, date: string, angle: PhotoAngle): Promise<Photo | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<Photo>(
      'SELECT * FROM photo WHERE profile_id = ? AND date = ? AND angle = ? ORDER BY id DESC LIMIT 1',
      profileId,
      date,
      angle,
    )) ?? null
  );
}

export async function deletePhoto(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM photo WHERE id = ?', id);
}
