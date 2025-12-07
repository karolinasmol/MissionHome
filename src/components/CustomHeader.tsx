// src/components/CustomHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Image,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";

import { useThemeColors } from "../context/ThemeContext";
import { auth, db } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  limit as fsLimit,
  writeBatch,
  doc,
  serverTimestamp,
  updateDoc,
  onSnapshot,
  getDoc,
} from "firebase/firestore";

const ACCENT_PREMIUM = "#22d3ee";
const ACCENT_NOTIF = "#2F6BFF";

type NavItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
};

type NotifRow = {
  id: string;
  type?: string;
  title?: string;
  body?: string | null;
  read?: boolean;
  createdAt?: any;
  inviteId?: string | null;
  familyId?: string | null;
};

export default function CustomHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { colors, isDark } = useThemeColors();
  const palette = useMemo(() => makePalette({ isDark, colors }), [isDark, colors]);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const useNativeDriver = Platform.OS !== "web";

  /* ========== AUTH ========== */
  const [user, setUser] = useState(() => auth.currentUser);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const uid = user?.uid || null;

  /* ========== NICKNAME ========== */
  const [nick, setNick] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return setNick(null);

    const loadNick = async () => {
      try {
        const ref = doc(db as any, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          const raw = (data?.nick ?? "").trim();
          setNick(raw || null);
        } else setNick(null);
      } catch {
        setNick(null);
      }
    };
    loadNick();
  }, [uid]);

  const authName = (user?.displayName || "").trim() || null;
  const emailPart = user?.email ? user.email.split("@")[0] : null;

  const displayName = nick || authName || emailPart || "Profil";
  const initials = getInitials(displayName);

  /* ========== NAV STRUCTURE ========== */
  const NAV: NavItem[] = [
    { key: "cal", icon: "calendar-outline", label: "Kalendarz", route: "/calendar" },
    { key: "fam", icon: "people-outline", label: "Rodzina", route: "/family" },
    { key: "stats", icon: "stats-chart-outline", label: "Statystyki", route: "/stats" },
    { key: "ach", icon: "trophy-outline", label: "Osiągnięcia", route: "/achievements" },
    { key: "rank", icon: "podium-outline", label: "Ranking", route: "/Ranking" },
  ];

  /* ========== MODALS ========== */
  const [profileOpen, setProfileOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);

  const closeAll = () => {
    setProfileOpen(false);
    setNavOpen(false);
    setNotifsOpen(false);
  };

  /* ========== NOTIFICATIONS ========== */
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifRows, setNotifRows] = useState<NotifRow[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    if (!uid) return setUnreadCount(0);

    const qUnread = query(
      collection(db as any, `users/${uid}/notifications`),
      where("read", "==", false)
    );
    const unsub = onSnapshot(
      qUnread,
      (snap) => setUnreadCount(snap.size || 0),
      () => setUnreadCount(0)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!notifsOpen || !uid) return setNotifRows(notifsOpen ? [] : null);

    setNotifLoading(true);
    const q = query(
      collection(db as any, `users/${uid}/notifications`),
      orderBy("createdAt", "desc"),
      fsLimit(20)
    );

    const off = onSnapshot(
      q,
      (snap) => {
        setNotifRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setNotifLoading(false);
      },
      () => {
        setNotifRows([]);
        setNotifLoading(false);
      }
    );
    return () => off();
  }, [notifsOpen, uid]);

  const markVisibleRead = async () => {
    if (!uid || !notifRows?.length) return;

    const batch = writeBatch(db as any);
    notifRows.forEach((n) => {
      if (!n.read) {
        batch.set(
          doc(db as any, `users/${uid}/notifications/${n.id}`),
          { read: true, readAt: serverTimestamp() },
          { merge: true }
        );
      }
    });
    await batch.commit();
  };

  const clearVisible = async () => {
    if (!uid || !notifRows?.length) return;

    const batch = writeBatch(db as any);
    notifRows.forEach((n) =>
      batch.delete(doc(db as any, `users/${uid}/notifications/${n.id}`))
    );
    await batch.commit();
    setNotifRows([]);
  };

  const toggleNotifRead = async (n: NotifRow) => {
    if (!uid) return;
    const next = !n.read;

    setNotifRows((prev) =>
      prev ? prev.map((x) => (x.id === n.id ? { ...x, read: next } : x)) : prev
    );

    await updateDoc(doc(db as any, `users/${uid}/notifications/${n.id}`), {
      read: next,
      readAt: next ? serverTimestamp() : null,
    });
  };

  const notifIconFor = (t?: string) => {
    switch (t) {
      case "FAMILY_INVITE":
        return "people";
      case "FRIEND_INVITE":
        return "person-add";
      case "LEVEL_UP":
        return "sparkles";
      case "WIN":
        return "trophy";
      default:
        return "notifications";
    }
  };

  const Badge = ({ count }: { count: number }) =>
    !count ? null : (
      <View style={[styles.badge, { borderColor: palette.card }]}>
        <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
      </View>
    );

  /* ========== UI HELPERS ========== */
  const tapScale = () => useRef(new Animated.Value(1)).current;

  const NavRow = ({ item }: { item: NavItem }) => {
    const active = pathname === item.route || pathname?.startsWith(item.route);
    return (
      <Pressable
        onPress={() => {
          setNavOpen(false);
          router.push(item.route as any);
        }}
        style={({ pressed }) => [
          styles.navRowItem,
          active && styles.navRowItemActive,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Ionicons
          name={item.icon}
          size={18}
          color={active ? palette.navIconActive : palette.navIcon}
        />
        <Text
          style={[styles.navRowText, active && { color: palette.navIconActive }]}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  const panelTop = Math.max(insets.top + 50, 80);

  /* ========== RENDER ========== */
  return (
    <SafeAreaView edges={["top"]} style={[styles.safeWrap, { backgroundColor: palette.bg }]}>
      <View style={styles.bar}>
        {/* LOGO */}
        <Pressable
          onPress={() => router.push("/" as any)}
          style={({ pressed }) => [styles.logoWrap, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.logoTop}>Mission</Text>
          <Text style={styles.logoBottom}>Home</Text>
        </Pressable>

        <View style={styles.actions}>
          {/* MENU (···) */}
          <Pressable
            onPress={() => {
              closeAll();
              setNavOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={palette.navIcon} />
          </Pressable>

          {/* NOTIFICATIONS */}
          <Pressable
            onPress={() => {
              closeAll();
              setNotifsOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.9 }]}
          >
            <View style={{ position: "relative" }}>
              <Ionicons name="notifications-outline" size={20} color={palette.navIcon} />
              <Badge count={unreadCount} />
            </View>
          </Pressable>

          {/* PREMIUM */}
          <Pressable
            onPress={() => router.push("/premium" as any)}
            style={({ pressed }) => [styles.premiumChip, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="sparkles" size={16} color={ACCENT_PREMIUM} />
          </Pressable>

          {/* PROFILE */}
          <Pressable
            onPress={() => {
              closeAll();
              setProfileOpen(true);
            }}
            style={({ pressed }) => [styles.profileBtn, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.avatarOuter}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{initials}</Text>
                </View>
              )}
            </View>
          </Pressable>
        </View>
      </View>

      {/* --- NAV MENU --- */}
      <Modal transparent visible={navOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setNavOpen(false)} />
        <View
          style={[
            styles.modalCard,
            { top: panelTop, left: 12, right: 12, maxWidth: 420, alignSelf: "center" },
          ]}
        >
          <Text style={styles.modalTitle}>Menu</Text>
          <View style={styles.modalSep} />

          {NAV.map((it) => (
            <NavRow key={it.key} item={it} />
          ))}
        </View>
      </Modal>

      {/* --- PROFILE MENU --- */}
      <Modal transparent visible={profileOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setProfileOpen(false)} />
        <View
          style={[
            styles.modalCard,
            { top: panelTop, right: 12, width: 250 },
          ]}
        >
          <Text style={styles.modalTitle}>{displayName}</Text>
          <Text style={styles.modalSub}>{user?.email}</Text>
          <View style={styles.modalSep} />

          <Pressable
            onPress={() => {
              setProfileOpen(false);
              router.push("/settings" as any);
            }}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <Ionicons name="settings-outline" size={18} color={palette.menuText} />
            <Text style={styles.menuRowText}>Ustawienia</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setProfileOpen(false);
              router.push("/bug" as any);
            }}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <Ionicons name="bug-outline" size={18} color={palette.menuText} />
            <Text style={styles.menuRowText}>Zgłoś błąd</Text>
          </Pressable>

          <View style={styles.modalSep} />

          <Pressable
            onPress={async () => {
              try {
                await auth.signOut();
              } catch {}
              setProfileOpen(false);
              router.replace("/login" as any);
            }}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            <Text style={[styles.menuRowText, { color: "#ef4444" }]}>Wyloguj</Text>
          </Pressable>
        </View>
      </Modal>

      {/* --- NOTIFICATIONS PANEL --- */}
      <Modal transparent visible={notifsOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setNotifsOpen(false)} />
        <View
          style={[
            styles.notifCard,
            { top: panelTop, left: 12, right: 12, maxWidth: 460, alignSelf: "center" },
          ]}
        >
          <View style={styles.notifHeader}>
            <Text style={styles.notifTitle}>Powiadomienia</Text>
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                onPress={markVisibleRead}
                style={[styles.notifAction, { backgroundColor: ACCENT_NOTIF }]}
              >
                <Ionicons name="checkmark-done" size={14} color="#fff" />
                <Text style={styles.notifActionText}>Przeczytane</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={clearVisible}
                style={[styles.notifAction, { backgroundColor: "#6B7280" }]}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.notifActionText}>Wyczyść</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.modalSep} />

          {notifLoading ? (
            <View style={styles.notifLoading}>
              <ActivityIndicator color={palette.text} />
            </View>
          ) : notifRows == null ? (
            <View style={styles.notifLoading}>
              <Text style={{ color: palette.muted }}>Ładowanie…</Text>
            </View>
          ) : notifRows.length === 0 ? (
            <View style={styles.notifLoading}>
              <Text style={{ color: palette.muted }}>Brak powiadomień</Text>
            </View>
          ) : (
            <ScrollView style={styles.notifScroll}>
              {notifRows.map((n) => {
                const unread = !n.read;
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => toggleNotifRead(n)}
                    style={[styles.notifRow, unread && styles.notifRowUnread]}
                  >
                    <Ionicons
                      name={notifIconFor(n.type) as any}
                      size={18}
                      color={unread ? ACCENT_NOTIF : palette.navIcon}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.notifRowTitle,
                          { fontWeight: unread ? "900" : "700" },
                        ]}
                        numberOfLines={1}
                      >
                        {n.title || "Powiadomienie"}
                      </Text>
                      {n.body && (
                        <Text style={styles.notifRowBody} numberOfLines={2}>
                          {n.body}
                        </Text>
                      )}
                    </View>
                    {unread && <View style={styles.dot} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ========================== HELPERS ========================== */
function getInitials(n: string) {
  if (!n) return "MH";
  const p = n.trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

function makePalette({ isDark, colors }: any) {
  return {
    bg: colors.bg,
    card: colors.card,
    border: colors.border,
    text: colors.text,
    muted: colors.textMuted,
    navIcon: isDark ? "#cbd5f5" : "#0f172a",
    navIconActive: colors.accent,
    profileChevron: isDark ? "#94a3b8" : "#475569",
    menuBg: isDark ? "#0b1220" : "#fff",
    menuBorder: isDark ? "rgba(148,163,184,0.32)" : "rgba(15,23,42,0.12)",
    menuText: isDark ? "#e5e7eb" : "#0f172a",
    chipBg: isDark ? "rgba(2,6,23,0.6)" : "rgba(219,234,254,0.9)",
  };
}

/* ========================== STYLES ========================== */
function makeStyles(p: ReturnType<typeof makePalette>) {
  return StyleSheet.create({
    safeWrap: {
      width: "100%",
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      paddingHorizontal: 12,
      paddingBottom: 6,
      zIndex: 10,
    },

    /* ===== HEADER BAR ===== */
    bar: {
      width: "100%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.card,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    logoWrap: {},
    logoTop: { fontSize: 18, fontWeight: "900", color: p.text },
    logoBottom: { fontSize: 18, fontWeight: "900", color: "#1dd4c7", marginTop: -1 },

    actions: { flexDirection: "row", alignItems: "center" },

    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: "transparent",
      marginLeft: 6,
    },

    premiumChip: {
      width: 34,
      height: 34,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.chipBg,
      marginLeft: 6,
    },

    profileBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 6,
      backgroundColor: p.chipBg,
      borderWidth: 1,
      borderColor: p.border,
    },

    avatarOuter: {
      width: 26,
      height: 26,
      borderRadius: 13,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(148,163,184,0.6)",
    },
    avatarImage: { width: "100%", height: "100%" },
    avatarFallback: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(15,23,42,0.7)",
    },
    avatarFallbackText: { color: "#e5e7eb", fontSize: 11, fontWeight: "900" },

    badge: {
      position: "absolute",
      top: -6,
      right: -6,
      minWidth: 16,
      height: 16,
      borderRadius: 999,
      paddingHorizontal: 4,
      backgroundColor: "#ef4444",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
    },
    badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },

    /* ===== MODALS ===== */
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    modalCard: {
      position: "absolute",
      backgroundColor: p.menuBg,
      borderWidth: 1,
      borderColor: p.menuBorder,
      borderRadius: 16,
      padding: 12,
      elevation: 10,
    },
    modalTitle: { fontSize: 15, fontWeight: "900", color: p.text },
    modalSub: { fontSize: 12, color: p.muted, marginBottom: 4 },
    modalSep: {
      height: 1,
      backgroundColor: p.menuBorder,
      marginVertical: 8,
    },

    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 10,
      gap: 10,
    },
    menuRowPressed: { backgroundColor: "rgba(148,163,184,0.12)" },
    menuRowText: { fontSize: 14, fontWeight: "800", color: p.menuText },

    /* ===== NAV MENU ROW ===== */
    navRowItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 10,
      gap: 10,
    },
    navRowItemActive: { backgroundColor: "rgba(47,107,255,0.08)" },
    navRowText: { color: p.text, fontSize: 14, fontWeight: "800" },

    /* ===== NOTIFICATIONS ===== */
    notifCard: {
      position: "absolute",
      backgroundColor: p.menuBg,
      borderWidth: 1,
      borderColor: p.menuBorder,
      borderRadius: 16,
      padding: 12,
      elevation: 12,
    },
    notifHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    notifTitle: { fontSize: 15, fontWeight: "900", color: p.text },

    notifAction: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      marginLeft: 6,
    },
    notifActionText: {
      color: "#fff",
      fontWeight: "900",
      fontSize: 12,
      marginLeft: 6,
    },

    notifLoading: { paddingVertical: 20, alignItems: "center" },
    notifScroll: { maxHeight: 380 },

    notifRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderTopWidth: 1,
      borderTopColor: p.menuBorder,
      borderRadius: 10,
      gap: 10,
    },
    notifRowUnread: { backgroundColor: "rgba(47,107,255,0.08)" },

    notifRowTitle: { color: p.text, fontSize: 13 },
    notifRowBody: { color: p.muted, fontSize: 12, marginTop: 2 },

    dot: {
      width: 8,
      height: 8,
      borderRadius: 6,
      backgroundColor: ACCENT_NOTIF,
      marginTop: 6,
    },
  });
}
