import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { isSupabaseConfigured, supabase } from "@/utils/supabase";
import { hasProfileProAccess, isProfileAdmin, type ProfileEntitlement } from "@/lib/profileEntitlements";

const SUBSCRIPTION_CACHE_KEY = "revenuecat.isSubscribed";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

function getRevenueCatApiKey() {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat Public API Keys not found");
  }

  if (!REVENUECAT_ENTITLEMENT_IDENTIFIER) {
    throw new Error("RevenueCat Entitlement Identifier not provided");
  }

  if (__DEV__ || Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    return REVENUECAT_TEST_API_KEY;
  }

  if (Platform.OS === "ios") {
    return REVENUECAT_IOS_API_KEY;
  }

  if (Platform.OS === "android") {
    return REVENUECAT_ANDROID_API_KEY;
  }

  return REVENUECAT_TEST_API_KEY;
}

export function initializeRevenueCat() {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) throw new Error("RevenueCat Public API Key not found");

  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });

  console.log("Configured RevenueCat");
}

function useSubscriptionContext() {
  // The signed-in user — used to check the Supabase subscription_tier as a
  // supplemental entitlement for Stripe Elite buyers who have no RevenueCat
  // entitlement. `useAuth()` is safe here because SubscriptionProvider is
  // mounted inside AuthProvider in _layout.tsx.
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  // Last-known subscription state from AsyncStorage, used until the live
  // customerInfo fetch resolves so the paywall doesn't flash for subscribers.
  const [cachedIsSubscribed, setCachedIsSubscribed] = useState<boolean | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SUBSCRIPTION_CACHE_KEY)
      .then((value) => {
        if (cancelled) return;
        if (value !== null) setCachedIsSubscribed(value === "true");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCacheLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => {
      const info = await Purchases.getCustomerInfo();
      return info;
    },
    staleTime: 60 * 1000,
    // Retry failed fetches with exponential backoff, then keep re-attempting
    // periodically while errored so the entitlement re-verifies on its own
    // when RevenueCat becomes reachable again (offline, outage).
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 30 * 1000),
    refetchOnReconnect: true,
    refetchInterval: (query) => (query.state.status === "error" ? 30 * 1000 : false),
  });

  // Refetch the entitlement whenever the app returns to the foreground so a
  // failed fetch recovers as soon as connectivity is likely back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && customerInfoQuery.isError) {
        customerInfoQuery.refetch();
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInfoQuery.isError]);

  // On every successful fetch, persist the entitlement state.
  const liveIsSubscribed = customerInfoQuery.data
    ? customerInfoQuery.data.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined
    : null;

  useEffect(() => {
    if (liveIsSubscribed === null) return;
    setCachedIsSubscribed(liveIsSubscribed);
    AsyncStorage.setItem(SUBSCRIPTION_CACHE_KEY, String(liveIsSubscribed)).catch(() => {});
  }, [liveIsSubscribed]);

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      const offerings = await Purchases.getOfferings();
      return offerings;
    },
    staleTime: 300 * 1000,
  });

  // Read the server-owned profile entitlement. RevenueCat is for store
  // purchases; the profile covers server-granted paid tiers and staff admins.
  // This is display/access state only—sensitive API actions verify it again.
  const [supabaseIsSubscribed, setSupabaseIsSubscribed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const refreshProfileEntitlement = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) {
      setSupabaseIsSubscribed(false);
      setIsAdmin(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("role, tier, manual_tier_override")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;

    const profile = data as ProfileEntitlement | null;
    setSupabaseIsSubscribed(hasProfileProAccess(profile));
    setIsAdmin(isProfileAdmin(profile));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void refreshProfileEntitlement().catch(() => {
      if (!cancelled) {
        setSupabaseIsSubscribed(false);
        setIsAdmin(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshProfileEntitlement]);

  // Invalidate the cache when a purchase or restore completes: recompute the
  // store entitlement and force a fresh server-owned profile read so screens
  // switch tiers without requiring an app restart.
  const applyFreshCustomerInfo = async (
    customerInfo: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>,
  ) => {
    const subscribed =
      customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
    setCachedIsSubscribed(subscribed);
    AsyncStorage.setItem(SUBSCRIPTION_CACHE_KEY, String(subscribed)).catch(() => {});
    await Promise.all([
      customerInfoQuery.refetch(),
      refreshProfileEntitlement().catch(() => {}),
    ]);
  };

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: any) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: applyFreshCustomerInfo,
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return Purchases.restorePurchases();
    },
    onSuccess: applyFreshCustomerInfo,
  });

  const manageSubscriptionMutation = useMutation({
    mutationFn: async () => {
      await Purchases.showManageSubscriptions();
    },
    // Refetch in case the user cancelled or changed their plan.
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const activeEntitlement =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];

  // Prefer live RevenueCat data; fall back to the cached value while loading.
  // OR grant access from the server-owned profile tier/override/admin role.
  const rcIsSubscribed = liveIsSubscribed !== null ? liveIsSubscribed : cachedIsSubscribed === true;
  const isSubscribed = rcIsSubscribed || supabaseIsSubscribed;

  // Entitlement is active but the user cancelled in the store: Pro access
  // continues until expirationDate, then the paywall reappears normally.
  const isWindingDown = activeEntitlement !== undefined && activeEntitlement.willRenew === false;
  const windDownExpirationDate = isWindingDown ? activeEntitlement?.expirationDate ?? null : null;

  // Only report loading if we have neither live data nor a cached value yet.
  const subscriptionResolving =
    customerInfoQuery.isLoading && (!cacheLoaded || cachedIsSubscribed === null);

  // True when the live fetch is failing and we're relying on the cached
  // entitlement — used to show a non-blocking "couldn't verify" indicator.
  const verificationPending = customerInfoQuery.isError && liveIsSubscribed === null;

  return {
    verificationPending,
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    activeEntitlement,
    isSubscribed,
    isAdmin,
    refreshProfileEntitlement,
    isWindingDown,
    windDownExpirationDate,
    isLoading: subscriptionResolving || (!isSubscribed && offeringsQuery.isLoading),
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    manageSubscription: manageSubscriptionMutation.mutateAsync,
    isManagingSubscription: manageSubscriptionMutation.isPending,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    restoreError: restoreMutation.error,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
