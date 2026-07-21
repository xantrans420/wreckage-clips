import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLOR, FONT, SPACE } from '../theme';
import { Button, Card, Label, Screen, T } from '../components/ui';
import { ExerciseLogger } from '../components/ExerciseLogger';
import { ProfileBar } from '../components/ProfileBar';
import { useApp } from '../context/AppContext';
import { TrainingDay, Exercise } from '../types';
import { todayIso, shortLabel } from '../domain/dates';
import {
  completedSessionCount,
  getAllExercises,
  getExercises,
  isSessionDone,
  markSessionDone,
} from '../db/repositories/train';
import { seedSplit } from '../db/database';
import { dayFromCompletedCount } from '../domain/rotation';

const DAYS: { key: TrainingDay; label: string }[] = [
  { key: 'A', label: 'A · PUSH' },
  { key: 'B', label: 'B · PULL' },
  { key: 'C', label: 'C · STRENGTH' },
];

export function TrainScreen() {
  const { activeId, profile } = useApp();
  const today = todayIso();
  const [day, setDay] = useState<TrainingDay>('A');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [hasPlan, setHasPlan] = useState(true);
  const [done, setDone] = useState(false);
  const [next, setNext] = useState<TrainingDay>('A');

  const load = useCallback(
    async (d: TrainingDay) => {
      if (activeId == null) return;
      setHasPlan((await getAllExercises(activeId)).length > 0);
      setExercises(await getExercises(activeId, d));
      setDone(await isSessionDone(activeId, today));
      setNext(dayFromCompletedCount(await completedSessionCount(activeId)));
    },
    [activeId, today],
  );

  const assignSplit = async () => {
    if (activeId == null || !profile) return;
    // Assign the standard A/B/C split on demand (respects the operator's
    // equipment). This is the "assignable later" path — nothing is fabricated
    // until the operator asks for it here.
    await seedSplit(activeId, profile.equipment, true);
    await load(day);
  };

  useFocusEffect(
    useCallback(() => {
      if (activeId == null) return;
      // On focus, default the tab to the next session in rotation.
      (async () => {
        const n = dayFromCompletedCount(await completedSessionCount(activeId));
        setDay(n);
        await load(n);
      })();
    }, [activeId, load]),
  );

  const pick = async (d: TrainingDay) => {
    setDay(d);
    await load(d);
  };

  const complete = async () => {
    if (activeId == null) return;
    await markSessionDone(activeId, today, day, 'manual');
    await load(day);
  };

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerWrap}>
          <ProfileBar title="TRAIN" />
          <T dim size={FONT.sm} style={{ marginTop: -SPACE.sm, marginBottom: SPACE.md }}>
            {hasPlan ? `NEXT UP IN ROTATION: ${next}` : 'NO PLAN ASSIGNED'}
          </T>
          {hasPlan ? (
            <View style={styles.tabs}>
              {DAYS.map((d) => (
                <Pressable key={d.key} onPress={() => pick(d.key)} style={[styles.tab, day === d.key && styles.tabActive]}>
                  <T size={FONT.xs} style={{ color: day === d.key ? COLOR.bg : COLOR.textDim }} bold>
                    {d.label}
                  </T>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ height: SPACE.md }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!hasPlan ? (
            // Op2 (and any operator without a seeded plan): empty + assignable.
            <Card>
              <Label>NO TRAINING PLAN</Label>
              <T dim size={FONT.sm} style={{ marginTop: SPACE.sm, lineHeight: 20 }}>
                {profile?.name ?? 'This operator'} has no plan assigned yet. Nothing is invented automatically — assign
                the standard posture-biased A/B/C split when ready, then edit it freely.
              </T>
              <View style={{ height: SPACE.md }} />
              <Button label="Assign A/B/C split" variant="accent" onPress={assignSplit} />
              <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
                Uses {profile?.equipment === 'machines_only' ? 'machine swaps' : 'free weights'} · change equipment in SYS.
              </T>
            </Card>
          ) : (
            <>
              <Card style={{ marginBottom: SPACE.md }}>
                <View style={styles.statusRow}>
                  <View>
                    <Label>DAY {day} · {shortLabel(today)}</Label>
                    <T size={FONT.md} style={{ marginTop: 2 }} dim>
                      6 exercises · log weight × reps per set
                    </T>
                  </View>
                  {done ? (
                    <T bold style={{ color: COLOR.good }}>
                      ✓ DONE
                    </T>
                  ) : null}
                </View>
              </Card>

              {activeId != null &&
                exercises.map((ex) => <ExerciseLogger key={ex.id} profileId={activeId} exercise={ex} date={today} />)}

              <View style={{ height: SPACE.sm }} />
              {!done ? (
                <Button label={`Mark session ${day} done`} variant="accent" onPress={complete} />
              ) : (
                <T dim size={FONT.sm} style={{ textAlign: 'center' }}>
                  Session logged. Rotation advances to {next}.
                </T>
              )}
              <T faint size={FONT.xs} style={{ marginTop: SPACE.md, textAlign: 'center' }}>
                All sets at the top of the rep range → “ADD WEIGHT” next time.
              </T>
            </>
          )}
          <View style={{ height: SPACE.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLOR.line },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md },
  tabs: { flexDirection: 'row', gap: SPACE.xs, marginBottom: SPACE.md },
  tab: { flex: 1, borderWidth: 1, borderColor: COLOR.line, paddingVertical: SPACE.sm, alignItems: 'center', backgroundColor: COLOR.surfaceAlt },
  tabActive: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
  content: { padding: SPACE.lg },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
