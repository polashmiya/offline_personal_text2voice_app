import React from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { AppText, Card, EmptyState } from '../../components/ui/primitives';

/**
 * Personal Voice Studio (roadmap steps 10–11). Recording, quality analysis
 * and desktop training are not implemented yet, so this screen says so
 * plainly instead of showing controls that do nothing.
 */
export function VoiceStudioScreen() {
  const { t } = useTranslation();
  return (
    <Screen topInset={false}>
      <EmptyState icon="mic" title={t('common.comingSoon')} body={t('studio.body')} />
      <Card>
        <AppText tone="muted">{t('studio.privacy')}</AppText>
      </Card>
    </Screen>
  );
}
