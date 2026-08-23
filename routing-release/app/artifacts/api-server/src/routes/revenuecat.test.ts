import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRevenueCatRouter, revenueCatTierForEvent } from './revenuecat.js';

const USER_ID = '9f7f9cb3-34c7-4c14-9d8a-4a1311d0f2be';
const TRANSFERRED_TO_USER_ID = '1c2d3e4f-5678-4abc-9123-456789abcdef';
const EVENT_AT = 1_700_000_000_000;

function appWith(secret = 'sandbox-secret') {
  const applyTier = vi.fn().mockResolvedValue(true);
  const app = express();
  app.use(express.json());
  app.use(createRevenueCatRouter({ webhookSecret: secret, applyTier }));
  return { app, applyTier };
}

describe('RevenueCat webhook tier resolution', () => {
  it('maps verified Pro and Elite purchases to the correct billing tier', () => {
    expect(revenueCatTierForEvent({ type: 'INITIAL_PURCHASE', entitlement_ids: ['pro'] })).toBe('pro');
    expect(revenueCatTierForEvent({ type: 'RENEWAL', product_id: 'tradiqs_elite_annual' })).toBe('elite');
  });

  it('only revokes access after an expiration event', () => {
    expect(revenueCatTierForEvent({ type: 'CANCELLATION', entitlement_ids: ['pro'] })).toBeNull();
    expect(revenueCatTierForEvent({ type: 'EXPIRATION', entitlement_ids: ['pro'] })).toBe('starter');
  });
});

describe('POST /revenuecat/webhook', () => {
  it('rejects missing or invalid webhook credentials', async () => {
    const { app, applyTier } = appWith();
    const res = await request(app)
      .post('/revenuecat/webhook')
      .send({ event: { type: 'INITIAL_PURCHASE', app_user_id: USER_ID, entitlement_ids: ['pro'] } });
    expect(res.status).toBe(401);
    expect(applyTier).not.toHaveBeenCalled();
  });

  it('rejects an event not bound to a Supabase user id', async () => {
    const { app, applyTier } = appWith();
    const res = await request(app)
      .post('/revenuecat/webhook')
      .set('Authorization', 'Bearer sandbox-secret')
      .send({ event: { type: 'INITIAL_PURCHASE', app_user_id: 'anonymous', entitlement_ids: ['pro'] } });
    expect(res.status).toBe(400);
    expect(applyTier).not.toHaveBeenCalled();
  });

  it('persists a verified entitlement without trusting client input', async () => {
    const { app, applyTier } = appWith();
    const res = await request(app)
      .post('/revenuecat/webhook')
      .set('Authorization', 'Bearer sandbox-secret')
      .send({ event: { type: 'INITIAL_PURCHASE', app_user_id: USER_ID, entitlement_ids: ['pro'], event_timestamp_ms: EVENT_AT } });
    expect(res.status).toBe(200);
    expect(applyTier).toHaveBeenCalledWith(USER_ID, 'pro', new Date(EVENT_AT));
  });

  it('records only the RevenueCat entitlement when it expires', async () => {
    const { app, applyTier } = appWith();
    const res = await request(app)
      .post('/revenuecat/webhook')
      .set('Authorization', 'Bearer sandbox-secret')
      .send({ event: { type: 'EXPIRATION', app_user_id: USER_ID, entitlement_ids: ['pro'], event_timestamp_ms: EVENT_AT } });
    expect(res.status).toBe(200);
    expect(applyTier).toHaveBeenCalledWith(USER_ID, 'starter', new Date(EVENT_AT));
  });

  it('acknowledges unknown events without changing the tier', async () => {
    const { app, applyTier } = appWith();
    const res = await request(app)
      .post('/revenuecat/webhook')
      .set('Authorization', 'Bearer sandbox-secret')
      .send({ event: { type: 'BILLING_ISSUE', app_user_id: USER_ID, entitlement_ids: ['pro'] } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ignored: true });
    expect(applyTier).not.toHaveBeenCalled();
  });

  it('rejects an active entitlement without a provider timestamp', async () => {
    const { app, applyTier } = appWith();
    const res = await request(app)
      .post('/revenuecat/webhook')
      .set('Authorization', 'Bearer sandbox-secret')
      .send({ event: { type: 'INITIAL_PURCHASE', app_user_id: USER_ID, entitlement_ids: ['pro'] } });
    expect(res.status).toBe(400);
    expect(applyTier).not.toHaveBeenCalled();
  });

  it('does not restore access when a delayed purchase follows an expiration', async () => {
    let newestEventAt = 0;
    let tier = 'starter';
    const applyTier = vi.fn(async (_userId: string, nextTier: string, eventAt: Date) => {
      if (eventAt.getTime() <= newestEventAt) return false;
      newestEventAt = eventAt.getTime();
      tier = nextTier;
      return true;
    });
    const app = express();
    app.use(express.json());
    app.use(createRevenueCatRouter({ webhookSecret: 'sandbox-secret', applyTier }));

    await request(app).post('/revenuecat/webhook').set('Authorization', 'Bearer sandbox-secret')
      .send({ event: { type: 'EXPIRATION', app_user_id: USER_ID, entitlement_ids: ['pro'], event_timestamp_ms: 200 } });
    const delayedPurchase = await request(app).post('/revenuecat/webhook').set('Authorization', 'Bearer sandbox-secret')
      .send({ event: { type: 'INITIAL_PURCHASE', app_user_id: USER_ID, entitlement_ids: ['pro'], event_timestamp_ms: 100 } });

    expect(delayedPurchase.body).toEqual({ synced: false, ignored: true });
    expect(tier).toBe('starter');
  });

  it('revokes the transferred-from account and grants the transferred-to account', async () => {
    const applyTier = vi.fn().mockResolvedValue(true);
    const app = express();
    app.use(express.json());
    app.use(createRevenueCatRouter({ webhookSecret: 'sandbox-secret', applyTier }));

    const res = await request(app).post('/revenuecat/webhook').set('Authorization', 'Bearer sandbox-secret')
      .send({
        event: {
          type: 'TRANSFER',
          transferred_from: [USER_ID],
          transferred_to: [TRANSFERRED_TO_USER_ID],
          entitlement_ids: ['pro'],
          event_timestamp_ms: EVENT_AT,
        },
      });

    expect(res.status).toBe(200);
    expect(applyTier).toHaveBeenCalledWith(USER_ID, 'starter', new Date(EVENT_AT));
    expect(applyTier).toHaveBeenCalledWith(TRANSFERRED_TO_USER_ID, 'pro', new Date(EVENT_AT));
  });

  it('accepts an anonymous RevenueCat source and grants the authenticated destination', async () => {
    const applyTier = vi.fn().mockResolvedValue(true);
    const app = express();
    app.use(express.json());
    app.use(createRevenueCatRouter({ webhookSecret: 'sandbox-secret', applyTier }));

    const res = await request(app).post('/revenuecat/webhook').set('Authorization', 'Bearer sandbox-secret')
      .send({
        event: {
          type: 'TRANSFER',
          transferred_from: ['$RCAnonymousID:abc123'],
          transferred_to: [TRANSFERRED_TO_USER_ID],
          entitlement_ids: ['pro'],
          event_timestamp_ms: EVENT_AT,
        },
      });

    expect(res.status).toBe(200);
    expect(applyTier).toHaveBeenCalledTimes(1);
    expect(applyTier).toHaveBeenCalledWith(TRANSFERRED_TO_USER_ID, 'pro', new Date(EVENT_AT));
  });

  it('does not restore the old owner when a delayed renewal follows a transfer', async () => {
    const accountState = new Map<string, { tier: string; at: number }>([
      [USER_ID, { tier: 'pro', at: 0 }],
      [TRANSFERRED_TO_USER_ID, { tier: 'starter', at: 0 }],
    ]);
    const applyTier = vi.fn(async (userId: string, nextTier: string, eventAt: Date) => {
      const current = accountState.get(userId)!;
      if (eventAt.getTime() <= current.at) return false;
      accountState.set(userId, { tier: nextTier, at: eventAt.getTime() });
      return true;
    });
    const app = express();
    app.use(express.json());
    app.use(createRevenueCatRouter({ webhookSecret: 'sandbox-secret', applyTier }));

    await request(app).post('/revenuecat/webhook').set('Authorization', 'Bearer sandbox-secret')
      .send({
        event: {
          type: 'TRANSFER',
          transferred_from: [USER_ID],
          transferred_to: [TRANSFERRED_TO_USER_ID],
          entitlement_ids: ['pro'],
          event_timestamp_ms: 300,
        },
      });
    const delayedRenewal = await request(app).post('/revenuecat/webhook').set('Authorization', 'Bearer sandbox-secret')
      .send({
        event: {
          type: 'RENEWAL',
          app_user_id: USER_ID,
          entitlement_ids: ['pro'],
          event_timestamp_ms: 200,
        },
      });

    expect(delayedRenewal.body).toEqual({ synced: false, ignored: true });
    expect(accountState.get(USER_ID)?.tier).toBe('starter');
    expect(accountState.get(TRANSFERRED_TO_USER_ID)?.tier).toBe('pro');
  });
});