import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorTokens } from './tokens';
import { usePreferences } from '../store/preferencesStore';

type Theme = { colors: ColorTokens; dark: boolean };

const ThemeContext = createContext<Theme>({ colors: lightColors, dark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const mode = usePreferences(s => s.themeMode);
  const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const value = useMemo(() => ({ colors: dark ? darkColors : lightColors, dark }), [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
