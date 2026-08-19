import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchAdminMetrics,
  type AdminMetrics,
} from '@/services/adminService';

const CYAN = '#00F0FF';

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

export default function MobileCmsDashboard() {
  const router = useRouter();
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
      const nextDashboard = await fetchAdminMetrics();
      if (requestGeneration.current !== generation) return;
      setDashboard(nextDashboard);
    } catch (error) {
      if (requestGeneration.current !== generation) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'CMS data is unavailable right now.',
      );
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

  const showWebCmsMessage = (action: string) => {
    Alert.alert(
      `${action} is coming to mobile`,
      'This workflow remains available in the web Command Center.',
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Back to Profile"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
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
            <Text accessibilityRole="alert" style={styles.errorText}>
              {errorMessage}
            </Text>
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
            onPress={() => router.push('/admin/insights')}
          />
          <QuickAction
            icon="user-check"
            label="View Waitlist"
            onPress={() => router.push('/admin/waitlist')}
          />
          <QuickAction
            icon="life-buoy"
            label="Check Help Desk"
            onPress={() => showWebCmsMessage('Help Desk')}
          />
          <QuickAction
            icon="radio"
            label="Broadcast Signal"
            onPress={() => showWebCmsMessage('Signal broadcasting')}
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
                onPress={() => router.push('/admin/insights')}
              >
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        </ScrollView>
      </View>
    </SafeAreaView>
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
  errorText: {
    color: '#FFCECE',
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
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