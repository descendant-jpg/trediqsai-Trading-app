import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@workspace/api-client-react';
import { supabase } from '@/utils/supabase';
import {
  fetchAdminMetrics,
  type AdminMetrics,
} from '@/services/adminService';

const CYAN = '#00F0FF';

// Emulator and tunnelled preview environments can be slow; 15s is generous
// without letting a dead network spin the dashboard forever.
const CMS_TIMEOUT_MS = 15_000;

class CmsTimeoutError extends Error {
  readonly name = 'CmsTimeoutError';
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CmsTimeoutError(`${label} exceeded ${ms}ms timeout`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type StatCard = {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Feather>['name'];
};

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? 'Date unavailable'
    : new Date(timestamp).toLocaleDateString();
}

function dashboardErrorMessage(error: unknown): string {
  if (error instanceof CmsTimeoutError) {
    return 'Connection timed out. The server did not respond in time — check your connection and retry.';
  }
  if (!(error instanceof ApiError)) {
    const detail = error instanceof Error ? error.message : String(error);
    return `CMS request failed before reaching the server (network/transport). ${detail}`;
  }
  // Surface the exact failure so administrators can see whether the request
  // was unauthorized (401), forbidden (403), misrouted (404), or a server
  // fault (5xx) instead of guessing behind a generic message.
  const diagnostic = `HTTP ${error.status} · ${error.method} ${error.url}`;
  if (error.status === 401) {
    return `Session rejected by the server. Sign in again to reload the CMS. [${diagnostic}]`;
  }
  if (error.status === 403) {
    return `This account was authenticated but lacks the CMS admin role. [${diagnostic}]`;
  }
  if (error.status === 404) {
    return `CMS endpoint not found on the server — client/server route mismatch. [${diagnostic}]`;
  }
  if (error.status >= 500) {
    return `CMS server fault — dashboard data could not be loaded. [${diagnostic}]`;
  }
  return `CMS data is unavailable. Pull down to try again. [${diagnostic}]`;
}

/**
 * Never trust a cached JWT for privileged reads. Supabase's getSession()
 * serves the token from local storage without verifying it, so force a
 * refresh before hitting the CMS API. Returns the live user, or null when
 * the session cannot be refreshed.
 */
async function refreshCmsSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    console.warn('[CMS] Session refresh failed:', error?.message ?? 'no session');
    return null;
  }
  const user = data.session.user;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  console.log(
    `[CMS] Session refreshed for ${user.email ?? user.id} — profiles.role =`,
    profile?.role ?? '(none)',
    profileError ? `(profile lookup error: ${profileError.message})` : '',
  );
  return user;
}

export default function MobileCmsDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dashboard, setDashboard] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async (fromPullToRefresh = false) => {
    const generation = ++requestGeneration.current;
    if (fromPullToRefresh) {
      setRefreshing(true);
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
          () => undefined,
        );
      }
    } else {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
      // A hung session refresh must not block the dashboard: customFetch
      // still attaches the cached token and refreshes once on 401.
      await withTimeout(
        refreshCmsSession(),
        CMS_TIMEOUT_MS,
        'session refresh',
      ).catch((refreshError) => {
        console.warn('[CMS] Session refresh did not complete:', refreshError);
      });
      const nextDashboard = await withTimeout(
        fetchAdminMetrics(),
        CMS_TIMEOUT_MS,
        'dashboard fetch',
      );
      if (requestGeneration.current !== generation) return;
      setDashboard(nextDashboard);
    } catch (error) {
      if (requestGeneration.current !== generation) return;
      if (error instanceof ApiError) {
        console.error(
          `[CMS] Dashboard fetch failed: HTTP ${error.status} ${error.method} ${error.url}`,
          error.data ?? '',
        );
      } else {
        console.error('[CMS] Dashboard fetch failed:', error);
      }
      setErrorMessage(dashboardErrorMessage(error));
    } finally {
      if (requestGeneration.current === generation) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      requestGeneration.current += 1;
    };
  }, [refresh]);

  const stats: StatCard[] = [
    {
      label: 'Total Waitlist Signups',
      value: dashboard?.waitlistCount ?? 0,
      icon: 'user-plus',
    },
    {
      label: 'Active Pro / Elite Subscribers',
      value: dashboard?.subscriberCount ?? 0,
      icon: 'users',
    },
    {
      label: 'Published Market Insights',
      value: dashboard?.insightsCount ?? 0,
      icon: 'file-text',
    },
    {
      label: 'Open Support Tickets',
      value: dashboard?.supportTicketCount ?? 0,
      icon: 'help-circle',
    },
  ];

  const navigateWithHaptic = (route: Parameters<typeof router.push>[0]) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
    router.push(route);
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Back to Profile"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.navigate('/(tabs)/profile')}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={22} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>TradiQs CMS</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh(true)}
              tintColor={CYAN}
              colors={[CYAN]}
              progressBackgroundColor="#16181D"
            />
          }
          showsVerticalScrollIndicator={false}
        >
        <Text style={styles.eyebrow}>COMMAND CENTER</Text>
        <Text style={styles.title}>TradiQs CMS</Text>
        <Text style={styles.subtitle}>
          Live operational intelligence for your trading workspace.
        </Text>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={17} color="#FFB4B4" />
            <View style={styles.errorBody}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {errorMessage}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry loading the CMS dashboard"
                onPress={() => void refresh()}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Tap to Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.statGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <View style={styles.statIcon}>
                <Feather name={stat.icon} size={18} color={CYAN} />
              </View>
              <Text style={styles.statLabel}>{stat.label}</Text>
              {loading && !dashboard ? (
                <ActivityIndicator
                  size="small"
                  color={CYAN}
                  style={styles.statLoader}
                />
              ) : (
                <Text style={styles.statValue}>
                  {dashboard ? stat.value.toLocaleString() : '—'}
                </Text>
              )}
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.quickActions}>
          <QuickAction
            icon="edit-3"
            label="Write New Post"
            onPress={() => navigateWithHaptic('/(admin)/write-post')}
          />
          <QuickAction
            icon="user-check"
            label="View Waitlist"
            onPress={() => navigateWithHaptic('/(admin)/waitlist')}
          />
          <QuickAction
            icon="life-buoy"
            label="Check Help Desk"
            onPress={() => navigateWithHaptic('/(admin)/help-desk')}
          />
          <QuickAction
            icon="radio"
            label="Broadcast Signal"
            onPress={() => navigateWithHaptic('/(admin)/broadcast')}
          />
        </View>

        <View style={styles.recentHeader}>
          <Text style={styles.sectionLabel}>RECENT POSTS</Text>
          {loading && !dashboard ? (
            <ActivityIndicator size="small" color={CYAN} />
          ) : null}
        </View>
        <View style={styles.recentCard}>
          {!loading &&
          dashboard?.recentPosts.length === 0 &&
          !errorMessage ? (
            <Text style={styles.emptyText}>
              No market insights have been published yet.
            </Text>
          ) : null}
          {(dashboard?.recentPosts ?? []).map((post, index) => (
            <View
              key={post.id}
              style={[styles.postRow, index > 0 && styles.postRowBorder]}
            >
              <View style={styles.postCopy}>
                <Text numberOfLines={2} style={styles.postTitle}>
                  {post.title}
                </Text>
                <Text style={styles.postDate}>
                  {formatDate(post.created_at)}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Edit ${post.title}`}
                onPress={() =>
                  navigateWithHaptic({
                    pathname: '/(admin)/edit-post/[id]',
                    params: { id: String(post.id) },
                  })
                }
              >
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        </ScrollView>
      </View>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.82}
      onPress={onPress}
      style={styles.quickAction}
    >
      <View style={styles.quickActionIcon}>
        <Feather name={icon} size={18} color={CYAN} />
      </View>
      <Text style={styles.quickActionText}>{label}</Text>
      <Feather name="chevron-right" size={18} color="#8A8D93" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#0A0B0E',
    flex: 1,
  },
  screen: { backgroundColor: '#0A0B0E', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: '#0A0B0E',
    borderBottomColor: '#22252A',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
    minWidth: 84,
  },
  backText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    marginLeft: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  headerSpacer: { minWidth: 84 },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: {
    color: CYAN,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 2,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 29,
    marginTop: 8,
  },
  subtitle: {
    color: '#8A8D93',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  errorBanner: {
    alignItems: 'flex-start',
    backgroundColor: '#321B20',
    borderColor: '#7A343F',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    padding: 12,
  },
  errorBody: {
    flex: 1,
    gap: 10,
  },
  errorText: {
    color: '#FFCECE',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#7A343F',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 24,
  },
  statCard: {
    backgroundColor: '#16181D',
    borderColor: '#00F0FF4D',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 158,
    padding: 15,
    width: '48%',
  },
  statIcon: {
    alignItems: 'center',
    backgroundColor: '#00F0FF1A',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  statLabel: {
    color: '#8A8D93',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.4,
    lineHeight: 14,
    marginTop: 17,
  },
  statValue: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 27,
    marginTop: 7,
  },
  statLoader: { alignSelf: 'flex-start', marginTop: 14 },
  sectionLabel: {
    color: '#8A8D93',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 27,
  },
  quickActions: { gap: 10, marginTop: 11 },
  quickAction: {
    alignItems: 'center',
    backgroundColor: '#16181D',
    borderColor: '#22252A',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  quickActionIcon: {
    alignItems: 'center',
    backgroundColor: '#00F0FF14',
    borderRadius: 9,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  quickActionText: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    marginLeft: 12,
  },
  recentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recentCard: {
    backgroundColor: '#16181D',
    borderColor: '#22252A',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 11,
    overflow: 'hidden',
  },
  emptyText: {
    color: '#8A8D93',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    padding: 18,
  },
  postRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  postRowBorder: { borderColor: '#22252A', borderTopWidth: 1 },
  postCopy: { flex: 1 },
  postTitle: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  postDate: {
    color: '#8A8D93',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 4,
  },
  editText: {
    color: CYAN,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
});