import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLOR, FONT, SPACE } from '../theme';
import { Button, Card, Divider, Field, Label, Screen, Stat, T } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { PhotoCompare } from '../components/PhotoCompare';
import { useApp } from '../context/AppContext';
import { todayIso, shortLabel } from '../domain/dates';
import {
  deletePhoto,
  getFirstWeight,
  getLatestWeight,
  getPhotos,
  getWeightHistory,
  logWeight,
  savePhoto,
} from '../db/repositories/body';
import { Photo, PhotoAngle, WeightLog } from '../types';
import { ANGLES, ANGLE_LABEL, capturePhoto } from '../domain/photos';
import { deleteFile } from '../domain/photos';

export function BodyScreen() {
  const { profile, patchProfile } = useApp();
  const today = todayIso();
  const [history, setHistory] = useState<WeightLog[]>([]);
  const [latest, setLatest] = useState<WeightLog | null>(null);
  const [first, setFirst] = useState<WeightLog | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [weighIn, setWeighIn] = useState('');
  const [compare, setCompare] = useState(false);

  const load = useCallback(async () => {
    setHistory(await getWeightHistory());
    setLatest(await getLatestWeight());
    setFirst(await getFirstWeight());
    setPhotos(await getPhotos());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const submitWeight = async () => {
    const kg = Number(weighIn);
    if (!kg || kg <= 0) return;
    await logWeight(today, kg);
    // Weight change recomputes all targets — keep the profile's live weight in sync.
    await patchProfile({ weight_kg: kg });
    setWeighIn('');
    await load();
  };

  const shoot = async (angle: PhotoAngle) => {
    const uri = await capturePhoto(today, angle);
    if (!uri) return;
    await savePhoto({ date: today, angle, file_uri: uri, weight_kg: latest?.kg ?? null });
    await load();
  };

  const removePhoto = (p: Photo) => {
    Alert.alert('Delete photo', `${ANGLE_LABEL[p.angle]} · ${shortLabel(p.date)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePhoto(p.id);
          await deleteFile(p.file_uri);
          await load();
        },
      },
    ]);
  };

  const totalChange = latest && first ? latest.kg - first.kg : 0;
  const photosToday = photos.filter((p) => p.date === today);
  const dates = Array.from(new Set(photos.map((p) => p.date))).sort().reverse();

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <T accent bold size={FONT.lg} style={{ letterSpacing: 2, marginBottom: SPACE.md }}>
            BODY
          </T>

          {/* WEIGHT */}
          <Card>
            <View style={styles.statRow}>
              <Stat label="CURRENT" value={latest ? String(latest.kg) : '—'} unit="kg" tone="accent" />
              <Stat
                label="TOTAL CHANGE"
                value={`${totalChange > 0 ? '+' : ''}${totalChange.toFixed(1)}`}
                unit="kg"
                tone={totalChange < 0 ? 'good' : undefined}
              />
              <Stat label="WEIGH-INS" value={String(history.length)} />
            </View>
            <View style={{ height: SPACE.md }} />
            <TrendChart data={history} />
            <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
              WEEKLY · SAME DAY · MORNING · EMPTY. Trend, not daily noise. Weight can sit flat while fat drops and muscle
              builds — the photos tell the truth.
            </T>
          </Card>

          <View style={styles.formRow}>
            <Field label="LOG WEIGH-IN (kg)" value={weighIn} onChangeText={setWeighIn} keyboardType="decimal-pad" placeholder="0.0" />
            <View style={{ width: SPACE.sm }} />
            <Button label="Save" variant="accent" onPress={submitWeight} style={{ alignSelf: 'flex-end' }} />
          </View>

          <Divider />

          {/* PHOTOS */}
          <View style={styles.photoHead}>
            <Label>PROGRESS PHOTOS · 3 ANGLES</Label>
            {dates.length >= 1 ? (
              <Pressable onPress={() => setCompare(true)}>
                <T accent size={FONT.sm}>
                  COMPARE →
                </T>
              </Pressable>
            ) : null}
          </View>
          <T faint size={FONT.xs} style={{ marginBottom: SPACE.sm }}>
            Weekly. On-device only, never uploaded. Same 3 shots: front / side / relaxed-front.
          </T>

          {/* This week capture row */}
          <View style={styles.captureRow}>
            {ANGLES.map((angle) => {
              const existing = photosToday.find((p) => p.angle === angle);
              return (
                <Pressable key={angle} onPress={() => shoot(angle)} style={styles.captureCell}>
                  {existing ? (
                    <Image source={{ uri: existing.file_uri }} style={styles.captureImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.captureEmpty}>
                      <T faint size={FONT.xl}>
                        +
                      </T>
                    </View>
                  )}
                  <T dim size={FONT.xs} style={{ marginTop: SPACE.xs, textAlign: 'center' }}>
                    {ANGLE_LABEL[angle]}
                  </T>
                </Pressable>
              );
            })}
          </View>

          {/* History grouped by date */}
          {dates.length > 0 && (
            <>
              <Label style={{ marginTop: SPACE.lg }}>HISTORY</Label>
              {dates.map((d) => (
                <View key={d} style={{ marginTop: SPACE.sm }}>
                  <T dim size={FONT.xs}>
                    {shortLabel(d)}
                    {photos.find((p) => p.date === d)?.weight_kg ? ` · ${photos.find((p) => p.date === d)?.weight_kg}kg` : ''}
                  </T>
                  <View style={styles.histRow}>
                    {ANGLES.map((angle) => {
                      const p = photos.find((ph) => ph.date === d && ph.angle === angle);
                      return (
                        <Pressable key={angle} onLongPress={() => p && removePhoto(p)} style={styles.histCell}>
                          {p ? (
                            <Image source={{ uri: p.file_uri }} style={styles.captureImg} resizeMode="cover" />
                          ) : (
                            <View style={styles.captureEmpty}>
                              <T faint size={FONT.xs}>
                                {ANGLE_LABEL[angle][0]}
                              </T>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              <T faint size={FONT.xs} style={{ marginTop: SPACE.sm }}>
                hold a photo to delete
              </T>
            </>
          )}
          <View style={{ height: SPACE.xxl }} />
        </ScrollView>
      </SafeAreaView>
      {compare ? <PhotoCompare photos={photos} onClose={() => setCompare(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE.lg },
  statRow: { flexDirection: 'row', gap: SPACE.md },
  formRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: SPACE.md },
  photoHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  captureRow: { flexDirection: 'row', gap: SPACE.sm },
  captureCell: { flex: 1 },
  captureImg: { width: '100%', aspectRatio: 0.75, backgroundColor: '#000', borderWidth: 1, borderColor: COLOR.lineBright },
  captureEmpty: {
    width: '100%',
    aspectRatio: 0.75,
    borderWidth: 1,
    borderColor: COLOR.line,
    backgroundColor: COLOR.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  histRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  histCell: { flex: 1 },
});
