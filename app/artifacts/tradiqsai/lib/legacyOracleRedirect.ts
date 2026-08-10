/**
 * Legacy deep-link mapping for the Oracle chat.
 *
 * The Oracle chat used to live on the AI Tools tab (`/(tabs)/ai-tools`) and
 * now has its own screen at `/oracle`. Saved navigation targets, notifications,
 * or deep links that still point at the old route can signal "I wanted the
 * chat" via a query param; the AI Tools screen redirects them to `/oracle`.
 *
 * Recognized legacy targets (all case-insensitive):
 * - `/(tabs)/ai-tools?chat=…`   (any value: `chat=1`, `chat=true`, `chat=oracle`, bare `chat`)
 * - `/(tabs)/ai-tools?view=chat` or `?view=oracle`
 * - `/(tabs)/ai-tools?screen=oracle`
 */

type ParamValue = string | string[] | undefined;

function first(v: ParamValue): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Returns `'/oracle'` when the given route params identify a legacy Oracle
 * chat target, otherwise `null`.
 */
export function legacyOracleRedirectTarget(
  params: Record<string, ParamValue>,
): '/oracle' | null {
  const chat = first(params.chat);
  if (chat !== undefined) {
    // A bare `?chat` arrives as '' — treat any non-"false"/"0" value as intent.
    const v = chat.trim().toLowerCase();
    if (v !== '0' && v !== 'false' && v !== 'no') return '/oracle';
  }

  const view = first(params.view)?.trim().toLowerCase();
  if (view === 'chat' || view === 'oracle') return '/oracle';

  const screen = first(params.screen)?.trim().toLowerCase();
  if (screen === 'oracle') return '/oracle';

  return null;
}
