import { create } from 'zustand';
import { settingsRepo } from '../services/db/repositories';
import type { ExportFormat, LanguageMode } from '../domain/types';
import { DEFAULT_BITRATE } from '../domain/export/fileName';
import { DEFAULT_MIX, parseMixSettings, type MixSettings } from '../domain/audio/mix';
import { errorCode, logger } from '../services/logging/logger';

/** Persistent user preferences (stored in SQLite `settings`). */
export type Preferences = {
  themeMode: 'system' | 'light' | 'dark';
  uiLanguage: 'system' | 'bn' | 'en';
  defaultLanguage: LanguageMode;
  defaultVoiceId: string | null;
  defaultStyleKey: string | null;
  defaultSpeed: number;
  autoSaveDraft: boolean;
  keepScreenAwake: boolean;
  defaultExportFormat: ExportFormat;
  defaultBitrate: number;
  normalizeAudio: boolean;
  /** Last-used Audio Studio settings (music, volumes, ducking, fades). */
  mixSettings: MixSettings;
  /** Artist tag remembered between exports. */
  exportArtist: string;
  onboardingDone: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  themeMode: 'system',
  uiLanguage: 'system',
  defaultLanguage: 'auto',
  defaultVoiceId: null,
  defaultStyleKey: null,
  defaultSpeed: 1,
  autoSaveDraft: true,
  keepScreenAwake: true,
  defaultExportFormat: 'mp3',
  defaultBitrate: DEFAULT_BITRATE,
  normalizeAudio: true,
  mixSettings: DEFAULT_MIX,
  exportArtist: '',
  onboardingDone: false,
};

type PreferencesState = Preferences & {
  loaded: boolean;
  load: () => Promise<void>;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
};

export const usePreferences = create<PreferencesState>((setState, getState) => ({
  ...DEFAULT_PREFERENCES,
  loaded: false,
  async load() {
    const stored = await settingsRepo.getAll();
    const next: Partial<Preferences> = {};
    for (const key of Object.keys(DEFAULT_PREFERENCES) as Array<keyof Preferences>) {
      if (stored[key] !== undefined) {
        try {
          (next as Record<string, unknown>)[key] = JSON.parse(stored[key]);
        } catch {
          logger.warn('prefs.invalid', { key });
        }
      }
    }
    if (next.mixSettings !== undefined) {
      next.mixSettings = parseMixSettings(next.mixSettings);
    }
    setState({ ...next, loaded: true });
  },
  set(key, value) {
    if (getState()[key] === value) {
      return;
    }
    setState({ [key]: value } as Partial<PreferencesState>);
    settingsRepo.set(key, JSON.stringify(value)).catch(e => logger.error('prefs.save_failed', { key, code: errorCode(e) }));
  },
}));
