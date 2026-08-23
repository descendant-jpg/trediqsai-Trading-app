/** The sole profile role allowed to enter the mobile administration surface. */
export const GOD_ADMIN_ROLE = 'god_admin';

/** Normalize display input without broadening the accepted capability. */
export function normalizeProfileRole(role: unknown): string | null {
  return typeof role === 'string' ? role.trim().toLowerCase() || null : null;
}

/** Shared by tab visibility and protected-route redirects. */
export function canAccessMobileAdmin(role: unknown): boolean {
  return normalizeProfileRole(role) === GOD_ADMIN_ROLE;
}