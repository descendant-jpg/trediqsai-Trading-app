import React from 'react';
import { useRouter } from 'expo-router';
import { PaywallModal } from '@/components/PaywallModal';

/**
 * Canonical deep-linkable subscription route. The shared modal owns all tier
 * selection and purchase behavior; route parameters are consumed there.
 */
export default function PaywallScreen() {
  const router = useRouter();
  return <PaywallModal visible onClose={() => router.back()} />;
}