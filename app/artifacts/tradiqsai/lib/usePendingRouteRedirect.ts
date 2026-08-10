/**
 * Hook that preserves a signed-out user's deep-link destination and replays
 * it after sign-in. See `lib/pendingRoute.ts` for the route mapping rules.
 *
 * If the stored route no longer resolves to a real screen (e.g. a stale
 * shared link), the user is sent to the home tab with a brief notice instead
 * of the bare not-found screen.
 */
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import {
  buildPendingRoute,
  consumePendingRoute,
  isResolvableRoute,
  setPendingRoute,
} from '@/lib/pendingRoute';

const STALE_LINK_TITLE = 'Link unavailable';
const STALE_LINK_MESSAGE =
  "The page you followed no longer exists, so we've taken you home.";

function notifyStaleLink(): void {
  if (Platform.OS === 'web') {
    // RN's Alert.alert is a silent no-op on web.
    window.alert(`${STALE_LINK_TITLE}\n\n${STALE_LINK_MESSAGE}`);
  } else {
    Alert.alert(STALE_LINK_TITLE, STALE_LINK_MESSAGE);
  }
}

export function usePendingRouteRedirect(
  session: unknown,
  loading: boolean,
): void {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  // While signed out, remember the deep-link route the user was trying to
  // reach so we can land them there after sign-in.
  useEffect(() => {
    if (loading || session) return;
    const pending = buildPendingRoute(pathname, params);
    if (pending) setPendingRoute(pending);
  }, [loading, session, pathname, params]);

  // Once signed in, replay the stored destination (if any) exactly once.
  useEffect(() => {
    if (loading || !session) return;
    const pending = consumePendingRoute();
    if (!pending) return;
    if (isResolvableRoute(pending)) {
      // Defer until the router stack has mounted.
      setTimeout(() => router.replace(pending as never), 0);
    } else {
      // Stale link: land on the home tab and explain briefly.
      setTimeout(() => {
        router.replace('/');
        notifyStaleLink();
      }, 0);
    }
  }, [loading, session, router]);
}
