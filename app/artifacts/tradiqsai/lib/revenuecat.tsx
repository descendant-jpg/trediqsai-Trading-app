import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { isSupabaseConfigured, supabase } from "@/utils/supabase";
import { isRevenueCatIdentityReady, revenueCatIdentityKey } from "@/lib/revenuecatIdentity";
import {
  getProfileAccessTier,
  hasProfileProAccess,
  isAccessTierUpgrade,
  isProfileAdmin,
  type AccessTier,
  type ProfileEntitlement,
} from "@/lib/profileEntitlements";
import {
  isCurrentSubscriptionIdentity,
  readCurrentSubscriptionValue,
  type IdentityScoped,
} from "@/lib/subscriptionIdentity";

const SUBSCRIPTION_CACHE_KEY_PREFIX = "revenuecat.entitlement";

const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
const REVENUECAT_WEB_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";
export const REVENUECAT_ELITE_ENTITLEMENT_IDENTIFIER = "elite";

type CustomerInfoLike = {
  entitlements: { active?: Record<string, unknown> };
};

let revenueCatConfigured = false;

function subscriptionCacheKey(userId: string | null) {
  return `${SUBSCRIPTION_CACHE_KEY_PREFIX}.${userId ?? "anonymous"}`;
}

function getRevenueCatApiKey() {
  // RevenueCat's web SDK rejects native/Test Store keys. Web paywalls remain
  // demoable with their existing fallback UI until a Web Billing key is set.
  if (Platform.OS === "web") return REVENUECAT_WEB_API_KEY ?? null;

  if (Platform.OS === "ios") {
    if (!REVENUECAT_IOS_API_KEY) throw new Error("RevenueCat iOS public API key not found");
    return REVENUECAT_IOS_API_KEY;
  }

  if (Platform.OS === "android") {
    if (!REVENUECAT_ANDROID_API_KEY) throw new Error("RevenueCat Android public API key not found");
    return REVENUECAT_ANDROID_API_KEY;
  }

  return null;
}

export function initializeRevenueCat() {
  if (revenueCatConfigured) return true;
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) return false;

  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  revenueCatConfigured = true;
  console.log("Configured RevenueCat");
  return true;
}

export function revenueCatAccessTier(customerInfo: CustomerInfoLike | null | undefined): AccessTier {
  const active = customerInfo?.entitlements.active ?? {};
  if (active[REVENUECAT_ELITE_ENTITLEMENT_IDENTIFIER] !== undefined) return "elite";
  if (active[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined) return "pro";
  return "starter";
}

function useSubscriptionContext() {
   // The signed-in user — used to check the Supabase revenuecat_tier as a
  // supplemental entitlement for Stripe Elite buyers who have no RevenueCat
  // entitlement. `useAuth()` is safe here because SubscriptionProvider is
  // mounted inside AuthProvider in _layout.tsx.
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const currentUserIdRef = useRef<string | null>(userId);
  currentUserIdRef.current = userId;

  // Last-known subscription state from AsyncStorage, used until the live
  // customerInfo fetch resolves so the paywall doesn't flash for subscribers.
  const [cachedEntitlement, setCachedEntitlement] = useState<
    IdentityScoped<AccessTier> | null
  >(null);
  const cachedTier = readCurrentSubscriptionValue(cachedEntitlement, userId);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [listenerCustomerInfo, setListenerCustomerInfo] = useState<{
    userId: string | null;
    customerInfo: CustomerInfoLike;
  } | null>(null);
  // Undefined means the RevenueCat SDK has not yet been associated with the
  // current Supabase identity. Do not read a previous account's query cache
  // during that gap.
  const [revenueCatIdentity, setRevenueCatIdentity] = useState<string | null | undefined>(undefined);
  const identityIsReady = isRevenueCatIdentityReady(revenueCatIdentity, userId);

  useEffect(() => {
    let cancelled = false;
    const cacheUserId = userId;
    setCacheLoaded(false);
    setCachedEntitlement(null);
    setListenerCustomerInfo(null);
    setRevenueCatIdentity(undefined);
    AsyncStorage.getItem(subscriptionCacheKey(userId))
      .then((value) => {
        if (cancelled) return;
        if (
          isCurrentSubscriptionIdentity(cacheUserId, currentUserIdRef.current) &&
          (value === "pro" || value === "elite" || value === "starter")
        ) {
          setCachedEntitlement({ userId: cacheUserId, value });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCacheLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info", revenueCatIdentityKey(userId)],
    queryFn: async () => {
      if (!initializeRevenueCat()) {
        return { entitlements: { active: {} } } as Awaited<ReturnType<typeof Purchases.getCustomerInfo>>;
      }
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
    enabled: identityIsReady,
  });
  // React Query's result object is not referentially stable, but its refetch
  // function is. Effects below must never depend on the entire result object.
  const refetchCustomerInfo = customerInfoQuery.refetch;

  // Refetch the entitlement whenever the app returns to the foreground so a
  // failed fetch recovers as soon as connectivity is likely back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && customerInfoQuery.isError) {
        refetchCustomerInfo();
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInfoQuery.isError, refetchCustomerInfo]);

  // On every successful fetch, persist the entitlement state.
  const liveCustomerInfo =
    listenerCustomerInfo?.userId === userId
      ? listenerCustomerInfo.customerInfo
      : customerInfoQuery.data;
  const liveTier = liveCustomerInfo ? revenueCatAccessTier(liveCustomerInfo) : null;
  const liveIsSubscribed = liveTier ? liveTier !== "starter" : null;

  useEffect(() => {
    if (!liveTier) return;
    setCachedEntitlement({ userId, value: liveTier });
    AsyncStorage.setItem(subscriptionCacheKey(userId), liveTier).catch(() => {});
  }, [liveTier, userId]);

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings", revenueCatIdentityKey(userId)],
    queryFn: async () => {
      if (!initializeRevenueCat()) {
        return { current: null, all: {} } as Awaited<ReturnType<typeof Purchases.getOfferings>>;
      }
      const offerings = await Purchases.getOfferings();
      return offerings;
    },
    staleTime: 300 * 1000,
  });

  // Read the server-owned profile entitlement. RevenueCat is for store
  // purchases; the profile covers server-granted paid tiers and staff admins.
  // This is display/access state only—sensitive API actions verify it again.
  type ProfileEntitlementState = {
    isSubscribed: boolean;
    isAdmin: boolean;
    accessTier: AccessTier;
    hasManualTierOverride: boolean;
  };
  const EMPTY_PROFILE_ENTITLEMENT: ProfileEntitlementState = {
    isSubscribed: false,
    isAdmin: false,
    accessTier: 'starter',
    hasManualTierOverride: false,
  };
  const [profileEntitlement, setProfileEntitlement] = useState<
    IdentityScoped<ProfileEntitlementState>
  >({ userId: null, value: EMPTY_PROFILE_ENTITLEMENT });
  const profileEntitlementRef = useRef(profileEntitlement);
  const [profileUpgrade, setProfileUpgrade] = useState<{
    userId: string;
    tier: Exclude<AccessTier, 'starter'>;
    sequence: number;
  } | null>(null);
  const commitProfileEntitlement = useCallback((
    capturedUserId: string | null,
    profile: ProfileEntitlement | null,
    announceUpgrade: boolean,
  ) => {
    if (
      !isCurrentSubscriptionIdentity(
        capturedUserId,
        currentUserIdRef.current,
      )
    ) {
      return;
    }
    const previousTier =
      profileEntitlementRef.current.userId === capturedUserId
        ? profileEntitlementRef.current.value.accessTier
        : 'starter';
    const nextTier = getProfileAccessTier(profile);
    const nextEntitlement: IdentityScoped<ProfileEntitlementState> = {
      userId: capturedUserId,
      value: {
        isSubscribed: hasProfileProAccess(profile),
        isAdmin: isProfileAdmin(profile),
        accessTier: nextTier,
        hasManualTierOverride: Boolean(profile?.manual_tier_override?.trim()),
      },
    };
    profileEntitlementRef.current = nextEntitlement;
    setProfileEntitlement(nextEntitlement);

    if (
      announceUpgrade &&
      capturedUserId &&
      nextTier !== 'starter' &&
      isAccessTierUpgrade(previousTier, nextTier)
    ) {
      setProfileUpgrade((current) => ({
        userId: capturedUserId,
        tier: nextTier,
        sequence: (current?.sequence ?? 0) + 1,
      }));
    }
  }, []);
  const refreshProfileEntitlement = useCallback(async () => {
    const requestedUserId = userId;
    if (!userId || !isSupabaseConfigured) {
      commitProfileEntitlement(requestedUserId, null, false);
      setProfileUpgrade(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("role, tier, revenuecat_tier, manual_tier_override, free_trial_until")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;

    const profile = data as ProfileEntitlement | null;
    commitProfileEntitlement(requestedUserId, profile, false);
  }, [commitProfileEntitlement, userId]);

  useEffect(() => {
    let cancelled = false;
    commitProfileEntitlement(userId, null, false);
    setProfileUpgrade(null);
    void refreshProfileEntitlement().catch(() => {
      if (!cancelled) {
        commitProfileEntitlement(userId, null, false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [commitProfileEntitlement, refreshProfileEntitlement, userId]);

  // The verified webhook writes the server-owned profile row. Listening to
  // that row makes the purchase result visible without polling or trusting a
  // client callback as the entitlement source of truth.
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`profile-entitlement-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          commitProfileEntitlement(
            userId,
            payload.new as ProfileEntitlement,
            true,
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [commitProfileEntitlement, userId]);

  // Invalidate the cache when a purchase or restore completes: recompute the
  // store entitlement and force a fresh server-owned profile read so screens
  // switch tiers without requiring an app restart.
  const applyFreshCustomerInfo = useCallback(async (
    customerInfo: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>,
  ) => {
    const capturedUserId = userId;
    if (
      !isCurrentSubscriptionIdentity(
        capturedUserId,
        currentUserIdRef.current,
      )
    ) {
      return;
    }
    const tier = revenueCatAccessTier(customerInfo);
    setListenerCustomerInfo({ userId: capturedUserId, customerInfo });
    setCachedEntitlement({ userId: capturedUserId, value: tier });
    AsyncStorage.setItem(subscriptionCacheKey(capturedUserId), tier).catch(() => {});
    await Promise.all([
      refetchCustomerInfo(),
      refreshProfileEntitlement().catch(() => {}),
    ]);
  }, [refetchCustomerInfo, refreshProfileEntitlement, userId]);

  // Tie RevenueCat's app user to the Supabase account. This lets the
  // server-side webhook safely map a verified store event to the profile it
  // may update. On sign-out, detach the anonymous RevenueCat user as well.
  useEffect(() => {
    let cancelled = false;
    const syncIdentity = async () => {
      try {
        if (!initializeRevenueCat()) return;
        if (userId) {
          const { customerInfo } = await Purchases.logIn(userId);
          if (!cancelled) {
            setRevenueCatIdentity(userId);
            await applyFreshCustomerInfo(customerInfo);
          }
        } else {
          const customerInfo = await Purchases.logOut();
          if (!cancelled) {
            setRevenueCatIdentity(null);
            await applyFreshCustomerInfo(customerInfo);
          }
        }
      } catch {
        // Sandbox/store availability must not block the signed-in app.
        if (!cancelled) setListenerCustomerInfo(null);
      }
    };
    void syncIdentity();
    return () => {
      cancelled = true;
    };
  }, [applyFreshCustomerInfo, userId]);

  useEffect(() => {
    if (!identityIsReady || !initializeRevenueCat()) return;
    const listener = (customerInfo: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>) => {
      void applyFreshCustomerInfo(customerInfo);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [applyFreshCustomerInfo, identityIsReady]);

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
    onSuccess: () => refetchCustomerInfo(),
  });

  const activeEntitlement =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];

  // Prefer live RevenueCat data; fall back to the cached value while loading.
  // OR grant access from the server-owned profile tier/override/admin role.
  const currentProfileEntitlement =
    readCurrentSubscriptionValue(profileEntitlement, userId) ??
    EMPTY_PROFILE_ENTITLEMENT;
  const activeProfileUpgrade =
    profileUpgrade?.userId === userId ? profileUpgrade : null;
  const resolvedRevenueCatTier = liveTier ?? cachedTier ?? "starter";
  const rcIsSubscribed = resolvedRevenueCatTier !== "starter";
  const isSubscribed = currentProfileEntitlement.hasManualTierOverride
    ? currentProfileEntitlement.isSubscribed
    : rcIsSubscribed || currentProfileEntitlement.isSubscribed;
  // RevenueCat's shared entitlement represents Pro access. A server-owned
  // Elite tier takes precedence when it is present.
  const accessTier: AccessTier =
    currentProfileEntitlement.isAdmin ||
    currentProfileEntitlement.accessTier === 'elite' ||
    resolvedRevenueCatTier === "elite"
      ? 'elite'
      : isSubscribed || currentProfileEntitlement.accessTier === 'pro'
        ? 'pro'
        : 'starter';

  // Entitlement is active but the user cancelled in the store: Pro access
  // continues until expirationDate, then the paywall reappears normally.
  const isWindingDown = activeEntitlement !== undefined && activeEntitlement.willRenew === false;
  const windDownExpirationDate = isWindingDown ? activeEntitlement?.expirationDate ?? null : null;

  // Only report loading if we have neither live data nor a cached value yet.
  const subscriptionResolving =
    customerInfoQuery.isLoading && (!cacheLoaded || cachedTier === null);

  // True when the live fetch is failing and we're relying on the cached
  // entitlement — used to show a non-blocking "couldn't verify" indicator.
  const verificationPending = customerInfoQuery.isError && liveIsSubscribed === null;

  return {
    verificationPending,
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    activeEntitlement,
    isSubscribed,
    isAdmin: currentProfileEntitlement.isAdmin,
    accessTier,
    profileUpgrade: activeProfileUpgrade,
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
