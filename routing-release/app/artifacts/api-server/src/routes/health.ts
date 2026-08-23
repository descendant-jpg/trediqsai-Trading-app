import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Safe-to-expose dependency probe for the mobile app. It discloses only the
 * migration names a developer needs to apply — never database credentials,
 * table rows, or Supabase error internals. Probes run with service-role
 * credentials because correctly configured RLS must hide these objects from
 * the public app key.
 */
router.get("/health/autopilot", async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({
      ready: false,
      missing: ["Supabase service-role API configuration"],
    });
    return;
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const checks = [
    {
      name: "007_autopilot_profiles.sql",
      path: "/rest/v1/profiles?select=active_bot,allocated_capital&limit=1",
    },
    {
      name: "011_set_active_bot.sql",
      path: "/rest/v1/autopilot_strategies?select=name&limit=1",
    },
    {
      name: "013_strategy_brief_cache.sql",
      path: "/rest/v1/autopilot_strategy_brief_cache?select=id&limit=1",
    },
  ];
  try {
    const results = await Promise.all(
      checks.map(async (check) => ({
        name: check.name,
        ok: (await fetch(`${SUPABASE_URL}${check.path}`, { headers })).ok,
      })),
    );
    const missing = results.filter((result) => !result.ok).map((result) => result.name);
    if (!missing.includes("013_strategy_brief_cache.sql")) {
      const rpc = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/autopilot_dependencies_ready`,
        { method: "POST", headers },
      );
      if (!rpc.ok) {
        missing.push("011_set_active_bot.sql");
      } else {
        const dependencies = (await rpc.json()) as {
          set_active_bot?: boolean;
          autopilot_strategies?: boolean;
          profile_bot_columns?: boolean;
        };
        if (
          !dependencies.set_active_bot ||
          !dependencies.autopilot_strategies ||
          !dependencies.profile_bot_columns
        ) {
          missing.push("011_set_active_bot.sql");
        }
      }
    }
    res.status(missing.length ? 503 : 200).json({
      ready: missing.length === 0,
      missing,
    });
  } catch (err) {
    logger.warn({ err }, "AutoPilot dependency health check failed");
    res.status(503).json({
      ready: false,
      missing: ["Unable to check Supabase AutoPilot dependencies"],
    });
  }
});

export default router;
