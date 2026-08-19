import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export default function AdminRouteLayout() {
  const { isGodAdmin, roleLoading } = useAuth();

  if (roleLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#00F0FF" />
      </View>
    );
  }

  if (!isGodAdmin) return <Redirect href="/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0B0E' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
        contentStyle: { backgroundColor: '#0A0B0E' },
        headerBackTitle: 'Admin',
      }}
    >
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