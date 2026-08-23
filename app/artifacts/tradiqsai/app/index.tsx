import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

/**
 * The only absolute-root entry point. Route groups are implementation details,
 * so the app must never let Expo Router choose one (such as Profile or Admin)
 * during session restoration.
 */
export default function RootIndex() {
  const { session, loading } = useAuth();

  if (loading) return null;

  return (
    <Redirect
      href={(session ? '/(tabs)/index' : '/(auth)/login') as never}
    />
  );
}