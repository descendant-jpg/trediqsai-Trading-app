import type { Session } from '@supabase/supabase-js';

/** Anonymous Supabase sessions must never enter the payout/evaluation surface. */
export function canAccessPayoutEvaluation(session: Session | null): boolean {
  return Boolean(session?.user?.id) && session?.user?.is_anonymous !== true;
}