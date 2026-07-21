import { getDb, seedFoodsForProfile, seedSplit, setActiveProfileId } from '../database';
import { Equipment, Profile, Sex, Weekday } from '../../types';
import { DEFAULT_PROFILE } from '../../domain/seed';

interface ProfileRow {
  id: number;
  name: string;
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
    name: r.name,
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

export async function getProfiles(): Promise<Profile[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProfileRow>('SELECT * FROM profile ORDER BY id ASC');
  return rows.map(hydrate);
}

export async function getProfile(id: number): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profile WHERE id = ?', id);
  return row ? hydrate(row) : null;
}

export async function updateProfile(id: number, patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
  const db = await getDb();
  const current = await getProfile(id);
  if (!current) return;
  const next = { ...current, ...patch };
  await db.runAsync(
    `UPDATE profile SET name=?, height_cm=?, weight_kg=?, age=?, sex=?, activity_mult=?, deficit=?, equipment=?, gym_days=?, onboarded=?
     WHERE id = ?`,
    next.name,
    next.height_cm,
    next.weight_kg,
    next.age,
    next.sex,
    next.activity_mult,
    next.deficit,
    next.equipment,
    JSON.stringify(next.gym_days),
    next.onboarded ? 1 : 0,
    id,
  );
  // Keep the split in sync with equipment. A deliberate *change* force-reseeds
  // with the right swaps (the SYS dialog warns it replaces custom edits); an
  // unchanged value still seeds when the table is empty (first onboarding).
  if (patch.equipment) {
    const changed = patch.equipment !== current.equipment;
    await seedSplit(id, patch.equipment, changed);
  }
}

export interface NewProfileInput {
  name: string;
  sex: Sex;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  activity_mult?: number;
  deficit?: number;
  equipment?: Equipment;
  gym_days?: Weekday[];
}

/** Create a second operator (your partner), seed their split + foods, and make
 * them the active profile. Returns the new profile id. */
export async function createProfile(input: NewProfileInput): Promise<number> {
  const db = await getDb();
  const equipment = input.equipment ?? 'free_weights';
  const gymDays = input.gym_days ?? (DEFAULT_PROFILE.gym_days as unknown as Weekday[]);
  const res = await db.runAsync(
    `INSERT INTO profile (name, height_cm, weight_kg, age, sex, activity_mult, deficit, equipment, gym_days, onboarded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    input.name.trim() || 'Operator',
    input.height_cm ?? DEFAULT_PROFILE.height_cm,
    input.weight_kg ?? DEFAULT_PROFILE.weight_kg,
    input.age ?? DEFAULT_PROFILE.age,
    input.sex,
    input.activity_mult ?? DEFAULT_PROFILE.activity_mult,
    input.deficit ?? DEFAULT_PROFILE.deficit,
    equipment,
    JSON.stringify(gymDays),
  );
  const id = res.lastInsertRowId;
  await seedSplit(id, equipment, true);
  await seedFoodsForProfile(id);
  await setActiveProfileId(id);
  return id;
}
