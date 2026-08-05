/**
 * Deferred deep-link navigation for signed-out users.
 *
 * When a signed-out user opens a deep link, the root layout renders the
 * sign-in screen instead of the router stack, so the intended destination
 * would be lost. This module captures the requested route while the user is
 * signed out and replays it (once) after a successful sign-in.
 *
 * Legacy Oracle chat links (`/(tabs)/ai-tools?chat=1`, `?view=chat`, …) are
 * normalized straight to `/oracle` so the user lands on the new screen.
 */
import { legacyOracleRedirectTarget } from '@/lib/legacyOracleRedirect';

type ParamValue = string | string[] | undefined;

/** Routes that are never worth restoring after sign-in. */
const IGNORED_PATHS = new Set(['/', '/index', '/_sitemap', '/+not-found']);

function isAiToolsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  return (
    normalized === '/ai-tools' ||
    normalized === '/(tabs)/ai-tools' ||
    normalized.endsWith('/ai-tools')
  );
}

function encodeParams(params: Record<string, ParamValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      search.append(key, v);
    }
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

/**
 * Builds the route to restore after sign-in from the requested pathname and
 * query params, or `null` when there is nothing worth restoring (home screen,
 * not-found, etc.). Legacy Oracle chat targets are mapped to `/oracle`.
 */
export function buildPendingRoute(
  pathname: string,
  params: Record<string, ParamValue> = {},
): string | null {
  if (!pathname || IGNORED_PATHS.has(pathname)) return null;

  if (isAiToolsPath(pathname)) {
    const legacy = legacyOracleRedirectTarget(params);
    if (legacy) return legacy;
  }

  return `${pathname}${encodeParams(params)}`;
}

/**
 * Pathnames that resolve to real screens (see `app/`). Keep in sync when
 * adding or removing routes; group segments like `(tabs)` are stripped
 * before matching.
 */
const KNOWN_PATHS = new Set([
  '/',
  '/index',
  '/leaderboard',
  '/portfolio',
  '/signals',
  '/profile',
  '/ai-tools',
  '/oracle',
  '/notification-settings',
]);

/**
 * Whether a stored route still resolves to an existing screen. Used to keep
 * stale shared links from dumping users on the not-found screen after
 * sign-in.
 */
export function isResolvableRoute(route: string): boolean {
  const pathname = route.split(/[?#]/, 1)[0];
  const normalized =
    '/' +
    pathname
      .split('/')
      .filter((seg) => seg && !(seg.startsWith('(') && seg.endsWith(')')))
      .join('/');
  return KNOWN_PATHS.has(normalized.toLowerCase());
}

let pendingRoute: string | null = null;

/** Records the route a signed-out user was trying to reach. */
export function setPendingRoute(route: string | null): void {
  pendingRoute = route;
}

/** Returns the stored route (if any) and clears it, so it replays only once. */
export function consumePendingRoute(): string | null {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}

/** Test-only helper. */
export function clearPendingRoute(): void {
  pendingRoute = null;
}
