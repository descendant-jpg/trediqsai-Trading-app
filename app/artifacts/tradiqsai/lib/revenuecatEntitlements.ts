export type RevenueCatEntitlement = {
  expirationDate?: string | number | null;
  periodType?: string | null;
  productIdentifier?: string | null;
  willRenew?: boolean | null;
};

function expirationTimestamp(value: RevenueCatEntitlement["expirationDate"]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * RevenueCat normally excludes expired grants from `entitlements.active`, but
 * channel access uses this explicit defense as well. A cancelled recurring
 * purchase loses channel access immediately; a configured lifetime purchase
 * remains valid even though it does not renew.
 */
export function isActiveRevenueCatEntitlement(
  entitlement: RevenueCatEntitlement | unknown,
  now = Date.now(),
): boolean {
  if (!entitlement || typeof entitlement !== "object") return false;

  const value = entitlement as RevenueCatEntitlement;
  const expiry = expirationTimestamp(value.expirationDate);
  if (expiry !== null && expiry <= now) return false;

  if (value.periodType?.toUpperCase() === "LIFETIME") return true;

  return value.willRenew !== false;
}