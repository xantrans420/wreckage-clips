import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLOR, FONT, SPACE } from '../theme';
import { Button, Card, Field, Label, Screen, T } from '../components/ui';
import { ProfileBar } from '../components/ProfileBar';
import { useApp } from '../context/AppContext';
import { Sex } from '../types';
import { computeTargets } from '../domain/targets';

/**
 * Per-operator setup. Op1 is fully seeded and never lands here; this collects
 * the pieces Op2 was left with (height, weight, deficit — sex/age prefilled) so
 * her targets can compute. It does NOT ask about equipment and does NOT seed a
 * training plan — that stays empty and assignable from TRAIN.
 *
 * The switcher up top lets you flip back to the other operator without setting
 * this one up.
 */
export function OnboardingScreen() {
  const { profile, patchProfile } = useApp();
  const [name, setName] = useState(profile?.name ?? 'Secondary');
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'female');
  const [age, setAge] = useState(String(profile?.age ?? 38));
  const [height, setHeight] = useState(profile && profile.height_cm > 0 ? String(profile.height_cm) : '');
  const [weight, setWeight] = useState(profile && profile.weight_kg > 0 ? String(profile.weight_kg) : '');
  const [deficit, setDeficit] = useState(String(profile?.deficit ?? 300));

  if (!profile) return null;

  const h = Number(height);
  const w = Number(weight);
  const ready = h > 0 && w > 0;
  const preview = ready
    ? computeTargets({
        ...profile,
        sex,
        age: Number(age) || profile.age,
        height_cm: h,
        weight_kg: w,
        deficit: Number(deficit) || 0,
      })
    : null;

  const finish = async () => {
    if (!ready) return;
    // No equipment key in the patch → no split is seeded. Plan stays empty.
    await patchProfile({
      name: name.trim() || profile.name,
      sex,
      age: Number(age) || profile.age,
      height_cm: h,
      weight_kg: w,
      deficit: Number(deficit) || 0,
      onboarded: true,
    });
  };

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ProfileBar title="SETUP" />
          <T dim size={FONT.sm} style={{ marginTop: -SPACE.sm, marginBottom: SPACE.md }}>
            {profile.name} needs a few numbers before targets can compute. Switch operator above to skip.
          </T>

          <Label>OPERATOR</Label>
          <View style={{ height: SPACE.sm }} />
          <Field label="NAME" value={name} onChangeText={setName} autoCapitalize="words" />

          <View style={{ height: SPACE.sm }} />
          <Label>SEX (drives BMR formula)</Label>
          <View style={[styles.pillRow, { marginTop: SPACE.xs }]}>
            {(['female', 'male'] as Sex[]).map((s) => (
              <Pressable key={s} onPress={() => setSex(s)} style={[styles.pill, sex === s && styles.pillActive]}>
                <T size={FONT.xs} bold style={{ color: sex === s ? COLOR.bg : COLOR.textDim }}>
                  {s.toUpperCase()}
                </T>
              </Pressable>
            ))}
          </View>

          <View style={{ height: SPACE.sm }} />
          <View style={styles.formRow}>
            <Field label="HEIGHT cm" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="—" />
            <View style={{ width: SPACE.sm }} />
            <Field label="WEIGHT kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="—" />
            <View style={{ width: SPACE.sm }} />
            <Field label="AGE" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
          </View>

          <View style={{ height: SPACE.sm }} />
          <Field label="DEFICIT kcal (easy)" value={deficit} onChangeText={setDeficit} keyboardType="number-pad" />

          <View style={{ height: SPACE.lg }} />
          <Label>COMPUTED TARGETS (self-update with weight)</Label>
          <Card style={{ marginTop: SPACE.sm }}>
            {preview ? (
              <>
                <Row k="MAINTENANCE" v={`${preview.maintenance} kcal`} />
                <Row k="CUT TARGET" v={`${preview.cutTarget} kcal`} />
                <Row k="PROTEIN" v={`${preview.proteinG} g/day`} last />
              </>
            ) : (
              <T faint size={FONT.sm}>Enter height + weight to compute targets.</T>
            )}
          </Card>

          <T faint size={FONT.xs} style={{ lineHeight: 16 }}>
            No training plan is assigned — {profile.name}'s split stays empty until you assign one from TRAIN. WATCH:{' '}
            {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} bridge, optional. Manual entry always works.
          </T>

          <View style={{ height: SPACE.lg }} />
          <Button label="Complete setup" variant="accent" onPress={finish} disabled={!ready} />
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

const styles = StyleSheet.create({
  content: { padding: SPACE.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACE.sm },
  rowLine: { borderBottomWidth: 1, borderBottomColor: COLOR.line },
  formRow: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', gap: SPACE.sm },
  pill: { flex: 1, borderWidth: 1, borderColor: COLOR.line, paddingVertical: SPACE.sm, alignItems: 'center', backgroundColor: COLOR.surfaceAlt },
  pillActive: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
});
