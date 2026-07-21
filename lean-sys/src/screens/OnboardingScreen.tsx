import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLOR, FONT, SPACE } from '../theme';
import { Button, Card, Field, Label, Screen, T } from '../components/ui';
import { useApp } from '../context/AppContext';
import { Equipment, Sex } from '../types';
import { computeTargets } from '../domain/targets';
import { DEFAULT_PROFILE } from '../domain/seed';

/**
 * First-launch flow — set up the first operator. A profile is pre-seeded, so
 * this collects name, sex, body basics and the one open config (equipment). The
 * second operator (your partner) is added later in SYS.
 */
export function OnboardingScreen() {
  const { profile, patchProfile } = useApp();
  const [name, setName] = useState(profile && profile.name !== 'Operator' ? profile.name : '');
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [age, setAge] = useState(String(profile?.age ?? DEFAULT_PROFILE.age));
  const [height, setHeight] = useState(String(profile?.height_cm ?? DEFAULT_PROFILE.height_cm));
  const [weight, setWeight] = useState(String(profile?.weight_kg ?? DEFAULT_PROFILE.weight_kg));
  const [equipment, setEquipment] = useState<Equipment>(profile?.equipment ?? 'free_weights');

  const preview = computeTargets({
    id: 1,
    name: name || 'Operator',
    height_cm: Number(height) || DEFAULT_PROFILE.height_cm,
    weight_kg: Number(weight) || DEFAULT_PROFILE.weight_kg,
    age: Number(age) || DEFAULT_PROFILE.age,
    sex,
    activity_mult: DEFAULT_PROFILE.activity_mult,
    deficit: DEFAULT_PROFILE.deficit,
    equipment,
    gym_days: DEFAULT_PROFILE.gym_days as any,
    onboarded: false,
  });

  const finish = async () => {
    // patchProfile targets the active (freshly-seeded) profile; passing equipment
    // triggers the split seed for this operator.
    await patchProfile({
      name: name.trim() || 'Operator',
      sex,
      age: Number(age) || DEFAULT_PROFILE.age,
      height_cm: Number(height) || DEFAULT_PROFILE.height_cm,
      weight_kg: Number(weight) || DEFAULT_PROFILE.weight_kg,
      equipment,
      onboarded: true,
    });
  };

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <T accent size={FONT.xl} bold style={{ letterSpacing: 2 }}>
            LEAN.SYS
          </T>
          <T dim size={FONT.sm} style={{ marginTop: SPACE.xs, letterSpacing: 1 }}>
            RECOMP TRACKER · TWO OPERATORS · LOCAL-ONLY
          </T>

          <View style={{ height: SPACE.xl }} />

          <Label>OPERATOR 1 — SET UP</Label>
          <View style={{ height: SPACE.sm }} />
          <Field label="NAME" value={name} onChangeText={setName} placeholder="e.g. Tom" autoCapitalize="words" />

          <View style={{ height: SPACE.sm }} />
          <Label>SEX (drives BMR formula)</Label>
          <View style={[styles.pillRow, { marginTop: SPACE.xs }]}>
            {(['male', 'female'] as Sex[]).map((s) => (
              <Pressable key={s} onPress={() => setSex(s)} style={[styles.pill, sex === s && styles.pillActive]}>
                <T size={FONT.xs} bold style={{ color: sex === s ? COLOR.bg : COLOR.textDim }}>
                  {s.toUpperCase()}
                </T>
              </Pressable>
            ))}
          </View>

          <View style={{ height: SPACE.sm }} />
          <View style={styles.formRow}>
            <Field label="HEIGHT cm" value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
            <View style={{ width: SPACE.sm }} />
            <Field label="WEIGHT kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
            <View style={{ width: SPACE.sm }} />
            <Field label="AGE" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
          </View>

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
            Add your partner as a second operator later in SYS — each of you gets a separate log, split, weigh-ins and
            photos. WATCH: {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} bridge, optional. Manual entry
            always works.
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
  formRow: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', gap: SPACE.sm },
  pill: { flex: 1, borderWidth: 1, borderColor: COLOR.line, paddingVertical: SPACE.sm, alignItems: 'center', backgroundColor: COLOR.surfaceAlt },
  pillActive: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
});
