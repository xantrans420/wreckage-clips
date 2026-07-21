import { getDb } from '../database';
import { FoodLog, SavedFood } from '../../types';

export interface DayTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function logFood(profileId: number, entry: Omit<FoodLog, 'id'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO food_log (profile_id, date, name, kcal, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?, ?, ?)',
    profileId,
    entry.date,
    entry.name,
    entry.kcal,
    entry.protein_g,
    entry.carbs_g,
    entry.fat_g,
  );
}

export async function logSavedFood(profileId: number, saved: SavedFood, date: string): Promise<void> {
  await logFood(profileId, { date, name: saved.name, kcal: saved.kcal, protein_g: saved.protein_g, carbs_g: null, fat_g: null });
}

export async function deleteFood(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_log WHERE id = ?', id);
}

export async function getFoodLog(profileId: number, date: string): Promise<FoodLog[]> {
  const db = await getDb();
  return db.getAllAsync<FoodLog>('SELECT * FROM food_log WHERE profile_id = ? AND date = ? ORDER BY id DESC', profileId, date);
}

export async function getDayTotals(profileId: number, date: string): Promise<DayTotals> {
  const db = await getDb();
  const row = await db.getFirstAsync<DayTotals>(
    `SELECT COALESCE(SUM(kcal),0) AS kcal, COALESCE(SUM(protein_g),0) AS protein_g,
            COALESCE(SUM(carbs_g),0) AS carbs_g, COALESCE(SUM(fat_g),0) AS fat_g
     FROM food_log WHERE profile_id = ? AND date = ?`,
    profileId,
    date,
  );
  return row ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
}

// --- Saved foods ("My foods") ---

export async function getSavedFoods(profileId: number): Promise<SavedFood[]> {
  const db = await getDb();
  return db.getAllAsync<SavedFood>('SELECT * FROM saved_food WHERE profile_id = ? ORDER BY name', profileId);
}

export async function addSavedFood(profileId: number, food: Omit<SavedFood, 'id'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO saved_food (profile_id, name, kcal, protein_g) VALUES (?, ?, ?, ?)',
    profileId,
    food.name,
    food.kcal,
    food.protein_g,
  );
}

export async function deleteSavedFood(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM saved_food WHERE id = ?', id);
}
