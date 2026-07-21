/**
 * LEAN.SYS visual system.
 * Dark HUD / terminal. Near-black, monospace, single orange accent, hairline
 * borders, zero border-radius, brutalist. No rounded pastel wellness look.
 */

export const COLOR = {
  bg: '#050505',
  surface: '#0c0c0c',
  surfaceAlt: '#111111',
  line: '#242424',
  lineBright: '#3a3a3a',
  text: '#e8e8e8',
  textDim: '#8a8a8a',
  textFaint: '#555555',
  accent: '#ff5a00',
  accentDim: '#7a2c00',
  good: '#4bd66b',
  warn: '#e0b020',
  bad: '#e0432a',
} as const;

/** The only type family in the app. Platform-native monospace. */
export const MONO = 'monospace';

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const;

export const FONT = {
  hero: 64,
  xl: 32,
  lg: 22,
  md: 16,
  sm: 13,
  xs: 11,
} as const;

/** Zero radius, everywhere. This is a machine, not a lifestyle brand. */
export const RADIUS = 0;

export const BORDER = {
  hairline: { borderWidth: 1, borderColor: COLOR.line },
  bright: { borderWidth: 1, borderColor: COLOR.lineBright },
  accent: { borderWidth: 1, borderColor: COLOR.accent },
} as const;
