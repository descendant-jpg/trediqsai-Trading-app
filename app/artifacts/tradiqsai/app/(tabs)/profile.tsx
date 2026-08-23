import React, { useCallback, useEffect, useRef, useState } from "react";
import { RiskDisclaimer } from "@/components/RiskDisclaimer";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAutopilotHistoryQueryKey } from "@workspace/api-client-react";
import TimezonePickerModal from "@/components/TimezonePickerModal";
import { useTrading } from "@/context/TradingContext";
import { useAuth } from "@/context/AuthContext";
import { usePayoutEvaluation } from "@/hooks/usePayoutEvaluation";
import {
  DAILY_DRAWDOWN_LIMIT,
  DEMO_STARTING_BALANCE,
  MINIMUM_ACTIVE_DAYS,
  TOTAL_EQUITY_FLOOR,
  formatMoney,
  type PayoutRequest,
} from "@/lib/payoutEvaluation";
import { useSubscription } from "@/lib/revenuecat";
import { PRIVACY_POLICY, TERMS_AND_CONDITIONS } from "@/lib/legalContent";
import { supabase } from "@/utils/supabase";
import { canAccessPayoutEvaluation } from "@/lib/payoutAccess";
import colors from "@/constants/colors";
import { AcademyModal } from "../../components/AcademyModal";
import { SocialMediaModal } from "@/components/SocialMediaModal";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { DeleteAccountModal } from "@/components/DeleteAccountModal";
import { TwoFactorAuthModal } from "@/components/TwoFactorAuthModal";
import { authenticateBiometrics, biometricCapability, getBiometricsEnabled, setBiometricsEnabled, unsupportedBiometricsMessage } from "@/lib/biometricSecurity";

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/** Confirm dialog that actually works on web (Alert buttons are a no-op there). */
function showConfirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ]);
  }
}

const LANGUAGE_KEY = "tradiqs.language.v1";

const LANGUAGES = ["English", "Spanish", "French"] as const;
type Language = (typeof LANGUAGES)[number];

const TELEGRAM_CHANNEL_URL = "https://t.me/tradiqsai";

const PARTNER_PROGRAM_COPY: Record<string, string> = {
  "Crypto Brokers":
    "Our crypto affiliate program connects you with vetted crypto broker partners. When you open a live account through a TradiQs partner link, you support the platform at no extra cost — and unlock partner-exclusive signal streams as they launch.",
  "Forex Partners":
    "The forex partner program links your TradiQs progress to real forex brokers. Graduates of the simulated challenge get priority referrals to our partner brokers, plus reduced-spread promotions negotiated for the TradiQs community.",
  "Stock Partners":
    "Our stock brokerage partners offer commission-free equity trading for TradiQs members. Referral rewards from partner signups help keep the simulated terminal free — full partner integrations are rolling out soon.",
};

type IconName = React.ComponentProps<typeof Feather>["name"];

function ListItem({
  icon,
  label,
  detail,
  onPress,
  testID,
  danger = false,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  testID?: string;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.listItem}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
    >
      <Feather name={icon} size={18} color={danger ? "#FF5252" : "#8A8D93"} />
      <Text style={[styles.listItemLabel, danger && styles.dangerLabel]}>
        {label}
      </Text>
      {!!detail && <Text style={styles.listItemDetail}>{detail}</Text>}
      <Feather name="chevron-right" size={18} color="#8A8D93" />
    </TouchableOpacity>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View style={styles.profileSkeleton} testID="profile-loading-skeleton">
      <View style={styles.skeletonIdentity}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonIdentityCopy}>
          <View style={[styles.skeletonLine, styles.skeletonName]} />
          <View style={[styles.skeletonLine, styles.skeletonEmail]} />
          <View style={[styles.skeletonLine, styles.skeletonBadge]} />
        </View>
      </View>
      <View style={styles.skeletonWallet}>
        <View style={[styles.skeletonLine, styles.skeletonLabel]} />
        <View style={[styles.skeletonLine, styles.skeletonBalance]} />
        <View style={styles.skeletonDivider} />
        <View style={styles.skeletonStatRow}>
          <View style={styles.skeletonStat} />
          <View style={styles.skeletonStat} />
          <View style={styles.skeletonStat} />
        </View>
      </View>
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
      <ActivityIndicator color={c.primary} style={styles.skeletonSpinner} />
    </View>
  );
}

/** Bottom-sheet style modal shell shared by all profile modals. */
function SheetModal({
  visible,
  title,
  onClose,
  children,
  scroll = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, scroll && styles.modalCardTall]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="modal-close"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {scroll ? (
            <ScrollView style={styles.modalScroll}>{children}</ScrollView>
          ) : (
            <View style={styles.modalBody}>{children}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

type ActiveModal =
  | null
  | "password"
  | "language"
  | "terms"
  | "privacy"
  | "partner";

/** Profile — account, wallet, settings, partners, support, and legal. */
export default function ProfileScreen() {
  const router = useRouter();
  const { mfa } = useLocalSearchParams<{ mfa?: string }>();
  const queryClient = useQueryClient();
  const { session, signOut, startAccountCreation } = useAuth();
  const {
    isSubscribed,
    isAdmin,
    activeAccessTier,
    hasActiveEntitlement,
    refreshProfileEntitlement,
  } = useSubscription();
  const { tradingDayTz, setTradingDayTz } = useTrading();
  const {
    evaluation,
    loading: evaluationLoading,
    error: evaluationError,
    history: payoutHistory,
    historyLoading,
    historyError,
    refresh: refreshPayoutEvaluation,
    requestPayout,
  } = usePayoutEvaluation();
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [tradingExperience, setTradingExperience] = useState<string | null>(null);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [loadedProfileUserId, setLoadedProfileUserId] = useState<string | null>(
    null,
  );
  const [profileLoading, setProfileLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [referralEarned, setReferralEarned] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [academyOpen, setAcademyOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(Platform.OS !== "web");
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // Change password
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Language (persisted in AsyncStorage)
  const [language, setLanguage] = useState<Language>("English");

  // Partner program modal content
  const [partnerTopic, setPartnerTopic] = useState<string>("Crypto Brokers");

  // Delete account
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isGuest = session?.user?.is_anonymous === true;
  const isElite = !isGuest && hasActiveEntitlement && activeAccessTier === "elite";
  const payoutAccessAllowed = canAccessPayoutEvaluation(session);
  const userMetadata = session?.user?.user_metadata ?? {};
  const metadataName =
    typeof userMetadata.full_name === "string"
      ? userMetadata.full_name.trim()
      : typeof userMetadata.name === "string"
        ? userMetadata.name.trim()
        : "";
  const userEmail = isGuest ? "" : (session?.user?.email ?? "");
  const displayName = isGuest
    ? "Guest Trader"
    : (metadataName || username || userEmail || "Trader");
  const userId = session?.user?.id ?? null;
  const activeProfileUserId = useRef(userId);
  const profileRequestGeneration = useRef(0);
  const referralRequestGeneration = useRef(0);
  const refreshGeneration = useRef(0);
  activeProfileUserId.current = userId;

  const refreshProfileIdentity = useCallback(async () => {
    const requestGeneration = ++profileRequestGeneration.current;
    if (!userId) {
      setUsername(null);
      setRole(null);
      setReferralCode(null);
      setLoadedProfileUserId(null);
      setProfileLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, referral_code, role, trading_experience")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (
        activeProfileUserId.current !== userId ||
        profileRequestGeneration.current !== requestGeneration
      ) {
        return;
      }

      setUsername(data?.username ?? null);
      setRole(
        typeof data?.role === "string"
          ? data.role.trim().toLowerCase()
          : null,
      );
      setReferralCode(data?.referral_code ?? null);
      setTradingExperience(data?.trading_experience ?? null);
      setLoadedProfileUserId(userId);
    } catch (error) {
      if (
        activeProfileUserId.current === userId &&
        profileRequestGeneration.current === requestGeneration
      ) {
        setUsername(null);
        setRole(null);
        setReferralCode(null);
        setLoadedProfileUserId(userId);
      }
      throw error;
    } finally {
      if (
        activeProfileUserId.current === userId &&
        profileRequestGeneration.current === requestGeneration
      ) {
        setProfileLoading(false);
      }
    }
  }, [userId]);

  const refreshReferralStats = useCallback(async () => {
    const requestGeneration = ++referralRequestGeneration.current;
    if (!userId) {
      setReferralCount(null);
      setReferralEarned(null);
      return;
    }

    try {
      const { data, count, error } = await supabase
        .from("referrals")
        .select("reward_amount", { count: "exact" })
        .eq("referrer_id", userId);
      if (error) throw error;
      if (
        activeProfileUserId.current !== userId ||
        referralRequestGeneration.current !== requestGeneration
      ) {
        return;
      }

      setReferralCount(count ?? 0);
      setReferralEarned(
        (data ?? []).reduce(
          (sum, row: { reward_amount: number | null }) =>
            sum + (Number(row.reward_amount) || 0),
          0,
        ),
      );
    } catch (error) {
      if (
        activeProfileUserId.current === userId &&
        referralRequestGeneration.current === requestGeneration
      ) {
        setReferralCount(null);
        setReferralEarned(null);
      }
      throw error;
    }
  }, [userId]);

  useEffect(() => {
    setProfileLoading(true);
    setUsername(null);
    setRole(null);
    setReferralCode(null);
    setReferralCount(null);
    setReferralEarned(null);

    void refreshProfileIdentity().catch(() => undefined);

    // Referral metadata is optional and must never delay or suppress the
    // profile role that controls the Admin Command Center.
    void refreshReferralStats().catch(() => undefined);

    return () => {
      profileRequestGeneration.current += 1;
      referralRequestGeneration.current += 1;
      refreshGeneration.current += 1;
    };
  }, [refreshProfileIdentity, refreshReferralStats, userId]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    const requestGeneration = ++refreshGeneration.current;
    setRefreshing(true);
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    try {
      await Promise.allSettled([
        refreshProfileIdentity(),
        refreshReferralStats(),
        refreshProfileEntitlement(),
        refreshPayoutEvaluation(),
        queryClient.invalidateQueries({ type: "active" }),
      ]);
    } finally {
      if (refreshGeneration.current === requestGeneration) {
        setRefreshing(false);
      }
    }
  }, [
    queryClient,
    refreshPayoutEvaluation,
    refreshProfileEntitlement,
    refreshProfileIdentity,
    refreshReferralStats,
    refreshing,
  ]);

  // Restore persisted settings.
  useEffect(() => {
    (async () => {
      try {
        const rawLang = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (rawLang && (LANGUAGES as readonly string[]).includes(rawLang)) {
          setLanguage(rawLang as Language);
        }
      } catch {
        // Non-fatal: fall back to defaults.
      }
    })();
  }, []);

  useEffect(() => {
    void getBiometricsEnabled().then((enabled) => setBiometricsEnabledState(enabled === true));
    void biometricCapability().then(setBiometricsAvailable);
    if (!session) return;
    supabase.auth.mfa.listFactors().then(({ data }) => setTwoFactorEnabled(Boolean(data?.totp?.some((factor: any) => factor.status === "verified")))).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (mfa === "verify") setTwoFactorOpen(true);
  }, [mfa]);

  const handleMfaVerified = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getGetAutopilotHistoryQueryKey() });
  }, [queryClient]);

  const toggleBiometrics = async () => {
    const result = await authenticateBiometrics(biometricsEnabled ? "Authenticate to disable FaceID / Biometrics" : "Authenticate to enable FaceID / Biometrics");
    if (!result.ok) {
      showAlert(Platform.OS === "web" ? "Biometrics unavailable" : "Authentication required", result.reason || unsupportedBiometricsMessage);
      return;
    }
    const next = !biometricsEnabled;
    await setBiometricsEnabled(next);
    setBiometricsEnabledState(next);
    showAlert("Biometrics", next ? "FaceID / biometric unlock is enabled." : "Biometric unlock is disabled.");
  };

  const selectLanguage = (lang: Language) => {
    setLanguage(lang);
    AsyncStorage.setItem(LANGUAGE_KEY, lang).catch(() => {});
    setActiveModal(null);
    showAlert("Language", `Language set to ${lang}.`);
  };

  const handleSavePassword = async (password = newPassword) => {
    if (password.length < 8) {
      showAlert("Change Password", "Password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setNewPassword("");
      setActiveModal(null);
      showAlert("Change Password", "Your password has been updated.");
    } catch (err: any) {
      showAlert(
        "Change Password",
        err?.message ?? "Failed to update password.",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    showConfirm(
      "Delete Account",
      "Are you sure? This cannot be undone.",
      async () => {
        setDeleting(true);
        // Flag the profile for deletion; auth users can't be hard-deleted from
        // the client. Sign-out proceeds either way, but the message must be
        // honest about whether the flag was actually recorded.
        let flagged = false;
        try {
          const { error } = await supabase.rpc("request_account_deletion");
          flagged = !error;
        } catch {
          flagged = false;
        }
        try {
          showAlert(
            "Account Deletion",
            flagged
              ? "Your account has been flagged for deletion. You will now be signed out."
              : "We could not record the deletion request right now. You will be signed out — please contact support@tradiqsai.com to complete deletion.",
          );
          await signOut();
        } catch (err: any) {
          showAlert("Delete Account", err?.message ?? "Failed to sign out.");
        } finally {
          setDeleting(false);
        }
      },
    );
  };

  const openLink = (url: string, fallbackLabel: string) => {
    Linking.openURL(url).catch(() => showAlert(fallbackLabel, url));
  };

  const handleEliteChannelPress = () => {
    if (isElite) {
      openLink(TELEGRAM_CHANNEL_URL, "Elite Channel");
      return;
    }

    Alert.alert(
      "Elite Access Only",
      "You must have an active Elite subscription to join the private channel. Upgrade now to unlock.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Upgrade", onPress: () => router.push("/shop") },
      ],
    );
  };

  const openPartner = (topic: string) => {
    setPartnerTopic(topic);
    setActiveModal("partner");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err: any) {
      showAlert("Sign out failed", err?.message ?? "Unknown error");
    }
  };

  // Fail closed: anything other than a validated, eligible, non-zero server
  // result keeps the button disabled.
  const payoutEnabled =
    payoutAccessAllowed &&
    !!evaluation &&
    evaluation.eligible &&
    !evaluation.violated &&
    evaluation.cashoutValue > 0 &&
    !requestingPayout;

  const payoutLockReason = evaluation
    ? (evaluation.violationReason ??
      evaluation.lockReason ??
      (evaluation.cashoutValue <= 0
        ? "You have reached your monthly payout cap for this cycle."
        : "Evaluation requirements are not met yet."))
    : (evaluationError ?? "Evaluation data is unavailable.");

  /**
   * The button is only ever enabled from a validated server result, so this
   * handler cannot be the thing that authorizes a payout — the RPC re-checks
   * every rule and is the sole authority on the outcome.
   */
  const handleRequestPayout = async () => {
    if (requestingPayout) return;
    setRequestingPayout(true);
    // Captured before the call: the refreshed summary returns the *remaining*
    // cashout value, which is 0 once this request consumes the cap.
    const requestedAmount = evaluation?.cashoutValue ?? 0;
    try {
      await requestPayout();
      showAlert(
        "Payout Requested",
        `Your payout request for ${formatMoney(requestedAmount)} has been recorded. ` +
          "Our team reviews requests before funds are released.",
      );
    } catch (err: any) {
      showAlert(
        "Payout Not Available",
        err?.message ??
          "We could not verify your payout eligibility right now.",
      );
    } finally {
      setRequestingPayout(false);
    }
  };

  const referralLink = referralCode
    ? `https://tradiqsai.com/r/${referralCode}`
    : null;

  const handleShareReferral = async () => {
    if (!referralLink) return;
    const message = `Join me on TradiQs AI — use my invite link: ${referralLink}`;
    try {
      if (Platform.OS === "web") {
        // Native share sheet where supported; clipboard fallback elsewhere.
        if (typeof navigator !== "undefined" && (navigator as any).share) {
          await (navigator as any).share({
            title: "TradiQs AI",
            text: message,
            url: referralLink,
          });
        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(referralLink);
          showAlert("Copied", "Referral link copied to clipboard.");
        } else {
          showAlert("Your referral link", referralLink);
        }
      } else {
        await Share.share(
          Platform.OS === "ios" ? { message, url: referralLink } : { message },
        );
      }
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            testID="profile-refresh-control"
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={c.primary}
            colors={[c.primary]}
            progressBackgroundColor={c.card}
          />
        }
      >
        {profileLoading || loadedProfileUserId !== userId ? (
          <ProfileSkeleton />
        ) : (
          <>
        <View style={styles.identityHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.username}>{displayName}</Text>
              {!isGuest && <Text style={styles.verified}>✓ Verified</Text>}
            </View>
            {!!userEmail && <Text style={styles.email}>{userEmail}</Text>}
            <View style={styles.planBadge}>
              <Text style={styles.planText}>
                {isAdmin
                  ? "ADMIN · PRO PLAN"
                  : isSubscribed
                    ? "PRO PLAN"
                    : "FREE PLAN"}
              </Text>
            </View>
          </View>
        </View>
        {!isGuest && <TouchableOpacity style={styles.experienceCard} onPress={() => setExperienceOpen(true)} testID="profile-trading-experience"><Text style={styles.experienceLabel}>TRADING EXPERIENCE</Text><Text style={styles.experienceValue}>{tradingExperience ?? "Choose your experience"}</Text></TouchableOpacity>}
        {!isSubscribed && (
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push("/signals")}
            activeOpacity={0.85}
            testID="profile-upgrade"
          >
            <Feather name="zap" size={18} color="#0A0B0E" />
            <Text style={styles.upgradeText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        )}
        {!payoutAccessAllowed ? (
          <View style={styles.guestLockedCard} testID="profile-guest-evaluation-locked">
            <Feather name="lock" size={22} color={c.primary} />
            <Text style={styles.guestLockedTitle}>$10,000 evaluation locked</Text>
            <Text style={styles.guestLockedBody}>
              Create an account to start your $10,000 evaluation.
            </Text>
            <TouchableOpacity
              style={styles.guestCreateButton}
              onPress={() => void startAccountCreation()}
              testID="profile-guest-create-account"
            >
              <Text style={styles.guestCreateButtonText}>Create an account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
        <View style={styles.walletCard}>
          <View style={styles.walletTop}>
            <View style={styles.walletColumn}>
              <Text style={styles.walletLabel}>DEMO ACCOUNT EQUITY</Text>
              <Text style={styles.walletBalance} testID="profile-demo-equity">
                {evaluation ? formatMoney(evaluation.totalEquity) : "—"}
              </Text>
              <Text style={styles.walletHint}>
                Simulated funds from a {formatMoney(DEMO_STARTING_BALANCE)}{" "}
                evaluation account. Not withdrawable.
              </Text>
            </View>
          </View>
          <View style={styles.walletDivider} />
          <View style={styles.walletTop}>
            <View style={styles.walletColumn}>
              <Text style={styles.walletLabel}>REAL CASHOUT VALUE</Text>
              <Text style={styles.cashBalance} testID="profile-cashout-value">
                {evaluation ? formatMoney(evaluation.cashoutValue) : "—"}
              </Text>
              <Text style={styles.walletHint}>
                {evaluation
                  ? `${evaluation.plan} split ${Math.round(evaluation.profitSplit * 100)}% · ` +
                    `${formatMoney(evaluation.monthlyPaid)} of ${formatMoney(
                      evaluation.monthlyCap,
                    )} monthly cap used`
                  : "Payout locked until your evaluation data loads."}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.payout, !payoutEnabled && styles.payoutDisabled]}
              onPress={handleRequestPayout}
              disabled={!payoutEnabled}
              accessibilityRole="button"
              accessibilityState={{
                disabled: !payoutEnabled,
                busy: requestingPayout,
              }}
              accessibilityLabel={
                payoutEnabled
                  ? `Request payout of ${formatMoney(evaluation?.cashoutValue ?? 0)}`
                  : `Payout unavailable. ${payoutLockReason}`
              }
              testID="profile-request-payout"
            >
              {requestingPayout ? (
                <ActivityIndicator size="small" color={c.primary} />
              ) : (
                <Text
                  style={[
                    styles.payoutText,
                    !payoutEnabled && styles.payoutTextDisabled,
                  ]}
                >
                  Request Payout
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.walletDivider} />
          <View style={styles.walletBottom}>
            <View>
              <Text style={styles.walletLabel}>CASHBACK & REFERRALS</Text>
              <Text style={styles.cashBalance}>
                ${(referralEarned ?? 0).toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                showAlert(
                  "Withdraw",
                  "Referral withdrawals will be available soon.",
                )
              }
            >
              <Text style={styles.withdrawText}>Withdraw →</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.evalCard} testID="profile-evaluation-status">
          <View style={styles.evalHeader}>
            <Text style={styles.walletLabel}>EVALUATION STATUS</Text>
            {evaluationLoading && !evaluation ? (
              <ActivityIndicator size="small" color={c.mutedForeground} />
            ) : (
              <Text
                style={[
                  styles.evalBadge,
                  evaluation?.eligible
                    ? styles.evalBadgePass
                    : styles.evalBadgeLocked,
                ]}
              >
                {evaluation?.eligible ? "PAYOUT UNLOCKED" : "PAYOUT LOCKED"}
              </Text>
            )}
          </View>
          {evaluation ? (
            <>
              <EvalRow
                label="Daily drawdown"
                value={`${formatMoney(evaluation.dailyLoss)} / ${formatMoney(DAILY_DRAWDOWN_LIMIT)}`}
                ok={evaluation.dailyLoss < DAILY_DRAWDOWN_LIMIT}
              />
              <EvalRow
                label="Total drawdown floor"
                value={`${formatMoney(evaluation.totalEquity)} / ${formatMoney(TOTAL_EQUITY_FLOOR)} min`}
                ok={evaluation.totalEquity >= TOTAL_EQUITY_FLOOR}
              />
              <EvalRow
                label="Active trading days"
                value={`${evaluation.activeDays} / ${MINIMUM_ACTIVE_DAYS}`}
                ok={evaluation.activeDays >= MINIMUM_ACTIVE_DAYS}
              />
              {evaluation.violated && (
                <Text
                  style={styles.evalViolation}
                  testID="profile-evaluation-violation"
                >
                  {evaluation.violationReason ??
                    "A drawdown rule was breached. Payouts stay disabled for the rest of this billing cycle."}
                </Text>
              )}
              {!evaluation.eligible &&
                !evaluation.violated &&
                evaluation.lockReason && (
                  <Text style={styles.evalLock}>{evaluation.lockReason}</Text>
                )}
            </>
          ) : (
            <Text
              style={styles.evalLock}
              testID="profile-evaluation-unavailable"
            >
              {evaluationError ??
                "Evaluation data is unavailable, so payouts stay locked until it loads."}
            </Text>
          )}
        </View>
        <View style={styles.payoutHistoryCard} testID="profile-payout-history">
          <View style={styles.evalHeader}>
            <Text style={styles.walletLabel}>PAYOUT HISTORY</Text>
            {historyLoading && (
              <ActivityIndicator size="small" color={c.mutedForeground} />
            )}
          </View>
          {payoutHistory ? (
            payoutHistory.length > 0 ? (
              payoutHistory.map((request) => (
                <PayoutHistoryRow key={request.id} request={request} />
              ))
            ) : (
              <Text
                style={styles.historyEmpty}
                testID="profile-payout-history-empty"
              >
                No payout requests yet. Eligible requests will appear here.
              </Text>
            )
          ) : (
            <Text
              style={styles.evalLock}
              testID="profile-payout-history-unavailable"
            >
              {historyError ??
                "Payout history is unavailable, so no request status can be shown right now."}
            </Text>
          )}
        </View>
          </>
        )}
        {isAdmin && (
          <TouchableOpacity
            style={styles.commandCenterCard}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              router.push("/(admin)" as never);
            }}
            activeOpacity={0.86}
            testID="profile-admin-command-center"
          >
            <View style={styles.commandCenterIcon}>
              <Feather name="shield" size={21} color={c.primary} />
            </View>
            <View style={styles.commandCenterCopy}>
              <Text style={styles.commandCenterTitle}>Admin Command Center</Text>
              <Text style={styles.commandCenterSubtitle}>
                Manage platform insights and waitlist
              </Text>
            </View>
            <Feather name="chevron-right" size={21} color={c.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.partnerCard}
          onPress={() => router.push("/partner-program")}
          activeOpacity={0.86}
          testID="profile-partner-program"
        >
          <View style={styles.partnerIcon}>
            <Feather name="dollar-sign" size={21} color="#FFD700" />
          </View>
          <View style={styles.partnerCopy}>
            <View style={styles.partnerTitleRow}>
              <Text style={styles.partnerTitle}>Partner Program</Text>
              <Text style={styles.partnerBadge}>EARN PASSIVE INCOME</Text>
            </View>
            <Text style={styles.partnerSubtitle}>
              Build your network. Scale your revenue.
            </Text>
          </View>
          <Feather name="chevron-right" size={21} color={c.primary} />
        </TouchableOpacity>
        <View style={styles.metrics}>
          <Metric label="WIN RATE" value="68%" color={c.success} />
          <Metric label="PROFIT FACTOR" value="1.8" />
          <Metric label="TOTAL TRADES" value="142" />
        </View>
        <Banner
          icon="book-open"
          title="TradiQs Academy"
          subtitle="Masterclasses, Guides & Risk Tools"
          onPress={() => setAcademyOpen(true)}
          testID="profile-academy"
        />
        <Banner
          icon="briefcase"
          title="Portfolio & History"
          subtitle="View open positions and trade journal"
          onPress={() => router.push("/portfolio")}
          testID="profile-portfolio"
        />
        <Text style={styles.sectionTitle}>QUICK TOOLS</Text>
        <View style={styles.toolsGrid}>
          <Tool
            icon="cpu"
            label="AutoPilot Bots"
            onPress={() => router.push("/profile/autopilot")}
          />
          <Tool
            icon="link"
            label="BrokerSync"
            onPress={() =>
              router.push({
                pathname: "/paywall",
                params: { defaultTier: "ELITE" },
              })
            }
          />
          <Tool
            icon="gift"
            label="Refer & Earn"
            badge="+$0.50"
            onPress={() => router.push("/refer-and-earn" as never)}
          />
          <Tool
            icon="star"
            label="Manage Plan"
            gold
            onPress={() => router.push("/signals")}
          />
        </View>
        <SettingsGroup title="SECURITY">
          <ListItem icon="lock" label="Biometrics / FaceID" detail={!biometricsAvailable ? "UNAVAILABLE" : biometricsEnabled ? "ON" : "OFF"} onPress={() => void toggleBiometrics()} testID="profile-biometrics" />
          <ListItem icon="shield" label="Two-Factor Auth (2FA)" detail={twoFactorEnabled ? "ENABLED" : "DISABLED"} onPress={() => setTwoFactorOpen(true)} testID="profile-two-factor" />
          <ListItem
            icon="key"
            label="Change Password"
            onPress={() => setActiveModal("password")}
            testID="profile-change-password"
          />
          <ListItem
            icon="trash-2"
            label="Delete Account"
            danger
            onPress={() => setDeleteModalOpen(true)}
            testID="profile-delete-account"
          />
        </SettingsGroup>
        <SettingsGroup title="PREFERENCES">
          <ListItem
            icon="bell"
            label="Notifications"
            onPress={() => router.push("/notification-settings")}
            testID="profile-notifications"
          />
          <ListItem
            icon="sliders"
            label="Chart Settings"
            onPress={() => router.push("/profile/chart-settings")}
            testID="profile-chart-settings"
          />
          <ListItem
            icon="globe"
            label="Language"
            detail={language}
            onPress={() => setActiveModal("language")}
          />
          <ListItem
            icon="clock"
            label="Trading Day Timezone"
            detail={tradingDayTz.replace(/_/g, " ")}
            onPress={() => setTzPickerOpen(true)}
          />
        </SettingsGroup>
        <SettingsGroup title="SUPPORT">
          <ListItem
            icon="help-circle"
            label="Help Center"
            onPress={() => router.push("/profile/help-center")}
            testID="profile-help-center"
          />
          <ListItem
            icon="share-2"
            label="Social Media"
            onPress={() => setSocialOpen(true)}
            testID="profile-social-media"
          />
          <ListItem
            icon="book-open"
            label="App Guide"
            onPress={() => router.push("/profile/app-guide")}
            testID="profile-app-guide"
          />
          <ListItem
            icon="file-text"
            label="Terms & Privacy"
            onPress={() => setActiveModal("terms")}
          />
        </SettingsGroup>
        <TouchableOpacity
          style={styles.community}
          onPress={handleEliteChannelPress}
          testID="profile-elite-channel"
        >
          <Text style={styles.communityText}>
            Join the TradiQs Elite Channel
          </Text>
          <Feather name={isElite ? "send" : "lock"} size={17} color={c.primaryForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.85}
          testID="profile-sign-out"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.version}>TradiQs AI v1.0.0</Text>
          </>
        )}
        <RiskDisclaimer />
      </ScrollView>
      <Modal visible={experienceOpen} transparent animationType="slide" onRequestClose={() => setExperienceOpen(false)}>
        <View style={styles.experienceOverlay}>
          <View style={styles.experienceSheet}>
            <Text style={styles.experienceTitle}>Trading Experience</Text>
            {["Beginner", "Intermediate", "Advanced", "Professional"].map((level) => <TouchableOpacity key={level} style={styles.experienceOption} onPress={() => { if (!userId) return; void supabase.from("profiles").update({ trading_experience: level }).eq("id", userId).then(({ error }) => { if (error) { showAlert("Could not save experience", "Please try again."); return; } setTradingExperience(level); setExperienceOpen(false); }); }}><Text style={styles.experienceOptionText}>{level}</Text></TouchableOpacity>)}
          </View>
        </View>
      </Modal>

      {/* Trading-day timezone picker (restored from settings task) */}
      <TimezonePickerModal
        visible={tzPickerOpen}
        current={tradingDayTz}
        onClose={() => setTzPickerOpen(false)}
        onSelect={(tz) => {
          const ok = setTradingDayTz(tz);
          if (!ok) showAlert("Timezone", `"${tz}" is not a valid timezone.`);
          else setTzPickerOpen(false);
          return ok;
        }}
      />

      <ChangePasswordModal
        visible={activeModal === "password"}
        saving={savingPassword}
        onClose={() => setActiveModal(null)}
        onSubmit={(_, password) => {
          setNewPassword(password);
          void handleSavePassword(password);
        }}
      />
      <DeleteAccountModal
        visible={deleteModalOpen}
        deleting={deleting}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => {
          setDeleteModalOpen(false);
          handleDeleteAccount();
        }}
      />
      <AcademyModal
        visible={academyOpen}
        onClose={() => setAcademyOpen(false)}
      />
      <SocialMediaModal
        visible={socialOpen}
        onClose={() => setSocialOpen(false)}
      />
      <TwoFactorAuthModal
        visible={twoFactorOpen}
        onClose={() => setTwoFactorOpen(false)}
        onStatusChange={setTwoFactorEnabled}
        onVerified={handleMfaVerified}
      />

      {/* Language */}
      <SheetModal
        visible={activeModal === "language"}
        title="Language"
        onClose={() => setActiveModal(null)}
      >
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang}
            style={styles.languageRow}
            onPress={() => selectLanguage(lang)}
            activeOpacity={0.8}
            testID={`language-${lang.toLowerCase()}`}
          >
            <Text
              style={[
                styles.languageLabel,
                language === lang && styles.languageLabelActive,
              ]}
            >
              {lang}
            </Text>
            {language === lang && (
              <Feather name="check" size={18} color="#00F0FF" />
            )}
          </TouchableOpacity>
        ))}
      </SheetModal>

      {/* Partner Program */}
      <SheetModal
        visible={activeModal === "partner"}
        title={partnerTopic}
        onClose={() => setActiveModal(null)}
      >
        <Text style={styles.partnerBody}>
          {PARTNER_PROGRAM_COPY[partnerTopic]}
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setActiveModal(null)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Got It</Text>
        </TouchableOpacity>
      </SheetModal>

      {/* Legal documents */}
      <SheetModal
        visible={activeModal === "terms" || activeModal === "privacy"}
        title={
          activeModal === "terms" ? "Terms and Conditions" : "Privacy Policy"
        }
        onClose={() => setActiveModal(null)}
        scroll
      >
        <Text style={styles.legalBody}>
          {activeModal === "terms" ? TERMS_AND_CONDITIONS : PRIVACY_POLICY}
        </Text>
      </SheetModal>
    </View>
  );
}

const c = colors.light;

function Metric({
  label,
  value,
  color = c.foreground,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function EvalRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <View
      style={styles.evalRow}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}. ${ok ? "Requirement met" : "Requirement not met"}`}
    >
      <View style={styles.evalRowLeft}>
        <Feather
          name={ok ? "check-circle" : "alert-circle"}
          size={13}
          color={ok ? c.success : c.destructive}
        />
        <Text style={styles.evalRowLabel}>{label}</Text>
      </View>
      <Text
        style={[styles.evalRowValue, { color: ok ? c.success : c.destructive }]}
      >
        {value}
      </Text>
    </View>
  );
}

const PAYOUT_STATUS: Record<
  PayoutRequest["status"],
  { label: string; color: string; icon: IconName }
> = {
  REQUESTED: { label: "Pending", color: "#E6C65C", icon: "clock" },
  APPROVED: { label: "Approved", color: c.primary, icon: "check-circle" },
  PAID: { label: "Paid", color: c.success, icon: "check-circle" },
  REJECTED: { label: "Rejected", color: c.destructive, icon: "x-circle" },
};

function PayoutHistoryRow({ request }: { request: PayoutRequest }) {
  const status = PAYOUT_STATUS[request.status];
  const date = new Date(request.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <View
      style={styles.historyRow}
      accessibilityRole="text"
      accessibilityLabel={`Payout request for ${formatMoney(request.amount)} on ${date}: ${status.label}`}
    >
      <View>
        <Text style={styles.historyAmount}>{formatMoney(request.amount)}</Text>
        <Text style={styles.historyDate}>{date}</Text>
      </View>
      <View style={[styles.historyStatus, { borderColor: status.color }]}>
        <Feather name={status.icon} size={12} color={status.color} />
        <Text style={[styles.historyStatusText, { color: status.color }]}>
          {status.label}
        </Text>
      </View>
    </View>
  );
}

function Banner({
  icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} testID={testID}>
      <View style={styles.bannerIcon}>
        <Feather name={icon} size={22} color={c.primary} />
      </View>
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerSubtitle}>{subtitle}</Text>
      </View>
      <Feather name="arrow-up-right" size={18} color={c.primary} />
    </TouchableOpacity>
  );
}

function Tool({
  icon,
  label,
  badge,
  gold,
  onPress,
}: {
  icon: IconName;
  label: string;
  badge?: string;
  gold?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tool} onPress={onPress}>
      <View style={[styles.toolIcon, gold && styles.goldIcon]}>
        <Feather name={icon} size={19} color={gold ? "#E6C65C" : c.primary} />
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
      {badge && <Text style={styles.toolBadge}>{badge}</Text>}
    </TouchableOpacity>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingsGroup}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  experienceCard: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, marginHorizontal: 20, marginBottom: 16, padding: 14 },
  experienceLabel: { color: c.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  experienceValue: { color: c.foreground, fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 5 },
  experienceOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.6)", justifyContent: "flex-end" },
  experienceSheet: { backgroundColor: c.card, padding: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  experienceTitle: { color: c.foreground, fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 12 },
  experienceOption: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border },
  experienceOptionText: { color: c.foreground, fontSize: 16, fontFamily: "Inter_500Medium" },
  container: {
    flex: 1,
    backgroundColor: "#0A0B0E",
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  identityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 18,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  verified: { color: c.success, fontSize: 10, fontFamily: "Inter_700Bold" },
  walletCard: {
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  walletTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 14,
  },
  walletLabel: {
    color: c.mutedForeground,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: "Inter_700Bold",
  },
  walletBalance: {
    color: c.foreground,
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginTop: 5,
  },
  cashBalance: {
    color: c.success,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 5,
  },
  walletColumn: { flex: 1, paddingRight: 12 },
  walletHint: {
    color: c.mutedForeground,
    fontSize: 10,
    marginTop: 6,
    lineHeight: 14,
  },
  payout: {
    borderColor: c.primary,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 7,
    minWidth: 104,
    alignItems: "center",
  },
  payoutDisabled: { borderColor: c.border, opacity: 0.55 },
  payoutText: { color: c.primary, fontSize: 10, fontFamily: "Inter_700Bold" },
  payoutTextDisabled: { color: c.mutedForeground },
  evalCard: {
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  evalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  evalBadge: {
    fontSize: 9,
    letterSpacing: 0.8,
    fontFamily: "Inter_700Bold",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  evalBadgePass: { color: c.success, borderColor: c.success },
  evalBadgeLocked: { color: c.mutedForeground, borderColor: c.border },
  evalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  evalRowLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  evalRowLabel: { color: c.foreground, fontSize: 12 },
  evalRowValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
  evalViolation: {
    color: c.destructive,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  evalLock: {
    color: c.mutedForeground,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  payoutHistoryCard: {
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopColor: c.border,
    borderTopWidth: 1,
  },
  historyAmount: {
    color: c.foreground,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  historyDate: { color: c.mutedForeground, fontSize: 10, marginTop: 3 },
  historyStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  historyStatusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  historyEmpty: { color: c.mutedForeground, fontSize: 11, lineHeight: 16 },
  withdrawText: { color: c.primary, fontSize: 11, fontFamily: "Inter_700Bold" },
  walletDivider: { height: 1, backgroundColor: c.border, marginTop: 16 },
  profileSkeleton: { gap: 16 },
  skeletonIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 8,
  },
  skeletonAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1A1D23",
    borderColor: "#283038",
    borderWidth: 1,
  },
  skeletonIdentityCopy: { flex: 1, gap: 9 },
  skeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: "#20242B",
  },
  skeletonName: { width: "48%", height: 15 },
  skeletonEmail: { width: "70%" },
  skeletonBadge: { width: 82, height: 18, backgroundColor: "#12343A" },
  skeletonWallet: {
    minHeight: 176,
    borderRadius: 16,
    padding: 18,
    backgroundColor: "#111419",
    borderColor: "#242A31",
    borderWidth: 1,
  },
  skeletonLabel: { width: 94 },
  skeletonBalance: { width: "55%", height: 30, marginTop: 16 },
  skeletonDivider: {
    height: 1,
    backgroundColor: "#242A31",
    marginVertical: 22,
  },
  skeletonStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  skeletonStat: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#1A1D23",
  },
  skeletonCard: {
    height: 76,
    borderRadius: 14,
    backgroundColor: "#111419",
    borderColor: "#242A31",
    borderWidth: 1,
  },
  skeletonSpinner: { marginTop: 4 },
  commandCenterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.card,
    borderColor: "rgba(0, 240, 255, 0.5)",
    borderWidth: 1,
    borderRadius: 13,
    padding: 14,
    marginBottom: 12,
  },
  commandCenterIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#0C2226",
    borderColor: "rgba(0, 240, 255, 0.5)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  commandCenterCopy: { flex: 1 },
  commandCenterTitle: {
    color: c.foreground,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  commandCenterSubtitle: {
    color: c.mutedForeground,
    fontSize: 10,
    marginTop: 5,
  },
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.card,
    borderColor: "#8B7125",
    borderWidth: 1,
    borderRadius: 13,
    padding: 14,
    marginBottom: 18,
  },
  partnerIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#2A2410",
    borderColor: "#FFD700",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerCopy: { flex: 1 },
  partnerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  partnerTitle: {
    color: c.foreground,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  partnerBadge: {
    color: "#FFD700",
    backgroundColor: "#2A2410",
    borderColor: "#8B7125",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 8,
    letterSpacing: 0.5,
    fontFamily: "Inter_700Bold",
  },
  partnerSubtitle: { color: c.mutedForeground, fontSize: 10, marginTop: 5 },
  metrics: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 18,
  },
  metric: { alignItems: "center", gap: 4 },
  metricLabel: {
    color: c.mutedForeground,
    fontSize: 8,
    letterSpacing: 0.8,
    fontFamily: "Inter_700Bold",
  },
  metricValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  bannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerCopy: { flex: 1 },
  bannerTitle: {
    color: c.foreground,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  bannerSubtitle: { color: c.mutedForeground, fontSize: 11, marginTop: 4 },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  tool: {
    width: "48%",
    minHeight: 96,
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 11,
    padding: 12,
    justifyContent: "space-between",
  },
  toolIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
  },
  goldIcon: { borderColor: "#80691F", borderWidth: 1 },
  toolLabel: {
    color: c.foreground,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  toolBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    color: c.success,
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  settingsGroup: { marginBottom: 18 },
  community: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 9,
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginTop: 2,
  },
  communityText: {
    color: c.primaryForeground,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  version: {
    color: "#3E4249",
    fontSize: 9,
    textAlign: "center",
    marginTop: 22,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "#22252A",
    borderRadius: colors.radius,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0A0B0E",
    borderWidth: 1.5,
    borderColor: "#00F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#00F0FF",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  userInfo: {
    flex: 1,
    gap: 3,
  },
  username: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  email: {
    color: "#8A8D93",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  planBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#0A0B0E",
    borderWidth: 1,
    borderColor: "#B026FF",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  planText: {
    color: "#B026FF",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  upgradeButton: {
    flexDirection: "row",
    gap: 8,
    height: 50,
    borderRadius: colors.radius,
    backgroundColor: "#00F0FF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  upgradeText: {
    color: "#0A0B0E",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  guestLockedCard: {
    alignItems: "center",
    backgroundColor: "#16181D",
    borderColor: "#B026FF",
    borderRadius: colors.radius,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 22,
  },
  guestLockedTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  guestLockedBody: {
    color: "#C7C9CE",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  guestCreateButton: {
    alignItems: "center",
    backgroundColor: c.primary,
    borderRadius: 8,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  guestCreateButtonText: {
    color: c.primaryForeground,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: "#8A8D93",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "#22252A",
    borderRadius: colors.radius,
    overflow: "hidden",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#22252A",
  },
  listItemLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14.5,
    fontFamily: "Inter_500Medium",
  },
  dangerLabel: {
    color: "#FF5252",
  },
  listItemDetail: {
    color: "#8A8D93",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  referralBlock: {
    padding: 16,
    gap: 4,
  },
  referralLabel: {
    color: "#8A8D93",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  referralLink: {
    color: "#00F0FF",
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  referralCount: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  referralEarned: {
    color: "#22C55E",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  referralRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#00F0FF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  shareButtonText: {
    color: "#0A0B0E",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  signOutButton: {
    height: 54,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: "#E54B4B",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 32,
  },
  signOutText: {
    color: "#E54B4B",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0A0B0E",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#22252A",
    paddingBottom: 24,
  },
  modalCardTall: {
    height: "85%",
    paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#22252A",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  modalScroll: {
    paddingHorizontal: 18,
  },
  modalBody: {
    padding: 18,
    gap: 12,
  },
  legalBody: {
    color: "#C7C9CE",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    paddingVertical: 16,
  },
  fieldLabel: {
    color: "#8A8D93",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  input: {
    height: 50,
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "#22252A",
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  primaryButton: {
    height: 50,
    borderRadius: colors.radius,
    backgroundColor: "#00F0FF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#0A0B0E",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  disabled: {
    opacity: 0.7,
  },
  languageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "#22252A",
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    height: 54,
  },
  languageLabel: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontFamily: "Inter_500Medium",
  },
  languageLabelActive: {
    color: "#00F0FF",
    fontFamily: "Inter_700Bold",
  },
  partnerBody: {
    color: "#C7C9CE",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
});
