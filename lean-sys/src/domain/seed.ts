import { Equipment, TrainingDay } from '../types';

/**
 * The hard-coded protocol. This app is not a generic tracker — it is *this*
 * split and *these* foods, seeded once on first launch, editable after.
 */

export interface SeedExercise {
  day: TrainingDay;
  name: string;
  scheme: string;
  note?: string;
  /** machines_only replacement when equipment != free_weights. */
  machineSwap?: { name: string; scheme?: string };
}

/**
 * 3 sessions/week, rotate A -> B -> C in any order. Posture-biased
 * (heavy rows / rear delts / face pulls) because rounded-shoulder posture is a
 * bigger visual problem than the fat.
 */
export const SPLIT: SeedExercise[] = [
  // Day A — full, push bias
  { day: 'A', name: 'Goblet / leg press', scheme: '3x8-10', machineSwap: { name: 'Leg press' } },
  { day: 'A', name: 'DB bench press', scheme: '3x8-10', machineSwap: { name: 'Chest press machine' } },
  { day: 'A', name: 'Lat pulldown', scheme: '3x10' },
  { day: 'A', name: 'Seated cable row', scheme: '3x10', note: 'posture' },
  { day: 'A', name: 'DB shoulder press', scheme: '3x10', machineSwap: { name: 'Shoulder press machine' } },
  { day: 'A', name: 'Plank', scheme: '3x40s' },

  // Day B — full, pull/hinge bias
  {
    day: 'B',
    name: 'Romanian deadlift',
    scheme: '3x8-10',
    machineSwap: { name: 'Leg curl + back extension', scheme: '3x10' },
  },
  { day: 'B', name: 'One-arm DB row', scheme: '3x10', machineSwap: { name: 'Seated cable row' } },
  { day: 'B', name: 'Incline DB press', scheme: '3x10', machineSwap: { name: 'Incline chest press machine' } },
  { day: 'B', name: 'Face pulls', scheme: '3x15', note: 'fixes rounded shoulders' },
  { day: 'B', name: 'Leg curl', scheme: '3x12' },
  { day: 'B', name: 'Hanging knee raise', scheme: '3x12', machineSwap: { name: 'Captain’s chair knee raise' } },

  // Day C — full, strength mix
  { day: 'C', name: 'Deadlift / trap-bar', scheme: '3x6-8', machineSwap: { name: 'Leg press', scheme: '3x8' } },
  { day: 'C', name: 'Pull-up / assisted', scheme: '3xmax', machineSwap: { name: 'Assisted pull-up / lat pulldown', scheme: '3x10' } },
  { day: 'C', name: 'Flat DB bench', scheme: '3x10', machineSwap: { name: 'Chest press machine' } },
  { day: 'C', name: 'Bulgarian split squat', scheme: '3x10/leg', machineSwap: { name: 'Leg press', scheme: '3x12' } },
  { day: 'C', name: 'Lateral raise', scheme: '3x15', machineSwap: { name: 'Lateral raise machine' } },
  { day: 'C', name: 'Cable crunch', scheme: '3x15' },
];

/** Resolve the split against the operator's equipment config. */
export function resolveSplit(equipment: Equipment): { day: TrainingDay; name: string; scheme: string; note: string | null }[] {
  return SPLIT.map((ex) => {
    if (equipment === 'machines_only' && ex.machineSwap) {
      return {
        day: ex.day,
        name: ex.machineSwap.name,
        scheme: ex.machineSwap.scheme ?? ex.scheme,
        note: ex.note ?? null,
      };
    }
    return { day: ex.day, name: ex.name, scheme: ex.scheme, note: ex.note ?? null };
  });
}

/** Quick-add "My foods". kcal / protein grams. */
export const SEED_FOODS: { name: string; kcal: number; protein_g: number }[] = [
  { name: 'Chicken thigh 150g', kcal: 290, protein_g: 38 },
  { name: 'Rice 200g', kcal: 260, protein_g: 5 },
  { name: '3 eggs', kcal: 210, protein_g: 18 },
  { name: 'Quark 250g', kcal: 170, protein_g: 30 },
  { name: 'Protein shake', kcal: 130, protein_g: 25 },
];

/** Static reference cards. Kept as data so the UI stays declarative. */
export const PLATE_FORMULA = [
  '1 palm+ protein',
  '1 fist carb (2 on train days)',
  '2 handfuls veg',
  '1 thumb fat',
];

export const BATCH_PREP =
  'Cook protein + carbs in bulk for 3 days. Assemble a plate in 90 seconds. ' +
  'Abs are built in training, revealed in the kitchen.';

/** Default owner profile — pre-loaded, editable in settings. */
/** Operator 1 — primary. Fully seeded, not asked. */
export const DEFAULT_PROFILE = {
  name: 'Primary',
  height_cm: 197,
  weight_kg: 95,
  age: 36,
  sex: 'male' as const,
  activity_mult: 1.375, // 3x gym + daily walking
  deficit: 300, // easy. do not raise for this profile.
  equipment: 'free_weights' as const, // locked for Op1
  gym_days: ['Mon', 'Wed', 'Fri'] as const,
};

/**
 * Operator 2 — secondary. Profile only at launch: female/38, but height, weight
 * and deficit are collected on setup, and her TRAINING PLAN IS NOT SEEDED — it
 * stays empty and assignable. Do not fabricate one.
 */
export const SECONDARY_PROFILE = {
  name: 'Secondary',
  sex: 'female' as const,
  age: 38,
  // Sentinels until setup fills them in (onboarded flag gates target display).
  height_cm: 0,
  weight_kg: 0,
  activity_mult: 1.375,
  deficit: 300,
  equipment: 'free_weights' as const,
  gym_days: ['Mon', 'Wed', 'Fri'] as const,
};

/** Daily walking target that feeds the step nudge. */
export const STEP_GOAL = 8000;
export const STEP_GOAL_STRETCH = 10000;

/** The core rule, surfaced everywhere. */
export const PRIORITY_ORDER = ['protein', 'stay near target', 'lift hard', 'walk', 'sleep'];
