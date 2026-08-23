import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import colors from "@/constants/colors";

type CompetitionTrader = {
  id: string;
  rank: number;
  username: string | null;
  profit: number;
  winRate: number;
};

const c = colors.light;
const money = (value: number) =>
  `${value >= 0 ? "+" : "−"}$${Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<CompetitionTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customFetch<CompetitionTrader[]>(
        "/api/competition/leaderboard",
      );
      if (!Array.isArray(response)) {
        throw new Error("The competition leaderboard returned an invalid response.");
      }
      setRows(response);
    } catch (caught) {
      setRows([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load the competition leaderboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Platform.OS === "web" ? 67 : insets.top },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>COMPETITION / SEASON 01</Text>
          <Text style={styles.title}>Global Leaderboard</Text>
          <Text style={styles.subtitle}>
            Ranked from live trader performance.
          </Text>
        </View>
        <Feather name="globe" size={24} color={c.primary} />
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <View style={styles.state} testID="competition-error">
          <Feather name="alert-circle" size={28} color={c.destructive} />
          <Text style={styles.stateText}>Unable to load leaderboard</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load()} testID="competition-retry">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(trader) => trader.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <RankRow trader={item} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No traders have recorded competition performance yet.
            </Text>
          }
        />
      )}
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.state} testID="competition-loading">
      <ActivityIndicator color={c.primary} size="large" />
      <Text style={styles.stateText}>Loading the global field…</Text>
      <View style={styles.skeleton} />
      <View style={styles.skeleton} />
      <View style={styles.skeleton} />
    </View>
  );
}

function RankRow({ trader }: { trader: CompetitionTrader }) {
  const username = trader.username?.trim() || "Anonymous trader";
  return (
    <View style={styles.row}>
      <Text style={styles.rank}>#{trader.rank}</Text>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{username.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.username}>{username}</Text>
        <Text style={styles.winRate}>{trader.winRate.toFixed(1)}% win rate</Text>
      </View>
      <Text
        style={[
          styles.profit,
          trader.profit < 0 ? styles.loss : styles.gain,
        ]}
      >
        {money(trader.profit)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0B0E" },
  header: {
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: c.primary,
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  title: {
    color: c.foreground,
    fontSize: 24,
    marginTop: 5,
    fontFamily: "Inter_700Bold",
  },
  subtitle: { color: c.mutedForeground, fontSize: 12, marginTop: 5 },
  list: { paddingHorizontal: 16, paddingBottom: 36, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#16181D",
    borderBottomWidth: 1,
    borderBottomColor: "#262930",
    borderRadius: 10,
    padding: 12,
  },
  rank: {
    color: c.primary,
    width: 32,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0A0B0E",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: c.primary, fontSize: 15, fontFamily: "Inter_700Bold" },
  rowInfo: { flex: 1 },
  username: { color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 13 },
  winRate: { color: c.mutedForeground, fontSize: 10, marginTop: 3 },
  profit: { fontFamily: "Inter_700Bold", fontSize: 13 },
  gain: { color: "#2ECA8B" },
  loss: { color: c.destructive },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  stateText: { color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 15 },
  error: { color: c.mutedForeground, textAlign: "center", fontSize: 11 },
  retry: {
    borderColor: c.primary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  retryText: { color: c.primary, fontFamily: "Inter_700Bold" },
  skeleton: {
    height: 52,
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#16181D",
    borderRadius: 10,
  },
  empty: { color: c.mutedForeground, textAlign: "center", padding: 30 },
});