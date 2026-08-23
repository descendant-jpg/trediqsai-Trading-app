// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: vi.fn() }) }));

const { whalePackage, subscription } = vi.hoisted(() => {
  const whalePackage = {
    identifier: "whale_lifetime",
    packageType: "LIFETIME",
    product: { identifier: "tradiqs_whale_lifetime", title: "TradiQs Whale" },
  };
  return {
    whalePackage,
    subscription: {
  offerings: {
    all: {
      pro: {
        availablePackages: [
          {
            identifier: "pro_lifetime",
            packageType: "LIFETIME",
            product: { identifier: "tradiqs_pro_lifetime" },
          },
        ],
      },
      elite: {
        availablePackages: [
          {
            identifier: "elite_lifetime",
            packageType: "LIFETIME",
            product: { identifier: "tradiqs_elite_lifetime" },
          },
        ],
      },
      whale: { availablePackages: [whalePackage] },
    },
  } as any,
  hasActiveEntitlement: false,
  isPurchasing: false,
  purchase: vi.fn(async () => ({})),
  refreshProfileEntitlement: vi.fn(async () => undefined),
    },
  };
});
const openURL = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/revenuecat", () => ({ useSubscription: () => subscription }));
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native-web")>();
  return { ...actual, Linking: { openURL } };
});

import VipSignalsScreen from "../vip-signals";

beforeEach(() => {
  subscription.hasActiveEntitlement = false;
  subscription.purchase.mockClear();
  subscription.refreshProfileEntitlement.mockClear();
  openURL.mockClear();
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VIP Signals access", () => {
  it("purchases the selected configured lifetime package and refreshes access", async () => {
    render(<VipSignalsScreen />);

    fireEvent.click(screen.getByTestId("vip-purchase-whale"));

    await waitFor(() => expect(subscription.purchase).toHaveBeenCalledWith(whalePackage));
    expect(subscription.refreshProfileEntitlement).toHaveBeenCalled();
  });

  it("hides purchase controls until access is no longer active and exposes the channel action", () => {
    subscription.hasActiveEntitlement = true;
    render(<VipSignalsScreen />);

    expect(screen.getByTestId("vip-open-channel")).toBeTruthy();
    expect(screen.queryByTestId("vip-purchase-pro")).toBeNull();
    fireEvent.click(screen.getByTestId("vip-open-channel"));
    expect(openURL).toHaveBeenCalledWith("https://t.me/tradiqsai");
  });
});