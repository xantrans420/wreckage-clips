import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLOR, FONT, MONO, SPACE } from '../theme';
import { Label } from './ui';

/**
 * The hero readout. On the home screen this is PROTEIN REMAINING — the single
 * most important number, big and orange. Calories are secondary.
 */
export function HeroNumber({
  label,
  value,
  unit,
  sub,
  done,
}: {
  label: string;
  value: number;
  unit: string;
  sub?: string;
  done?: boolean;
}) {
  const shown = Math.max(0, Math.round(value));
  return (
    <View style={styles.wrap}>
      <Label>{label}</Label>
      <View style={styles.row}>
        <Text style={[styles.value, done && { color: COLOR.good }]}>{done ? '0' : shown}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {sub ? <Text style={styles.sub}>{done ? 'TARGET HIT' : sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  value: { color: COLOR.accent, fontFamily: MONO, fontSize: FONT.hero, fontWeight: '700', lineHeight: FONT.hero * 1.02 },
  unit: { color: COLOR.textDim, fontFamily: MONO, fontSize: FONT.lg, marginBottom: SPACE.md, marginLeft: SPACE.sm },
  sub: { color: COLOR.textDim, fontFamily: MONO, fontSize: FONT.sm, marginTop: SPACE.xs, letterSpacing: 1 },
});
