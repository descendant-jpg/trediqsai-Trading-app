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
import { fetchMessages, resolveMessage, type HelpMessage } from "@/services/adminService";

const CYAN = "#00F0FF";

function formatDate(value: string) {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? "Date unavailable" : new Date(ts).toLocaleDateString();
}

function statusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "resolved":
      return "#4ADE80";
    case "open":
      return "#FACC15";
    default:
      return "#8A8D93";
  }
}

export default function HelpDeskScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<HelpMessage[]>([]);
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
      const data = await fetchMessages();
      if (generation.current !== gen) return;
      setMessages(data);
    } catch (err: unknown) {
      if (generation.current !== gen) return;
      setErrorMessage(err instanceof Error ? err.message : "Failed to load messages.");
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

  const handleResolve = (msg: HelpMessage) => {
    if (msg.status?.toLowerCase() === "resolved") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert(
      "Resolve Ticket",
      `Mark this ticket from ${msg.email ?? "unknown"} as resolved?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resolve",
          onPress: async () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            try {
              const updated = await resolveMessage(msg.id);
              setMessages((prev) =>
                prev.map((m) => (m.id === msg.id ? { ...m, status: updated.status } : m)),
              );
            } catch (err: unknown) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to resolve ticket.",
              );
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item, index }: { item: HelpMessage; index: number }) => {
    const text = item.body ?? item.message ?? "";
    const isResolved = item.status?.toLowerCase() === "resolved";
    return (
      <View style={[styles.row, index > 0 && styles.rowBorder]}>
        <View style={styles.rowIcon}>
          <Feather name="message-circle" size={15} color={CYAN} />
        </View>
        <View style={styles.rowBody}>
          {item.subject ? <Text style={styles.rowSubject}>{item.subject}</Text> : null}
          {item.email ? <Text style={styles.rowEmail}>{item.email}</Text> : null}
          {text ? (
            <Text numberOfLines={2} style={styles.rowPreview}>
              {text}
            </Text>
          ) : null}
          <View style={styles.rowFooter}>
            <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
            <View style={[styles.statusBadge, { borderColor: statusColor(item.status) }]}>
              <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                {item.status}
              </Text>
            </View>
          </View>
        </View>
        {!isResolved ? (
          <TouchableOpacity
            accessibilityLabel="Resolve ticket"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => handleResolve(item)}
            style={styles.resolveButton}
          >
            <Feather name="check-circle" size={18} color="#4ADE80" />
          </TouchableOpacity>
        ) : (
          <Feather name="check-circle" size={18} color="#4ADE8066" />
        )}
      </View>
    );
  };

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
        <Text style={styles.headerTitle}>Support Tickets</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={CYAN} size="large" />
          <Text style={styles.loadingText}>Loading tickets…</Text>
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
          data={messages}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No support tickets found.</Text>
          }
          ListHeaderComponent={
            <Text style={styles.countLabel}>
              {messages.length} {messages.length === 1 ? "ticket" : "tickets"}
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
    alignItems: "flex-start",
    backgroundColor: "#16181D",
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
    marginTop: 2,
    width: 34,
  },
  rowBody: { flex: 1 },
  rowSubject: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
  },
  rowEmail: {
    color: "#8A8D93",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  rowPreview: {
    color: "#C0C2C7",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  rowFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  rowDate: { color: "#8A8D93", fontFamily: "Inter_400Regular", fontSize: 11 },
  statusBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 10, textTransform: "uppercase" },
  resolveButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    minHeight: 36,
    minWidth: 36,
  },
  emptyText: {
    color: "#8A8D93",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingVertical: 24,
    textAlign: "center",
  },
});
