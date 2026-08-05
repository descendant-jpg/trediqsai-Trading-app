import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { PaywallCard } from '@/components/paywall';
import colors from '@/constants/colors';
import { useSubscription } from '@/lib/revenuecat';

const c = colors.light;

const CYAN = '#00F0FF';
const GOLD = '#F5C542';

type IconName = React.ComponentProps<typeof Feather>['name'];

interface Masterclass {
  id: string;
  title: string;
  duration: string;
  proOnly: boolean;
}

const MASTERCLASSES: Masterclass[] = [
  { id: 'order-blocks', title: 'Institutional Order Blocks', duration: '1h 45m', proOnly: false },
  { id: 'risk-101', title: 'Risk Management 101', duration: '58m', proOnly: true },
  { id: 'autopilot', title: 'Mastering the AI AutoPilot', duration: '1h 12m', proOnly: true },
];

interface Guide {
  id: string;
  title: string;
  icon: IconName;
  color: string;
  readTime: string;
}

const GUIDES: Guide[] = [
  { id: 'lot-sizes', title: 'How to Calculate Lot Sizes', icon: 'book', color: CYAN, readTime: '5 min read' },
  { id: 'market-structure', title: 'Understanding Market Structure', icon: 'bar-chart-2', color: '#2ECA8B', readTime: '8 min read' },
  { id: 'psychology', title: 'Trading Psychology', icon: 'zap', color: '#B026FF', readTime: '6 min read' },
  { id: 'risk-reward', title: 'Risk-to-Reward Ratios Explained', icon: 'trending-up', color: GOLD, readTime: '4 min read' },
];

const TOOLS: { id: string; title: string; icon: IconName }[] = [
  { id: 'lot-calc', title: 'Lot Size Calculator', icon: 'divide-square' },
  { id: 'pnl-sim', title: 'Profit / Loss Simulator', icon: 'sliders' },
];

/** Learning — the TradiQs Academy tab: masterclasses, guides, and tools. */
export default function LearningScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const { isSubscribed } = useSubscription();

  const [searchQuery, setSearchQuery] = useState('');
  const [paywallOpen, setPaywallOpen] = useState(false);

  const query = searchQuery.trim().toLowerCase();
  const filteredMasterclasses = useMemo(
    () => MASTERCLASSES.filter((m) => m.title.toLowerCase().includes(query)),
    [query],
  );
  const filteredGuides = useMemo(
    () => GUIDES.filter((g) => g.title.toLowerCase().includes(query)),
    [query],
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header + search */}
        <Text style={styles.title}>TradiQs Academy</Text>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={c.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search strategies, indicators, basics..."
            placeholderTextColor={c.mutedForeground}
            testID="academy-search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="academy-search-clear"
            >
              <Feather name="x" size={16} color={c.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Section 1 — Video masterclasses */}
        {filteredMasterclasses.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Premium Video Masterclasses</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.masterclassRow}
              style={styles.masterclassScroll}
            >
              {filteredMasterclasses.map((mc) => {
                const locked = mc.proOnly && !isSubscribed;
                return (
                  <TouchableOpacity
                    key={mc.id}
                    style={styles.masterclassCard}
                    activeOpacity={0.85}
                    onPress={locked ? () => setPaywallOpen(true) : undefined}
                    testID={`masterclass-${mc.id}`}
                  >
                    {/* Simulated video thumbnail */}
                    <View style={styles.thumbFill}>
                      <View style={styles.playButton}>
                        <Feather name="play" size={22} color={CYAN} />
                      </View>
                    </View>

                    <View style={styles.masterclassOverlay}>
                      <Text style={styles.masterclassTitle} numberOfLines={1}>
                        {mc.title}
                      </Text>
                      <View style={styles.durationRow}>
                        <Feather name="clock" size={11} color={c.mutedForeground} />
                        <Text style={styles.durationText}>{mc.duration}</Text>
                      </View>
                    </View>

                    {locked && (
                      <View style={styles.lockOverlay}>
                        <BlurView
                          intensity={Platform.OS === 'web' ? 26 : 20}
                          tint="dark"
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.proBadge}>
                          <Text style={styles.proBadgeText}>Pro</Text>
                        </View>
                        <Feather name="lock" size={22} color={GOLD} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Section 2 — Reading guides */}
        {filteredGuides.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Essential Trading Guides</Text>
            <View style={styles.guideList}>
              {GUIDES.filter((g) => filteredGuides.includes(g)).map((guide) => (
                <TouchableOpacity
                  key={guide.id}
                  style={styles.guideCard}
                  activeOpacity={0.8}
                  testID={`guide-${guide.id}`}
                >
                  <View style={[styles.guideIcon, { backgroundColor: `${guide.color}1F` }]}>
                    <Feather name={guide.icon} size={16} color={guide.color} />
                  </View>
                  <Text style={styles.guideTitle}>{guide.title}</Text>
                  <Text style={styles.readTime}>{guide.readTime}</Text>
                  <Feather name="chevron-right" size={16} color={c.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {filteredMasterclasses.length === 0 && filteredGuides.length === 0 && (
          <View style={styles.emptyState} testID="academy-empty">
            <Feather name="search" size={22} color={c.mutedForeground} />
            <Text style={styles.emptyText}>No lessons match "{searchQuery.trim()}"</Text>
          </View>
        )}

        {/* Section 3 — Trader's toolkit */}
        <Text style={styles.sectionTitle}>Trader's Toolkit</Text>
        <View style={styles.toolGrid}>
          {TOOLS.map((tool) => (
            <TouchableOpacity
              key={tool.id}
              style={styles.toolCard}
              activeOpacity={0.85}
              testID={`tool-${tool.id}`}
            >
              <View style={styles.toolIcon}>
                <Feather name={tool.icon} size={22} color={CYAN} />
              </View>
              <Text style={styles.toolTitle}>{tool.title}</Text>
              <Text style={styles.toolHint}>Coming soon</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Paywall */}
      <Modal
        visible={paywallOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPaywallOpen(false)}
      >
        <View style={styles.paywallBackdrop}>
          <View style={styles.paywallSheet}>
            <TouchableOpacity
              style={styles.paywallClose}
              onPress={() => setPaywallOpen(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="paywall-close"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <PaywallCard />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginTop: 12,
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 0,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    marginTop: 26,
    marginBottom: 12,
  },
  masterclassScroll: {
    marginHorizontal: -16,
  },
  masterclassRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  masterclassCard: {
    width: 280,
    height: 160,
    borderRadius: colors.radius,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    overflow: 'hidden',
  },
  thumbFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: CYAN,
    backgroundColor: 'rgba(0,240,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  masterclassOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(5,6,8,0.82)',
    gap: 3,
  },
  masterclassTitle: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter_700Bold',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  durationText: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(245,197,66,0.12)',
  },
  proBadgeText: {
    color: GOLD,
    fontSize: 10.5,
    fontFamily: 'Inter_700Bold',
  },
  guideList: {
    gap: 10,
  },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  guideIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter_600SemiBold',
  },
  readTime: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  emptyText: {
    color: c.mutedForeground,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  toolGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  toolCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 14,
  },
  toolIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.35)',
    backgroundColor: 'rgba(0,240,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  toolHint: {
    color: c.mutedForeground,
    fontSize: 10.5,
    fontFamily: 'Inter_500Medium',
  },
  paywallBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  paywallSheet: {
    gap: 10,
  },
  paywallClose: {
    alignSelf: 'flex-end',
  },
});
