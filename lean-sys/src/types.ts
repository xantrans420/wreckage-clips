/** Shared domain types for LEAN.SYS. */

export type Sex = 'male' | 'female';
export type Equipment = 'free_weights' | 'machines_only';
export type Platform = 'ios' | 'android';
export type TrainingDay = 'A' | 'B' | 'C';
export type PhotoAngle = 'front' | 'side' | 'relaxed';

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface Profile {
  id: number;
  /** Operator name, e.g. "Tom" / "Anna". Two profiles: you and your wife. */
  name: string;
  height_cm: number;
  weight_kg: number;
  age: number;
  sex: Sex;
  activity_mult: number;
  deficit: number;
  equipment: Equipment;
  /** Days the operator lifts. Order is display order; rotation is A->B->C. */
  gym_days: Weekday[];
  /** Whether the one-time onboarding has been completed. */
  onboarded: boolean;
}

export interface FoodLog {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface SavedFood {
  id: number;
  name: string;
  kcal: number;
  protein_g: number;
}

export interface Exercise {
  id: number;
  day: TrainingDay;
  name: string;
  scheme: string; // e.g. "3x8-10"
  note: string | null; // e.g. "posture"
  order_no: number;
}

export interface LiftSet {
  id: number;
  date: string;
  exercise_id: number;
  set_no: number;
  weight_kg: number;
  reps: number;
}

export interface WeightLog {
  id: number;
  date: string;
  kg: number;
}

export interface Photo {
  id: number;
  date: string;
  angle: PhotoAngle;
  file_uri: string;
  weight_kg: number | null;
}

export interface HealthDaily {
  date: string;
  steps: number | null;
  active_kcal: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
}

/** Live-computed targets — never persisted, always derived from profile. */
export interface Targets {
  bmr: number;
  maintenance: number;
  /** Cut = maintenance - deficit. Equal to maintenance when deficit is 0. */
  cutTarget: number;
  proteinG: number;
}
