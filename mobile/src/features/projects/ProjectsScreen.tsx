import React, { useCallback, useState } from 'react';
import { useGeneration } from '../tts/store/generationStore';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/layout/Screen';
import { AppText, Card, ChoiceChips, EmptyState, IconButton } from '../../components/ui/primitives';
import { confirmDialog, promptDialog } from '../../components/ui/overlays';
import { Icon } from '../../components/ui/Icon';
import {
  generationsRepo,
  projectsRepo,
  type Generation,
  type Project,
} from '../../services/db/repositories';
import { useEditor } from '../tts/store/editorStore';
import { PlayerCard } from '../audio-studio/player/PlayerCard';
import { ReadAlong } from '../audio-studio/player/ReadAlong';
import { usePlayer } from '../audio-studio/player/playerStore';
import { FileBridge } from '../../services/native';
import { useTheme } from '../../theme/ThemeProvider';
import { formatClock, formatDate } from '../../utils/format';
import { radius, spacing, typography } from '../../theme/tokens';

type Tab = 'projects' | 'history';

export function ProjectsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [tab, setTab] = useState<Tab>('history');
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [history, setHistory] = useState<Generation[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [p, h] = await Promise.all([projectsRepo.list(search), generationsRepo.list(search)]);
    setProjects(p);
    setHistory(h);
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const openInEditor = (text: string, settings: Partial<Project['settings']>, projectId: string | null, title: string) => {
    useEditor.getState().loadDraft({
      text,
      language: settings.language ?? 'auto',
      voiceId: settings.voiceId ?? null,
      styleKey: settings.styleKey ?? null,
      speed: settings.speed ?? 1,
      projectId,
      title,
    });
    navigation.navigate('Tabs', { screen: 'Home' });
  };

  const renameProject = async (p: Project) => {
    const title = await promptDialog({ title: t('projects.renameTitle'), initial: p.title, confirmLabel: t('common.save') });
    if (title) {
      await projectsRepo.rename(p.id, title);
      reload();
    }
  };

  const deleteProject = async (p: Project) => {
    const ok = await confirmDialog({
      title: t('projects.deleteProjectTitle'),
      body: t('projects.deleteProjectBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) {
      await projectsRepo.remove(p.id);
      if (useEditor.getState().projectId === p.id) {
        useEditor.getState().update({ projectId: null });
      }
      reload();
    }
  };

  const renameAudio = async (g: Generation) => {
    const title = await promptDialog({ title: t('projects.renameTitle'), initial: g.title, confirmLabel: t('common.save') });
    if (title) {
      await generationsRepo.rename(g.id, title);
      reload();
    }
  };

  const deleteAudio = async (g: Generation) => {
    const ok = await confirmDialog({
      title: t('projects.deleteAudioTitle'),
      body: t('projects.deleteAudioBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    if (usePlayer.getState().path === g.audioPath) {
      await usePlayer.getState().unload();
    }
    // Home must not keep showing (and exporting) audio that no longer exists.
    const last = useGeneration.getState().lastOutcome;
    if (last?.status === 'completed' && last.generationId === g.id) {
      useGeneration.getState().clearOutcome();
    }
    if (g.audioPath) {
      await FileBridge.deletePath(g.audioPath).catch(() => undefined);
    }
    await generationsRepo.remove(g.id);
    reload();
  };

  const languageLabel = (code: string) => t(`languages.${code}`, { defaultValue: code });

  return (
    <Screen title={t('projects.title')}>
      <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Icon name="search" size={20} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('projects.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={t('common.search')}
          style={[typography.body, styles.searchInput, { color: colors.text }]}
        />
      </View>
      <ChoiceChips
        label={t('projects.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'history', label: t('projects.historyTab') },
          { value: 'projects', label: t('projects.projectsTab') },
        ]}
      />

      {tab === 'projects' ? (
        projects.length === 0 ? (
          <EmptyState icon="folder" title={t('projects.emptyProjects')} />
        ) : (
          projects.map(p => (
            <Card key={p.id}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {p.title}
              </AppText>
              <AppText tone="muted" numberOfLines={2}>
                {p.text}
              </AppText>
              <AppText variant="caption" tone="faint">
                {t('projects.updated', { date: formatDate(p.updatedAt, i18n.language) })}
              </AppText>
              <View style={styles.actions}>
                <IconButton icon="pencil" label={t('common.rename')} onPress={() => renameProject(p)} />
                <IconButton icon="trash" label={t('common.delete')} tone="danger" onPress={() => deleteProject(p)} />
                <View style={styles.flex} />
                <IconButton icon="fileText" label={t('projects.openInEditor')} tone="accent" onPress={() => openInEditor(p.text, p.settings, p.id, p.title)} />
              </View>
            </Card>
          ))
        )
      ) : history.length === 0 ? (
        <EmptyState icon="wave" title={t('projects.emptyHistory')} />
      ) : (
        history.map(g => (
          <Card key={g.id}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {g.title}
            </AppText>
            <AppText variant="small" tone="muted">
              {g.voiceName} · {languageLabel(g.language)} · {formatClock(g.durationMs ?? 0)} · WAV
            </AppText>
            <AppText variant="caption" tone="faint">
              {formatDate(g.createdAt, i18n.language)}
            </AppText>
            {expanded === g.id && g.audioPath ? (
              <>
                <PlayerCard path={g.audioPath} mediaTitle={g.title} />
                <ReadAlong path={g.audioPath} text={g.text} timeline={g.timeline} />
              </>
            ) : null}
            <View style={styles.actions}>
              <IconButton
                icon={expanded === g.id ? 'close' : 'play'}
                label={expanded === g.id ? t('common.close') : t('common.play')}
                tone="accent"
                onPress={() => setExpanded(expanded === g.id ? null : g.id)}
              />
              <IconButton icon="pencil" label={t('common.rename')} onPress={() => renameAudio(g)} />
              <IconButton icon="trash" label={t('common.delete')} tone="danger" onPress={() => deleteAudio(g)} />
              <View style={styles.flex} />
              <IconButton
                icon="fileText"
                label={t('projects.openInEditor')}
                onPress={() =>
                  openInEditor(
                    g.text,
                    { voiceId: g.voiceId, language: g.language, styleKey: g.styleKey, speed: g.speed },
                    g.projectId,
                    g.title,
                  )
                }
              />
              <IconButton icon="share" label={t('common.export')} onPress={() => navigation.navigate('Export', { generationId: g.id })} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
});
