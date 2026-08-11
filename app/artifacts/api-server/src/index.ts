import app from "./app.js";
import { logger } from "./lib/logger.js";
import { getStripeSync, getStripeCredentials } from "./stripeClient.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Initialise Stripe: run schema migrations and register a managed webhook so
 * Stripe events are mirrored to the local `stripe` schema in Postgres.
 * Non-fatal: if the DATABASE_URL is absent or the integration is not yet
 * connected, the server still starts and the PaymentIntent / confirm
 * endpoints remain usable.
 */
async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn(
      "DATABASE_URL is not set — Stripe schema sync is disabled. " +
        "PaymentIntent and confirm endpoints will still work.",
    );
    return;
  }

  try {
    // Verify the integration is connected before attempting migrations.
    await getStripeCredentials();

    const { runMigrations } = await import("stripe-replit-sync");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
    );
    logger.info("Stripe webhook configured");

    // Run backfill in the background — don't block server startup.
    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err: unknown) => logger.error({ err }, "Stripe backfill failed"));
  } catch (err: unknown) {
    logger.warn(
      { err },
      "Stripe initialisation skipped — integration may not be connected yet",
    );
  }
}

await initStripe();

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
