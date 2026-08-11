import { Router, type IRouter } from 'express';
import { identity, requestUserId, ANONYMOUS_USER } from '../middlewares/identity.js';
import { getUncachableStripeClient, getStripeCredentials } from '../stripeClient.js';
import { grantEliteTier } from '../lib/supabaseAdmin.js';
import { logger } from '../lib/logger.js';

const router: IRouter = Router();

/** $49.00 in cents */
const ELITE_AMOUNT_CENTS = 4900;
const ELITE_CURRENCY = 'usd';

/**
 * GET /api/payment/config
 *
 * Returns the Stripe publishable key so the mobile app can initialise
 * StripeProvider without baking the key into the bundle.
 */
router.get('/payment/config', async (_req, res, next) => {
  try {
    const { publishableKey } = await getStripeCredentials();
    res.json({ publishableKey });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payment/intent
 *
 * Creates a Stripe PaymentIntent for the Elite plan and returns its
 * client_secret.  The mobile app uses the secret to confirm payment via
 * Apple Pay / Google Pay without ever touching the Stripe secret key.
 *
 * The Elite entitlement is granted idempotently by the `payment_intent.succeeded`
 * webhook — that is the durable source of truth.  This endpoint only creates the
 * intent; it never writes to the profiles table.
 *
 * Requires a valid auth token (Bearer header).
 */
router.post('/payment/intent', identity(), async (req, res, next) => {
  try {
    const userId = requestUserId(res);
    if (userId === ANONYMOUS_USER) {
      res.status(401).json({ error: 'Sign in required to start a payment.' });
      return;
    }

    const stripe = await getUncachableStripeClient();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: ELITE_AMOUNT_CENTS,
      currency: ELITE_CURRENCY,
      // Attach the user ID and plan so the webhook handler can grant the right
      // entitlement when the intent succeeds — even if the client never calls /confirm.
      metadata: { userId, plan: 'elite' },
    });

    if (!paymentIntent.client_secret) {
      throw new Error('Stripe did not return a client secret.');
    }

    logger.info({ userId }, 'Created Elite PaymentIntent');
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payment/confirm
 *
 * Fast-path supplement to the webhook: called by the app immediately after
 * `confirmPlatformPayPayment` resolves so the user sees Elite without waiting
 * for the webhook round-trip.
 *
 * Verifies the PaymentIntent status directly with Stripe (so a faked ID cannot
 * grant Elite), then calls `grantEliteTier` — the same idempotent write used
 * by the webhook handler.  Calling this endpoint more than once is safe.
 *
 * Body: { paymentIntentId: string }
 * Requires a valid auth token (Bearer header).
 */
router.post('/payment/confirm', identity(), async (req, res, next) => {
  try {
    const userId = requestUserId(res);
    if (userId === ANONYMOUS_USER) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }

    const body = req.body as { paymentIntentId?: unknown };
    const paymentIntentId = body.paymentIntentId;
    if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
      res.status(400).json({ error: 'paymentIntentId is required.' });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== 'succeeded') {
      res.status(402).json({
        error: `Payment not completed (status: ${intent.status}). Please try again.`,
      });
      return;
    }

    // Verify the intent was created for this user, for the Elite plan, and
    // for the correct amount/currency — preventing a user from submitting a
    // cheaper or unrelated PaymentIntent to unlock Elite.
    const ownerMatch = intent.metadata.userId === userId;
    const planMatch = intent.metadata.plan === 'elite';
    const amountMatch = intent.amount === ELITE_AMOUNT_CENTS && intent.currency === ELITE_CURRENCY;

    if (!ownerMatch) {
      logger.warn(
        { userId, intentUserId: intent.metadata.userId },
        'PaymentIntent user mismatch on /confirm',
      );
      res.status(403).json({ error: 'Payment intent does not belong to this account.' });
      return;
    }

    if (!planMatch || !amountMatch) {
      logger.warn(
        { userId, plan: intent.metadata.plan, amount: intent.amount, currency: intent.currency },
        'PaymentIntent plan/amount mismatch on /confirm',
      );
      res.status(400).json({ error: 'Payment intent does not match the Elite plan.' });
      return;
    }

    // Same idempotent write used by the webhook handler.
    await grantEliteTier(userId);

    logger.info({ userId, paymentIntentId }, 'Elite tier granted via /confirm (fast-path)');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
