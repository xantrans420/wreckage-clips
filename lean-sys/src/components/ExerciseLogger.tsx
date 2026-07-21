import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BORDER, COLOR, FONT, MONO, SPACE } from '../theme';
import { Label, T } from './ui';
import { Exercise } from '../types';
import { getLastSession, getSetsFor, saveSets, LastSession } from '../db/repositories/train';
import { parseScheme } from '../domain/progression';
import { shortLabel } from '../domain/dates';

interface Draft {
  weight: string;
  reps: string;
}

/**
 * One exercise: shows last session's numbers as the target to beat, flags
 * "add weight" when the last session capped the rep range, and lets you log
 * this session's sets. Saves are idempotent per (exercise, date).
 */
export function ExerciseLogger({ profileId, exercise, date }: { profileId: number; exercise: Exercise; date: string }) {
  const [last, setLast] = useState<LastSession | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saved, setSaved] = useState(false);

  const defaultSetCount = (() => {
    const n = exercise.scheme.split('x')[0];
    const c = Number(n);
    return Number.isFinite(c) && c > 0 ? c : 3;
  })();

  const load = useCallback(async () => {
    const prev = await getLastSession(exercise, date);
    setLast(prev);
    const existing = await getSetsFor(exercise.id, date);
    if (existing.length > 0) {
      setDrafts(existing.map((s) => ({ weight: String(s.weight_kg), reps: String(s.reps) })));
      setSaved(true);
    } else {
      // Prefill from last session's numbers as the starting point to beat.
      const seed: Draft[] =
        prev && prev.sets.length
          ? prev.sets.map((s) => ({ weight: String(s.weight_kg), reps: '' }))
          : Array.from({ length: defaultSetCount }, () => ({ weight: '', reps: '' }));
      setDrafts(seed);
      setSaved(false);
    }
  }, [exercise, date, defaultSetCount]);

  useEffect(() => {
    load();
  }, [load]);

  const setDraft = (i: number, patch: Partial<Draft>) => {
    setDrafts((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    setSaved(false);
  };

  const addSet = () => setDrafts((d) => [...d, { weight: d[d.length - 1]?.weight ?? '', reps: '' }]);

  const save = async () => {
    const rows = drafts
      .filter((d) => d.weight.trim() !== '' || d.reps.trim() !== '')
      .map((d) => ({ weight_kg: Number(d.weight) || 0, reps: Number(d.reps) || 0 }));
    await saveSets(profileId, exercise.id, date, rows);
    setSaved(true);
    await load();
  };

  const range = parseScheme(exercise.scheme);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <T bold>{exercise.name}</T>
          <T dim size={FONT.xs}>
            {exercise.scheme}
            {exercise.note ? `  · ${exercise.note}` : ''}
          </T>
        </View>
        {last?.addWeight ? (
          <View style={styles.flag}>
            <T size={FONT.xs} style={{ color: COLOR.bg }} bold>
              ADD WEIGHT
            </T>
          </View>
        ) : null}
      </View>

      {/* last session = target to beat */}
      <T faint size={FONT.xs} style={{ marginTop: SPACE.xs }}>
        {last
          ? `LAST ${shortLabel(last.date)}: ${last.sets.map((s) => `${s.weight_kg}×${s.reps}`).join('  ')}`
          : 'NO HISTORY — set the baseline'}
      </T>

      {/* set inputs */}
      <View style={styles.setHeader}>
        <T faint size={FONT.xs} style={{ width: 24 }}>
          #
        </T>
        <T faint size={FONT.xs} style={{ flex: 1 }}>
          KG
        </T>
        <T faint size={FONT.xs} style={{ flex: 1 }}>
          REPS{range.high ? ` (top ${range.high})` : ''}
        </T>
      </View>
      {drafts.map((d, i) => {
        const hitTop = range.high != null && Number(d.reps) >= range.high && d.reps !== '';
        return (
          <View key={i} style={styles.setRow}>
            <T dim size={FONT.sm} style={{ width: 24 }}>
              {i + 1}
            </T>
            <TextInput
              value={d.weight}
              onChangeText={(t) => setDraft(i, { weight: t })}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={COLOR.textFaint}
              selectionColor={COLOR.accent}
              style={styles.cell}
            />
            <TextInput
              value={d.reps}
              onChangeText={(t) => setDraft(i, { reps: t })}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={COLOR.textFaint}
              selectionColor={COLOR.accent}
              style={[styles.cell, hitTop && { color: COLOR.good, borderColor: COLOR.good }]}
            />
          </View>
        );
      })}

      <View style={styles.actions}>
        <Pressable onPress={addSet} style={styles.smallBtn}>
          <T size={FONT.xs} dim>
            + SET
          </T>
        </Pressable>
        <Pressable onPress={save} style={[styles.smallBtn, styles.saveBtn, saved && { borderColor: COLOR.good }]}>
          <T size={FONT.xs} style={{ color: saved ? COLOR.good : COLOR.accent }} bold>
            {saved ? '✓ SAVED' : 'SAVE'}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...BORDER.hairline, backgroundColor: COLOR.surface, padding: SPACE.md, marginBottom: SPACE.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  flag: { backgroundColor: COLOR.accent, paddingHorizontal: SPACE.sm, paddingVertical: 3 },
  setHeader: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.xs, alignItems: 'center' },
  setRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.xs, alignItems: 'center' },
  cell: {
    flex: 1,
    color: COLOR.text,
    fontFamily: MONO,
    fontSize: FONT.md,
    ...BORDER.hairline,
    backgroundColor: COLOR.surfaceAlt,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  smallBtn: { ...BORDER.hairline, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  saveBtn: { borderColor: COLOR.accent, marginLeft: 'auto' },
});
