import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import AuthScreen from '@/screens/AuthScreen';

/** Signed-out authentication gateway for the absolute root redirect. */
export default function LoginScreen() {
  const { session, loading, authScreenMode } = useAuth();

  if (loading) return null;

  if (session) {
    return <Redirect href={'/(tabs)/index' as never} />;
  }

  return <AuthScreen initialMode={authScreenMode} />;
}