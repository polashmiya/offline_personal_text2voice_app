import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, spacing } from '../../theme/tokens';
import { AppText, Banner, Button, TextField } from './primitives';

// ------------------------------------------------------------------ dialogs

type DialogRequest =
  | {
      kind: 'confirm';
      title: string;
      body?: string;
      confirmLabel: string;
      destructive?: boolean;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: 'prompt';
      title: string;
      initial: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    };

const useDialogStore = create<{ current: DialogRequest | null }>(() => ({ current: null }));

export function confirmDialog(options: {
  title: string;
  body?: string;
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise(resolve => useDialogStore.setState({ current: { kind: 'confirm', ...options, resolve } }));
}

export function promptDialog(options: { title: string; initial: string; confirmLabel: string }): Promise<string | null> {
  return new Promise(resolve => useDialogStore.setState({ current: { kind: 'prompt', ...options, resolve } }));
}

export function DialogHost() {
  const current = useDialogStore(s => s.current);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setValue(current.initial);
    }
  }, [current]);

  if (!current) {
    return null;
  }
  const close = (result: boolean) => {
    useDialogStore.setState({ current: null });
    if (current.kind === 'confirm') {
      current.resolve(result);
    } else {
      current.resolve(result && value.trim() ? value.trim() : null);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
          <AppText variant="heading" accessibilityRole="header">
            {current.title}
          </AppText>
          {current.kind === 'confirm' && current.body ? <AppText tone="muted">{current.body}</AppText> : null}
          {current.kind === 'prompt' ? (
            <TextField label={current.title} value={value} onChangeText={setValue} autoFocus maxLength={120} />
          ) : null}
          <View style={styles.actions}>
            <Button kind="secondary" label={t('common.cancel')} onPress={() => close(false)} style={styles.flex} />
            <Button
              kind={current.kind === 'confirm' && current.destructive ? 'danger' : 'primary'}
              label={current.confirmLabel}
              onPress={() => close(true)}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------ toasts

type Toast = { id: number; text: string; tone: 'info' | 'error' | 'success' };
const useToastStore = create<{ toast: Toast | null }>(() => ({ toast: null }));
let toastId = 0;

export function showToast(text: string, tone: Toast['tone'] = 'info') {
  const id = ++toastId;
  useToastStore.setState({ toast: { id, text, tone } });
  setTimeout(() => {
    if (useToastStore.getState().toast?.id === id) {
      useToastStore.setState({ toast: null });
    }
  }, tone === 'error' ? 6000 : 3500);
}

export function ToastHost() {
  const toast = useToastStore(s => s.toast);
  const insets = useSafeAreaInsets();
  if (!toast) {
    return null;
  }
  return (
    <Pressable
      onPress={() => useToastStore.setState({ toast: null })}
      style={[styles.toast, { bottom: insets.bottom + 72 }]}>
      <Banner tone={toast.tone} text={toast.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  dialog: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
  toast: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
