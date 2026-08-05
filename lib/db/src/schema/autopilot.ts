import {
  pgTable,
  text,
  boolean,
  doublePrecision,
  integer,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core";

/** Per-bot mutable configuration (toggle + allocation settings). */
export const autopilotBotsTable = pgTable("autopilot_bots", {
  id: text("id").primaryKey(),
  running: boolean("running").notNull(),
  capital: doublePrecision("capital").notNull(),
  drawdown: doublePrecision("drawdown").notNull(),
});

export type AutopilotBotRow = typeof autopilotBotsTable.$inferSelect;

/** Singleton row holding global AutoPilot state (master toggle, P&L, logs). */
export const autopilotStateTable = pgTable("autopilot_state", {
  id: integer("id").primaryKey(),
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
