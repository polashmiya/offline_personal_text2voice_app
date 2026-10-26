import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card, ChoiceChips, Divider } from '../../../components/ui/primitives';
import { confirmDialog, showToast } from '../../../components/ui/overlays';
import { useVoices } from '../../../store/voicesStore';
import { usePreferences } from '../../../store/preferencesStore';
import { voicesRepo } from '../../../services/db/repositories';
import type { VoicePackManifest } from '../../../domain/voicepack/manifest';
import { deleteVoice } from '../services/voiceImport';
import { testVoice } from '../services/voiceRuntime';
import { usePlayer } from '../../audio-studio/player/playerStore';
import { useErrorText } from '../../../components/common/useErrorText';
import { toAppError } from '../../../services/native/errors';
import { formatBytes } from '../../../utils/format';
import { localizeDigits } from '../../../i18n';
import { spacing } from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceDetail'>;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <AppText tone="muted" style={styles.label}>
        {label}
      </AppText>
      <AppText style={styles.value}>{value}</AppText>
    </View>
  );
}

export function VoiceDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const voice = useVoices(s => s.byId(route.params.voiceId));
  const defaultVoiceId = usePreferences(s => s.defaultVoiceId);
  const [manifest, setManifest] = useState<VoicePackManifest | null>(null);
  const [styleKey, setStyleKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [metrics, setMetrics] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    voicesRepo.manifest(route.params.voiceId).then(setManifest);
  }, [route.params.voiceId]);

  useEffect(() => {
    navigation.setOptions({ title: voice?.name ?? '' });
  }, [navigation, voice?.name]);

  if (!voice) {
    return <Screen topInset={false}>{null}</Screen>;
  }

  const style = voice.styles.find(s => s.key === styleKey) ?? voice.styles[0];

  const runTest = async () => {
    if (!manifest) {
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const sentence = voice.languages.includes('bn') ? t('voices.testSentenceBn') : t('voices.testSentenceEn');
      const result = await testVoice(voice, manifest, sentence, style.speakerId);
      setMetrics(
        t('voices.loadTime', {
          ms: localizeDigits(String(Math.round(result.loadMs))),
          rtf: localizeDigits(result.realTimeFactor.toFixed(2)),
        }),
      );
      const player = usePlayer.getState();
      if (await player.load(result.path)) {
        await player.toggle();
      }
    } catch (e) {
      setError(errorText(toAppError(e, 'generation_failed')));
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: t('voices.deleteTitle', { name: voice.name }),
      body: t('voices.deleteBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    await usePlayer.getState().unload();
    await deleteVoice(voice.id);
    if (defaultVoiceId === voice.id) {
      usePreferences.getState().set('defaultVoiceId', null);
    }
    await useVoices.getState().refresh();
    navigation.goBack();
  };

  const languages = voice.languages.map(l => (l === 'bn' ? t('languages.nameBn') : t('languages.nameEn'))).join(', ');

  return (
    <Screen topInset={false}>
      <Card>
        {voice.description ? <AppText tone="muted">{voice.description}</AppText> : null}
        <InfoRow label={t('voices.languages')} value={languages} />
        {voice.languageHandling.en === 'transliterate' ? (
          <AppText variant="small" tone="muted">
            {t('voices.readsEnglishAs')}
          </AppText>
        ) : null}
        <Divider />
        <InfoRow label={t('voices.styles')} value={voice.styles.map(s => s.label).join(', ')} />
        <InfoRow label={t('voices.size')} value={formatBytes(voice.sizeBytes)} />
        <InfoRow label={t('voices.engine')} value={`${voice.engine.toUpperCase()} · ${t(`voices.quality.${voice.quality}`)}`} />
        <InfoRow label={t('voices.version')} value={voice.modelVersion} />
        <InfoRow label={t('voices.license')} value={voice.license.name} />
        <InfoRow label={t('voices.commercialUse')} value={voice.license.commercialUse ? t('common.yes') : t('common.no')} />
        {voice.license.attribution ? <InfoRow label={t('voices.attribution')} value={voice.license.attribution} /> : null}
      </Card>

      {voice.styles.length > 1 ? (
        <ChoiceChips
          label={t('home.style')}
          value={style.key}
          onChange={setStyleKey}
          options={voice.styles.map(s => ({ value: s.key, label: s.label }))}
        />
      ) : null}

      <Button icon="play" label={testing ? t('voices.testing') : t('voices.test')} loading={testing} onPress={runTest} />
      {metrics ? (
        <AppText variant="small" tone="muted">
          {metrics}
        </AppText>
      ) : null}
      {error ? <Banner tone="error" text={error} /> : null}

      <Button
        kind="secondary"
        icon="star"
        label={defaultVoiceId === voice.id ? t('voices.isDefault') : t('voices.setDefault')}
        disabled={defaultVoiceId === voice.id}
        onPress={() => {
          usePreferences.getState().set('defaultVoiceId', voice.id);
          showToast(t('voices.isDefault'), 'success');
        }}
      />
      <Button kind="danger" icon="trash" label={t('common.delete')} onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  info: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  label: { flex: 2 },
  value: { flex: 3 },
});
