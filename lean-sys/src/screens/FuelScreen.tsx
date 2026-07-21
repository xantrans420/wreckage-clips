import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLOR, FONT, SPACE } from '../theme';
import { Button, Card, Divider, Field, Label, Screen, Stat, T } from '../components/ui';
import { Bar } from '../components/Bar';
import { ProfileBar } from '../components/ProfileBar';
import { useApp } from '../context/AppContext';
import { todayIso } from '../domain/dates';
import {
  DayTotals,
  addSavedFood,
  deleteFood,
  getDayTotals,
  getFoodLog,
  getSavedFoods,
  logFood,
  logSavedFood,
} from '../db/repositories/fuel';
import { FoodLog, SavedFood } from '../types';
import { PLATE_FORMULA, BATCH_PREP } from '../domain/seed';

export function FuelScreen() {
  const { profile, targets, activeId } = useApp();
  const today = todayIso();
  const [totals, setTotals] = useState<DayTotals>({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [log, setLog] = useState<FoodLog[]>([]);
  const [saved, setSaved] = useState<SavedFood[]>([]);

  // add-food form
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saveToQuick, setSaveToQuick] = useState(false);

  const load = useCallback(async () => {
    if (activeId == null) return;
    setTotals(await getDayTotals(activeId, today));
    setLog(await getFoodLog(activeId, today));
    setSaved(await getSavedFoods(activeId));
  }, [activeId, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canAdd = name.trim().length > 0 && protein.trim().length > 0;

  const add = async () => {
    if (!canAdd || activeId == null) return;
    const entry = {
      date: today,
      name: name.trim(),
      kcal: Number(kcal) || 0,
      protein_g: Number(protein) || 0,
      carbs_g: carbs ? Number(carbs) : null,
      fat_g: fat ? Number(fat) : null,
    };
    await logFood(activeId, entry);
    if (saveToQuick) await addSavedFood(activeId, { name: entry.name, kcal: entry.kcal, protein_g: entry.protein_g });
    setName('');
    setKcal('');
    setProtein('');
    setCarbs('');
    setFat('');
    setSaveToQuick(false);
    await load();
  };

  const quickAdd = async (f: SavedFood) => {
    if (activeId == null) return;
    await logSavedFood(activeId, f, today);
    await load();
  };

  const remove = async (id: number) => {
    await deleteFood(id);
    await load();
  };

  if (!targets || !profile) return null;
  const proteinRemaining = Math.max(0, targets.proteinG - totals.protein_g);
  const target = profile.deficit > 0 ? targets.cutTarget : targets.maintenance;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ProfileBar title="FUEL" />

          {/* Protein hero + calories */}
          <Card style={{ borderColor: COLOR.accent }}>
            <Label>PROTEIN — HERO METRIC</Label>
            <View style={styles.statRow}>
              <Stat label="LOGGED" value={String(Math.round(totals.protein_g))} unit="g" tone="accent" />
              <Stat label="REMAINING" value={String(Math.round(proteinRemaining))} unit="g" />
              <Stat label="TARGET" value={String(targets.proteinG)} unit="g" />
            </View>
            <View style={{ height: SPACE.sm }} />
            <Bar value={totals.protein_g} target={targets.proteinG} height={8} />
          </Card>

          <Card>
            <View style={styles.statRow}>
              <Stat label="CALORIES" value={`${Math.round(totals.kcal)}`} unit={`/ ${target}`} tone={totals.kcal > target ? 'bad' : undefined} />
              <Stat label="CARBS" value={`${Math.round(totals.carbs_g)}`} unit="g" />
              <Stat label="FAT" value={`${Math.round(totals.fat_g)}`} unit="g" />
            </View>
            <View style={{ height: SPACE.sm }} />
            <Bar value={totals.kcal} target={target} color={totals.kcal > target ? COLOR.bad : COLOR.textDim} />
          </Card>

          {/* Quick add — My foods */}
          <Label style={{ marginTop: SPACE.sm }}>MY FOODS — TAP TO LOG</Label>
          <View style={styles.chips}>
            {saved.map((f) => (
              <Pressable key={f.id} onPress={() => quickAdd(f)} style={styles.chip}>
                <T size={FONT.sm}>{f.name}</T>
                <T dim size={FONT.xs}>
                  {f.kcal} · {f.protein_g}p
                </T>
              </Pressable>
            ))}
          </View>

          <Divider />

          {/* Manual add */}
          <Label>LOG FOOD (protein mandatory)</Label>
          <View style={{ height: SPACE.sm }} />
          <Field label="NAME" value={name} onChangeText={setName} placeholder="food name" />
          <View style={{ height: SPACE.sm }} />
          <View style={styles.formRow}>
            <Field label="KCAL" value={kcal} onChangeText={setKcal} keyboardType="number-pad" placeholder="0" />
            <View style={{ width: SPACE.sm }} />
            <Field label="PROTEIN g" value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="0" />
          </View>
          <View style={{ height: SPACE.sm }} />
          <View style={styles.formRow}>
            <Field label="CARBS g (opt)" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" placeholder="—" />
            <View style={{ width: SPACE.sm }} />
            <Field label="FAT g (opt)" value={fat} onChangeText={setFat} keyboardType="number-pad" placeholder="—" />
          </View>
          <Pressable onPress={() => setSaveToQuick((v) => !v)} style={styles.checkRow}>
            <View style={[styles.check, saveToQuick && { backgroundColor: COLOR.accent, borderColor: COLOR.accent }]} />
            <T dim size={FONT.sm}>
              also save to My Foods
            </T>
          </Pressable>
          <Button label="Log it" variant="accent" onPress={add} disabled={!canAdd} />

          {/* Today's log */}
          {log.length > 0 && (
            <>
              <Divider />
              <Label>TODAY — {log.length} ENTRIES</Label>
              <View style={{ height: SPACE.sm }} />
              {log.map((e) => (
                <Pressable key={e.id} onLongPress={() => remove(e.id)} style={styles.logRow}>
                  <View style={{ flex: 1 }}>
                    <T size={FONT.sm}>{e.name}</T>
                    <T faint size={FONT.xs}>
                      hold to delete
                    </T>
                  </View>
                  <T dim size={FONT.sm}>
                    {Math.round(e.kcal)} kcal
                  </T>
                  <T accent size={FONT.sm} style={{ width: 52, textAlign: 'right' }}>
                    {Math.round(e.protein_g)}p
                  </T>
                </Pressable>
              ))}
            </>
          )}

          {/* Static references */}
          <Divider />
          <Label>PLATE FORMULA</Label>
          <Card style={{ marginTop: SPACE.sm }}>
            {PLATE_FORMULA.map((line) => (
              <T key={line} dim size={FONT.sm} style={{ marginBottom: 2 }}>
                · {line}
              </T>
            ))}
          </Card>
          <Label>BATCH PREP</Label>
          <T faint size={FONT.xs} style={{ marginTop: SPACE.xs, lineHeight: 16 }}>
            {BATCH_PREP}
          </T>
          <View style={{ height: SPACE.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE.lg },
  statRow: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.xs },
  formRow: { flexDirection: 'row' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm },
  chip: { borderWidth: 1, borderColor: COLOR.lineBright, backgroundColor: COLOR.surfaceAlt, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginVertical: SPACE.md },
  check: { width: 14, height: 14, borderWidth: 1, borderColor: COLOR.lineBright },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLOR.line },
});
