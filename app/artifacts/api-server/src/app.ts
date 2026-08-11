import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { WebhookHandlers } from "./webhookHandlers.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

// Behind the Replit proxy: trust X-Forwarded-For so req.ip reflects the
// real client IP (used by rate limiting).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Register the Stripe webhook route BEFORE express.json() so the body
// arrives as a raw Buffer (required for Stripe signature verification).
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;

    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Webhook error";
      logger.error({ err }, "Stripe webhook processing failed");
      res.status(400).json({ error: message });
    }
  },
);

// JSON / form parsing for all other routes (comes after the webhook route).
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
