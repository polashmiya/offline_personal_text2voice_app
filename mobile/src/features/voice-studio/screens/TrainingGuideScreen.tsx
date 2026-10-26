import React from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Card } from '../../../components/ui/primitives';

/**
 * Honest explanation of the training step. Training needs a GPU, so it runs
 * on a computer (or free Colab); the app never pretends to train on the phone.
 */
export function TrainingGuideScreen() {
  const { t } = useTranslation();
  const sections: Array<[string, string]> = [
    ['studio.guideATitle', 'studio.guideABody'],
    ['studio.guideBTitle', 'studio.guideBBody'],
    ['studio.guideCTitle', 'studio.guideCBody'],
    ['studio.guideBaseTitle', 'studio.guideBaseBody'],
  ];
  return (
    <Screen topInset={false}>
      <AppText>{t('studio.guideIntro')}</AppText>
      {sections.map(([title, body]) => (
        <Card key={title}>
          <AppText variant="heading">{t(title)}</AppText>
          <AppText selectable>{t(body)}</AppText>
        </Card>
      ))}
      <AppText variant="small" tone="muted">
        {t('studio.guideOnline')}
      </AppText>
    </Screen>
  );
}
