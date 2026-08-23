// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));

const customFetch = vi.hoisted(() => vi.fn());
vi.mock("@workspace/api-client-react", () => ({ customFetch }));

import LeaderboardScreen from "../leaderboard";

const traders = [
  { id: "trader-a", rank: 1, username: "Alpha", profit: 1835.5, winRate: 67.5 },
  { id: "trader-b", rank: 2, username: "Beta", profit: -48, winRate: 48 },
];

beforeEach(() => {
  customFetch.mockReset();
});

afterEach(() => cleanup());

describe("competition leaderboard", () => {
  it("shows a loading state while the live request is pending", () => {
    customFetch.mockReturnValue(new Promise(() => {}));
    render(<LeaderboardScreen />);

    expect(screen.getByTestId("competition-loading")).toBeTruthy();
    expect(screen.queryByTestId("competition-retry")).toBeNull();
    expect(customFetch).toHaveBeenCalledWith("/api/competition/leaderboard");
  });

  it("renders rank, username, profit, and win rate from the API", async () => {
    customFetch.mockResolvedValue(traders);
    render(<LeaderboardScreen />);

    await screen.findByText("Alpha");
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("+$1,835.5")).toBeTruthy();
    expect(screen.getByText("67.5% win rate")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("offers retry only after a real request failure", async () => {
    customFetch
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(traders);
    render(<LeaderboardScreen />);

    await screen.findByTestId("competition-error");
    fireEvent.click(screen.getByTestId("competition-retry"));

    await waitFor(() => expect(screen.getByText("Alpha")).toBeTruthy());
    expect(customFetch).toHaveBeenCalledTimes(2);
  });
});