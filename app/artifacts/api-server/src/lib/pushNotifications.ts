/**
 * Expo push dispatch for signal lifecycle events.
 *
 * Tokens live on `profiles.expo_push_token` (written by the app's
 * NotificationService at registration). Dispatch is best-effort: a failed
 * push must never fail signal creation or status updates. Every fetch is
 * bounded by the caller's cycle deadline plus a per-call timeout so push
 * fan-out can never make a publisher cycle outlive its lease.
 */
import { logger } from "./logger.js";
import { withDeadline } from "./httpTimeout.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export async function sendExpoPush(
  messages: PushMessage[],
  fetchImpl: typeof fetch = fetch,
  deadline?: AbortSignal,
): Promise<void> {
  const valid = messages.filter((message) => message.to.startsWith("ExponentPushToken"));
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chunk),
        signal: withDeadline(deadline, 10_000),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, "Expo push dispatch rejected");
      }
    } catch (err) {
      logger.warn({ err }, "Expo push dispatch failed");
    }
  }
}

/** All opted-in devices. Capped so one cycle can never fan out unbounded. */
export async function getSignalPushTokens(
  fetchImpl: typeof fetch = fetch,
  supabaseUrl: string = SUPABASE_URL,
  serviceKey: string = SERVICE_KEY,
  deadline?: AbortSignal,
): Promise<string[]> {
  if (!supabaseUrl || !serviceKey) return [];
  try {
    const query = new URLSearchParams({
      select: "expo_push_token",
      expo_push_token: "not.is.null",
      is_banned: "is.false",
      limit: "500",
    });
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/profiles?${query}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      signal: withDeadline(deadline, 10_000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { expo_push_token?: string | null }[];
    return rows
      .map((row) => row.expo_push_token ?? "")
      .filter((token) => token.startsWith("ExponentPushToken"));
  } catch {
    return [];
  }
}

export async function notifySignalEvent(
  title: string,
  body: string,
  data: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  deadline?: AbortSignal,
): Promise<void> {
  const tokens = await getSignalPushTokens(fetchImpl, SUPABASE_URL, SERVICE_KEY, deadline);
  if (!tokens.length) return;
  await sendExpoPush(
    tokens.map((to) => ({ to, title, body, data })),
    fetchImpl,
    deadline,
  );
}
