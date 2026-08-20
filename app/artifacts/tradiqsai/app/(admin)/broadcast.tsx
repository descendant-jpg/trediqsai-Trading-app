import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { broadcastSignal, type SignalDirection } from "@/services/adminService";

const CYAN = "#00F0FF";

function parsePriceField(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export default function BroadcastScreen() {
  const router = useRouter();

  // Signal title is display-only / client-side label – not sent to backend
  const [signalTitle, setSignalTitle] = useState("");
  const [asset, setAsset] = useState("");
  const [direction, setDirection] = useState<SignalDirection>("BUY");
  const [entry, setEntry] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [sending, setSending] = useState(false);

  const validate = (): string | null => {
    if (!asset.trim()) return "Asset is required.";
    const entryVal = parsePriceField(entry);
    const tpVal = parsePriceField(takeProfit);
    const slVal = parsePriceField(stopLoss);
    if (Number.isNaN(entryVal)) return "Entry price must be a valid number.";
    if (Number.isNaN(tpVal)) return "Take profit must be a valid number.";
    if (Number.isNaN(slVal)) return "Stop loss must be a valid number.";
    if (direction === "BUY" && tpVal <= entryVal) {
      return "For a BUY signal, take profit must be above the entry.";
    }
    if (direction === "BUY" && slVal >= entryVal) {
      return "For a BUY signal, stop loss must be below the entry.";
    }
    if (direction === "SELL" && tpVal >= entryVal) {
      return "For a SELL signal, take profit must be below the entry.";
    }
    if (direction === "SELL" && slVal <= entryVal) {
      return "For a SELL signal, stop loss must be above the entry.";
    }
    return null;
  };

  const handleBroadcast = async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert("Validation Error", validationError);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSending(true);
    try {
      await broadcastSignal({
        asset: asset.trim().toUpperCase(),
        direction,
        entry: parsePriceField(entry),
        takeProfit: parsePriceField(takeProfit),
        stopLoss: parsePriceField(stopLoss),
        status: "active",
        isPremium: true,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to broadcast signal.");
    } finally {
      setSending(false);
    }
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
        <Text style={styles.headerTitle}>Broadcast Signal</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Signal title — display/client label only, not sent to backend */}
          <View style={styles.titleHintRow}>
            <Text style={styles.label}>Signal Title</Text>
            <View style={styles.displayOnlyBadge}>
              <Text style={styles.displayOnlyText}>Display only</Text>
            </View>
          </View>
          <TextInput
            accessibilityLabel="Signal title"
            autoCapitalize="words"
            onChangeText={setSignalTitle}
            placeholder="e.g. BTC/USD Breakout Setup"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={signalTitle}
          />

          <Text style={styles.label}>Asset</Text>
          <TextInput
            accessibilityLabel="Asset symbol"
            autoCapitalize="characters"
            onChangeText={setAsset}
            placeholder="e.g. BTCUSDT"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={asset}
          />

          <Text style={styles.label}>Direction</Text>
          <View style={styles.directionRow}>
            {(["BUY", "SELL"] as SignalDirection[]).map((dir) => (
              <TouchableOpacity
                key={dir}
                accessibilityLabel={`Direction ${dir}`}
                accessibilityRole="button"
                activeOpacity={0.8}
                onPress={() => setDirection(dir)}
                style={[
                  styles.directionButton,
                  direction === dir &&
                    (dir === "BUY" ? styles.directionBuyActive : styles.directionSellActive),
                ]}
              >
                <Feather
                  name={dir === "BUY" ? "trending-up" : "trending-down"}
                  size={15}
                  color={
                    direction === dir
                      ? dir === "BUY"
                        ? "#4ADE80"
                        : "#FF4D4D"
                      : "#8A8D93"
                  }
                />
                <Text
                  style={[
                    styles.directionText,
                    direction === dir &&
                      (dir === "BUY"
                        ? styles.directionTextBuyActive
                        : styles.directionTextSellActive),
                  ]}
                >
                  {dir}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Entry Price</Text>
          <TextInput
            accessibilityLabel="Entry price"
            keyboardType="decimal-pad"
            onChangeText={setEntry}
            placeholder="e.g. 42500.00"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={entry}
          />

          <Text style={styles.label}>Take Profit</Text>
          <TextInput
            accessibilityLabel="Take profit price"
            keyboardType="decimal-pad"
            onChangeText={setTakeProfit}
            placeholder="e.g. 44000.00"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={takeProfit}
          />

          <Text style={styles.label}>Stop Loss</Text>
          <TextInput
            accessibilityLabel="Stop loss price"
            keyboardType="decimal-pad"
            onChangeText={setStopLoss}
            placeholder="e.g. 41500.00"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={stopLoss}
          />

          <View style={styles.premiumBadgeRow}>
            <Feather name="lock" size={13} color="#FACC15" />
            <Text style={styles.premiumBadgeText}>Premium signal · Always active</Text>
          </View>

          <TouchableOpacity
            accessibilityLabel="Broadcast signal"
            accessibilityRole="button"
            activeOpacity={0.85}
            disabled={sending}
            onPress={() => void handleBroadcast()}
            style={[styles.submitButton, sending && styles.submitButtonDisabled]}
          >
            {sending ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <Feather name="radio" size={16} color="#000000" />
                <Text style={styles.submitText}>Broadcast Signal</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#030712", flex: 1 },
  flex: { flex: 1 },
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
  scrollContent: { padding: 20, paddingBottom: 48 },
  titleHintRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    marginTop: 20,
  },
  label: {
    color: "#8A8D93",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
    textTransform: "uppercase",
  },
  displayOnlyBadge: {
    backgroundColor: "#1E2028",
    borderColor: "#22252A",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  displayOnlyText: {
    color: "#8A8D93",
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#16181D",
    borderColor: "#22252A",
    borderRadius: 12,
    borderWidth: 1,
    color: "#FFFFFF",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  directionRow: { flexDirection: "row", gap: 12 },
  directionButton: {
    alignItems: "center",
    borderColor: "#22252A",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 13,
  },
  directionBuyActive: {
    backgroundColor: "#0F2A1A",
    borderColor: "#4ADE80",
  },
  directionSellActive: {
    backgroundColor: "#2A0F0F",
    borderColor: "#FF4D4D",
  },
  directionText: {
    color: "#8A8D93",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  directionTextBuyActive: { color: "#4ADE80" },
  directionTextSellActive: { color: "#FF4D4D" },
  premiumBadgeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 20,
  },
  premiumBadgeText: {
    color: "#FACC15",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: CYAN,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 54,
    paddingHorizontal: 24,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: {
    color: "#000000",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
});
