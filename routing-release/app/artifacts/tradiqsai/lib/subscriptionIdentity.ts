export type IdentityScoped<T> = {
  userId: string | null;
  value: T;
};

export function isCurrentSubscriptionIdentity(
  capturedUserId: string | null,
  currentUserId: string | null,
): boolean {
  return capturedUserId === currentUserId;
}

export function readCurrentSubscriptionValue<T>(
  scoped: IdentityScoped<T> | null,
  currentUserId: string | null,
): T | null {
  return scoped?.userId === currentUserId ? scoped.value : null;
}