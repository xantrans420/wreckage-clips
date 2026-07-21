import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Profile, Targets } from '../types';
import { computeTargets } from '../domain/targets';
import { getProfile, updateProfile as persistProfile } from '../db/repositories/profile';
import { seedIfEmpty, seedSplit } from '../db/database';

interface AppState {
  ready: boolean;
  profile: Profile | null;
  targets: Targets | null;
  refresh: () => Promise<void>;
  patchProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const p = await getProfile();
    setProfile(p);
  }, []);

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      await load();
      setReady(true);
    })();
  }, [load]);

  const patchProfile = useCallback(
    async (patch: Partial<Omit<Profile, 'id'>>) => {
      await persistProfile(patch);
      // If equipment changed and the operator hasn't customised the split, reseed.
      if (patch.equipment) await seedSplit(patch.equipment);
      await load();
    },
    [load],
  );

  const targets = useMemo(() => (profile ? computeTargets(profile) : null), [profile]);

  const value = useMemo<AppState>(
    () => ({ ready, profile, targets, refresh: load, patchProfile }),
    [ready, profile, targets, load, patchProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}
