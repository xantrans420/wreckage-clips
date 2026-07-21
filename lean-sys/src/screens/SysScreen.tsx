import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLOR, FONT, SPACE } from '../theme';
import { Button, Card, Divider, Field, Label, Screen, Stat, T } from '../components/ui';
import { useApp } from '../context/AppContext';
import { Equipment, Sex, Weekday, WEEKDAYS } from '../types';
import { rescheduleAll, cancelAll, ensurePermissions } from '../notifications/schedule';
import { getHealthProvider, syncHealthForDate } from '../health';
import { todayIso } from '../domain/dates';
import { wipeAll } from '../db/database';

export function SysScreen() {
  const { profile, targets, patchProfile, refresh } = useApp();

  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [deficit, setDeficit] = useState('');
  const [activity, setActivity] = useState('');
  const [healthStatus, setHealthStatus] = useState<'unknown' | 'available' | 'unavailable' | 'granted'>('unknown');

  const hydrate = useCallback(() => {
    if (!profile) return;
    setHeight(String(profile.height_cm));
    setWeight(String(profile.weight_kg));
    setAge(String(profile.age));
    setDeficit(String(profile.deficit));
    setActivity(String(profile.activity_mult));
  }, [profile]);

  useFocusEffect(useCallback(() => hydrate(), [hydrate]));

  useEffect(() => {
    getHealthProvider()
      .isAvailable()
      .then((ok) => setHealthStatus(ok ? 'available' : 'unavailable'));
  }, []);

  if (!profile || !targets) return null;

  const provider = getHealthProvider();

  const saveProfile = async () => {
    await patchProfile({
      height_cm: Number(height) || profile.height_cm,
      weight_kg: Number(weight) || profile.weight_kg,
      age: Number(age) || profile.age,
      deficit: Number(deficit),
      activity_mult: Number(activity) || profile.activity_mult,
    });
    Alert.alert('Saved', 'Targets recomputed from your new numbers.');
  };

  const setSex = (sex: Sex) => patchProfile({ sex });
  const setEquipment = (equipment: Equipment) =>
    Alert.alert(
      'Change equipment',
      equipment === 'machines_only'
        ? 'Re-seed the split with machine swaps? Custom exercise edits will be replaced.'
        : 'Re-seed the split with free-weight movements? Custom exercise edits will be replaced.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-seed', onPress: () => patchProfile({ equipment }) },
      ],
    );

  const toggleGymDay = (d: Weekday) => {
    const has = profile.gym_days.includes(d);
    const next = has ? profile.gym_days.filter((x) => x !== d) : [...profile.gym_days, d];
    // keep them in weekly order
    const ordered = WEEKDAYS.filter((w) => next.includes(w));
    patchProfile({ gym_days: ordered });
  };

  const enableNotifs = async () => {
    const ok = await ensurePermissions();
    if (!ok) return Alert.alert('Denied', 'Enable notifications for LEAN.SYS in system settings.');
    await rescheduleAll(profile);
    Alert.alert('Scheduled', 'Gym-day mornings + weekly weigh-in/photo nudge. One nudge, no spam.');
  };

  const connectHealth = async () => {
    const ok = await provider.requestPermissions();
    setHealthStatus(ok ? 'granted' : 'unavailable');
    if (ok) {
      await syncHealthForDate(todayIso());
      await refresh();
      Alert.alert('Connected', `${provider.platformName} linked. Steps, sleep, resting HR and workouts will sync.`);
    } else {
      Alert.alert(
        'Not available',
        `${provider.platformName} isn't reachable in this build. Health data needs a dev build with the native module; the log works fully on manual entry.`,
      );
    }
  };

  const reset = () =>
    Alert.alert('Reset everything', 'Wipe all local data. This cannot be undone. Nothing is uploaded anywhere.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Wipe',
        style: 'destructive',
        onPress: async () => {
          await cancelAll();
          await wipeAll();
          await refresh();
        },
      },
    ]);

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <T accent bold size={FONT.lg} style={{ letterSpacing: 2, marginBottom: SPACE.md }}>
            SYS
          </T>

          {/* Computed targets */}
          <Card style={{ borderColor: COLOR.accent }}>
            <Label>LIVE TARGETS (Mifflin-St Jeor)</Label>
            <View style={styles.statRow}>
              <Stat label="MAINT" value={String(targets.maintenance)} unit="kcal" />
              <Stat label="CUT" value={String(targets.cutTarget)} unit="kcal" tone="accent" />
              <Stat label="PROTEIN" value={String(targets.proteinG)} unit="g" />
            </View>
            <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
              BMR {targets.bmr} · recomputed whenever weight changes
            </T>
          </Card>

          {/* Profile */}
          <Label style={{ marginTop: SPACE.sm }}>OPERATOR</Label>
          <View style={{ height: SPACE.sm }} />
          <View style={styles.formRow}>
            <Field label="HEIGHT cm" value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
            <View style={{ width: SPACE.sm }} />
            <Field label="WEIGHT kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
          </View>
          <View style={{ height: SPACE.sm }} />
          <View style={styles.formRow}>
            <Field label="AGE" value={age} onChangeText={setAge} keyboardType="number-pad" />
            <View style={{ width: SPACE.sm }} />
            <Field label="ACTIVITY ×" value={activity} onChangeText={setActivity} keyboardType="decimal-pad" />
            <View style={{ width: SPACE.sm }} />
            <Field label="DEFICIT" value={deficit} onChangeText={setDeficit} keyboardType="number-pad" />
          </View>
          <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
            Deficit stays easy (≈300). The app never pushes an aggressive cut for this profile — build muscle first.
          </T>
          <View style={{ height: SPACE.sm }} />
          <View style={styles.pillRow}>
            {(['male', 'female'] as Sex[]).map((s) => (
              <Pressable key={s} onPress={() => setSex(s)} style={[styles.pill, profile.sex === s && styles.pillActive]}>
                <T size={FONT.xs} style={{ color: profile.sex === s ? COLOR.bg : COLOR.textDim }} bold>
                  {s.toUpperCase()}
                </T>
              </Pressable>
            ))}
          </View>
          <View style={{ height: SPACE.sm }} />
          <Button label="Save operator" variant="accent" onPress={saveProfile} />

          <Divider />

          {/* Equipment */}
          <Label>EQUIPMENT</Label>
          <View style={[styles.pillRow, { marginTop: SPACE.sm }]}>
            {(['free_weights', 'machines_only'] as Equipment[]).map((e) => (
              <Pressable key={e} onPress={() => setEquipment(e)} style={[styles.pill, profile.equipment === e && styles.pillActive]}>
                <T size={FONT.xs} style={{ color: profile.equipment === e ? COLOR.bg : COLOR.textDim }} bold>
                  {e === 'free_weights' ? 'FREE WEIGHTS' : 'MACHINES ONLY'}
                </T>
              </Pressable>
            ))}
          </View>

          <Divider />

          {/* SCHEDULE */}
          <Label>SCHEDULE · GYM DAYS</Label>
          <View style={[styles.dayRow, { marginTop: SPACE.sm }]}>
            {WEEKDAYS.map((d) => {
              const on = profile.gym_days.includes(d);
              return (
                <Pressable key={d} onPress={() => toggleGymDay(d)} style={[styles.day, on && styles.dayOn]}>
                  <T size={FONT.xs} style={{ color: on ? COLOR.bg : COLOR.textDim }} bold>
                    {d[0]}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
            {profile.gym_days.join(' · ') || 'none'} · A→B→C rotation
          </T>
          <View style={{ height: SPACE.sm }} />
          <Button label="Enable / refresh notifications" onPress={enableNotifs} />

          <Divider />

          {/* WATCH */}
          <Label>WATCH · {provider.platformName}</Label>
          <Card style={{ marginTop: SPACE.sm }}>
            <T dim size={FONT.sm}>
              STATUS:{' '}
              <T size={FONT.sm} style={{ color: healthStatus === 'granted' ? COLOR.good : healthStatus === 'unavailable' ? COLOR.warn : COLOR.text }}>
                {healthStatus.toUpperCase()}
              </T>
            </T>
            <T faint size={FONT.xs} style={{ marginTop: SPACE.sm, lineHeight: 16 }}>
              Garmin syncs to {provider.platformName} automatically. In Garmin Connect → Settings → connect to{' '}
              {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}. We read from the OS store — no Garmin login,
              no Garmin API. HRV / body battery / training load may not cross the bridge (accepted v1 tradeoff).
            </T>
          </Card>
          <Button label="Connect / sync health" onPress={connectHealth} />

          <Divider />

          {/* DATA */}
          <Label>DATA</Label>
          <T faint size={FONT.xs} style={{ marginTop: SPACE.xs, lineHeight: 16 }}>
            Local-only. No accounts, no server, no cloud. Progress photos never leave the device.
          </T>
          <View style={{ height: SPACE.sm }} />
          <Button label="Reset all data" variant="danger" onPress={reset} />
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
  pillRow: { flexDirection: 'row', gap: SPACE.sm },
  pill: { flex: 1, borderWidth: 1, borderColor: COLOR.line, paddingVertical: SPACE.sm, alignItems: 'center', backgroundColor: COLOR.surfaceAlt },
  pillActive: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
  dayRow: { flexDirection: 'row', gap: SPACE.xs },
  day: { flex: 1, aspectRatio: 1, borderWidth: 1, borderColor: COLOR.line, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surfaceAlt },
  dayOn: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
});
