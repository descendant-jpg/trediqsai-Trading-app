import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';

const ANDROID_CHANNEL_ID = 'default';
const ALLOWED_NOTIFICATION_ROUTES = new Set([
  '/notifications',
  '/live-chart',
  '/(tabs)/signals',
  '/signals',
]);

/**
 * Requests device notification permission, obtains the Expo token (which Expo
 * maps to FCM on Android), and associates it with the authenticated profile.
 * Push tokens are device-only: browser previews and simulators safely skip it.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice || !isSupabaseConfigured) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Trading alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const permissions = await Notifications.getPermissionsAsync();
    const status = permissions.status === 'granted'
      ? permissions.status
      : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )).data;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    // The schema's client-writable device-token column is intentionally named
    // expo_push_token; its migration and column-level grant already exist.
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', user.id);
    if (error) throw error;

    return token;
  } catch (error) {
    console.warn('Push notification registration failed:', error);
    return null;
  }
}

/** Only allow known in-app destinations supplied by trusted push payloads. */
export function getNotificationRoute(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const route = (data as { route?: unknown }).route;
  return typeof route === 'string' && ALLOWED_NOTIFICATION_ROUTES.has(route) ? route : null;
}