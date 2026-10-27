import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/layout/Screen';
import { AppText, Card, ChoiceChips, Divider, ListRow, SectionHeader, ToggleRow } from '../../components/ui/primitives';
import { confirmDialog, showToast } from '../../components/ui/overlays';
import { usePreferences } from '../../store/preferencesStore';
import { applyUiLanguage, localizeDigits } from '../../i18n';
import type { ExportFormat, LanguageMode } from '../../domain/types';
import { BITRATES, FORMAT_INFO } from '../../domain/export/fileName';
import { FileBridge } from '../../services/native';
import { deleteAllUserData } from '../../services/db/repositories';
import { ensureBundledMusic } from '../audio-studio/music/bundledMusic';
import { studioRepo } from '../voice-studio/services/studioRepo';
import { paths } from '../../services/storage/paths';
import { usePlayer } from '../audio-studio/player/playerStore';
import { useGeneration } from '../tts/store/generationStore';
import { spacing } from '../../theme/tokens';

const LANGS: LanguageMode[] = ['auto', 'bn', 'en', 'mixed', 'banglish'];
const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25];
const FORMATS: ExportFormat[] = ['mp3', 'wav', 'm4a', 'flac', 'opus'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const prefs = usePreferences();
  const build = FileBridge.getBuildInfo();

  const deleteEverything = async () => {
    const ok = await confirmDialog({
      title: t('settings.deleteAllTitle'),
      body: t('settings.deleteAllBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok || useGeneration.getState().running) {
      return;
    }
    await usePlayer.getState().unload();
    await deleteAllUserData();
    await studioRepo.deleteAll();
    const p = paths();
    await Promise.all([p.generated, p.exports, p.drafts, p.jobs, p.imports, p.studio, p.music, p.mix].map(dir => FileBridge.deletePath(dir).catch(() => undefined)));
    await ensureBundledMusic();
    showToast(t('settings.deleted'), 'success');
  };

  return (
    <Screen title={t('settings.title')}>
      <SectionHeader title={t('settings.appearance')} />
      <Card>
        <Field label={t('settings.theme')}>
          <ChoiceChips
            label={t('settings.theme')}
            value={prefs.themeMode}
            onChange={v => prefs.set('themeMode', v)}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
          />
        </Field>
        <Field label={t('settings.appLanguage')}>
          <ChoiceChips
            label={t('settings.appLanguage')}
            value={prefs.uiLanguage}
            onChange={v => {
              prefs.set('uiLanguage', v);
              applyUiLanguage(v);
            }}
            options={[
              { value: 'system', label: t('settings.systemLanguage') },
              { value: 'bn', label: 'বাংলা' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
      </Card>

      <SectionHeader title={t('settings.general')} />
      <Card>
        <Field label={t('settings.defaultLanguage')}>
          <ChoiceChips
            label={t('settings.defaultLanguage')}
            value={prefs.defaultLanguage}
            onChange={v => prefs.set('defaultLanguage', v)}
            options={LANGS.map(l => ({ value: l, label: t(`languages.${l}`) }))}
          />
        </Field>
        <Field label={t('settings.defaultSpeed')}>
          <ChoiceChips
            label={t('settings.defaultSpeed')}
            value={prefs.defaultSpeed}
            onChange={v => prefs.set('defaultSpeed', v)}
            options={SPEEDS.map(s => ({ value: s, label: localizeDigits(`${s}×`) }))}
          />
        </Field>
      </Card>
      <Card style={styles.list}>
        <ToggleRow title={t('settings.autoSaveDraft')} value={prefs.autoSaveDraft} onChange={v => prefs.set('autoSaveDraft', v)} />
        <Divider />
        <ToggleRow title={t('settings.keepScreenAwake')} value={prefs.keepScreenAwake} onChange={v => prefs.set('keepScreenAwake', v)} />
      </Card>

      <SectionHeader title={t('settings.audio')} />
      <Card>
        <Field label={t('settings.defaultFormat')}>
          <ChoiceChips
            label={t('settings.defaultFormat')}
            value={prefs.defaultExportFormat}
            onChange={v => prefs.set('defaultExportFormat', v)}
            options={FORMATS.map(f => ({ value: f, label: FORMAT_INFO[f].label }))}
          />
        </Field>
        <Field label={t('settings.defaultBitrate')}>
          <ChoiceChips
            label={t('settings.defaultBitrate')}
            value={prefs.defaultBitrate}
            onChange={v => prefs.set('defaultBitrate', v)}
            options={BITRATES.map(b => ({ value: b, label: localizeDigits(`${b} kbps`) }))}
          />
        </Field>
      </Card>
      <Card style={styles.list}>
        <ToggleRow title={t('settings.normalizeAudio')} value={prefs.normalizeAudio} onChange={v => prefs.set('normalizeAudio', v)} />
      </Card>

      <SectionHeader title={t('settings.voice')} />
      <Card style={styles.list}>
        <ListRow icon="book" title={t('settings.dictionary')} onPress={() => navigation.navigate('Dictionary')} />
        <Divider />
        <ListRow icon="wave" title={t('settings.manageVoices')} onPress={() => navigation.navigate('Tabs', { screen: 'Voices' })} />
      </Card>

      <SectionHeader title={t('settings.storage')} />
      <Card style={styles.list}>
        <ListRow icon="storage" title={t('settings.storageUsage')} onPress={() => navigation.navigate('Storage')} />
      </Card>

      <SectionHeader title={t('settings.privacy')} />
      <Card>
        <AppText tone="muted">{t('settings.privacyNote')}</AppText>
      </Card>
      <Card style={styles.list}>
        <ListRow icon="trash" title={t('settings.deleteAll')} destructive onPress={deleteEverything} />
      </Card>

      <SectionHeader title={t('settings.about')} />
      <Card style={styles.list}>
        <ListRow icon="info" title="Voice Studio" subtitle={t('settings.version', { version: build.versionName })} />
        <Divider />
        <ListRow icon="shield" title={t('settings.licenses')} onPress={() => navigation.navigate('Licenses')} />
      </Card>
      {!build.allowNetwork && !__DEV__ ? (
        <AppText variant="small" tone="muted">
          {t('settings.offlineBuild')}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
});
