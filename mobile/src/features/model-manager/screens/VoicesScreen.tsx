import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card, EmptyState } from '../../../components/ui/primitives';
import { confirmDialog, showToast } from '../../../components/ui/overlays';
import { Icon } from '../../../components/ui/Icon';
import { useVoices } from '../../../store/voicesStore';
import { usePreferences } from '../../../store/preferencesStore';
import { importVoicePack, type ImportStage } from '../services/voiceImport';
import { useErrorText } from '../../../components/common/useErrorText';
import { useTheme } from '../../../theme/ThemeProvider';
import { formatBytes } from '../../../utils/format';
import { spacing } from '../../../theme/tokens';
import type { VoiceProfile } from '../../../domain/types';

function VoiceRow({ voice, isDefault, onPress }: { voice: VoiceProfile; isDefault: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const languages = voice.languages.map(l => (l === 'bn' ? t('languages.nameBn') : t('languages.nameEn'))).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.voice, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}>
      <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
        <Icon name={voice.isPersonal ? 'person' : 'wave'} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
            {voice.name}
          </AppText>
          {isDefault ? <Icon name="star" size={16} color={colors.accent} /> : null}
        </View>
        <AppText variant="small" tone="muted">
          {languages} · {t(`voices.quality.${voice.quality}`)} · {formatBytes(voice.sizeBytes)}
        </AppText>
        {voice.isPersonal ? (
          <AppText variant="caption" tone="accent">
            {t('voices.personal')}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevronRight" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

export function VoicesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const errorText = useErrorText();
  const voices = useVoices(s => s.voices);
  const defaultVoiceId = usePreferences(s => s.defaultVoiceId);
  const [stage, setStage] = useState<ImportStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runImport = async () => {
    setError(null);
    const result = await importVoicePack(setStage, ({ current, incoming }) =>
      confirmDialog({
        title: t('voices.replaceTitle', { name: current.name }),
        body: t('voices.replaceBody', {
          current: `${current.name} ${current.version}`,
          incoming: `${incoming.name} ${incoming.version}`,
        }),
        confirmLabel: t('voices.replace'),
        destructive: true,
      }),
    );
    setStage(null);
    if (result.status === 'installed') {
      await useVoices.getState().refresh();
      showToast(t(result.replaced ? 'voices.updated' : 'voices.installed', { name: result.manifest.name }), 'success');
    } else if (result.status === 'failed') {
      const message = errorText(result.error);
      setError(result.reason ? `${message}\n${t('errors.details', { reason: result.reason })}` : message);
    }
  };

  return (
    <Screen title={t('voices.title')}>
      {voices.length === 0 ? (
        <EmptyState icon="wave" title={t('voices.empty')} body={t('voices.importHelp')} />
      ) : (
        <View style={styles.list}>
          {voices.map(v => (
            <VoiceRow
              key={v.id}
              voice={v}
              isDefault={v.id === defaultVoiceId}
              onPress={() => navigation.navigate('VoiceDetail', { voiceId: v.id })}
            />
          ))}
        </View>
      )}

      {stage ? <Banner tone="info" text={t(`voices.stages.${stage}`)} /> : null}
      {error ? <Banner tone="error" text={error} /> : null}

      <Button icon="upload" label={t('voices.importPackage')} onPress={runImport} loading={!!stage} disabled={!!stage} />
      {voices.length > 0 ? (
        <AppText variant="small" tone="muted">
          {t('voices.importHelp')}
        </AppText>
      ) : null}

      <Card>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('VoiceStudio')} style={styles.studio}>
          <Icon name="mic" />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t('voices.createMine')}</AppText>
            <AppText variant="caption" tone="muted">
              {t('voices.createMineBody')}
            </AppText>
          </View>
          <Icon name="chevronRight" size={20} />
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 72,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  studio: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
});
