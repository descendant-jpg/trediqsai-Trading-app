import React from "react";
import {
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import colors from "@/constants/colors";

const c = colors.light;

const SOCIALS = [
  {
    label: "Facebook",
    icon: "facebook" as const,
    url: "https://facebook.com/tradiqsai",
  },
  {
    label: "Instagram",
    icon: "instagram" as const,
    url: "https://instagram.com/tradiqsai",
  },
  {
    label: "YouTube",
    icon: "youtube" as const,
    url: "https://youtube.com/@tradiqsai",
  },
  {
    label: "TikTok",
    icon: "video" as const,
    url: "https://tiktok.com/@tradiqsai",
  },
  {
    label: "X (Twitter)",
    icon: "twitter" as const,
    url: "https://x.com/tradiqsai",
  },
  {
    label: "Telegram Channel Forex",
    icon: "send" as const,
    url: "https://t.me/tradiqs_ai",
  },
  {
    label: "Telegram Channel Crypto",
    icon: "send" as const,
    url: "https://t.me/tradiqsai",
  },
  {
    label: "Telegram Channel Stock",
    icon: "send" as const,
    url: "https://t.me/tradiqsai",
  },
];

export function SocialMediaModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const open = (url: string) => {
    Linking.openURL(url).catch(() => undefined);
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>CONNECT WITH TRADIQS</Text>
              <Text style={styles.title}>Social Media</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close social media"
            >
              <Feather name="x" size={22} color={c.foreground} />
            </TouchableOpacity>
          </View>
          <View style={styles.list}>
            {SOCIALS.map((social) => (
              <TouchableOpacity
                key={social.label}
                style={styles.card}
                onPress={() => open(social.url)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${social.label}`}
              >
                <View style={styles.cardLeft}>
                  <View style={styles.iconBox}>
                    <Feather name={social.icon} size={18} color={c.primary} />
                  </View>
                  <Text style={styles.label}>{social.label}</Text>
                </View>
                <Text style={styles.external}>↗</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    backgroundColor: c.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: c.border,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginBottom: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  kicker: {
    color: c.primary,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: "Inter_700Bold",
  },
  title: {
    color: c.foreground,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 3,
  },
  list: { gap: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 11,
    padding: 13,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  external: { color: c.primary, fontSize: 22, fontFamily: "Inter_500Medium" },
});
