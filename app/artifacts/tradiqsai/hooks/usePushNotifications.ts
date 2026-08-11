import { useEffect } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/utils/supabase';

export function usePushNotifications(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId || !Device.isDevice) return;
    let cancelled = false;

    async function register() {
      try {
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted' || cancelled) return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        const token = (await Notifications.getExpoPushTokenAsync()).data;
        if (!cancelled) {
          const { error } = await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
          if (error) console.warn('Unable to save push token:', error.message);
        }
      } catch (error) {
        console.warn('Push notification registration failed:', error);
      }
    }

    void register();
    return () => { cancelled = true; };
  }, [userId]);
}