/**
 * Hook that preserves a signed-out user's deep-link destination and replays
 * it after sign-in. See `lib/pendingRoute.ts` for the route mapping rules.
 */
import { useEffect } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import {
  buildPendingRoute,
  consumePendingRoute,
  setPendingRoute,
} from '@/lib/pendingRoute';

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
    if (pending) {
      // Defer until the router stack has mounted.
      setTimeout(() => router.replace(pending as never), 0);
    }
  }, [loading, session, router]);
}
