import { afterEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import leaderboardRouter, {
  fetchAllCompetitionRows,
  rankCompetitionProfiles,
} from "./leaderboard";

let server: Server | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
});

describe("competition leaderboard", () => {
  it("ranks only persisted profile performance in response order", () => {
    expect(
      rankCompetitionProfiles([
        {
          id: "trader-a",
          username: "alpha",
        },
        {
          id: "trader-b",
          username: null,
        },
      ],
      [
        { user_id: "trader-a", pnl: "4200.25", price_source: "SERVER" },
        { user_id: "trader-a", pnl: -100, price_source: "SERVER" },
        { user_id: "trader-b", pnl: -80, price_source: "SERVER" },
        {
          user_id: "trader-b",
          pnl: 999999,
          price_source: "CLIENT",
        },
      ],
    )).toEqual([
      {
        id: "trader-a",
        rank: 1,
        username: "alpha",
        profit: 4100.25,
        winRate: 50,
      },
      {
        id: "trader-b",
        rank: 2,
        username: null,
        profit: -80,
        winRate: 0,
      },
    ]);
  });

  it("reads every page and keeps a deterministic order for tied profit", async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => ({
      id: `trader-${String(index).padStart(4, "0")}`,
      username: `trader-${index}`,
    }));
    const requestedPages: Array<[number, number]> = [];

    const fetchedRows = await fetchAllCompetitionRows(async (from, to) => {
      requestedPages.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });

    expect(requestedPages).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(
      rankCompetitionProfiles(fetchedRows, [
        { user_id: "trader-1000", pnl: 20, price_source: "SERVER" },
        { user_id: "trader-0001", pnl: 20, price_source: "SERVER" },
      ]),
    ).toMatchObject([
      { id: "trader-0001", rank: 1, profit: 20 },
      { id: "trader-1000", rank: 2, profit: 20 },
    ]);
  });

  it("returns an explicit unavailable error instead of fixture traders", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const app: Express = express();
    app.use(leaderboardRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const runningServer = server!;
    const { address, port } = runningServer.address() as AddressInfo;
    const response = await fetch(
      `http://${address}:${port}/competition/leaderboard`,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Competition leaderboard is temporarily unavailable.",
    });
  });
});