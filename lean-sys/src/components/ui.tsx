import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
} from 'react-native';
import { BORDER, COLOR, FONT, MONO, SPACE } from '../theme';

/** Monospace text primitives. */
export function T(props: TextProps & { dim?: boolean; faint?: boolean; accent?: boolean; size?: number; bold?: boolean }) {
  const { dim, faint, accent, size, bold, style, ...rest } = props;
  return (
    <Text
      {...rest}
      style={[
        {
          color: accent ? COLOR.accent : faint ? COLOR.textFaint : dim ? COLOR.textDim : COLOR.text,
          fontFamily: MONO,
          fontSize: size ?? FONT.md,
          fontWeight: bold ? '700' : '400',
        },
        style,
      ]}
    />
  );
}

/** Section/eyebrow label — uppercase, spaced, dim. */
export function Label({ children, style }: { children: React.ReactNode; style?: TextProps['style'] }) {
  return (
    <Text style={[styles.label, style]} allowFontScaling>
      {typeof children === 'string' ? children.toUpperCase() : children}
    </Text>
  );
}

/** Hairline-bordered card. Zero radius. */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View {...rest} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Button({
  label,
  onPress,
  variant = 'default',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'accent' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: ViewProps['style'];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'accent' && styles.btnAccent,
        variant === 'danger' && styles.btnDanger,
        variant === 'ghost' && styles.btnGhost,
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.3 },
        style,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          variant === 'accent' && { color: COLOR.bg },
          variant === 'danger' && { color: COLOR.bad },
        ]}
      >
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label?: string }) {
  return (
    <View style={{ flex: 1 }}>
      {label ? <Label style={{ marginBottom: SPACE.xs }}>{label}</Label> : null}
      <TextInput
        {...rest}
        placeholderTextColor={COLOR.textFaint}
        style={[styles.input, style]}
        selectionColor={COLOR.accent}
      />
    </View>
  );
}

/** Screen scaffold: black bg + consistent padding. */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewProps['style'] }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

/** A labelled stat readout used across screens. */
export function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  const color =
    tone === 'good' ? COLOR.good : tone === 'warn' ? COLOR.warn : tone === 'bad' ? COLOR.bad : tone === 'accent' ? COLOR.accent : COLOR.text;
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <Text style={[styles.statValue, { color }]}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  label: {
    color: COLOR.textDim,
    fontFamily: MONO,
    fontSize: FONT.xs,
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: COLOR.surface,
    ...BORDER.hairline,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
  },
  divider: { height: 1, backgroundColor: COLOR.line, marginVertical: SPACE.md },
  btn: {
    ...BORDER.bright,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.surfaceAlt,
  },
  btnAccent: { backgroundColor: COLOR.accent, borderColor: COLOR.accent },
  btnGhost: { backgroundColor: 'transparent', borderColor: COLOR.line },
  btnDanger: { backgroundColor: 'transparent', borderColor: COLOR.bad },
  btnText: { color: COLOR.text, fontFamily: MONO, fontSize: FONT.sm, letterSpacing: 1 },
  input: {
    color: COLOR.text,
    fontFamily: MONO,
    fontSize: FONT.md,
    ...BORDER.hairline,
    backgroundColor: COLOR.surfaceAlt,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  statValue: { fontFamily: MONO, fontSize: FONT.lg, fontWeight: '700', marginTop: 2 },
  statUnit: { fontSize: FONT.sm, color: COLOR.textDim, fontWeight: '400' },
});
