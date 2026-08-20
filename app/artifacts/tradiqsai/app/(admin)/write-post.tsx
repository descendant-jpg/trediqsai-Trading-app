import React, { useEffect, useState } from "react";
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
import {
  createPost,
  FALLBACK_CATEGORIES,
  FALLBACK_TAGS,
  fetchTaxonomy,
} from "@/services/adminService";

const CYAN = "#00F0FF";
const ASSET_CLASSES = ["Forex", "Crypto", "Stocks", "Commodities", "Indices"];
const STATUSES: Array<"draft" | "published"> = ["draft", "published"];

export default function WritePostScreen() {
  const router = useRouter();

  // Core fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [content, setContent] = useState("");
  const [assetClass, setAssetClass] = useState("Forex");
  const [category, setCategory] = useState("Forex");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");

  // Taxonomy state
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [tags, setTags] = useState<string[]>(FALLBACK_TAGS);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Auto-generate slug from title
  useEffect(() => {
    const generated = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 100);
    setSlug(generated);
  }, [title]);

  // Fetch taxonomy on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setTaxonomyLoading(true);
      setTaxonomyError(null);
      try {
        const [cats, tgs] = await Promise.all([
          fetchTaxonomy("category").catch(() => FALLBACK_CATEGORIES),
          fetchTaxonomy("tag").catch(() => FALLBACK_TAGS),
        ]);
        if (!cancelled) {
          setCategories(cats);
          setTags(tgs);
          if (cats.length > 0) setCategory(cats[0]!);
        }
      } catch {
        if (!cancelled) {
          setTaxonomyError("Could not load categories/tags. Using defaults.");
          setCategories(FALLBACK_CATEGORIES);
          setTags(FALLBACK_TAGS);
        }
      } finally {
        if (!cancelled) setTaxonomyLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

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
      await createPost({
        title: title.trim(),
        slug: slug.trim() || undefined,
        excerpt: excerpt.trim() || undefined,
        cover_image: coverImage.trim() || null,
        content: content.trim(),
        asset_class: assetClass,
        category,
        tags: selectedTags,
        status,
      });
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
          {/* ── Title ── */}
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

          {/* ── Slug ── */}
          <Text style={styles.label}>Slug</Text>
          <TextInput
            accessibilityLabel="Post slug"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSlug}
            placeholder="auto-generated-from-title"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={slug}
          />

          {/* ── Excerpt ── */}
          <Text style={styles.label}>Excerpt</Text>
          <TextInput
            accessibilityLabel="Post excerpt"
            autoCapitalize="sentences"
            multiline
            numberOfLines={3}
            onChangeText={setExcerpt}
            placeholder="Short summary shown in previews…"
            placeholderTextColor="#4A4D54"
            style={[styles.input, styles.excerptArea]}
            textAlignVertical="top"
            value={excerpt}
          />

          {/* ── Cover Image ── */}
          <Text style={styles.label}>Cover Image URL</Text>
          <TextInput
            accessibilityLabel="Cover image URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setCoverImage}
            placeholder="https://…"
            placeholderTextColor="#4A4D54"
            style={styles.input}
            value={coverImage}
          />

          {/* ── Asset Class ── */}
          <Text style={styles.label}>Asset Class</Text>
          <View style={styles.chipRow}>
            {ASSET_CLASSES.map((ac) => (
              <TouchableOpacity
                key={ac}
                accessibilityLabel={`Asset class ${ac}`}
                accessibilityRole="button"
                activeOpacity={0.8}
                onPress={() => setAssetClass(ac)}
                style={[styles.chip, assetClass === ac && styles.chipActive]}
              >
                <Text style={[styles.chipText, assetClass === ac && styles.chipTextActive]}>
                  {ac}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Category ── */}
          <Text style={styles.label}>Category</Text>
          {taxonomyLoading ? (
            <View style={styles.taxonomyLoading}>
              <ActivityIndicator color={CYAN} size="small" />
              <Text style={styles.taxonomyLoadingText}>Loading categories…</Text>
            </View>
          ) : (
            <>
              {taxonomyError ? (
                <View style={styles.taxonomyErrorBanner}>
                  <Feather name="alert-circle" size={13} color="#FFB4B4" />
                  <Text style={styles.taxonomyErrorText}>{taxonomyError}</Text>
                </View>
              ) : null}
              <View style={styles.chipRow}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    accessibilityLabel={`Category ${cat}`}
                    accessibilityRole="button"
                    activeOpacity={0.8}
                    onPress={() => setCategory(cat)}
                    style={[styles.chip, category === cat && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ── Tags ── */}
          <Text style={styles.label}>Tags</Text>
          {taxonomyLoading ? (
            <View style={styles.taxonomyLoading}>
              <ActivityIndicator color={CYAN} size="small" />
              <Text style={styles.taxonomyLoadingText}>Loading tags…</Text>
            </View>
          ) : (
            <View style={styles.chipRow}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  accessibilityLabel={`Tag ${tag}`}
                  accessibilityRole="button"
                  activeOpacity={0.8}
                  onPress={() => toggleTag(tag)}
                  style={[styles.chip, selectedTags.includes(tag) && styles.chipActiveGreen]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedTags.includes(tag) && styles.chipTextActiveGreen,
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Status ── */}
          <Text style={styles.label}>Status</Text>
          <View style={styles.segmentedControl}>
            {STATUSES.map((s, i) => (
              <TouchableOpacity
                key={s}
                accessibilityLabel={`Status ${s}`}
                accessibilityRole="button"
                activeOpacity={0.8}
                onPress={() => setStatus(s)}
                style={[
                  styles.segmentedItem,
                  i === 0 && styles.segmentedItemLeft,
                  i === STATUSES.length - 1 && styles.segmentedItemRight,
                  status === s && styles.segmentedItemActive,
                ]}
              >
                <Text style={[styles.segmentedText, status === s && styles.segmentedTextActive]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Content ── */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Content</Text>
            <Text style={styles.mdHint}>Markdown supported</Text>
          </View>
          <TextInput
            accessibilityLabel="Post content"
            autoCapitalize="sentences"
            multiline
            numberOfLines={12}
            onChangeText={setContent}
            placeholder="Write your market analysis here… **bold**, _italic_, ## headers"
            placeholderTextColor="#4A4D54"
            style={[styles.input, styles.textArea]}
            textAlignVertical="top"
            value={content}
          />

          {/* ── Submit ── */}
          <TouchableOpacity
            accessibilityLabel={status === "published" ? "Publish post" : "Save draft"}
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
                <Feather
                  name={status === "published" ? "send" : "save"}
                  size={16}
                  color="#000000"
                />
                <Text style={styles.submitText}>
                  {status === "published" ? "Publish Post" : "Save Draft"}
                </Text>
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
  scrollContent: { padding: 20, paddingBottom: 56 },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
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
  mdHint: {
    color: "#4A4D54",
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginBottom: 0,
    marginTop: 0,
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
  excerptArea: {
    minHeight: 72,
    paddingTop: 13,
  },
  textArea: {
    minHeight: 200,
    paddingTop: 13,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderColor: "#22252A",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: "#00F0FF1A",
    borderColor: CYAN,
  },
  chipActiveGreen: {
    backgroundColor: "#00FF9A1A",
    borderColor: "#00FF9A",
  },
  chipText: {
    color: "#8A8D93",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  chipTextActive: {
    color: CYAN,
  },
  chipTextActiveGreen: {
    color: "#00FF9A",
  },
  taxonomyLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
  },
  taxonomyLoadingText: {
    color: "#4A4D54",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  taxonomyErrorBanner: {
    alignItems: "center",
    backgroundColor: "#321B20",
    borderColor: "#7A343F",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  taxonomyErrorText: {
    color: "#FFCECE",
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  segmentedControl: {
    borderColor: "#22252A",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  segmentedItem: {
    alignItems: "center",
    borderColor: "transparent",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 11,
  },
  segmentedItemLeft: { borderRightColor: "#22252A", borderRightWidth: 1 },
  segmentedItemRight: {},
  segmentedItemActive: {
    backgroundColor: "#00F0FF1A",
  },
  segmentedText: {
    color: "#8A8D93",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  segmentedTextActive: {
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
