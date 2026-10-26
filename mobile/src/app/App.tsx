import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import '../i18n';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { DialogHost, ToastHost, showToast } from '../components/ui/overlays';
import { AppText, Button } from '../components/ui/primitives';
import { bootstrap, type BootResult } from './bootstrap';
import { useDraftAutosave } from '../features/tts/hooks/useDraftAutosave';
import { logger } from '../services/logging/logger';
import { spacing } from '../theme/tokens';

function Shell() {
  const { colors, dark } = useTheme();
  const { t } = useTranslation();
  const [boot, setBoot] = useState<BootResult | null>(null);
  const [failed, setFailed] = useState(false);
  useDraftAutosave();

  const start = () => {
    setFailed(false);
    bootstrap()
      .then(result => {
        setBoot(result);
        if (result.draftRestored) {
          showToast(t('home.draftRestored'));
        }
      })
      .catch(e => {
        logger.error('app.boot_failed', { msg: String(e) });
        setFailed(true);
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(start, []);

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      {boot ? (
        <NavigationContainer theme={navTheme}>
          <RootNavigator showOnboarding={boot.showOnboarding} />
        </NavigationContainer>
      ) : (
        <View style={[styles.splash, { backgroundColor: colors.background }]}>
          {failed ? (
            <>
              <AppText tone="danger">{t('errors.unknown')}</AppText>
              <Button label={t('common.retry')} onPress={start} />
            </>
          ) : (
            <ActivityIndicator color={colors.accent} size="large" />
          )}
        </View>
      )}
      <DialogHost />
      <ToastHost />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
});
