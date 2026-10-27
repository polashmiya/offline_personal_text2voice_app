import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../store/editorStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { AppText, Button, Card, IconButton } from '../../../components/ui/primitives';
import { confirmDialog, showToast } from '../../../components/ui/overlays';
import { textStats } from '../../../domain/text/estimate';
import { formatClock } from '../../../utils/format';
import { localizeDigits } from '../../../i18n';
import { FileBridge } from '../../../services/native';
import { radius, spacing, typography } from '../../../theme/tokens';
import { useErrorText } from '../../../components/common/useErrorText';
import { toAppError } from '../../../services/native/errors';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_CHARS = 100_000;

export function TextEditorCard({ editable }: { editable: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const errorText = useErrorText();
  const text = useEditor(s => s.text);
  const speed = useEditor(s => s.speed);
  const canUndo = useEditor(s => s.undoStack.length > 0);
  const canRedo = useEditor(s => s.redoStack.length > 0);
  const { setText, undo, redo } = useEditor.getState();
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>();
  /** Last known cursor, so "Insert pause" lands where the user is typing. */
  const cursor = useRef({ start: 0, end: 0 });

  const stats = useMemo(() => textStats(text, speed), [text, speed]);

  const paste = async () => {
    const clip = await Clipboard.getString();
    if (clip) {
      setText((text ? `${text}${/\s$/.test(text) ? '' : '\n'}` : '') + clip, { checkpoint: true });
    }
  };

  const clear = async () => {
    if (!text) {
      return;
    }
    const ok = await confirmDialog({
      title: t('home.clearConfirmTitle'),
      body: t('home.clearConfirmBody'),
      confirmLabel: t('home.clear'),
      destructive: true,
    });
    if (ok) {
      setText('', { checkpoint: true });
    }
  };

  const importText = async () => {
    try {
      const picked = await FileBridge.pickFile(['text/plain'], MAX_IMPORT_BYTES);
      if (!picked) {
        return;
      }
      const content = await FileBridge.readText(picked.cachedPath);
      await FileBridge.deletePath(picked.cachedPath);
      setText(content.slice(0, MAX_CHARS), { checkpoint: true });
      showToast(t('home.textImported'), 'success');
    } catch (e) {
      showToast(errorText(toAppError(e, 'file_permission')), 'error');
    }
  };

  /** Inserts a [pause 1s] marker at the cursor (or replaces the selection). Never spoken; it becomes silence. */
  const insertPause = () => {
    const { start, end } = cursor.current;
    const at = Math.min(start, text.length);
    const to = Math.min(Math.max(end, at), text.length);
    const before = text.slice(0, at);
    const after = text.slice(to);
    const marker = '[pause 1s]';
    const left = before && !/\s$/.test(before) ? ' ' : '';
    const right = after && !/^\s/.test(after) ? ' ' : '';
    const next = before + left + marker + right + after;
    setText(next.slice(0, MAX_CHARS), { checkpoint: true });
    const caret = (before + left + marker + right).length;
    cursor.current = { start: caret, end: caret };
    inputRef.current?.focus();
    setSelection({ start: caret, end: caret });
  };

  const selectAll = () => {
    inputRef.current?.focus();
    setSelection({ start: 0, end: text.length });
  };

  return (
    <Card style={styles.card}>
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={value => setText(value)}
        editable={editable}
        multiline
        maxLength={MAX_CHARS}
        selection={selection}
        onSelectionChange={e => {
          cursor.current = e.nativeEvent.selection;
          if (selection) {
            setSelection(undefined);
          }
        }}
        placeholder={t('home.placeholder')}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={t('home.title')}
        textAlignVertical="top"
        style={[typography.editor, styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
      />
      <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
        {t('home.stats', {
          chars: localizeDigits(String(stats.characters)),
          words: localizeDigits(String(stats.words)),
          duration: formatClock(stats.estimatedSeconds * 1000),
        })}
      </AppText>
      <View style={styles.pauseRow}>
        <Button compact kind="ghost" icon="plus" label={t('home.insertPause')} onPress={insertPause} disabled={!editable} />
        <AppText variant="caption" tone="faint" style={styles.flex}>
          {t('home.pauseHint')}
        </AppText>
      </View>
      <View style={styles.toolbar}>
        <IconButton icon="paste" label={t('home.paste')} onPress={paste} disabled={!editable} />
        <IconButton icon="fileText" label={t('home.importText')} onPress={importText} disabled={!editable} />
        <IconButton icon="undo" label={t('home.undo')} onPress={undo} disabled={!editable || !canUndo} />
        <IconButton icon="redo" label={t('home.redo')} onPress={redo} disabled={!editable || !canRedo} />
        <IconButton icon="select" label={t('home.selectAll')} onPress={selectAll} disabled={!text} />
        <IconButton icon="trash" label={t('home.clear')} onPress={clear} disabled={!editable || !text} tone="danger" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md },
  input: { minHeight: 180, maxHeight: 420, borderRadius: radius.md, padding: spacing.md },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between' },
  pauseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
