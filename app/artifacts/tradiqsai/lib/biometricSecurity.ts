import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const BIOMETRICS_KEY = 'tradiqs_biometrics_enabled';
export const unsupportedBiometricsMessage = 'Biometric authentication is only available on supported iOS/Android devices with FaceID or Fingerprint enabled.';

const readPreference = async () => {
  const value = Platform.OS === 'web'
    ? await AsyncStorage.getItem(BIOMETRICS_KEY)
    : await SecureStore.getItemAsync(BIOMETRICS_KEY);
  return value === 'true';
};

type PreferenceListener = (enabled: boolean) => void;
const listeners = new Set<PreferenceListener>();

/** Returns null when encrypted storage cannot be read; callers must fail closed. */
export const getBiometricsEnabled = () => readPreference().catch(() => null);

export const setBiometricsEnabled = async (enabled: boolean) => {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(BIOMETRICS_KEY, String(enabled));
  } else {
    await SecureStore.setItemAsync(BIOMETRICS_KEY, String(enabled));
  }
  listeners.forEach((listener) => listener(enabled));
};

export const subscribeToBiometricsPreference = (listener: PreferenceListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const authenticateBiometrics = async (promptMessage: string) => {
  if (Platform.OS === 'web') return { ok: false, reason: unsupportedBiometricsMessage };
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !enrolled) return { ok: false, reason: unsupportedBiometricsMessage };
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success ? { ok: true, reason: '' } : { ok: false, reason: result.error === 'user_cancel' ? 'Authentication was cancelled.' : 'Biometric authentication could not be verified.' };
  } catch {
    return { ok: false, reason: 'Biometric authentication is temporarily unavailable. Please try again.' };
  }
};