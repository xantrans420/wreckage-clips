import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLOR, FONT, MONO, SPACE } from '../theme';
import { Button, Card, Field, Label, Screen, T } from '../components/ui';
import { useApp } from '../context/AppContext';
import { Equipment } from '../types';
import { seedSplit } from '../db/database';
import { computeTargets } from '../domain/targets';
import { DEFAULT_PROFILE } from '../domain/seed';

/**
 * First-launch flow. The profile is pre-seeded, so the only things we need are:
 * confirm age, and lock the one open config — equipment. Everything else is
 * editable later in settings.
 */
export function OnboardingScreen() {
  const { profile, patchProfile } = useApp();
  const [age, setAge] = useState(String(profile?.age ?? DEFAULT_PROFILE.age));
  const [equipment, setEquipment] = useState<Equipment>(profile?.equipment ?? 'free_weights');

  const preview = computeTargets({
    ...(profile ?? ({} as any)),
    ...DEFAULT_PROFILE,
    age: Number(age) || DEFAULT_PROFILE.age,
    equipment,
    onboarded: false,
    id: 1,
    gym_days: DEFAULT_PROFILE.gym_days as any,
  });

  const finish = async () => {
    await seedSplit(equipment, true);
    await patchProfile({ age: Number(age) || DEFAULT_PROFILE.age, equipment, onboarded: true });
  };

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <T accent size={FONT.xl} bold style={{ letterSpacing: 2 }}>
            LEAN.SYS
          </T>
          <T dim size={FONT.sm} style={{ marginTop: SPACE.xs, letterSpacing: 1 }}>
            RECOMP TRACKER · ONE OPERATOR · LOCAL-ONLY
          </T>

          <View style={{ height: SPACE.xl }} />

          <Label>OPERATOR</Label>
          <Card style={{ marginTop: SPACE.sm }}>
            <Row k="HEIGHT" v={`${DEFAULT_PROFILE.height_cm} cm`} />
            <Row k="START WEIGHT" v={`${DEFAULT_PROFILE.weight_kg} kg`} />
            <Row k="SEX" v="male" />
            <Row k="ACTIVITY" v={`${DEFAULT_PROFILE.activity_mult} (3× gym + walking)`} />
            <Row k="DEFICIT" v={`−${DEFAULT_PROFILE.deficit} kcal (easy)`} last />
          </Card>

          <View style={{ height: SPACE.md }} />
          <Field label="CONFIRM AGE" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />

          <View style={{ height: SPACE.lg }} />
          <Label>EQUIPMENT — pick one (drives exercise swaps)</Label>
          <View style={{ height: SPACE.sm }} />
          <Choice
            active={equipment === 'free_weights'}
            title="FREE WEIGHTS"
            desc="Dumbbells, barbell, RDLs, Bulgarian split squats, pull-ups."
            onPress={() => setEquipment('free_weights')}
          />
          <Choice
            active={equipment === 'machines_only'}
            title="MACHINES ONLY"
            desc="Auto-swaps: RDL→leg curl+back ext, DB bench→chest press, pull-up→lat pulldown, split squat→leg press."
            onPress={() => setEquipment('machines_only')}
          />

          <View style={{ height: SPACE.lg }} />
          <Label>COMPUTED TARGETS (self-update with weight)</Label>
          <Card style={{ marginTop: SPACE.sm }}>
            <Row k="MAINTENANCE" v={`${preview.maintenance} kcal`} />
            <Row k="CUT TARGET" v={`${preview.cutTarget} kcal`} />
            <Row k="PROTEIN" v={`${preview.proteinG} g/day`} last />
          </Card>

          <View style={{ height: SPACE.sm }} />
          <T faint size={FONT.xs} style={{ lineHeight: 16 }}>
            WATCH: {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} bridge. In Garmin Connect → Settings →
            connect to {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}. Health data is optional enrichment —
            the log works fully on manual entry.
          </T>

          <View style={{ height: SPACE.lg }} />
          <Button label="Start" variant="accent" onPress={finish} />
          <View style={{ height: SPACE.xl }} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <T dim size={FONT.sm}>
        {k}
      </T>
      <T size={FONT.sm}>{v}</T>
    </View>
  );
}

function Choice({ active, title, desc, onPress }: { active: boolean; title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={[styles.choice, active && { borderColor: COLOR.accent }]}>
        <View style={styles.choiceHead}>
          <View style={[styles.radio, active && { backgroundColor: COLOR.accent, borderColor: COLOR.accent }]} />
          <T accent={active} bold style={{ letterSpacing: 1 }}>
            {title}
          </T>
        </View>
        <T dim size={FONT.xs} style={{ marginTop: SPACE.xs, lineHeight: 16 }}>
          {desc}
        </T>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACE.sm },
  rowLine: { borderBottomWidth: 1, borderBottomColor: COLOR.line },
  choice: { marginBottom: SPACE.sm },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  radio: { width: 12, height: 12, borderWidth: 1, borderColor: COLOR.lineBright },
});
