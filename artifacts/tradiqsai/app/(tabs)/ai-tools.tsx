import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';

type Tool = {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description: string;
  route?: string;
  comingSoon?: boolean;
};

const TOOLS: Tool[] = [
  {
    icon: 'zap',
    title: 'AI Signals',
    description: 'Machine-generated trade setups with targets and confidence.',
    route: '/signals',
  },
  {
    icon: 'award',
    title: 'Leaderboard',
    description: 'Weekly sweepstakes and the top simulated traders.',
    route: '/leaderboard',
  },
  {
    icon: 'trending-up',
    title: 'AI Market Scanner',
    description: 'Scans momentum and volatility across markets in real time.',
    comingSoon: true,
  },
  {
    icon: 'shield',
    title: 'Risk Analyzer',
    description: 'AI review of your drawdown, sizing, and trade discipline.',
    comingSoon: true,
  },
  {
    icon: 'message-square',
    title: 'Trade Copilot',
    description: 'Chat with an AI about setups before you pull the trigger.',
    comingSoon: true,
  },
];

/** AI Tools — the hub behind the center tab button. */
export default function AiToolsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>AI Tools</Text>
        <Text style={styles.subtitle}>
          Your edge on the floor — powered by TradiQs AI.
        </Text>

        <View style={styles.list}>
          {TOOLS.map((tool) => (
            <TouchableOpacity
              key={tool.title}
              style={styles.card}
              activeOpacity={tool.comingSoon ? 1 : 0.85}
              disabled={tool.comingSoon}
              onPress={() => tool.route && router.push(tool.route as any)}
              testID={`tool-${tool.title}`}
            >
              <View style={styles.iconWrap}>
                <Feather name={tool.icon} size={20} color="#00F0FF" />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{tool.title}</Text>
                  {tool.comingSoon && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>SOON</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardDescription}>{tool.description}</Text>
              </View>
              {!tool.comingSoon && (
                <Feather name="chevron-right" size={18} color="#8A8D93" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  subtitle: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  list: {
    marginTop: 20,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    padding: 16,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0A0B0E',
    borderWidth: 1,
    borderColor: '#22252A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  badge: {
    backgroundColor: '#0A0B0E',
    borderWidth: 1,
    borderColor: '#B026FF',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#B026FF',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  cardDescription: {
    color: '#8A8D93',
    fontSize: 12.5,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
});
