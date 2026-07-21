import { Profile, Targets } from '../types';

/**
 * Mifflin-St Jeor. Targets are COMPUTED, never stored — they self-update the
 * moment weight changes. This is the single source of truth for every number
 * the app shows.
 *
 *   BMR (male)   = 10*kg + 6.25*cm - 5*age + 5
 *   BMR (female) = 10*kg + 6.25*cm - 5*age - 161
 *   Maintenance  = BMR * activity_mult
 *   Cut target   = Maintenance - deficit
 *   Protein      = bodyweight_kg * 1.9  (high — protects muscle during recomp)
 *
 * Reference operator at 95kg / 197cm / 35 male / 1.375:
 *   maintenance ~= 2720, cut ~= 2420, protein ~= 180 g/day.
 */

export const PROTEIN_PER_KG = 1.9;

export function computeBmr(profile: Pick<Profile, 'weight_kg' | 'height_cm' | 'age' | 'sex'>): number {
  const base = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

export function computeTargets(profile: Profile): Targets {
  const bmr = computeBmr(profile);
  const maintenance = bmr * profile.activity_mult;
  const cutTarget = maintenance - profile.deficit;
  const proteinG = profile.weight_kg * PROTEIN_PER_KG;
  return {
    bmr: Math.round(bmr),
    maintenance: Math.round(maintenance),
    cutTarget: Math.round(cutTarget),
    proteinG: Math.round(proteinG),
  };
}
