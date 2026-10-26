/**
 * Design tokens. Calm, professional audio-tool look: neutral surfaces, one
 * teal accent, no gradients. Text contrast ≥ 4.5:1 on its surface in both themes.
 */

export type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  waveform: string;
  waveformPlayed: string;
};

export const lightColors: ColorTokens = {
  background: '#F6F7F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F3',
  border: '#D9DEE3',
  text: '#14181C',
  textMuted: '#4D5761',
  textFaint: '#6B7580',
  accent: '#0B6E69',
  accentText: '#FFFFFF',
  accentSoft: '#DDF0EE',
  danger: '#B42318',
  dangerSoft: '#FDECEA',
  warning: '#8A5A00',
  warningSoft: '#FFF4DB',
  success: '#1F7A3A',
  successSoft: '#E5F4EA',
  waveform: '#B8C2CC',
  waveformPlayed: '#0B6E69',
};

export const darkColors: ColorTokens = {
  background: '#0F1316',
  surface: '#171C20',
  surfaceAlt: '#20262B',
  border: '#2E363D',
  text: '#ECEFF1',
  textMuted: '#AAB4BD',
  textFaint: '#8D98A2',
  accent: '#4FC3B8',
  accentText: '#04211F',
  accentSoft: '#163532',
  danger: '#F2867C',
  dangerSoft: '#3A1D1A',
  warning: '#F0C060',
  warningSoft: '#352A12',
  success: '#7ED39A',
  successSoft: '#17301F',
  waveform: '#3C464F',
  waveformPlayed: '#4FC3B8',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Bangla script needs extra line height to avoid clipped vowel signs. */
export const typography = {
  title: { fontSize: 24, lineHeight: 34, fontWeight: '700' as const },
  heading: { fontSize: 18, lineHeight: 27, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 25 },
  bodyStrong: { fontSize: 16, lineHeight: 25, fontWeight: '600' as const },
  small: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 18 },
  editor: { fontSize: 18, lineHeight: 30 },
};

export const MIN_TOUCH = 48;
