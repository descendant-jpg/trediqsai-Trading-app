/**
 * Global auth-route policy.
 *
 * Route groups have no user-facing meaning. During session restoration Expo
 * Router must never choose one implicitly, because that can mount Profile or
 * Admin before the app has established its authenticated landing route.
 */
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';

export const AUTH_HOME_ROUTE = '/(tabs)';
export const AUTH_LOGIN_ROUTE = '/(auth)/login';

export function usePendingRouteRedirect(
  session: unknown,
  loading: boolean,
): void {
  const router = useRouter();
  const pathname = usePathname();
  const lastAuthState = useRef<'authenticated' | 'anonymous' | null>(null);

  // Route once when the initial session finishes restoring and once for each
  // actual sign-in/sign-out transition. A token refresh retains the same auth
  // state and therefore never pulls a user away from an intentional screen.
  useEffect(() => {
    if (loading) return;

    const authState = session ? 'authenticated' : 'anonymous';
    if (lastAuthState.current === authState) return;
    lastAuthState.current = authState;

    const destination =
      authState === 'authenticated' ? AUTH_HOME_ROUTE : AUTH_LOGIN_ROUTE;
    if (pathname === destination) return;

    // The root stack must mount before this replacement, so defer by one turn.
    const timer = setTimeout(() => router.replace(destination as never), 0);
    return () => clearTimeout(timer);
  }, [loading, pathname, router, session]);
}
