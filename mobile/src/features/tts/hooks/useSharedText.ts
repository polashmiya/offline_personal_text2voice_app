import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import type { RootStackParamList } from '../../../navigation/types';
import { FileBridge } from '../../../services/native';
import { confirmDialog, showToast } from '../../../components/ui/overlays';
import { useEditor } from '../store/editorStore';
import { errorCode, logger } from '../../../services/logging/logger';

/** Same limit as the editor. */
const MAX_CHARS = 100_000;

/**
 * Picks up text shared into the app ("Share → Voice Studio", "Open with" a
 * .txt file) on start and whenever the app returns to the foreground, and
 * puts it in the editor — asking first if that would replace other text.
 */
export function useSharedText(ready: boolean, navigation: NavigationContainerRefWithCurrent<RootStackParamList>) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!ready) {
      return;
    }
    let busy = false;
    const check = async () => {
      if (busy) {
        return;
      }
      busy = true;
      try {
        const shared = await FileBridge.takeSharedText();
        const text = shared?.replace(/\r\n?/g, '\n').trim();
        if (!text) {
          return;
        }
        const editor = useEditor.getState();
        const current = editor.text.trim();
        if (current && current !== text) {
          const ok = await confirmDialog({
            title: t('home.sharedTitle'),
            body: t('home.sharedBody'),
            confirmLabel: t('home.sharedReplace'),
          });
          if (!ok) {
            return;
          }
        }
        editor.setText(text.slice(0, MAX_CHARS), { checkpoint: true });
        editor.update({ projectId: null, title: '' });
        if (navigation.isReady()) {
          navigation.navigate('Tabs', { screen: 'Home' });
        }
        showToast(text.length > MAX_CHARS ? t('home.sharedTrimmed') : t('home.sharedReceived'), 'success');
      } catch (e) {
        logger.warn('share.intake_failed', { code: errorCode(e) });
      } finally {
        busy = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', state => state === 'active' && check());
    return () => sub.remove();
  }, [ready, navigation, t]);
}
