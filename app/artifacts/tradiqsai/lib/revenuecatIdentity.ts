/** Stable identity segment used to keep RevenueCat query caches account-scoped. */
export function revenueCatIdentityKey(userId: string | null): string {
  return userId ?? 'anonymous';
}

/**
 * A CustomerInfo value is safe to use only after Purchases has been associated
 * with the same Supabase user represented by the current render.
 */
export function isRevenueCatIdentityReady(
  associatedUserId: string | null | undefined,
  currentUserId: string | null,
): boolean {
  return associatedUserId === currentUserId;
}