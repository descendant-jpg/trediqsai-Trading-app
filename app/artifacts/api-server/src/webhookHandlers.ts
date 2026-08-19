import type Stripe from 'stripe';
import { getStripeSync } from './stripeClient.js';
import { grantEliteTier } from './lib/supabaseAdmin.js';
import { logger } from './lib/logger.js';
import { isElitePayment } from './lib/elitePlan.js';

export class WebhookHandlers {
  /**
   * Processes a raw Stripe webhook payload:
   *
   * 1. Delegates verification to `stripe-replit-sync` — the only code that
   *    knows the signing secret of the managed endpoint it created.  Using
   *    a credential from the connector settings would reference a different,
   *    unrelated secret and reject every genuine event.
   * 2. After verification succeeds, parses the already-trusted payload JSON
   *    to handle `payment_intent.succeeded` — the idempotent source of truth
   *    for granting Elite tier.  A user whose client fast-path is interrupted
   *    still receives the entitlement on the next Stripe retry.
   * 3. The StripeSync call also mirrors the event into the local `stripe`
   *    schema so products, customers, etc. remain queryable without extra API
   *    calls.
   */
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
          'Received type: ' +
          typeof payload +
          '. ' +
          'This usually means express.json() parsed the body before reaching this handler. ' +
          'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).',
      );
    }

    const sync = await getStripeSync();

    // Step 1 — verify the signature and sync into the stripe schema.
    // StripeSync uses the managed endpoint's signing secret (not the connector
    // credential), so this is the correct verifier for managed webhooks.
    await sync.processWebhook(payload, signature);

    // Step 2 — apply business logic on the now-verified payload.
    // Parsing the raw Buffer is safe here because the signature check above
    // already proved the payload originated from Stripe.
    let event: Stripe.Event;
    try {
      event = JSON.parse(payload.toString('utf8')) as Stripe.Event;
    } catch {
      // Malformed JSON after a successful signature check is extremely unlikely;
      // log and return so we don't reject a Stripe retry.
      logger.warn('Could not parse verified webhook payload as JSON');
      return;
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const userId = intent.metadata?.userId;
      const plan = intent.metadata?.plan;
      const correctProduct = isElitePayment(intent);

      if (userId && plan === 'elite' && correctProduct) {
        try {
          await grantEliteTier(
            userId,
            intent.id,
            new Date(intent.created * 1000),
          );
          logger.info(
            { userId, paymentIntentId: intent.id },
            'Elite tier granted via webhook',
          );
        } catch (err: unknown) {
          // Re-throw so the HTTP handler returns 4xx and Stripe retries.
          logger.error({ err, userId }, 'Failed to grant Elite tier from webhook');
          throw err;
        }
      } else if (userId && plan === 'elite') {
        logger.warn(
          {
            userId,
            paymentIntentId: intent.id,
            amount: intent.amount,
            currency: intent.currency,
          },
          'Ignored verified Stripe webhook with mismatched Elite product',
        );
      }
    }
  }
}
