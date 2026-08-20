// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profileResponses = vi.hoisted(() => [] as Promise<any>[]);
const referralResponses = vi.hoisted(() => [] as Promise<any>[]);
const refreshProfileEntitlement = vi.hoisted(() => vi.fn(async () => undefined));
const refreshPayoutEvaluation = vi.hoisted(() => vi.fn(async () => undefined));
const startAccountCreation = vi.hoisted(() => vi.fn(async () => undefined));
const invalidateQueries = vi.hoisted(() => vi.fn(async () => undefined));
const authState = vi.hoisted(() => ({
  session: {
    user: {
      id: "profile-user",
      email: "trader@example.com",
        is_anonymous: false,
    },
    } as { user: { id: string; email: string; is_anonymous?: boolean } } | null,
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native-web")>();
  const MockScrollView = ({
    children,
    refreshControl,
  }: {
    children?: React.ReactNode;
    refreshControl?: React.ReactNode;
  }) => (
    <div>
      {refreshControl}
      {children}
    </div>
  );
  const MockRefreshControl = ({
    onRefresh,
    refreshing,
    testID,
  }: {
    onRefresh: () => void;
    refreshing: boolean;
    testID?: string;
  }) => (
    <button
      data-testid={testID}
      data-refreshing={String(refreshing)}
      onClick={onRefresh}
    />
  );
  return {
    ...actual,
    ScrollView: MockScrollView,
    RefreshControl: MockRefreshControl,
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("@workspace/api-client-react", () => ({
  getGetAutopilotHistoryQueryKey: () => ["/api/autopilot/history"],
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    session: authState.session,
    signOut: vi.fn(),
    startAccountCreation,
  }),
}));
vi.mock("@/context/TradingContext", () => ({
  useTrading: () => ({
    tradingDayTz: "UTC",
    setTradingDayTz: vi.fn(),
  }),
}));
vi.mock("@/lib/revenuecat", () => ({
  useSubscription: () => ({
    isSubscribed: false,
    isAdmin: false,
    refreshProfileEntitlement,
  }),
}));
vi.mock("@/hooks/usePayoutEvaluation", () => ({
  usePayoutEvaluation: () => ({
    evaluation: null,
    loading: false,
    error: null,
    history: [],
    historyLoading: false,
    historyError: null,
    refresh: refreshPayoutEvaluation,
    requestPayout: vi.fn(),
  }),
}));
vi.mock("@/lib/payoutEvaluation", () => ({
  DAILY_DRAWDOWN_LIMIT: 0.05,
  DEMO_STARTING_BALANCE: 100000,
  MINIMUM_ACTIVE_DAYS: 5,
  TOTAL_EQUITY_FLOOR: 90000,
  formatMoney: (value: number) => `$${value}`,
}));
vi.mock("@/lib/legalContent", () => ({
  PRIVACY_POLICY: "",
  TERMS_AND_CONDITIONS: "",
}));
vi.mock("@/lib/biometricSecurity", () => ({
  authenticateBiometrics: vi.fn(),
  biometricCapability: vi.fn(async () => false),
  getBiometricsEnabled: vi.fn(async () => false),
  setBiometricsEnabled: vi.fn(),
  unsupportedBiometricsMessage: "Unavailable",
}));

vi.mock("@/components/TimezonePickerModal", () => ({
  default: () => null,
}));
vi.mock("@/components/AcademyModal", () => ({
  AcademyModal: () => null,
}));
vi.mock("@/components/SocialMediaModal", () => ({
  SocialMediaModal: () => null,
}));
vi.mock("@/components/ChangePasswordModal", () => ({
  ChangePasswordModal: () => null,
}));
vi.mock("@/components/DeleteAccountModal", () => ({
  DeleteAccountModal: () => null,
}));
vi.mock("@/components/TwoFactorAuthModal", () => ({
  TwoFactorAuthModal: () => null,
}));

const supabase = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "profiles") {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          profileResponses.shift() ??
          Promise.resolve({ data: null, error: null }),
      };
      return builder;
    }
    const builder: any = {
      select: () => builder,
      eq: () =>
        referralResponses.shift() ??
        Promise.resolve({ data: [], count: 0, error: null }),
    };
    return builder;
  }),
  auth: {
    mfa: {
      listFactors: vi.fn(async () => ({ data: { totp: [] } })),
    },
    updateUser: vi.fn(async () => ({ error: null })),
  },
  rpc: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/utils/supabase", () => ({ supabase }));

import ProfileScreen from "../profile";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  authState.session = {
    user: {
      id: "profile-user",
      email: "trader@example.com",
      is_anonymous: false,
    },
  };
  profileResponses.splice(0);
  referralResponses.splice(0);
  supabase.from.mockClear();
  refreshProfileEntitlement.mockClear();
  refreshPayoutEvaluation.mockClear();
  invalidateQueries.mockClear();
});

afterEach(() => cleanup());

describe("profile identity refresh", () => {
  it("locks guests out of evaluation and payout history", async () => {
    authState.session = {
      user: { id: "guest-user", email: "", is_anonymous: true },
    };
    profileResponses.push(Promise.resolve({ data: null, error: null }));
    referralResponses.push(Promise.resolve({ data: [], count: 0, error: null }));

    render(<ProfileScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("profile-guest-evaluation-locked")).toBeTruthy(),
    );
    expect(screen.getByText("Guest Trader")).toBeTruthy();
    expect(screen.queryByTestId("profile-payout-history")).toBeNull();
    expect(screen.queryByTestId("profile-evaluation-unavailable")).toBeNull();
  });

  it("shows a skeleton, then renders god_admin even when referrals fail", async () => {
    const identity = deferred<any>();
    profileResponses.push(identity.promise);
    referralResponses.push(
      Promise.resolve({ data: null, count: null, error: new Error("offline") }),
    );

    render(<ProfileScreen />);
    expect(screen.getByTestId("profile-loading-skeleton")).toBeTruthy();

    await act(async () => {
      identity.resolve({
        data: {
          username: "root",
          referral_code: "ROOT500",
          role: " GOD_ADMIN ",
        },
        error: null,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("profile-admin-command-center")).toBeTruthy(),
    );
    expect(screen.queryByTestId("profile-loading-skeleton")).toBeNull();
  });

  it("keeps the newer role when an older identity request fails late", async () => {
    const initialIdentity = deferred<any>();
    const refreshedIdentity = deferred<any>();
    const refreshedReferrals = deferred<any>();
    profileResponses.push(initialIdentity.promise, refreshedIdentity.promise);
    referralResponses.push(
      Promise.resolve({ data: [], count: 0, error: null }),
      refreshedReferrals.promise,
    );

    render(<ProfileScreen />);
    fireEvent.click(screen.getByTestId("profile-refresh-control"));
    expect(
      screen.getByTestId("profile-refresh-control").getAttribute("data-refreshing"),
    ).toBe("true");

    await act(async () => {
      refreshedIdentity.resolve({
        data: {
          username: "root",
          referral_code: "ROOT500",
          role: "god_admin",
        },
        error: null,
      });
      refreshedReferrals.resolve({ data: [], count: 0, error: null });
    });
    await waitFor(() =>
      expect(screen.getByTestId("profile-admin-command-center")).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        screen
          .getByTestId("profile-refresh-control")
          .getAttribute("data-refreshing"),
      ).toBe("false"),
    );

    await act(async () => {
      initialIdentity.resolve({
        data: null,
        error: new Error("stale request failed"),
      });
    });
    expect(screen.getByTestId("profile-admin-command-center")).toBeTruthy();
  });

  it("fails closed immediately when the authenticated account changes", async () => {
    profileResponses.push(
      Promise.resolve({
        data: {
          username: "root",
          referral_code: "ROOT500",
          role: "god_admin",
        },
        error: null,
      }),
    );
    referralResponses.push(
      Promise.resolve({ data: [], count: 0, error: null }),
    );

    const view = render(<ProfileScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("profile-admin-command-center")).toBeTruthy(),
    );

    const secondIdentity = deferred<any>();
    profileResponses.push(secondIdentity.promise);
    referralResponses.push(
      Promise.resolve({ data: [], count: 0, error: null }),
    );
    authState.session = {
      user: {
        id: "ordinary-user",
        email: "ordinary@example.com",
      },
    };
    view.rerender(<ProfileScreen />);

    expect(screen.queryByTestId("profile-admin-command-center")).toBeNull();
    expect(screen.getByTestId("profile-loading-skeleton")).toBeTruthy();

    await act(async () => {
      secondIdentity.resolve({
        data: {
          username: "ordinary",
          referral_code: "USER500",
          role: "user",
        },
        error: null,
      });
    });
    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading-skeleton")).toBeNull(),
    );
    expect(screen.queryByTestId("profile-admin-command-center")).toBeNull();
  });
});