import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { COLOR, FONT, SPACE } from '../theme';
import { T } from './ui';
import { useApp } from '../context/AppContext';

/**
 * Two-operator switcher. Tap a name to switch whose log you're viewing. Sits at
 * the top of every module so it's always one tap to flip between you and your
 * wife. With a single profile it's just a label.
 */
export function ProfileBar({ title }: { title: string }) {
  const { profiles, activeId, switchProfile } = useApp();

  return (
    <View style={styles.wrap}>
      <T accent bold size={FONT.lg} style={{ letterSpacing: 2 }}>
        {title}
      </T>
      <View style={styles.pills}>
        {profiles.map((p) => {
          const on = p.id === activeId;
          return (
            <Pressable key={p.id} onPress={() => switchProfile(p.id)} style={[styles.pill, on && styles.pillOn]}>
              <T size={FONT.xs} bold style={{ color: on ? COLOR.bg : COLOR.textDim, letterSpacing: 1 }}>
                {(p.name || '—').toUpperCase()}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md },
  pills: { flexDirection: 'row', gap: SPACE.xs },
  pill: {
    borderWidth: 1,
    borderColor: COLOR.line,
    backgroundColor: COLOR.surfaceAlt,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  pillOn: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
});
