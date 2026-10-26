import React from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { AppText, Card, SectionHeader } from '../../components/ui/primitives';
import { useVoices } from '../../store/voicesStore';

/** Kept in sync with THIRD_PARTY_NOTICES.md at the repository root. */
const LIBRARIES: Array<{ name: string; license: string; note?: string }> = [
  { name: 'sherpa-onnx', license: 'Apache-2.0', note: 'Offline speech synthesis runtime (k2-fsa)' },
  { name: 'ONNX Runtime', license: 'MIT', note: 'Bundled inside sherpa-onnx' },
  { name: 'espeak-ng data', license: 'GPL-3.0', note: 'Only inside voice packages that include it' },
  { name: 'LAME', license: 'LGPL-2.0-or-later', note: 'MP3 encoder, built as a separate library (liblamejni.so)' },
  { name: 'React Native', license: 'MIT' },
  { name: 'React Navigation', license: 'MIT' },
  { name: 'op-sqlite', license: 'MIT' },
  { name: 'Zustand', license: 'MIT' },
  { name: 'Zod', license: 'MIT' },
  { name: 'i18next / react-i18next', license: 'MIT' },
  { name: 'react-native-svg', license: 'MIT' },
  { name: 'react-native-screens', license: 'MIT' },
  { name: 'react-native-safe-area-context', license: 'MIT' },
  { name: '@react-native-clipboard/clipboard', license: 'MIT' },
];

export function LicensesScreen() {
  const { t } = useTranslation();
  const voices = useVoices(s => s.voices);
  return (
    <Screen topInset={false}>
      <SectionHeader title={t('licenses.models')} />
      {voices.length === 0 ? <AppText tone="muted">{t('licenses.noModels')}</AppText> : null}
      {voices.map(v => (
        <Card key={v.id}>
          <AppText variant="bodyStrong">
            {v.name} · {v.modelVersion}
          </AppText>
          <AppText tone="muted">
            {v.license.name} · {t('voices.commercialUse')}: {v.license.commercialUse ? t('common.yes') : t('common.no')}
          </AppText>
          {v.license.attribution ? <AppText variant="small" tone="muted">{v.license.attribution}</AppText> : null}
          {v.license.url ? (
            <AppText variant="caption" tone="faint" selectable>
              {v.license.url}
            </AppText>
          ) : null}
        </Card>
      ))}
      <SectionHeader title={t('licenses.libraries')} />
      {LIBRARIES.map(lib => (
        <Card key={lib.name}>
          <AppText variant="bodyStrong">{lib.name}</AppText>
          <AppText tone="muted">{lib.license}</AppText>
          {lib.note ? <AppText variant="small" tone="faint">{lib.note}</AppText> : null}
        </Card>
      ))}
    </Screen>
  );
}
