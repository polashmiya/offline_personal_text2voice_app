import type { NavigatorScreenParams } from '@react-navigation/native';

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
