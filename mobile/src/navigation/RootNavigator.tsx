import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList, TabParamList } from './types';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/ui/Icon';
import { HomeScreen } from '../features/tts/screens/HomeScreen';
import { VoicesScreen } from '../features/model-manager/screens/VoicesScreen';
import { VoiceDetailScreen } from '../features/model-manager/screens/VoiceDetailScreen';
import { ProjectsScreen } from '../features/projects/ProjectsScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { DictionaryScreen } from '../features/settings/DictionaryScreen';
import { StorageScreen } from '../features/settings/StorageScreen';
import { LicensesScreen } from '../features/settings/LicensesScreen';
import { ExportScreen } from '../features/audio-studio/export/ExportScreen';
import { VoiceStudioScreen } from '../features/voice-studio/VoiceStudioScreen';
import { CreateVoiceScreen } from '../features/voice-studio/screens/CreateVoiceScreen';
import { StudioProjectScreen } from '../features/voice-studio/screens/StudioProjectScreen';
import { RecordSessionScreen } from '../features/voice-studio/screens/RecordSessionScreen';
import { TrainingGuideScreen } from '../features/voice-studio/screens/TrainingGuideScreen';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  Home: 'mic',
  Voices: 'wave',
  Projects: 'folder',
  Settings: 'settings',
};

function Tabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIcon: ({ color, size }) => <Icon name={TAB_ICONS[route.name]} color={color} size={size} />,
      })}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t('tabs.home') }} />
      <Tab.Screen name="Voices" component={VoicesScreen} options={{ title: t('tabs.voices') }} />
      <Tab.Screen name="Projects" component={ProjectsScreen} options={{ title: t('tabs.projects') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('tabs.settings') }} />
    </Tab.Navigator>
  );
}

export function RootNavigator({ showOnboarding }: { showOnboarding: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      initialRouteName={showOnboarding ? 'Onboarding' : 'Tabs'}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Export" component={ExportScreen} options={{ title: t('export.title'), presentation: 'modal' }} />
      <Stack.Screen name="VoiceDetail" component={VoiceDetailScreen} options={{ title: '' }} />
      <Stack.Screen name="VoiceStudio" component={VoiceStudioScreen} options={{ title: t('studio.title') }} />
      <Stack.Screen name="CreateVoice" component={CreateVoiceScreen} options={{ title: t('studio.createTitle') }} />
      <Stack.Screen name="StudioProject" component={StudioProjectScreen} options={{ title: '' }} />
      <Stack.Screen name="RecordSession" component={RecordSessionScreen} options={{ title: '' }} />
      <Stack.Screen name="TrainingGuide" component={TrainingGuideScreen} options={{ title: t('studio.guideTitle') }} />
      <Stack.Screen name="Dictionary" component={DictionaryScreen} options={{ title: t('dictionary.title') }} />
      <Stack.Screen name="Storage" component={StorageScreen} options={{ title: t('storage.title') }} />
      <Stack.Screen name="Licenses" component={LicensesScreen} options={{ title: t('licenses.title') }} />
    </Stack.Navigator>
  );
}
