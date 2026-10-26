import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { AppText, Button } from '../../components/ui/primitives';
import { Icon, type IconName } from '../../components/ui/Icon';
import { usePreferences } from '../../store/preferencesStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'shield', title: 'onboarding.s1Title', body: 'onboarding.s1Body' },
  { icon: 'wave', title: 'onboarding.s2Title', body: 'onboarding.s2Body' },
  { icon: 'play', title: 'onboarding.s3Title', body: 'onboarding.s3Body' },
];

/** Three short screens, skippable (spec §80). */
export function OnboardingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const finish = () => {
    usePreferences.getState().set('onboardingDone', true);
    navigation.replace('Tabs', { screen: index >= 1 ? 'Voices' : 'Home' });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.top}>
        <Button kind="ghost" compact label={t('onboarding.skip')} onPress={finish} />
      </View>
      <View style={styles.center}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Icon name={step.icon} size={40} color={colors.accent} />
        </View>
        <AppText variant="title" style={styles.text} accessibilityRole="header">
          {t(step.title)}
        </AppText>
        <AppText tone="muted" style={styles.text}>
          {t(step.body)}
        </AppText>
      </View>
      <View style={styles.dots} accessible accessibilityLabel={`${index + 1} / ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={[styles.dot, { backgroundColor: i === index ? colors.accent : colors.border }]} />
        ))}
      </View>
      <Button label={last ? t('onboarding.start') : t('onboarding.next')} onPress={() => (last ? finish() : setIndex(index + 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  top: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  icon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
