import { useEffect } from 'react';
import { registerForPushNotificationsAsync } from '@/services/NotificationService';

export function usePushNotifications(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function register() {
      await registerForPushNotificationsAsync();
      if (cancelled) return;
    }

    void register();
    return () => { cancelled = true; };
  }, [userId]);
}