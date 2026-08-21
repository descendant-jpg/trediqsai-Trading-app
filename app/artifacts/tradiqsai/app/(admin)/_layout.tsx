import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { supabase } from '@/utils/supabase';

const MASTER_EMAIL = 'nextgensynthex@gmail.com';
const ADMIN_ROLES = new Set(['admin', 'god_admin']);

export default function AdminRouteLayout() {
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>(
    'checking',
  );

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError || !session?.user) {
          throw sessionError ?? new Error('No session');
        }

        const email = session.user.email?.trim().toLowerCase() ?? '';
        if (email === MASTER_EMAIL) {
          if (active) setAccess('allowed');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        const role =
          typeof profile?.role === 'string'
            ? profile.role.trim().toLowerCase()
            : '';
        if (active) setAccess(ADMIN_ROLES.has(role) ? 'allowed' : 'denied');
      } catch {
        if (active) setAccess('denied');
      }
    };

    void checkAccess();
    return () => {
      active = false;
    };
  }, []);

  if (access === 'checking') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#00F0FF" />
      </View>
    );
  }

  if (access === 'denied') return <Redirect href="/(tabs)" />;

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