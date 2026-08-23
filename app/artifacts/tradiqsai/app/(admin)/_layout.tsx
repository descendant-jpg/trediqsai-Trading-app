import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/lib/revenuecat";

/**
 * Client navigation gate for the CMS route. The API still authorizes every
 * privileged request, while this gate prevents ordinary traders from mounting
 * a dashboard that can only end in a confusing 403 screen.
 */
export default function AdminLayout() {
  const { session, loading } = useAuth();
  const { isAdmin, isAdminLoading } = useSubscription();

  // Wait for the server-owned profile entitlement state before choosing a
  // route. This prevents an initial false admin value from bouncing a real
  // administrator to Home.
  if (loading || isAdminLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color="#00F0FF" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href={'/(auth)/login' as never} />;
  }

  if (!isAdmin) {
    return <Redirect href={'/(tabs)' as never} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: "#0A0B0E" },
        headerTintColor: "#FFFFFF",
        headerShadowVisible: false,
        headerTitleStyle: styles.headerTitle,
        contentStyle: { backgroundColor: "#0A0B0E" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "TradiQs CMS" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: "#0A0B0E",
    flex: 1,
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
});