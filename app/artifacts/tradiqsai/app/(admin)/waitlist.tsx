import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteWaitlistEntry, fetchWaitlist, type WaitlistEntry } from "@/services/adminService";

const CYAN = "#00F0FF";

function formatDate(value: string) {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? "Date unavailable" : new Date(ts).toLocaleDateString();
}

export default function WaitlistScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (fromRefresh = false) => {
    const gen = ++generation.current;
    if (fromRefresh) {
      setRefreshing(true);
      if (Platform.OS !== "web") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } else {
      setLoading(true);
    }
    setErrorMessage(null);
    try {
      const data = await fetchWaitlist();
      if (generation.current !== gen) return;
      setEntries(data);
    } catch (err: unknown) {
      if (generation.current !== gen) return;
      setErrorMessage(err instanceof Error ? err.message : "Failed to load waitlist.");
    } finally {
      if (generation.current === gen) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const handleRemove = (entry: WaitlistEntry) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert(
      "Remove from Waitlist",
      `Remove ${entry.email} from the waitlist? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            try {
              await deleteWaitlistEntry(entry.id);
              setEntries((prev) => prev.filter((e) => e.id !== entry.id));
            } catch (err: unknown) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to remove entry.");
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item, index }: { item: WaitlistEntry; index: number }) => (
    <View style={[styles.row, index > 0 && styles.rowBorder]}>
      <View style={styles.rowIcon}>
        <Feather name="user" size={15} color={CYAN} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowEmail}>{item.email}</Text>
        {item.name ? <Text style={styles.rowMeta}>{item.name}</Text> : null}
        <Text style={styles.rowDate}>Joined {formatDate(item.created_at)}</Text>
      </View>
      <TouchableOpacity
        accessibilityLabel={`Remove ${item.email} from waitlist`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => handleRemove(item)}
        style={styles.removeButton}
      >
        <Feather name="trash-2" size={16} color="#FF4D4D" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={22} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Waitlist Management</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={CYAN} size="large" />
          <Text style={styles.loadingText}>Loading waitlist…</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.centered}>
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={17} color="#FFB4B4" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Retry"
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={entries}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No waitlist entries found.</Text>
          }
          ListHeaderComponent={
            <Text style={styles.countLabel}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </Text>
          }
          refreshControl={
            <RefreshControl
              colors={[CYAN]}
              onRefresh={() => void load(true)}
              progressBackgroundColor="#16181D"
              refreshing={refreshing}
              tintColor={CYAN}
            />
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#030712", flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: "#22252A",
    borderBottomWidth: 1,
    flexDirection: "row",
    height: 58,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backButton: { alignItems: "center", flexDirection: "row", minHeight: 44, minWidth: 84 },
  backText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14, marginLeft: 2 },
  headerTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  headerSpacer: { minWidth: 84 },
  centered: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  loadingText: {
    color: "#8A8D93",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginTop: 12,
  },
  errorBanner: {
    alignItems: "flex-start",
    backgroundColor: "#321B20",
    borderColor: "#7A343F",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
    width: "100%",
  },
  errorText: {
    color: "#FFCECE",
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: "#16181D",
    borderColor: "#22252A",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: { color: CYAN, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 48 },
  countLabel: {
    color: "#8A8D93",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  row: {
    alignItems: "center",
    backgroundColor: "#16181D",
    borderColor: "#22252A",
    borderRadius: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowBorder: { borderTopColor: "#22252A", borderTopWidth: 1 },
  rowIcon: {
    alignItems: "center",
    backgroundColor: "#00F0FF1A",
    borderRadius: 9,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  rowBody: { flex: 1 },
  rowEmail: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  rowMeta: {
    color: "#8A8D93",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  rowDate: {
    color: "#8A8D93",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  removeButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  emptyText: {
    color: "#8A8D93",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingVertical: 24,
    textAlign: "center",
  },
});
