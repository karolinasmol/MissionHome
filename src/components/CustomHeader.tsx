// src/components/CustomHeader.tsx
// UPDATED: Theme button in header is now ONLY the palette icon (no theme name).
// UPDATED: Theme names in dropdown are colorized to match the theme look (heuristic by label/key + fallback).

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
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

import { useTheme, useThemeColors, THEMES, THEME_LABELS, Theme } from "../context/ThemeContext";
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
};

export default function CustomHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { theme, setTheme } = useTheme();
  const { colors, isDark } = useThemeColors();

  const palette = useMemo(() => makePalette({ isDark, colors }), [isDark, colors]);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const AVAILABLE_THEMES = THEMES as Theme[];

  /* ========== AUTH ========== */
  const [user, setUser] = useState(() => auth.currentUser);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  const uid = user?.uid || null;

  /* ========== NICKNAME ========== */
  const [nick, setNick] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return setNick(null);

    (async () => {
      try {
        const ref = doc(db as any, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const raw = (snap.data()?.nick ?? "").trim();
          setNick(raw || null);
        }
      } catch {
        setNick(null);
      }
    })();
  }, [uid]);

  const displayName =
    nick || user?.displayName?.trim() || user?.email?.split("@")[0] || "Profil";
  const initials = getInitials(displayName);

  /* ========== NAV STRUCTURE ========== */
  const NAV: NavItem[] = [
    { key: "cal", icon: "calendar-outline", label: "Kalendarz", route: "/calendar" },
    { key: "fam", icon: "people-outline", label: "Rodzina", route: "/family" },
    { key: "stats", icon: "stats-chart-outline", label: "Statystyki", route: "/stats" },
    { key: "ach", icon: "trophy-outline", label: "Osiągnięcia", route: "/achievements" },
    { key: "rank", icon: "podium-outline", label: "Ranking", route: "/Ranking" },
    { key: "msg", icon: "chatbubbles-outline", label: "Wiadomości", route: "/messages" },
  ];

  /* ========== MODALS ========== */
  const [profileOpen, setProfileOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const closeAll = () => {
    setProfileOpen(false);
    setNavOpen(false);
    setNotifsOpen(false);
    setThemeOpen(false);
  };

  useEffect(() => {
    // zamykaj panele przy zmianie trasy (jak na web)
    closeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
    notifRows.forEach((n) => batch.delete(doc(db as any, `users/${uid}/notifications/${n.id}`)));
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

  const notifIconFor = (t?: string) =>
    ({
      FAMILY_INVITE: "people",
      FRIEND_INVITE: "person-add",
      LEVEL_UP: "sparkles",
      WIN: "trophy",
    }[t || ""] || "notifications");

  const Badge = ({ count }: { count: number }) =>
    !count ? null : (
      <View style={[styles.badge, { borderColor: palette.card }]}>
        <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
      </View>
    );

  /* ========== FIX: dynamiczny offset panelu ========== */
  const panelTop = Math.max(insets.top + 50, 80);

  const handleThemeSelect = (t: Theme) => {
    if (t === theme) {
      setThemeOpen(false);
      return;
    }
    try {
      setTheme(t);
    } catch {}
    setThemeOpen(false);
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeWrap, { backgroundColor: palette.bg }]}>
      <View style={styles.bar}>
        {/* LEFT: LOGO + THEME */}
        <View style={styles.left}>
          <Pressable
            onPress={() => router.push("/" as any)}
            style={({ pressed }) => [styles.logoWrap, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.logoTop}>Mission</Text>
            <Text style={styles.logoBottom}>Home</Text>
          </Pressable>

          {/* THEME BUTTON (native) — ONLY ICON */}
          <Pressable
            onPress={() => {
              closeAll();
              setThemeOpen(true);
            }}
            style={({ pressed }) => [styles.themeIconBtn, pressed && { opacity: 0.9 }]}
            accessibilityLabel="Zmień motyw"
          >
            <Ionicons name="color-palette" size={18} color={palette.navIcon} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          {/* MENU */}
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

      {/* ================= THEME MENU ================= */}

      <Modal transparent visible={themeOpen} animationType="fade">
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalOverlay} onPress={() => setThemeOpen(false)} />

          <View style={[styles.modalCard, { marginTop: panelTop, width: "92%", maxWidth: 360 }]}>
            <Text style={styles.modalTitle}>Motywy</Text>
            <View style={styles.modalSep} />

            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 6 }}>
              {AVAILABLE_THEMES.map((t) => {
                const active = t === theme;
                const labelUpper = String(THEME_LABELS?.[t] ?? t).toUpperCase();

                // heuristic “looks-like” color for each theme (by key/label); fallback is stable
                const themeColor = active
                  ? palette.navIconActive
                  : guessThemeColor({
                      themeKey: String(t),
                      labelUpper,
                      isDark,
                      fallbackSeed: String(t),
                    });

                return (
                  <Pressable
                    key={String(t)}
                    onPress={() => handleThemeSelect(t)}
                    style={({ pressed }) => [
                      styles.themeRow,
                      active && styles.themeRowActive,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <View style={styles.themeRowLeft}>
                      <View style={[styles.themeSwatch, { backgroundColor: themeColor }]} />
                      <Text style={[styles.themeRowText, { color: themeColor }]} numberOfLines={1}>
                        {labelUpper}
                      </Text>
                    </View>

                    {active ? (
                      <Ionicons name="checkmark" size={16} color={palette.navIconActive} />
                    ) : (
                      <View style={{ width: 16 }} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= NAV MENU ================= */}

      <Modal transparent visible={navOpen} animationType="fade">
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalOverlay} onPress={() => setNavOpen(false)} />

          <View style={[styles.modalCard, { marginTop: panelTop }]}>
            <Text style={styles.modalTitle}>Nawigacja</Text>
            <View style={styles.modalSep} />

            <ScrollView style={{ maxHeight: 380 }}>
              {NAV.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    setNavOpen(false);
                    router.push(item.route as any);
                  }}
                  style={({ pressed }) => [
                    styles.navRowItem,
                    pressed && { opacity: 0.8 },
                    pathname.startsWith(item.route) && styles.navRowItemActive,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={pathname.startsWith(item.route) ? palette.navIconActive : palette.navIcon}
                  />
                  <Text
                    style={[
                      styles.navRowText,
                      pathname.startsWith(item.route) && { color: palette.navIconActive },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= PROFILE MENU ================= */}

      <Modal transparent visible={profileOpen} animationType="fade">
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalOverlay} onPress={() => setProfileOpen(false)} />

          <View style={[styles.modalCard, { marginTop: panelTop, width: 260 }]}>
            <Text style={styles.modalTitle}>{displayName}</Text>
            <Text style={styles.modalSub}>{user?.email}</Text>

            <View style={styles.modalSep} />

            <ScrollView style={{ maxHeight: 340 }}>
              {/* PROFILE PAGE */}
              <Pressable
                onPress={() => {
                  setProfileOpen(false);
                  router.push("/Profile" as any);
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              >
                <Ionicons name="person-outline" size={18} color={palette.menuText} />
                <Text style={styles.menuRowText}>Profil</Text>
              </Pressable>

              {/* SETTINGS */}
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

              {/* BUG REPORT */}
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

              {/* LOGOUT */}
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= NOTIFICATIONS ================= */}

      <Modal transparent visible={notifsOpen} animationType="fade">
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalOverlay} onPress={() => setNotifsOpen(false)} />

          <View style={[styles.notifCard, { marginTop: panelTop }]}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifTitle}>Powiadomienia</Text>

              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={markVisibleRead}
                  activeOpacity={0.85}
                  style={[styles.notifAction, { backgroundColor: ACCENT_NOTIF, marginRight: 8 }]}
                >
                  <Ionicons name="checkmark-done" size={14} color="#fff" />
                  <Text style={styles.notifActionText}>Przeczytane</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={clearVisible}
                  activeOpacity={0.85}
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
              <ScrollView style={[styles.notifScroll, { maxHeight: 380 }]}>
                {notifRows.map((n) => {
                  const unread = !n.read;
                  return (
                    <TouchableOpacity
                      key={n.id}
                      activeOpacity={0.85}
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
                          numberOfLines={1}
                          style={[styles.notifRowTitle, { fontWeight: unread ? "900" : "700" }]}
                        >
                          {n.title || "Powiadomienie"}
                        </Text>

                        {n.body && (
                          <Text numberOfLines={2} style={styles.notifRowBody}>
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

function hexToRgba(hex: string, alpha: number) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hashStringToIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return mod ? h % mod : 0;
}

function guessThemeColor({
  themeKey,
  labelUpper,
  isDark,
  fallbackSeed,
}: {
  themeKey: string;
  labelUpper: string;
  isDark: boolean;
  fallbackSeed: string;
}) {
  const key = `${themeKey} ${labelUpper}`.toUpperCase();

  // keyword-based (matches typical theme names/labels)
  if (/(OCEAN|SEA|MORZ|AQUA|TURQUOISE|CYAN|TEAL)/.test(key)) return "#22d3ee";
  if (/(FOREST|JUNGLE|LAS|GREEN|EMERALD)/.test(key)) return "#22c55e";
  if (/(SUNSET|ZACH(O|Ó)D|ORANGE|AMBER|GOLD|SUN)/.test(key)) return "#f59e0b";
  if (/(ROSE|PINK|MAGENTA|FUCHSIA)/.test(key)) return "#ec4899";
  if (/(PURPLE|VIOLET|LAVENDER|INDIGO)/.test(key)) return "#8b5cf6";
  if (/(MIDNIGHT|NIGHT|NOC|DARK|BLACK)/.test(key)) return "#60a5fa";
  if (/(ICE|FROST|SNOW|WINTER)/.test(key)) return "#93c5fd";
  if (/(SAND|DESERT|BEIGE|EARTH|BRONZE)/.test(key)) return "#d97706";
  if (/(MONO|GRAY|GREY|SZAR|GRAPHITE)/.test(key)) return isDark ? "#cbd5e1" : "#475569";

  // stable fallback palette
  const fallback = ["#22d3ee", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#60a5fa", "#10b981"];
  return fallback[hashStringToIndex(fallbackSeed, fallback.length)];
}

function makePalette({ isDark, colors }: any) {
  const accentSoft = hexToRgba(colors.accent, isDark ? 0.18 : 0.12);

  return {
    bg: colors.bg,
    card: colors.card,
    border: colors.border,
    text: colors.text,
    muted: colors.textMuted,
    accentSoft,

    navIcon: isDark ? "#cbd5f5" : "#0f172a",
    navIconActive: colors.accent,

    profileChevron: isDark ? "#94a3b8" : "#475569",

    menuBg: isDark ? "#0b1220" : "#ffffff",
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

    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexShrink: 1,
    },

    logoWrap: { flexDirection: "column" },
    logoTop: { fontSize: 18, fontWeight: "900", color: p.text, lineHeight: 18 },
    logoBottom: { fontSize: 18, fontWeight: "900", color: "#1dd4c7", lineHeight: 18 },

    // NEW: icon-only theme button
    themeIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: "transparent",
    },

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
    modalContainer: {
      flex: 1,
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 10,
    },

    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },

    modalCard: {
      backgroundColor: p.menuBg,
      borderWidth: 1,
      borderColor: p.menuBorder,
      borderRadius: 16,
      padding: 14,
      width: "92%",
      maxWidth: 420,
      maxHeight: "80%",
    },

    modalTitle: { fontSize: 15, fontWeight: "900", color: p.text },
    modalSub: { fontSize: 12, color: p.muted, marginTop: 2, marginBottom: 4 },
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

    /* ===== THEME LIST ===== */
    themeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    themeRowActive: {
      backgroundColor: p.accentSoft,
    },
    themeRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      paddingRight: 10,
    },
    themeSwatch: {
      width: 10,
      height: 10,
      borderRadius: 999,
    },
    themeRowText: {
      fontSize: 12,
      fontWeight: "900",
      flex: 1,
    },

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
      backgroundColor: p.menuBg,
      borderWidth: 1,
      borderColor: p.menuBorder,
      borderRadius: 16,
      padding: 14,
      width: "92%",
      maxWidth: 460,
      maxHeight: "82%",
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
    notifScroll: {},

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

// src/components/CustomHeader.tsx
