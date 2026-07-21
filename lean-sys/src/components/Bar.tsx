import React from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR } from '../theme';

/** Hairline progress bar. Fills with accent; overfill clamps visually. */
export function Bar({ value, target, color = COLOR.accent, height = 6 }: { value: number; target: number; color?: string; height?: number }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: COLOR.surfaceAlt, borderWidth: 1, borderColor: COLOR.line, width: '100%' },
  fill: { height: '100%' },
});
