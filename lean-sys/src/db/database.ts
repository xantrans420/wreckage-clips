import * as SQLite from 'expo-sqlite';
import { DEFAULT_PROFILE, SECONDARY_PROFILE, SEED_FOODS, resolveSplit } from '../domain/seed';
import { Equipment, Weekday } from '../types';

/**
 * Local-first storage. One SQLite file on-device. No backend, no accounts, no
 * network. This is deliberate: the progress photos are half-naked mirror shots
 * and they never leave the device.
 *
 * Two operators (you + your wife). Every data table is scoped by profile_id so
 * the two of you keep separate logs, weights, photos, splits and targets on the
 * same device.
 */

const DB_NAME = 'leansys.db';
const CURRENT_VERSION = 2;

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(_db);
  return _db;
}

/** Final-form schema. CREATE IF NOT EXISTS never mutates an existing table — a
 * pre-v2 database is upgraded by the migration below. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  height_cm     REAL NOT NULL,
  weight_kg     REAL NOT NULL,
  age           INTEGER NOT NULL,
  sex           TEXT NOT NULL,
  activity_mult REAL NOT NULL,
  deficit       REAL NOT NULL,
  equipment     TEXT NOT NULL,
  gym_days      TEXT NOT NULL,          -- JSON array of weekday labels
  onboarded     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS food_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  kcal       REAL NOT NULL,
  protein_g  REAL NOT NULL,
  carbs_g    REAL,
  fat_g      REAL
);
CREATE INDEX IF NOT EXISTS idx_food_log_pd ON food_log(profile_id, date);

CREATE TABLE IF NOT EXISTS saved_food (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kcal       REAL NOT NULL,
  protein_g  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_food_p ON saved_food(profile_id);

CREATE TABLE IF NOT EXISTS exercise (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,             -- 'A' | 'B' | 'C'
  name       TEXT NOT NULL,
  scheme     TEXT NOT NULL,
  note       TEXT,
  order_no   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exercise_pd ON exercise(profile_id, day);

CREATE TABLE IF NOT EXISTS lift_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  set_no      INTEGER NOT NULL,
  weight_kg   REAL NOT NULL,
  reps        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lift_log_ex_date ON lift_log(exercise_id, date);

CREATE TABLE IF NOT EXISTS weight_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  kg         REAL NOT NULL,
  UNIQUE(profile_id, date)
);

CREATE TABLE IF NOT EXISTS photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  angle      TEXT NOT NULL,             -- 'front' | 'side' | 'relaxed'
  file_uri   TEXT NOT NULL,
  weight_kg  REAL
);
CREATE INDEX IF NOT EXISTS idx_photo_pd ON photo(profile_id, date);

CREATE TABLE IF NOT EXISTS health_daily (
  profile_id  INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  steps       INTEGER,
  active_kcal REAL,
  resting_hr  REAL,
  sleep_hours REAL,
  PRIMARY KEY (profile_id, date)
);

CREATE TABLE IF NOT EXISTS session_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  day        TEXT NOT NULL,             -- 'A' | 'B' | 'C'
  source     TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_session_pd ON session_log(profile_id, date);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA);
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'schema_version');
  let version = row ? Number(row.value) : 0;

  // Fresh install: SCHEMA already created final-form tables.
  if (version === 0) version = CURRENT_VERSION;

  // Upgrade a pre-multi-profile (v1) database in place, preserving data.
  if (version === 1) {
    await upgradeV1toV2(db);
    version = 2;
  }

  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'schema_version', String(CURRENT_VERSION));
}

/** Rebuild the single-operator v1 schema into the multi-profile v2 schema. All
 * existing rows are assigned to profile 1. Defensive — no released build wrote
 * a v1 DB, but this keeps upgrades lossless if one exists. */
async function upgradeV1toV2(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    // profile: add name, drop the id=1 CHECK by rebuilding.
    await db.execAsync(`
      CREATE TABLE profile_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, height_cm REAL NOT NULL,
        weight_kg REAL NOT NULL, age INTEGER NOT NULL, sex TEXT NOT NULL, activity_mult REAL NOT NULL,
        deficit REAL NOT NULL, equipment TEXT NOT NULL, gym_days TEXT NOT NULL, onboarded INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO profile_new (id, name, height_cm, weight_kg, age, sex, activity_mult, deficit, equipment, gym_days, onboarded)
        SELECT id, 'Operator', height_cm, weight_kg, age, sex, activity_mult, deficit, equipment, gym_days, onboarded FROM profile;
      DROP TABLE profile;
      ALTER TABLE profile_new RENAME TO profile;
    `);
    // Add profile_id to the append-only tables.
    for (const t of ['food_log', 'saved_food', 'exercise', 'lift_log', 'photo', 'session_log']) {
      await db.execAsync(`ALTER TABLE ${t} ADD COLUMN profile_id INTEGER NOT NULL DEFAULT 1;`);
    }
    // weight_log: composite uniqueness needs a rebuild.
    await db.execAsync(`
      CREATE TABLE weight_log_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER NOT NULL DEFAULT 1,
        date TEXT NOT NULL, kg REAL NOT NULL, UNIQUE(profile_id, date)
      );
      INSERT INTO weight_log_new (id, profile_id, date, kg) SELECT id, 1, date, kg FROM weight_log;
      DROP TABLE weight_log;
      ALTER TABLE weight_log_new RENAME TO weight_log;
    `);
    // health_daily: composite PK needs a rebuild.
    await db.execAsync(`
      CREATE TABLE health_daily_new (
        profile_id INTEGER NOT NULL DEFAULT 1, date TEXT NOT NULL, steps INTEGER, active_kcal REAL,
        resting_hr REAL, sleep_hours REAL, PRIMARY KEY (profile_id, date)
      );
      INSERT INTO health_daily_new (profile_id, date, steps, active_kcal, resting_hr, sleep_hours)
        SELECT 1, date, steps, active_kcal, resting_hr, sleep_hours FROM health_daily;
      DROP TABLE health_daily;
      ALTER TABLE health_daily_new RENAME TO health_daily;
    `);
  });
}

// --- Active profile (which operator the UI is currently showing) ---

export async function getActiveProfileId(): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'active_profile');
  if (row) return Number(row.value);
  // Fall back to the first onboarded (or any) profile.
  const first = await db.getFirstAsync<{ id: number }>('SELECT id FROM profile ORDER BY onboarded DESC, id ASC LIMIT 1');
  return first?.id ?? null;
}

export async function setActiveProfileId(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'active_profile', String(id));
}

/**
 * First-launch seed — do not ask, seed both operators (per spec §0):
 *   Op1 (primary): fully seeded, onboarded, with the A/B/C split + saved foods.
 *   Op2 (secondary): female/38 profile stub, onboarded = 0 so height/weight/
 *     deficit are collected on setup, and NO training plan is seeded (it stays
 *     empty and assignable — do not fabricate one).
 * Op1 is the active operator at launch.
 */
export async function seedIfEmpty(): Promise<void> {
  const db = await getDb();
  const prof = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM profile');
  if (prof && prof.c > 0) return;

  // Operator 1 — primary, fully seeded.
  const op1 = await db.runAsync(
    `INSERT INTO profile (name, height_cm, weight_kg, age, sex, activity_mult, deficit, equipment, gym_days, onboarded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    DEFAULT_PROFILE.name,
    DEFAULT_PROFILE.height_cm,
    DEFAULT_PROFILE.weight_kg,
    DEFAULT_PROFILE.age,
    DEFAULT_PROFILE.sex,
    DEFAULT_PROFILE.activity_mult,
    DEFAULT_PROFILE.deficit,
    DEFAULT_PROFILE.equipment,
    JSON.stringify(DEFAULT_PROFILE.gym_days as unknown as Weekday[]),
  );
  const op1Id = op1.lastInsertRowId;
  await seedSplit(op1Id, DEFAULT_PROFILE.equipment, true);
  await seedFoodsForProfile(op1Id);

  // Operator 2 — secondary, profile only. No split seeded.
  const op2 = await db.runAsync(
    `INSERT INTO profile (name, height_cm, weight_kg, age, sex, activity_mult, deficit, equipment, gym_days, onboarded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    SECONDARY_PROFILE.name,
    SECONDARY_PROFILE.height_cm,
    SECONDARY_PROFILE.weight_kg,
    SECONDARY_PROFILE.age,
    SECONDARY_PROFILE.sex,
    SECONDARY_PROFILE.activity_mult,
    SECONDARY_PROFILE.deficit,
    SECONDARY_PROFILE.equipment,
    JSON.stringify(SECONDARY_PROFILE.gym_days as unknown as Weekday[]),
  );
  await seedFoodsForProfile(op2.lastInsertRowId);

  await setActiveProfileId(op1Id);
}

/** Seed the default "My foods" list for a profile (only if it has none). */
export async function seedFoodsForProfile(profileId: number): Promise<void> {
  const db = await getDb();
  const foods = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM saved_food WHERE profile_id = ?', profileId);
  if (foods && foods.c > 0) return;
  for (const f of SEED_FOODS) {
    await db.runAsync(
      'INSERT INTO saved_food (profile_id, name, kcal, protein_g) VALUES (?, ?, ?, ?)',
      profileId,
      f.name,
      f.kcal,
      f.protein_g,
    );
  }
}

/**
 * (Re)seed one profile's exercise table from the split for their equipment.
 * Called on onboarding, on adding a profile, and when equipment changes. Skips
 * profiles that already have exercises unless forced (avoids clobbering edits).
 */
export async function seedSplit(profileId: number, equipment: Equipment, force = false): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM exercise WHERE profile_id = ?', profileId);
  if (existing && existing.c > 0 && !force) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM exercise WHERE profile_id = ?', profileId);
    const rows = resolveSplit(equipment);
    let order = 0;
    let lastDay = '';
    for (const ex of rows) {
      if (ex.day !== lastDay) {
        order = 0;
        lastDay = ex.day;
      }
      await db.runAsync(
        'INSERT INTO exercise (profile_id, day, name, scheme, note, order_no) VALUES (?, ?, ?, ?, ?, ?)',
        profileId,
        ex.day,
        ex.name,
        ex.scheme,
        ex.note,
        order++,
      );
    }
  });
}

/** Wipe just one operator's data (keeps the other profile intact). */
export async function wipeProfileData(profileId: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of ['food_log', 'lift_log', 'weight_log', 'photo', 'health_daily', 'session_log']) {
      await db.runAsync(`DELETE FROM ${t} WHERE profile_id = ?`, profileId);
    }
  });
}

/** Delete an operator entirely (cascades all their data). */
export async function deleteProfile(profileId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM profile WHERE id = ?', profileId);
}

/** Nuke everything (settings -> reset). Local data only, nothing leaves. */
export async function wipeAll(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM food_log; DELETE FROM saved_food; DELETE FROM exercise;
    DELETE FROM lift_log; DELETE FROM weight_log; DELETE FROM photo;
    DELETE FROM health_daily; DELETE FROM session_log; DELETE FROM profile;
    DELETE FROM meta WHERE key = 'active_profile';
  `);
}
