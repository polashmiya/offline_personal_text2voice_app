import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { AppText, Banner, Button, Card, ChoiceChips, EmptyState, IconButton, TextField, ToggleRow } from '../../components/ui/primitives';
import { confirmDialog } from '../../components/ui/overlays';
import { pronunciationsRepo } from '../../services/db/repositories';
import type { PronunciationEntry } from '../../domain/text/pronunciation';
import { useTheme } from '../../theme/ThemeProvider';
import { newId } from '../../utils/id';
import { radius, spacing } from '../../theme/tokens';

const blank = (): PronunciationEntry => ({
  id: newId('pr_'),
  term: '',
  replacement: '',
  language: 'any',
  caseSensitive: false,
  enabled: true,
  projectId: null,
});

function EntryEditor({ entry, onClose }: { entry: PronunciationEntry; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [draft, setDraft] = useState(entry);
  const [invalid, setInvalid] = useState(false);

  const save = async () => {
    if (!draft.term.trim() || !draft.replacement.trim()) {
      setInvalid(true);
      return;
    }
    await pronunciationsRepo.save(draft);
    onClose(true);
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={() => onClose(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <AppText variant="heading">{entry.term ? t('dictionary.edit') : t('dictionary.add')}</AppText>
          <TextField label={t('dictionary.term')} value={draft.term} onChangeText={term => setDraft({ ...draft, term })} autoCapitalize="none" autoCorrect={false} maxLength={80} />
          <TextField
            label={t('dictionary.replacement')}
            hint={t('dictionary.replacementHint')}
            value={draft.replacement}
            onChangeText={replacement => setDraft({ ...draft, replacement })}
            maxLength={200}
          />
          <View style={styles.group}>
            <AppText variant="small" tone="muted">
              {t('dictionary.language')}
            </AppText>
            <ChoiceChips
              label={t('dictionary.language')}
              value={draft.language}
              onChange={language => setDraft({ ...draft, language })}
              options={[
                { value: 'any', label: t('dictionary.any') },
                { value: 'bn', label: t('languages.nameBn') },
                { value: 'en', label: t('languages.nameEn') },
              ]}
            />
          </View>
          <ToggleRow title={t('dictionary.caseSensitive')} value={draft.caseSensitive} onChange={caseSensitive => setDraft({ ...draft, caseSensitive })} />
          {invalid ? <Banner tone="error" text={t('dictionary.invalid')} /> : null}
          <View style={styles.actions}>
            <Button kind="secondary" label={t('common.cancel')} onPress={() => onClose(false)} style={styles.flex} />
            <Button label={t('common.save')} onPress={save} style={styles.flex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DictionaryScreen() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<PronunciationEntry[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PronunciationEntry | null>(null);

  const reload = useCallback(() => {
    pronunciationsRepo.list(search).then(setEntries);
  }, [search]);
  useEffect(reload, [reload]);

  const remove = async (entry: PronunciationEntry) => {
    const ok = await confirmDialog({ title: `${t('common.delete')} “${entry.term}”?`, confirmLabel: t('common.delete'), destructive: true });
    if (ok) {
      await pronunciationsRepo.remove(entry.id);
      reload();
    }
  };

  const toggle = async (entry: PronunciationEntry) => {
    await pronunciationsRepo.save({ ...entry, enabled: !entry.enabled });
    reload();
  };

  return (
    <Screen topInset={false}>
      <TextField label={t('common.search')} placeholder={t('dictionary.searchPlaceholder')} value={search} onChangeText={setSearch} />
      <Button icon="plus" label={t('dictionary.add')} onPress={() => setEditing(blank())} />
      {entries.length === 0 ? (
        <EmptyState icon="book" title={t('dictionary.title')} body={t('dictionary.empty')} />
      ) : (
        entries.map(entry => (
          <Card key={entry.id} style={styles.entry}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" tone={entry.enabled ? 'default' : 'faint'}>
                {entry.term}
              </AppText>
              <AppText tone={entry.enabled ? 'muted' : 'faint'}>→ {entry.replacement}</AppText>
              <AppText variant="caption" tone="faint">
                {entry.language === 'any' ? t('dictionary.any') : entry.language === 'bn' ? t('languages.nameBn') : t('languages.nameEn')}
                {' · '}
                {entry.enabled ? t('common.on') : t('common.off')}
              </AppText>
            </View>
            <IconButton icon={entry.enabled ? 'check' : 'close'} label={t('dictionary.enabled')} tone={entry.enabled ? 'accent' : 'default'} onPress={() => toggle(entry)} />
            <IconButton icon="pencil" label={t('common.edit')} onPress={() => setEditing(entry)} />
            <IconButton icon="trash" label={t('common.delete')} tone="danger" onPress={() => remove(entry)} />
          </Card>
        ))
      )}
      {editing ? (
        <EntryEditor
          entry={editing}
          onClose={saved => {
            setEditing(null);
            if (saved) {
              reload();
            }
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: spacing.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 0, paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
});
