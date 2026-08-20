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
import { createPost } from "@/services/adminService";

const CYAN = "#00F0FF";

const CATEGORIES = ["Analysis", "Education", "News", "Strategy", "General"];

export default function WritePostScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("General");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Validation Error", "Title is required.");
      return;
    }
    if (!content.trim()) {
      Alert.alert("Validation Error", "Content is required.");
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSaving(true);
    try {
      await createPost({ title: title.trim(), content: content.trim(), category, status: "published" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create post.";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
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
        <Text style={styles.headerTitle}>Write Market Insight</Text>
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
          <Text style={styles.label}>Title</Text>
          <TextInput
            accessibilityLabel="Post title"
            autoCapitalize="sentences"
            onChangeText={setTitle}
            placeholder="Market insight headline…"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={title}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                accessibilityLabel={`Category ${cat}`}
                accessibilityRole="button"
                activeOpacity={0.8}
                onPress={() => setCategory(cat)}
                style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
              >
                <Text
                  style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Content</Text>
          <TextInput
            accessibilityLabel="Post content"
            autoCapitalize="sentences"
            multiline
            numberOfLines={12}
            onChangeText={setContent}
            placeholder="Write your market analysis here…"
            placeholderTextColor="#4A4D54"
            style={[styles.input, styles.textArea]}
            textAlignVertical="top"
            value={content}
          />

          <TouchableOpacity
            accessibilityLabel="Publish post"
            accessibilityRole="button"
            activeOpacity={0.85}
            disabled={saving}
            onPress={() => void handleSubmit()}
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <Feather name="send" size={16} color="#000000" />
                <Text style={styles.submitText}>Publish Post</Text>
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
  label: {
    color: "#8A8D93",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
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
  textArea: {
    minHeight: 200,
    paddingTop: 13,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    borderColor: "#22252A",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  categoryChipActive: {
    backgroundColor: "#00F0FF1A",
    borderColor: CYAN,
  },
  categoryChipText: {
    color: "#8A8D93",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: CYAN,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: CYAN,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 32,
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
