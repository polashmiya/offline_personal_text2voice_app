import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useEditor } from '../store/editorStore';
import { useVoices } from '../../../store/voicesStore';
import { AppText, Banner, Button, Card, ChoiceChips } from '../../../components/ui/primitives';
import type { LanguageMode } from '../../../domain/types';
import { localizeDigits } from '../../../i18n';
import { spacing } from '../../../theme/tokens';
import { Icon } from '../../../components/ui/Icon';
import { useTheme } from '../../../theme/ThemeProvider';

const LANGUAGES: LanguageMode[] = ['auto', 'bn', 'en', 'mixed', 'banglish'];
const SPEEDS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];

export function VoiceOptions({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const voices = useVoices(s => s.voices);
  const { language, voiceId, styleKey, speed } = useEditor();
  const update = useEditor.getState().update;
  const voice = voices.find(v => v.id === voiceId);

  return (
    <Card>
      <View style={styles.group}>
        <AppText variant="small" tone="muted">
          {t('home.language')}
        </AppText>
        <ChoiceChips
          label={t('home.language')}
          value={language}
          onChange={value => !disabled && update({ language: value })}
          options={LANGUAGES.map(code => ({ value: code, label: t(`languages.${code}`), disabled }))}
        />
      </View>

      <View style={styles.group}>
        <AppText variant="small" tone="muted">
          {t('home.voice')}
        </AppText>
        {voices.length === 0 ? (
          <Banner
            tone="info"
            text={t('home.noVoiceBody')}
            action={
              <Button
                compact
                kind="ghost"
                label={t('home.installVoice')}
                onPress={() => navigation.navigate('Tabs', { screen: 'Voices' })}
              />
            }
          />
        ) : (
          <ChoiceChips
            label={t('home.voice')}
            value={voiceId ?? ''}
            onChange={id => {
              const next = voices.find(v => v.id === id);
              update({ voiceId: id, styleKey: next?.styles[0]?.key ?? null });
            }}
            options={voices.map(v => ({ value: v.id, label: v.name, disabled }))}
          />
        )}
      </View>

      {voice && voice.styles.length > 1 ? (
        <View style={styles.group}>
          <AppText variant="small" tone="muted">
            {t('home.style')}
          </AppText>
          <ChoiceChips
            label={t('home.style')}
            value={styleKey ?? voice.styles[0].key}
            onChange={key => update({ styleKey: key })}
            options={voice.styles.map(s => ({ value: s.key, label: s.label, disabled }))}
          />
        </View>
      ) : null}

      {voice?.supportsSpeed ? (
        <View style={styles.group}>
          <AppText variant="small" tone="muted">
            {t('home.speed')}
          </AppText>
          <ChoiceChips
            label={t('home.speed')}
            value={speed}
            onChange={value => update({ speed: value })}
            options={SPEEDS.map(s => ({ value: s, label: localizeDigits(`${s}×`), disabled }))}
          />
        </View>
      ) : null}

      <View style={[styles.comingSoon, { borderColor: colors.border }]} accessibilityState={{ disabled: true }}>
        <Icon name="music" size={20} color={colors.textFaint} />
        <AppText tone="faint" style={styles.flex}>
          {t('home.backgroundMusic')}
        </AppText>
        <AppText variant="caption" tone="faint">
          {t('common.comingSoon')}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  flex: { flex: 1 },
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
});
