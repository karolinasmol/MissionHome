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

type NotifRow = {
  id: string;
  type?: string;
  title?: string;
  body?: string | null;
  read?: boolean;
  createdAt?: any;
  listingId?: string | null;

  inviteId?: string | null;
  familyId?: string | null;
  status?: string | null;
};

type NavItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
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

  // ---- AUTH ----
  const [user, setUser] = useState(() => auth.currentUser);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const uid = user?.uid || null;

  // ---- NICK z Firestore ----
  const [nick, setNick] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setNick(null);
      return;
    }

    const loadNick = async () => {
      try {
        const userRef = doc(db as any, "users", uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          const rawNick = (data?.nick ?? "").trim();
          setNick(rawNick || null);
        } else {
          setNick(null);
        }
      } catch (e) {
        console.log("CustomHeader: error loading nick", e);
        setNick(null);
      }
    };

    loadNick();
  }, [uid]);

  const authDisplayName = (user?.displayName || "").trim() || null;
  const emailPart = user?.email ? user.email.split("@")[0] : null;

  // 👉 TO jest finalny tekst, który ma się pokazać obok avatara:
  const displayNameForHeader =
    nick || authDisplayName || emailPart || "Profil";

  // Tytuł w menu profilu (żeby był taki sam)
  const displayNameForMenu = displayNameForHeader;

  const initials = getInitials(displayNameForMenu);

  console.log("HEADER DEBUG -> uid:", uid, "nick:", nick, "authName:", authDisplayName, "emailPart:", emailPart);

  // ---- NAV ----
  const NAV: NavItem[] = useMemo(
    () => [
      { key: "cal", icon: "calendar-outline", label: "Kalendarz", route: "/calendar" },
      { key: "fam", icon: "people-outline", label: "Rodzina", route: "/family" },
      { key: "stats", icon: "stats-chart-outline", label: "Statystyki", route: "/stats" },
      { key: "ach", icon: "trophy-outline", label: "Osiągnięcia", route: "/achievements" },
    ],
    []
  );

  const isTight = width < 380;
  const primaryNav = isTight ? NAV.slice(0, 2) : NAV;
  const overflowNav = isTight ? NAV.slice(2) : [];

  // ---- DROPDOWNS ----
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);

  const closeAll = () => {
    setProfileOpen(false);
    setMoreOpen(false);
    setNotifsOpen(false);
  };

  // ---- POWIADOMIENIA ----
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifRows, setNotifRows] = useState<NotifRow[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    if (!uid) {
      setUnreadCount(0);
      return;
    }
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
    if (!notifsOpen || !uid) {
      setNotifRows(notifsOpen ? [] : null);
      return;
    }

    setNotifLoading(true);
    const qy = query(
      collection(db as any, `users/${uid}/notifications`),
      orderBy("createdAt", "desc"),
      fsLimit(20)
    );

    const off = onSnapshot(
      qy,
      (snap) => {
        const arr: NotifRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setNotifRows(arr);
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
    try {
      const batch = writeBatch(db as any);
      let touched = 0;
      notifRows.forEach((n) => {
        if (n.read) return;
        touched++;
        batch.set(
          doc(db as any, `users/${uid}/notifications/${n.id}`),
          { read: true, readAt: serverTimestamp() },
          { merge: true } as any
        );
      });
      if (!touched) return;
      await batch.commit();
    } catch {}
  };

  const clearVisible = async () => {
    if (!uid || !notifRows?.length) return;
    try {
      const batch = writeBatch(db as any);
      notifRows.forEach((n) => batch.delete(doc(db as any, `users/${uid}/notifications/${n.id}`)));
      await batch.commit();
      setNotifRows([]);
    } catch {}
  };

  const toggleNotifRead = async (n: NotifRow) => {
    if (!uid) return;
    const nextRead = !n.read;

    setNotifRows((prev) =>
      prev ? prev.map((row) => (row.id === n.id ? { ...row, read: nextRead } : row)) : prev
    );

    try {
      await updateDoc(doc(db as any, `users/${uid}/notifications/${n.id}`), {
        read: nextRead,
        readAt: nextRead ? serverTimestamp() : null,
      });
    } catch {}
  };

  const notifIconFor = (type?: string) => {
    switch (type) {
      case "FAMILY_INVITE":
        return "people";
      case "FAMILY_INVITE_ACCEPTED":
        return "checkmark-circle";
      case "FAMILY_INVITE_DECLINED":
        return "close-circle";
      case "FRIEND_INVITE":
        return "person-add";
      case "FRIEND_INVITE_ACCEPTED":
        return "happy";
      case "LEVEL_UP":
        return "sparkles";
      case "EXP_GAIN":
        return "flash";
      case "WIN":
        return "trophy";
      case "SOLD":
        return "cash";
      case "OUTBID":
        return "trending-up";
      default:
        return "notifications";
    }
  };

  const Badge = ({ count }: { count: number }) => {
    if (!count) return null;
    return (
      <View style={[styles.badge, { borderColor: palette.card }]}>
        <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
      </View>
    );
  };

  const isFamilyOrFriendsNotif = (n: NotifRow) => {
    const t = n.type || "";
    return (
      t === "FAMILY_INVITE" ||
      t === "FAMILY_INVITE_ACCEPTED" ||
      t === "FAMILY_INVITE_DECLINED" ||
      t === "FRIEND_INVITE" ||
      t === "FRIEND_INVITE_ACCEPTED"
    );
  };

  const handleNotifPress = (n: NotifRow) => {
    if (!n.read) toggleNotifRead(n);

    if (isFamilyOrFriendsNotif(n)) {
      setNotifsOpen(false);
      router.push(
        {
          pathname: "/family",
          params: n.familyId ? { from: "notif", familyId: n.familyId } : { from: "notif" },
        } as any
      );
      return;
    }
  };

  const makeTapScale = () => useRef(new Animated.Value(1)).current;

  const NavButton = ({ item }: { item: NavItem }) => {
    const active = pathname === item.route || pathname?.startsWith(item.route);
    const scale = makeTapScale();

    const onPressIn = () =>
      Animated.spring(scale, {
        toValue: 0.96,
        useNativeDriver,
        friction: 7,
        tension: 220,
      }).start();
    const onPressOut = () =>
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver,
        friction: 7,
        tension: 220,
      }).start();

    return (
      <Pressable
        onPress={() => router.push(item.route as any)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.navBtn,
          active && styles.navBtnActive,
          pressed && { opacity: 0.95 },
        ]}
        hitSlop={10}
      >
        <Animated.View style={[styles.navInner, { transform: [{ scale }] }]}>
          <Ionicons
            name={item.icon}
            size={16}
            color={active ? palette.navIconActive : palette.navIcon}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
            {item.label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  };

  const MenuRow = ({
    icon,
    label,
    onPress,
    danger,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    danger?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={danger ? "#ef4444" : palette.menuText}
        style={{ marginRight: 10 }}
      />
      <Text style={[styles.menuRowText, danger && { color: "#ef4444" }]}>{label}</Text>
    </Pressable>
  );

  const panelTop = Math.max(insets.top + 60, 90);

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeWrap, { backgroundColor: palette.bg }]}>
      {/* BAR */}
      <View style={[styles.bar, { marginTop: 8 }]}>
        {/* LEFT: logo */}
        <Pressable
          onPress={() => router.push("/" as any)}
          style={({ pressed }) => [styles.logoWrap, pressed && { opacity: 0.9 }]}
          hitSlop={10}
        >
          <Text style={styles.logoTop}>Mission</Text>
          <Text style={styles.logoBottom}>Home</Text>
        </Pressable>

        {/* RIGHT: actions */}
        <View style={styles.actions}>
          {/* NOTIFS */}
          <Pressable
            onPress={() => {
              setProfileOpen(false);
              setMoreOpen(false);
              setNotifsOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.9 }]}
            hitSlop={10}
          >
            <View style={{ position: "relative" }}>
              <Ionicons
                name={notifsOpen ? "notifications" : "notifications-outline"}
                size={20}
                color={palette.navIcon}
              />
              <Badge count={unreadCount} />
            </View>
          </Pressable>

          {/* PREMIUM */}
          <Pressable
            onPress={() => router.push("/premium" as any)}
            style={({ pressed }) => [styles.premiumChip, pressed && { opacity: 0.9 }]}
            hitSlop={10}
          >
            <Ionicons name="sparkles" size={16} color={ACCENT_PREMIUM} style={{ marginRight: 6 }} />
            <Text style={styles.premiumText}>Premium</Text>
          </Pressable>

          {/* PROFILE */}
          <Pressable
            onPress={() => {
              setNotifsOpen(false);
              setMoreOpen(false);
              setProfileOpen(true);
            }}
            style={({ pressed }) => [styles.profileBtn, pressed && { opacity: 0.92 }]}
            hitSlop={10}
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
            <Text style={styles.profileName} numberOfLines={1}>
              {displayNameForHeader}
            </Text>
            <Ionicons name="chevron-down" size={16} color={palette.profileChevron} />
          </Pressable>
        </View>
      </View>

      {/* NAV */}
      <View style={styles.navRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navRow}
          keyboardShouldPersistTaps="handled"
        >
          {primaryNav.map((it) => (
            <NavButton key={it.key} item={it} />
          ))}

          {overflowNav.length > 0 && (
            <Pressable
              onPress={() => {
                setProfileOpen(false);
                setNotifsOpen(false);
                setMoreOpen(true);
              }}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.95 }]}
              hitSlop={10}
            >
              <View style={styles.navInner}>
                <Ionicons
                  name="ellipsis-horizontal"
                  size={18}
                  color={palette.navIcon}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.navLabel}>Więcej</Text>
              </View>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* ===== MORE MENU (Modal) ===== */}
      <Modal
        transparent
        visible={moreOpen}
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMoreOpen(false)} />
        <View style={[styles.modalCard, { top: panelTop, right: 12 }]}>
          <Text style={styles.modalTitle}>Menu</Text>
          <View style={styles.modalSep} />
          {overflowNav.map((it) => (
            <MenuRow
              key={it.key}
              icon={it.icon}
              label={it.label}
              onPress={() => {
                setMoreOpen(false);
                router.push(it.route as any);
              }}
            />
          ))}
        </View>
      </Modal>

      {/* ===== PROFILE MENU (Modal) ===== */}
      <Modal
        transparent
        visible={profileOpen}
        animationType="fade"
        onRequestClose={() => setProfileOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setProfileOpen(false)} />
        <View style={[styles.modalCard, { top: panelTop, right: 12, width: 240 }]}>
          <Text style={styles.modalTitle}>{displayNameForMenu}</Text>
          <Text style={styles.modalSub}>{user?.email ? user.email : "—"}</Text>
          <View style={styles.modalSep} />

          <MenuRow
            icon="settings-outline"
            label="Ustawienia"
            onPress={() => {
              setProfileOpen(false);
              router.push("/settings" as any);
            }}
          />
          <MenuRow
            icon="bug-outline"
            label="Zgłoś błąd"
            onPress={() => {
              setProfileOpen(false);
              router.push("/bug" as any);
            }}
          />
          <View style={styles.modalSep} />
          <MenuRow
            icon="log-out-outline"
            label="Wyloguj"
            danger
            onPress={async () => {
              try {
                await auth.signOut();
              } catch {}
              setProfileOpen(false);
              router.replace("/login" as any);
            }}
          />
        </View>
      </Modal>

      {/* ===== NOTIFS (Modal) ===== */}
      <Modal
        transparent
        visible={notifsOpen}
        animationType="fade"
        onRequestClose={() => setNotifsOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setNotifsOpen(false)} />
        <View style={[styles.notifCard, { top: panelTop, right: 12, left: 12 }]}>
          <View style={styles.notifHeader}>
            <Text style={styles.notifTitle}>Powiadomienia</Text>

            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                onPress={markVisibleRead}
                activeOpacity={0.9}
                style={[styles.notifAction, { backgroundColor: ACCENT_NOTIF, marginRight: 8 }]}
              >
                <Ionicons name="checkmark-done" size={14} color="#fff" />
                <Text style={styles.notifActionText}>Przeczytane</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={clearVisible}
                activeOpacity={0.9}
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
              <ActivityIndicator color={isDark ? "#fff" : "#111"} />
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
            <ScrollView style={styles.notifScroll} contentContainerStyle={{ paddingBottom: 8 }}>
              {notifRows.map((n) => {
                const icon = notifIconFor(n.type);
                const unread = !n.read;

                return (
                  <TouchableOpacity
                    key={n.id}
                    activeOpacity={0.92}
                    onPress={() => handleNotifPress(n)}
                    onLongPress={() => toggleNotifRead(n)}
                    delayLongPress={280}
                    style={[styles.notifRow, unread && styles.notifRowUnread]}
                  >
                    <Ionicons
                      name={icon as any}
                      size={18}
                      color={unread ? ACCENT_NOTIF : palette.navIcon}
                      style={{ marginRight: 10, marginTop: 2 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={[styles.notifRowTitle, { fontWeight: unread ? "900" : "700" }]}
                      >
                        {n.title || "Powiadomienie"}
                      </Text>
                      {!!n.body && (
                        <Text numberOfLines={2} style={styles.notifRowBody}>
                          {n.body}
                        </Text>
                      )}
                      <Text style={styles.notifHint}>
                        Tap: otwórz • Long-press: read/unread
                      </Text>
                    </View>
                    {unread ? <View style={styles.dot} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            onPress={() => {
              setNotifsOpen(false);
              router.push("/notifications" as any);
            }}
            activeOpacity={0.92}
            style={[styles.bigCta, { backgroundColor: ACCENT_NOTIF }]}
          >
            <Ionicons name="open-outline" size={16} color="#fff" />
            <Text style={styles.bigCtaText}>Zobacz wszystkie</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------ HELPERS ------------------ */
function getInitials(name: string) {
  if (!name) return "MH";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const p = parts[0];
    if (!p) return "MH";
    if (p.includes("@")) return p[0]?.toUpperCase() || "M";
    return p.slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function makePalette({
  isDark,
  colors,
}: {
  isDark: boolean;
  colors: {
    bg: string;
    card: string;
    text: string;
    textMuted: string;
    accent: string;
    border: string;
  };
}) {
  return {
    bg: colors.bg,
    card: colors.card,
    border: colors.border,
    text: colors.text,
    muted: colors.textMuted,
    navIcon: isDark ? "#cbd5f5" : "#0f172a",
    navIconActive: colors.accent,
    navText: colors.text,
    navTextActive: colors.accent,
    profileChevron: isDark ? "#94a3b8" : "#475569",
    menuBg: isDark ? "#0b1220" : "#ffffff",
    menuBorder: isDark ? "rgba(148,163,184,0.32)" : "rgba(15,23,42,0.12)",
    menuText: isDark ? "#e5e7eb" : "#0f172a",
    chipBg: isDark ? "rgba(2,6,23,0.6)" : "rgba(219,234,254,0.9)",
  };
}

function makeStyles(palette: ReturnType<typeof makePalette>) {
  return StyleSheet.create({
    safeWrap: {
      width: "100%",
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingHorizontal: 12,
      paddingBottom: 8,
      zIndex: 10,
    },

    bar: {
      width: "100%",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      elevation: 4,
    },

    logoWrap: { paddingVertical: 2, paddingRight: 8 },
    logoTop: { fontSize: 18, fontWeight: "900", color: palette.text, lineHeight: 18 },
    logoBottom: {
      fontSize: 18,
      fontWeight: "900",
      color: "#1dd4c7",
      lineHeight: 18,
      marginTop: 1,
    },

    actions: { flexDirection: "row", alignItems: "center" },
    iconBtn: {
      width: 40,
      height: 38,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: "transparent",
    },

    premiumChip: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.chipBg,
      paddingHorizontal: 10,
      height: 38,
      borderRadius: 12,
      marginRight: 8,
    },
    premiumText: { color: ACCENT_PREMIUM, fontWeight: "900", fontSize: 12 },

    profileBtn: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.chipBg,
      paddingHorizontal: 10,
      height: 38,
      borderRadius: 12,
      maxWidth: 190,
    },

    profileName: {
      color: palette.menuText,
      fontWeight: "800",
      fontSize: 13,
      marginRight: 6,
      maxWidth: 90,
    },

    avatarOuter: {
      width: 26,
      height: 26,
      borderRadius: 13,
      overflow: "hidden",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(148,163,184,0.7)",
      marginRight: 8,
    },
    avatarImage: { width: "100%", height: "100%", borderRadius: 13 },
    avatarFallback: {
      width: "100%",
      height: "100%",
      borderRadius: 13,
      backgroundColor: "rgba(15,23,42,0.8)",
      justifyContent: "center",
      alignItems: "center",
    },
    avatarFallbackText: { color: "#e5e7eb", fontSize: 11, fontWeight: "900" },

    badge: {
      position: "absolute",
      top: -8,
      right: -10,
      minWidth: 18,
      height: 18,
      borderRadius: 999,
      paddingHorizontal: 5,
      backgroundColor: "#ef4444",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
    },
    badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },

    navRowWrap: { marginTop: 10 },
    navRow: { paddingHorizontal: 2, paddingBottom: 2, alignItems: "center" },

    navBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginRight: 10,
    },
    navBtnActive: {
      backgroundColor: "rgba(47,107,255,0.10)",
      borderColor: "rgba(47,107,255,0.35)",
    },

    navInner: { flexDirection: "row", alignItems: "center" },
    navLabel: { fontSize: 13, color: palette.navText, fontWeight: "800" },
    navLabelActive: { color: palette.navTextActive },

    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(2,6,23,0.35)",
    },
    modalCard: {
      position: "absolute",
      backgroundColor: palette.menuBg,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      borderRadius: 14,
      paddingVertical: 8,
      paddingHorizontal: 10,
      width: 260,
      elevation: 8,
    },
    modalTitle: { color: palette.text, fontSize: 14, fontWeight: "900" },
    modalSub: { color: palette.muted, fontSize: 12, marginTop: 2, marginBottom: 4 },
    modalSep: { height: 1, backgroundColor: palette.menuBorder, marginVertical: 8 },

    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 10,
    },
    menuRowPressed: { backgroundColor: "rgba(148,163,184,0.12)" },
    menuRowText: { fontSize: 14, fontWeight: "800", color: palette.menuText },

    notifCard: {
      position: "absolute",
      backgroundColor: palette.menuBg,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 10,
      elevation: 10,
      maxWidth: 520,
      alignSelf: "center",
    },
    notifHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    notifTitle: { color: palette.text, fontSize: 15, fontWeight: "900" },
    notifAction: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    notifActionText: { color: "#fff", fontWeight: "900", fontSize: 12, marginLeft: 6 },

    notifLoading: { paddingVertical: 20, alignItems: "center", justifyContent: "center" },
    notifScroll: { maxHeight: 360, marginTop: 4 },

    notifRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderTopWidth: 1,
      borderTopColor: palette.menuBorder,
      borderRadius: 10,
    },
    notifRowUnread: { backgroundColor: "rgba(47,107,255,0.08)" },
    notifRowTitle: { color: palette.text, fontSize: 13 },
    notifRowBody: { color: palette.muted, marginTop: 2, fontSize: 12, lineHeight: 16 },
    notifHint: { color: palette.muted, marginTop: 6, fontSize: 10 },

    dot: {
      width: 10,
      height: 10,
      borderRadius: 10,
      backgroundColor: ACCENT_NOTIF,
      marginLeft: 8,
      marginTop: 4,
    },

    bigCta: {
      marginTop: 10,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    bigCtaText: { color: "#fff", fontWeight: "900", fontSize: 13, marginLeft: 8 },
  });
}
