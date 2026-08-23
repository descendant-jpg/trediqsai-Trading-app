import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { applyRevenueCatTier, type BillingTier } from '../lib/supabaseAdmin';

const ACTIVE_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);
const EXPIRING_EVENT_TYPES = new Set(['EXPIRATION']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  entitlement_ids?: string[];
  product_id?: string;
  event_timestamp_ms?: number;
  transferred_from?: string[];
  transferred_to?: string[];
};

function safelyMatchesSecret(value: string | undefined, secret: string): boolean {
  if (!value) return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function revenueCatTierForEvent(event: RevenueCatEvent): BillingTier | null {
  const type = event.type?.toUpperCase();
  if (type && EXPIRING_EVENT_TYPES.has(type)) return 'starter';
  if (!type || (!ACTIVE_EVENT_TYPES.has(type) && type !== 'TRANSFER')) return null;

  return tierFromEntitlementData(event);
}

function tierFromEntitlementData(event: RevenueCatEvent): BillingTier | null {
  const ids = [...(event.entitlement_ids ?? []), event.product_id ?? '']
    .join(' ')
    .toLowerCase();
  if (/(elite|institutional|quant)/.test(ids)) return 'elite';
  if (/\bpro\b/.test(ids)) return 'pro';
  return null;
}

function isSupabaseUserId(userId: string): boolean {
  return UUID.test(userId);
}

export function createRevenueCatRouter({
  webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET ?? '',
  applyTier = applyRevenueCatTier,
}: {
  webhookSecret?: string;
  applyTier?: (userId: string, tier: BillingTier, eventAt: Date) => Promise<boolean>;
} = {}) {
  const router = Router();
  router.post('/revenuecat/webhook', async (req: Request, res: Response) => {
    if (!webhookSecret) {
      res.status(503).json({ error: 'RevenueCat webhook is not configured' });
      return;
    }
    if (!safelyMatchesSecret(req.header('authorization'), webhookSecret)) {
      res.status(401).json({ error: 'Unauthorized RevenueCat webhook' });
      return;
    }

    const event = (req.body as { event?: RevenueCatEvent } | undefined)?.event;
    if (!event) {
      res.status(400).json({ error: 'Invalid RevenueCat event' });
      return;
    }
    const type = event.type?.toUpperCase();
    const tier = type === 'TRANSFER' ? null : revenueCatTierForEvent(event);
    if (type !== 'TRANSFER' && !tier) {
      res.status(200).json({ ignored: true });
      return;
    }
    const eventAt = new Date(Number(event.event_timestamp_ms));
    if (!Number.isFinite(Number(event.event_timestamp_ms)) || Number.isNaN(eventAt.getTime())) {
      res.status(400).json({ error: 'Invalid RevenueCat event timestamp' });
      return;
    }

    try {
      if (type === 'TRANSFER') {
        const transferredFrom = event.transferred_from ?? [];
        const transferredTo = event.transferred_to ?? [];
        const destinationTier = tierFromEntitlementData(event);
        const supabaseSources = transferredFrom.filter(isSupabaseUserId);
        const supabaseDestinations = transferredTo.filter(isSupabaseUserId);
        if (
          supabaseDestinations.length === 0 ||
          !destinationTier
        ) {
          res.status(400).json({ error: 'Invalid RevenueCat transfer event' });
          return;
        }
        const changes = await Promise.all([
          ...supabaseSources.map((userId) => applyTier(userId, 'starter', eventAt)),
          ...supabaseDestinations.map((userId) => applyTier(userId, destinationTier, eventAt)),
        ]);
        res.status(200).json({ synced: changes.some(Boolean), ignored: !changes.some(Boolean) });
        return;
      }

      // Defensive narrowing: transfer events returned above; standard events
      // were already filtered before timestamp parsing.
      if (!tier) {
        res.status(200).json({ ignored: true });
        return;
      }
      if (!event.app_user_id || !isSupabaseUserId(event.app_user_id)) {
        res.status(400).json({ error: 'Invalid RevenueCat event user' });
        return;
      }
      const applied = await applyTier(event.app_user_id, tier, eventAt);
      res.status(200).json({ synced: applied, ignored: !applied });
    } catch (error) {
      res.status(500).json({ error: 'Could not synchronize subscription tier' });
    }
  });
  return router;
}

export default createRevenueCatRouter();