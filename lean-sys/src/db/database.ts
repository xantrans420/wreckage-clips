import * as SQLite from 'expo-sqlite';
import { DEFAULT_PROFILE, SEED_FOODS, resolveSplit } from '../domain/seed';
import { Equipment, Weekday } from '../types';

/**
 * Local-first storage. One SQLite file on-device. No backend, no accounts, no
 * network. This is deliberate: the progress photos are half-naked mirror shots
 * and they never leave the device.
 */

const DB_NAME = 'leansys.db';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(_db);
  return _db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
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
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  date      TEXT NOT NULL,
  name      TEXT NOT NULL,
  kcal      REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g   REAL,
  fat_g     REAL
);
CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log(date);

CREATE TABLE IF NOT EXISTS saved_food (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  kcal      REAL NOT NULL,
  protein_g REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  day      TEXT NOT NULL,               -- 'A' | 'B' | 'C'
  name     TEXT NOT NULL,
  scheme   TEXT NOT NULL,
  note     TEXT,
  order_no INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lift_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  set_no      INTEGER NOT NULL,
  weight_kg   REAL NOT NULL,
  reps        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lift_log_ex_date ON lift_log(exercise_id, date);

CREATE TABLE IF NOT EXISTS weight_log (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  kg   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS photo (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  date      TEXT NOT NULL,
  angle     TEXT NOT NULL,              -- 'front' | 'side' | 'relaxed'
  file_uri  TEXT NOT NULL,
  weight_kg REAL
);
CREATE INDEX IF NOT EXISTS idx_photo_date ON photo(date);

CREATE TABLE IF NOT EXISTS health_daily (
  date        TEXT PRIMARY KEY,
  steps       INTEGER,
  active_kcal REAL,
  resting_hr  REAL,
  sleep_hours REAL
);

-- A lift session is marked done either by logging sets or by the watch bridge.
CREATE TABLE IF NOT EXISTS session_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  date   TEXT NOT NULL,
  day    TEXT NOT NULL,                 -- 'A' | 'B' | 'C'
  source TEXT NOT NULL DEFAULT 'manual' -- 'manual' | 'watch'
);
CREATE INDEX IF NOT EXISTS idx_session_date ON session_log(date);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA);
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'schema_version');
  const version = row ? Number(row.value) : 0;
  // Future migrations key off `version` here.
  if (version < 1) {
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'schema_version', '1');
  }
}

/**
 * First-launch seed. Writes the default owner profile (onboarded = 0 so the
 * app still routes through the equipment question) and the saved-food list.
 * The split is seeded separately once equipment is chosen.
 */
export async function seedIfEmpty(): Promise<void> {
  const db = await getDb();
  const prof = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM profile');
  if (!prof || prof.c === 0) {
    await db.runAsync(
      `INSERT INTO profile (id, height_cm, weight_kg, age, sex, activity_mult, deficit, equipment, gym_days, onboarded)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      DEFAULT_PROFILE.height_cm,
      DEFAULT_PROFILE.weight_kg,
      DEFAULT_PROFILE.age,
      DEFAULT_PROFILE.sex,
      DEFAULT_PROFILE.activity_mult,
      DEFAULT_PROFILE.deficit,
      'free_weights',
      JSON.stringify(DEFAULT_PROFILE.gym_days as unknown as Weekday[]),
    );
  }
  const foods = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM saved_food');
  if (!foods || foods.c === 0) {
    for (const f of SEED_FOODS) {
      await db.runAsync('INSERT INTO saved_food (name, kcal, protein_g) VALUES (?, ?, ?)', f.name, f.kcal, f.protein_g);
    }
  }
}

/**
 * (Re)seed the exercise table from the split for the chosen equipment. Called
 * on onboarding completion and whenever the equipment flag changes. Only reseeds
 * when the operator hasn't customised the split (to avoid clobbering edits).
 */
export async function seedSplit(equipment: Equipment, force = false): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM exercise');
  if (existing && existing.c > 0 && !force) return;
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM exercise');
    const rows = resolveSplit(equipment);
    let order = 0;
    let lastDay = '';
    for (const ex of rows) {
      if (ex.day !== lastDay) {
        order = 0;
        lastDay = ex.day;
      }
      await db.runAsync(
        'INSERT INTO exercise (day, name, scheme, note, order_no) VALUES (?, ?, ?, ?, ?)',
        ex.day,
        ex.name,
        ex.scheme,
        ex.note,
        order++,
      );
    }
  });
}

/** Nuke everything (settings -> reset). Local data only, nothing leaves. */
export async function wipeAll(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM food_log; DELETE FROM saved_food; DELETE FROM exercise;
    DELETE FROM lift_log; DELETE FROM weight_log; DELETE FROM photo;
    DELETE FROM health_daily; DELETE FROM session_log; DELETE FROM profile;
  `);
}
