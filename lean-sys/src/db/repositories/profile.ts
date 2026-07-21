import { getDb } from '../database';
import { Equipment, Profile, Sex, Weekday } from '../../types';

interface ProfileRow {
  id: number;
  height_cm: number;
  weight_kg: number;
  age: number;
  sex: string;
  activity_mult: number;
  deficit: number;
  equipment: string;
  gym_days: string;
  onboarded: number;
}

function hydrate(r: ProfileRow): Profile {
  return {
    id: r.id,
    height_cm: r.height_cm,
    weight_kg: r.weight_kg,
    age: r.age,
    sex: r.sex as Sex,
    activity_mult: r.activity_mult,
    deficit: r.deficit,
    equipment: r.equipment as Equipment,
    gym_days: JSON.parse(r.gym_days) as Weekday[],
    onboarded: r.onboarded === 1,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profile WHERE id = 1');
  return row ? hydrate(row) : null;
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
  const db = await getDb();
  const current = await getProfile();
  if (!current) return;
  const next = { ...current, ...patch };
  await db.runAsync(
    `UPDATE profile SET height_cm=?, weight_kg=?, age=?, sex=?, activity_mult=?, deficit=?, equipment=?, gym_days=?, onboarded=?
     WHERE id = 1`,
    next.height_cm,
    next.weight_kg,
    next.age,
    next.sex,
    next.activity_mult,
    next.deficit,
    next.equipment,
    JSON.stringify(next.gym_days),
    next.onboarded ? 1 : 0,
  );
}
