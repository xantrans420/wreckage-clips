import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLOR, FONT, SPACE } from '../theme';
import { Card, Divider, Label, Screen, Stat, T } from '../components/ui';
import { HeroNumber } from '../components/HeroNumber';
import { Bar } from '../components/Bar';
import { ProfileBar } from '../components/ProfileBar';
import { useApp } from '../context/AppContext';
import { todayIso, shortLabel } from '../domain/dates';
import { getDayTotals, DayTotals } from '../db/repositories/fuel';
import { completedSessionCount, isSessionDone } from '../db/repositories/train';
import { getHealthDaily } from '../db/repositories/health';
import { getLatestWeight } from '../db/repositories/body';
import { dayFromCompletedCount, isGymDay } from '../domain/rotation';
import { syncHealthForDate } from '../health';
import { HealthDaily, TrainingDay, WeightLog } from '../types';
import { STEP_GOAL } from '../domain/seed';

export function HomeScreen() {
  const { profile, targets, activeId } = useApp();
  const today = todayIso();
  const [totals, setTotals] = useState<DayTotals>({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [nextDay, setNextDay] = useState<TrainingDay>('A');
  const [doneToday, setDoneToday] = useState(false);
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [weight, setWeight] = useState<WeightLog | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (activeId == null) return;
    setTotals(await getDayTotals(activeId, today));
    setNextDay(dayFromCompletedCount(await completedSessionCount(activeId)));
    setDoneToday(await isSessionDone(activeId, today));
    setHealth(await getHealthDaily(activeId, today));
    setWeight(await getLatestWeight(activeId));
  }, [activeId, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    if (activeId == null) return;
    setRefreshing(true);
    await syncHealthForDate(activeId, today); // no-op if no provider
    await load();
    setRefreshing(false);
  }, [activeId, today, load]);

  if (!profile || !targets) return null;

  const proteinRemaining = targets.proteinG - totals.protein_g;
  const proteinDone = proteinRemaining <= 0;
  const target = profile.deficit > 0 ? targets.cutTarget : targets.maintenance;
  const calRemaining = target - totals.kcal;
  const gymToday = isGymDay(today, profile.gym_days);

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.accent} />}
        >
          <ProfileBar title="LEAN.SYS" />
          <T dim size={FONT.sm} style={{ marginTop: -SPACE.sm, marginBottom: SPACE.md }}>
            {profile.name} · {shortLabel(today)}
          </T>

          {/* HERO — protein remaining. The one number that matters. */}
          <Card style={styles.hero}>
            <HeroNumber
              label="PROTEIN REMAINING TODAY"
              value={proteinRemaining}
              unit="g"
              done={proteinDone}
              sub={`${Math.round(totals.protein_g)} / ${targets.proteinG} g logged`}
            />
            <Bar value={totals.protein_g} target={targets.proteinG} height={8} />
          </Card>

          {/* Calories — secondary. */}
          <Card>
            <View style={styles.statRow}>
              <Stat
                label={profile.deficit > 0 ? 'CAL REMAINING (CUT)' : 'CAL REMAINING'}
                value={String(Math.round(calRemaining))}
                unit="kcal"
                tone={calRemaining < 0 ? 'bad' : undefined}
              />
              <Stat label="EATEN" value={String(Math.round(totals.kcal))} unit="kcal" />
            </View>
            <View style={{ height: SPACE.sm }} />
            <Bar value={totals.kcal} target={target} color={totals.kcal > target ? COLOR.bad : COLOR.textDim} />
            <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
              TARGET {target} kcal · MAINT {targets.maintenance} · NEVER PUSH A HARD DEFICIT
            </T>
          </Card>

          {/* Training status. */}
          <Card>
            <Label>TODAY</Label>
            <View style={styles.trainRow}>
              <View>
                <T size={FONT.xl} bold accent={gymToday && !doneToday}>
                  {doneToday ? 'DONE' : gymToday ? `SESSION ${nextDay}` : 'REST'}
                </T>
                <T dim size={FONT.sm}>
                  {doneToday ? 'session logged' : gymToday ? 'next in A/B/C rotation' : 'not a gym day'}
                </T>
              </View>
              <T faint size={FONT.hero} bold>
                {nextDay}
              </T>
            </View>
          </Card>

          {/* Recovery / walking from watch. Surfaced prominently — sleep matters. */}
          <Card>
            <Label>RECOVERY & WALK</Label>
            <View style={[styles.statRow, { marginTop: SPACE.sm }]}>
              <Stat
                label="STEPS"
                value={health?.steps != null ? health.steps.toLocaleString() : '—'}
                tone={health?.steps != null && health.steps < STEP_GOAL ? 'warn' : health?.steps != null ? 'good' : undefined}
              />
              <Stat label="SLEEP" value={health?.sleep_hours != null ? String(health.sleep_hours) : '—'} unit="h" />
              <Stat label="REST HR" value={health?.resting_hr != null ? String(Math.round(health.resting_hr)) : '—'} />
            </View>
            <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
              {health ? 'from health store' : 'pull to sync · manual entry always works'} · goal {STEP_GOAL / 1000}–10k steps
            </T>
          </Card>

          <Divider />
          <Label>PRIORITY ORDER</Label>
          <T dim size={FONT.sm} style={{ marginTop: SPACE.xs, letterSpacing: 1 }}>
            protein → near target → lift hard → walk → sleep
          </T>
          <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
            Abs are built in training, revealed in the kitchen.
          </T>
          {weight ? (
            <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
              LAST WEIGH-IN {weight.kg} kg · {shortLabel(weight.date)}
            </T>
          ) : null}
          <View style={{ height: SPACE.xl }} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE.lg },
  hero: { borderColor: COLOR.accent, paddingBottom: SPACE.lg },
  statRow: { flexDirection: 'row', gap: SPACE.md },
  trainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.xs },
});
