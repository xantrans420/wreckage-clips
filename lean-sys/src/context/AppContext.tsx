import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Profile, Targets } from '../types';
import { computeTargets } from '../domain/targets';
import { getProfile, getProfiles, updateProfile, createProfile, NewProfileInput } from '../db/repositories/profile';
import { getActiveProfileId, seedIfEmpty, setActiveProfileId } from '../db/database';

interface AppState {
  ready: boolean;
  /** Both operators (you + your wife). */
  profiles: Profile[];
  /** The operator currently shown. */
  profile: Profile | null;
  activeId: number | null;
  targets: Targets | null;
  refresh: () => Promise<void>;
  switchProfile: (id: number) => Promise<void>;
  addProfile: (input: NewProfileInput) => Promise<void>;
  /** Patch the active profile. */
  patchProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>;
  /** Patch a specific profile by id. */
  patchProfileById: (id: number, patch: Partial<Omit<Profile, 'id'>>) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const all = await getProfiles();
    setProfiles(all);
    let active = await getActiveProfileId();
    // Guard against a stale/deleted active id.
    if (!active || !all.some((p) => p.id === active)) {
      active = all[0]?.id ?? null;
      if (active) await setActiveProfileId(active);
    }
    setActiveId(active);
  }, []);

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      await load();
      setReady(true);
    })();
  }, [load]);

  const switchProfile = useCallback(
    async (id: number) => {
      await setActiveProfileId(id);
      await load();
    },
    [load],
  );

  const addProfile = useCallback(
    async (input: NewProfileInput) => {
      await createProfile(input); // becomes active
      await load();
    },
    [load],
  );

  const patchProfileById = useCallback(
    async (id: number, patch: Partial<Omit<Profile, 'id'>>) => {
      await updateProfile(id, patch);
      await load();
    },
    [load],
  );

  const patchProfile = useCallback(
    async (patch: Partial<Omit<Profile, 'id'>>) => {
      if (activeId == null) return;
      await updateProfile(activeId, patch);
      await load();
    },
    [activeId, load],
  );

  const profile = useMemo(() => profiles.find((p) => p.id === activeId) ?? null, [profiles, activeId]);
  const targets = useMemo(() => (profile ? computeTargets(profile) : null), [profile]);

  const value = useMemo<AppState>(
    () => ({ ready, profiles, profile, activeId, targets, refresh: load, switchProfile, addProfile, patchProfile, patchProfileById }),
    [ready, profiles, profile, activeId, targets, load, switchProfile, addProfile, patchProfile, patchProfileById],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}

// Re-export for screens that build add-profile forms.
export type { NewProfileInput } from '../db/repositories/profile';
