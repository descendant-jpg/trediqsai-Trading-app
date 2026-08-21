import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

/**
 * Non-blocking client gate for the CMS route. Entry is decided solely from
 * the in-memory auth state — no network call (and therefore no timeout) may
 * hold or bounce navigation. Role verification happens asynchronously inside
 * the dashboard view, and every privileged read remains enforced server-side
 * (401/403), so a slow network can never eject an administrator.
 */
export default function AdminRouteLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#00F0FF" />
      </View>
    );
  }

  if (!session) return <Redirect href="/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#0A0B0E' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
        contentStyle: { backgroundColor: '#0A0B0E' },
        headerBackTitle: 'Admin',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'TradiQs CMS', headerBackVisible: false }} />
      <Stack.Screen name="admin/index" options={{ title: 'Command Center', headerBackVisible: false }} />
      <Stack.Screen name="admin/insights" options={{ title: 'Market Insights' }} />
      <Stack.Screen name="admin/waitlist" options={{ title: 'Waitlist & Leads' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0B0E',
  },
});