import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLOR, FONT, SPACE } from '../theme';
import { Button, Label, T } from './ui';
import { Photo, PhotoAngle } from '../types';
import { ANGLES, ANGLE_LABEL } from '../domain/photos';
import { shortLabel } from '../domain/dates';

/**
 * Side-by-side compare of any two dates at the same angle — the real motivator.
 * The scale lies during a recomp; the photos tell the truth. Optional ghost
 * overlay to line up the pose.
 */
export function PhotoCompare({ photos, onClose }: { photos: Photo[]; onClose: () => void }) {
  const [angle, setAngle] = useState<PhotoAngle>('front');
  const dates = useMemo(() => {
    const set = Array.from(new Set(photos.filter((p) => p.angle === angle).map((p) => p.date))).sort();
    return set;
  }, [photos, angle]);

  const [aDate, setADate] = useState<string | null>(null);
  const [bDate, setBDate] = useState<string | null>(null);
  const [ghost, setGhost] = useState(false);

  const find = (d: string | null) => (d ? photos.find((p) => p.date === d && p.angle === angle) ?? null : null);
  const a = find(aDate ?? dates[0] ?? null);
  const b = find(bDate ?? dates[dates.length - 1] ?? null);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.top}>
            <T accent bold size={FONT.lg} style={{ letterSpacing: 2 }}>
              COMPARE
            </T>
            <Pressable onPress={onClose}>
              <T dim>CLOSE ✕</T>
            </Pressable>
          </View>

          <View style={styles.angleTabs}>
            {ANGLES.map((ang) => (
              <Pressable key={ang} onPress={() => setAngle(ang)} style={[styles.angleTab, angle === ang && styles.angleActive]}>
                <T size={FONT.xs} style={{ color: angle === ang ? COLOR.bg : COLOR.textDim }} bold>
                  {ANGLE_LABEL[ang]}
                </T>
              </Pressable>
            ))}
          </View>

          <View style={styles.imgRow}>
            <Frame photo={a} label="A" />
            <View style={{ width: 1, backgroundColor: COLOR.line }} />
            <Frame photo={b} ghost={ghost ? a : null} label="B" />
          </View>

          <ScrollView style={{ maxHeight: 170 }} contentContainerStyle={{ padding: SPACE.lg }}>
            <Pressable onPress={() => setGhost((v) => !v)} style={styles.checkRow}>
              <View style={[styles.check, ghost && { backgroundColor: COLOR.accent, borderColor: COLOR.accent }]} />
              <T dim size={FONT.sm}>
                ghost A over B to line up the pose
              </T>
            </Pressable>

            <Label style={{ marginTop: SPACE.sm }}>SLOT A</Label>
            <DatePicker dates={dates} selected={aDate ?? dates[0] ?? null} onPick={setADate} />
            <Label style={{ marginTop: SPACE.md }}>SLOT B</Label>
            <DatePicker dates={dates} selected={bDate ?? dates[dates.length - 1] ?? null} onPick={setBDate} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Frame({ photo, ghost, label }: { photo: Photo | null; ghost?: Photo | null; label: string }) {
  return (
    <View style={styles.frame}>
      <View style={styles.frameHead}>
        <T faint size={FONT.xs}>
          {label}
        </T>
        <T dim size={FONT.xs}>
          {photo ? `${shortLabel(photo.date)}${photo.weight_kg ? ` · ${photo.weight_kg}kg` : ''}` : '—'}
        </T>
      </View>
      <View style={styles.imgBox}>
        {photo ? <Image source={{ uri: photo.file_uri }} style={styles.img} resizeMode="cover" /> : <T faint size={FONT.xs}>NO PHOTO</T>}
        {ghost ? <Image source={{ uri: ghost.file_uri }} style={[styles.img, styles.ghost]} resizeMode="cover" /> : null}
      </View>
    </View>
  );
}

function DatePicker({ dates, selected, onPick }: { dates: string[]; selected: string | null; onPick: (d: string) => void }) {
  if (dates.length === 0) return <T faint size={FONT.xs}>no photos at this angle</T>;
  return (
    <View style={styles.dateWrap}>
      {dates.map((d) => (
        <Pressable key={d} onPress={() => onPick(d)} style={[styles.dateChip, selected === d && styles.dateActive]}>
          <T size={FONT.xs} style={{ color: selected === d ? COLOR.bg : COLOR.textDim }}>
            {shortLabel(d)}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.lg },
  angleTabs: { flexDirection: 'row', gap: SPACE.xs, paddingHorizontal: SPACE.lg, marginBottom: SPACE.sm },
  angleTab: { flex: 1, borderWidth: 1, borderColor: COLOR.line, paddingVertical: SPACE.sm, alignItems: 'center', backgroundColor: COLOR.surfaceAlt },
  angleActive: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
  imgRow: { flex: 1, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLOR.line },
  frame: { flex: 1 },
  frameHead: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLOR.line },
  imgBox: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  img: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  ghost: { opacity: 0.4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  check: { width: 14, height: 14, borderWidth: 1, borderColor: COLOR.lineBright },
  dateWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.xs },
  dateChip: { borderWidth: 1, borderColor: COLOR.line, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, backgroundColor: COLOR.surfaceAlt },
  dateActive: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
});
