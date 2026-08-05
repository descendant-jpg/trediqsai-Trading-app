import {
  pgTable,
  text,
  boolean,
  doublePrecision,
  integer,
  bigint,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Per-user, per-bot mutable configuration (toggle + allocation settings).
 * AutoPilot state is scoped to the caller's auth identity; unauthenticated
 * callers share the "anonymous" user id.
 */
export const autopilotBotsTable = pgTable(
  "autopilot_bots",
  {
    userId: text("user_id").notNull(),
    botId: text("bot_id").notNull(),
    running: boolean("running").notNull(),
    capital: doublePrecision("capital").notNull(),
    drawdown: doublePrecision("drawdown").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.botId] })],
);

export type AutopilotBotRow = typeof autopilotBotsTable.$inferSelect;

/** One row per user holding AutoPilot state (master toggle, P&L, logs). */
export const autopilotStateTable = pgTable("autopilot_state", {
  userId: text("user_id").primaryKey(),
  masterActive: boolean("master_active").notNull(),
  todayPnl: doublePrecision("today_pnl").notNull(),
  pnlDay: text("pnl_day").notNull(),
  logs: jsonb("logs")
    .$type<{ id: string; time: string; text: string }[]>()
    .notNull(),
  lastTickAt: bigint("last_tick_at", { mode: "number" }).notNull(),
  logSeq: integer("log_seq").notNull(),
  templateIndex: integer("template_index").notNull(),
});

export type AutopilotStateRow = typeof autopilotStateTable.$inferSelect;
