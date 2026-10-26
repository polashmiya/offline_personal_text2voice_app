import type { NavigatorScreenParams } from '@react-navigation/native';
import type { StyleKey } from '../domain/voice-dataset/types';

export type TabParamList = {
  Home: undefined;
  Voices: undefined;
  Projects: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Onboarding: undefined;
  Export: { generationId: string };
  VoiceDetail: { voiceId: string };
  VoiceStudio: undefined;
  CreateVoice: undefined;
  StudioProject: { projectId: string };
  RecordSession: { projectId: string; style: StyleKey };
  TrainingGuide: undefined;
  Dictionary: undefined;
  Storage: undefined;
  Licenses: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
