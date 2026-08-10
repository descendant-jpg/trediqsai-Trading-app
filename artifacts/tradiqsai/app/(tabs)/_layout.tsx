import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import colors from '@/constants/colors';

const c = colors.light;
const isWeb = Platform.OS === 'web';

/** Distinct button for AI Tools: larger icon in a cyan-ringed pod. */
function AiToolsIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View
      style={[
        styles.centerPod,
        focused && styles.centerPodFocused,
      ]}
    >
      <Feather name="cpu" size={26} color={focused ? '#0A0B0E' : '#00F0FF'} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00F0FF',
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: {
          backgroundColor: '#0A0B0E',
          borderTopWidth: 1,
          borderTopColor: c.border,
          elevation: 0,
          // Respect Android/iOS system nav areas so the bar never overlaps.
          height: (isWeb ? 84 : 64) + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Feather name="activity" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="signals"
        options={{
          title: 'Signals',
          tabBarIcon: ({ color }) => (
            <Feather name="zap" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-tools"
        options={{
          title: 'AI Tools',
          tabBarIcon: ({ color, focused }) => (
            <AiToolsIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color }) => (
            <Feather name="briefcase" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={22} color={color} />
          ),
        }}
      />
      {/* Leaderboard stays routable (linked from elsewhere) but off the bar. */}
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerPod: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#00F0FF',
    backgroundColor: '#16181D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPodFocused: {
    backgroundColor: '#00F0FF',
  },
});
