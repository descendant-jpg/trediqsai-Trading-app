import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../stripeClient.js', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripeCredentials: vi.fn().mockResolvedValue({
    secretKey: 'sk_test_mock',
    publishableKey: 'pk_test_mock',
    webhookSecret: 'whsec_mock',
  }),
}));

vi.mock('../lib/supabaseAdmin.js', () => ({
  grantEliteTier: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock identity middleware: reads X-Test-User-Id header as the resolved user.
vi.mock('../middlewares/identity.js', () => ({
  ANONYMOUS_USER: 'anonymous',
  identity: () => (req: any, res: any, next: any) => {
    const id = req.headers['x-test-user-id'] as string | undefined;
    res.locals['userId'] = id ?? 'anonymous';
    next();
  },
  requestUserId: (res: any) => res.locals['userId'] ?? 'anonymous',
}));

import paymentRouter from './payment.js';
import { getUncachableStripeClient } from '../stripeClient.js';
import { grantEliteTier } from '../lib/supabaseAdmin.js';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(paymentRouter);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /payment/config
// ---------------------------------------------------------------------------

describe('GET /payment/config', () => {
  it('returns the publishable key', async () => {
    const app = makeApp();
    const res = await request(app).get('/payment/config');
    expect(res.status).toBe(200);
    expect(res.body.publishableKey).toBe('pk_test_mock');
  });
});

// ---------------------------------------------------------------------------
// POST /payment/intent
// ---------------------------------------------------------------------------

describe('POST /payment/intent', () => {
  it('returns 401 when not authenticated', async () => {
    const app = makeApp();
    const res = await request(app).post('/payment/intent');
    expect(res.status).toBe(401);
  });

  it('creates a PaymentIntent and returns the client secret', async () => {
    const mockStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({
          client_secret: 'pi_test_secret_123',
          metadata: { userId: 'user-1', plan: 'elite' },
        }),
      },
    };
    (getUncachableStripeClient as any).mockResolvedValue(mockStripe);

    const app = makeApp();
    const res = await request(app)
      .post('/payment/intent')
      .set('x-test-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe('pi_test_secret_123');
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ userId: 'user-1', plan: 'elite' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /payment/confirm
// ---------------------------------------------------------------------------

describe('POST /payment/confirm', () => {
  it('returns 401 when not authenticated', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/payment/confirm')
      .send({ paymentIntentId: 'pi_test' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a missing or non-pi_ paymentIntentId', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/payment/confirm')
      .set('x-test-user-id', 'user-1')
      .send({ paymentIntentId: 'not_a_pi' });
    expect(res.status).toBe(400);
  });

  it('returns 402 when the PaymentIntent has not succeeded', async () => {
    const mockStripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          status: 'requires_payment_method',
          metadata: { userId: 'user-1', plan: 'elite' },
        }),
      },
    };
    (getUncachableStripeClient as any).mockResolvedValue(mockStripe);

    const app = makeApp();
    const res = await request(app)
      .post('/payment/confirm')
      .set('x-test-user-id', 'user-1')
      .send({ paymentIntentId: 'pi_test123' });

    expect(res.status).toBe(402);
  });

  it('returns 403 when the PaymentIntent belongs to a different user', async () => {
    const mockStripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          status: 'succeeded',
          metadata: { userId: 'other-user', plan: 'elite' },
        }),
      },
    };
    (getUncachableStripeClient as any).mockResolvedValue(mockStripe);

    const app = makeApp();
    const res = await request(app)
      .post('/payment/confirm')
      .set('x-test-user-id', 'user-1')
      .send({ paymentIntentId: 'pi_test123' });

    expect(res.status).toBe(403);
    expect(grantEliteTier).not.toHaveBeenCalled();
  });

  it('grants Elite and returns success when payment succeeded and user matches', async () => {
    const mockStripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'pi_test123',
          created: 1_700_000_000,
          status: 'succeeded',
          amount: 4900,
          currency: 'usd',
          metadata: { userId: 'user-1', plan: 'elite' },
        }),
      },
    };
    (getUncachableStripeClient as any).mockResolvedValue(mockStripe);

    const app = makeApp();
    const res = await request(app)
      .post('/payment/confirm')
      .set('x-test-user-id', 'user-1')
      .send({ paymentIntentId: 'pi_test123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(grantEliteTier).toHaveBeenCalledWith(
      'user-1',
      'pi_test123',
      new Date('2023-11-14T22:13:20.000Z'),
    );
  });

  it('does not grant Elite when grantEliteTier throws (Supabase failure)', async () => {
    const mockStripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'pi_test123',
          created: 1_700_000_000,
          status: 'succeeded',
          amount: 4900,
          currency: 'usd',
          metadata: { userId: 'user-1', plan: 'elite' },
        }),
      },
    };
    (getUncachableStripeClient as any).mockResolvedValue(mockStripe);
    (grantEliteTier as any).mockRejectedValue(new Error('Supabase unavailable'));

    const app = makeApp();
    const res = await request(app)
      .post('/payment/confirm')
      .set('x-test-user-id', 'user-1')
      .send({ paymentIntentId: 'pi_test123' });

    // Express error handler returns 500 on unhandled errors.
    expect(res.status).toBe(500);
  });
});
