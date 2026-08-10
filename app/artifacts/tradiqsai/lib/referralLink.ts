/**
 * Extracts a referral code from an incoming URL, if present.
 *
 * Supported shapes:
 * - https://tradiqsai.com/r/<code>            (universal link)
 * - tradiqsai://r/<code>                      (custom scheme deep link)
 * - any URL with ?ref=<code> or ?code=<code>  (Expo web query param)
 *
 * Returns the uppercased code, or null when the URL carries no referral.
 */
export function extractReferralCode(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);

    // Query params take a straightforward shape on web: /?ref=CODE
    const fromQuery = parsed.searchParams.get('ref') ?? parsed.searchParams.get('code');
    if (fromQuery && fromQuery.trim()) return fromQuery.trim().toUpperCase();

    // Path form: /r/<code>. For scheme URLs (tradiqsai://r/CODE) the "r"
    // lands in the host, so check both host+path and path-only shapes.
    const host = parsed.hostname;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (host === 'r' && segments.length >= 1) {
      return segments[0].trim().toUpperCase() || null;
    }
    const rIndex = segments.indexOf('r');
    if (rIndex !== -1 && segments.length > rIndex + 1) {
      const code = segments[rIndex + 1].trim();
      return code ? code.toUpperCase() : null;
    }
    return null;
  } catch {
    return null;
  }
}
