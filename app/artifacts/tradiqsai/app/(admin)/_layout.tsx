import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/lib/revenuecat';

/**
 * Client navigation gate for the CMS route. The API still authorizes every
 * privileged request, while this gate prevents ordinary traders from mounting
 * a dashboard that can only end in a confusing 403 screen.
 */
export default function AdminRouteLayout() {
  const { session, loading } = useAuth();
  const { isAdmin, isAdminLoading } = useSubscription();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#00F0FF" />
      </View>
    );
  }

  if (!session) return <Redirect href={'/(auth)/login' as never} />;

  if (isAdminLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#00F0FF" />
      </View>
    );
  }

  if (!isAdmin) return <Redirect href={'/(tabs)/index' as never} />;

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