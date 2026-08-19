import { beforeEach, describe, expect, it, vi } from 'vitest';

const { processWebhook, grantEliteTier } = vi.hoisted(() => ({
  processWebhook: vi.fn(),
  grantEliteTier: vi.fn(),
}));

vi.mock('./stripeClient.js', () => ({
  getStripeSync: vi.fn(async () => ({ processWebhook })),
}));

vi.mock('./lib/supabaseAdmin.js', () => ({
  grantEliteTier,
}));

vi.mock('./lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { WebhookHandlers } from './webhookHandlers.js';

function payload(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    id: 'evt_verified',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_verified',
        created: 1_700_000_000,
        amount: 4900,
        currency: 'usd',
        metadata: { userId: 'user-123', plan: 'elite' },
        ...overrides,
      },
    },
  }));
}

describe('Stripe webhook fulfillment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processWebhook.mockResolvedValue(undefined);
    grantEliteTier.mockResolvedValue(true);
  });

  it('never fulfills when managed signature verification fails', async () => {
    processWebhook.mockRejectedValue(new Error('invalid signature'));

    await expect(
      WebhookHandlers.processWebhook(payload(), 'bad-signature'),
    ).rejects.toThrow('invalid signature');

    expect(grantEliteTier).not.toHaveBeenCalled();
  });

  it('fulfills a verified, correctly priced PaymentIntent through the RPC', async () => {
    await WebhookHandlers.processWebhook(payload(), 'valid-signature');

    expect(processWebhook).toHaveBeenCalled();
    expect(grantEliteTier).toHaveBeenCalledWith(
      'user-123',
      'pi_verified',
      new Date('2023-11-14T22:13:20.000Z'),
    );
  });

  it('ignores a verified PaymentIntent with the wrong amount', async () => {
    await WebhookHandlers.processWebhook(payload({ amount: 100 }), 'valid-signature');

    expect(grantEliteTier).not.toHaveBeenCalled();
  });
});