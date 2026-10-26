import { PermissionsAndroid, Platform } from 'react-native';

export type MicPermission = 'granted' | 'denied' | 'blocked';

/** Asks for the microphone only when the user starts recording. */
export async function ensureMicPermission(): Promise<MicPermission> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) {
    return 'granted';
  }
  const result = await PermissionsAndroid.request(permission);
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}
