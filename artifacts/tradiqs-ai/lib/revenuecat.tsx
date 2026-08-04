import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  });

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

  // Invalidate the cache when a purchase or restore completes: recompute the
  // entitlement from the fresh customerInfo and persist it immediately.
  const applyFreshCustomerInfo = (customerInfo: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>) => {
    const subscribed =
      customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
    setCachedIsSubscribed(subscribed);
    AsyncStorage.setItem(SUBSCRIPTION_CACHE_KEY, String(subscribed)).catch(() => {});
    customerInfoQuery.refetch();
  };

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: any) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: (customerInfo) => applyFreshCustomerInfo(customerInfo),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return Purchases.restorePurchases();
    },
    onSuccess: (customerInfo) => applyFreshCustomerInfo(customerInfo),
  });

  // Prefer live data; fall back to the cached value while loading.
  const isSubscribed = liveIsSubscribed !== null ? liveIsSubscribed : cachedIsSubscribed === true;

  // Only report loading if we have neither live data nor a cached value yet.
  const subscriptionResolving =
    customerInfoQuery.isLoading && (!cacheLoaded || cachedIsSubscribed === null);

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isLoading: subscriptionResolving || (!isSubscribed && offeringsQuery.isLoading),
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
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
