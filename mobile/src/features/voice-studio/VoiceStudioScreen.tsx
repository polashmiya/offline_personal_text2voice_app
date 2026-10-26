import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Screen } from '../../components/layout/Screen';
import { AppText, Button, Card, Divider, ListRow, SectionHeader } from '../../components/ui/primitives';
import { localizeDigits } from '../../i18n';
import { spacing } from '../../theme/tokens';
import { studioRepo, type VoiceProject } from './services/studioRepo';
import { datasetStats } from '../../domain/voice-dataset/dataset';

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceStudio'>;

type ProjectSummary = { project: VoiceProject; minutes: number };

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View style={styles.step}>
      <AppText variant="heading" tone="accent">
        {localizeDigits(String(n))}
      </AppText>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small" tone="muted">
          {body}
        </AppText>
      </View>
    </View>
  );
}

/** Personal Voice Studio hub: record → train on a computer → import. */
export function VoiceStudioScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const list = await studioRepo.listProjects();
        const summaries = await Promise.all(
          list.map(async project => ({
            project,
            minutes: datasetStats(await studioRepo.recordings(project.id)).speechMs / 60000,
          })),
        );
        if (alive) {
          setProjects(summaries);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <Screen topInset={false}>
      <Card>
        <AppText>{t('studio.hubIntro')}</AppText>
        <Step n={1} title={t('studio.step1Title')} body={t('studio.step1Body')} />
        <Step n={2} title={t('studio.step2Title')} body={t('studio.step2Body')} />
        <Step n={3} title={t('studio.step3Title')} body={t('studio.step3Body')} />
      </Card>

      {projects.length > 0 ? (
        <>
          <SectionHeader title={t('studio.myVoices')} />
          <Card style={styles.list}>
            {projects.map(({ project, minutes }, i) => (
              <React.Fragment key={project.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  icon="mic"
                  title={project.name}
                  subtitle={t('studio.minutesRecorded', { minutes: localizeDigits(minutes.toFixed(1)) })}
                  onPress={() => navigation.navigate('StudioProject', { projectId: project.id })}
                />
              </React.Fragment>
            ))}
          </Card>
        </>
      ) : null}

      <Button icon="plus" label={t('studio.newVoice')} onPress={() => navigation.navigate('CreateVoice')} />
      <Button kind="secondary" icon="book" label={t('studio.trainingGuide')} onPress={() => navigation.navigate('TrainingGuide')} />
      <AppText variant="small" tone="muted">
        {t('studio.privacy')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1, gap: spacing.xs },
  list: { paddingVertical: spacing.xs, gap: 0 },
});
