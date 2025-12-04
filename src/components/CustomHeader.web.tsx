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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";

import { useTheme, useThemeColors } from "../context/ThemeContext";
import { auth, db } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as fsLimit,
  writeBatch,
  doc,
  serverTimestamp,
  updateDoc,
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

export default function CustomHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const { theme, toggleTheme } = useTheme();
  const { colors, isDark } = useThemeColors();

  const palette = useMemo(() => makePalette({ isDark, colors }), [isDark, colors]);
  const isWeb = Platform.OS === "web";
  const useNative = Platform.OS !== "web";

  const styles = useMemo(() => makeStyles(palette, isWeb), [palette, isWeb]);

  // AUTH
  const [user, setUser] = useState(() => auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const uid = user?.uid || null;

  // USERNAME
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setUsername(null);
      return;
    }

    const userRef = doc(db as any, "users", uid);

    const unsub = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.data() as any;
        const u = typeof data?.username === "string" ? data.username.trim() : "";
        setUsername(u || null);
      },
      () => setUsername(null)
    );

    return () => unsub();
  }, [uid]);

  const fallbackName =
    user?.displayName || user?.email?.split("@")[0] || "Użytkownik";
  const shownName = username || fallbackName;
  const initials = getInitials(shownName);

  // PROFILE MENU
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const openMenu = () => {
    setMenuOpen(true);
    menuAnim.setValue(0);
    Animated.timing(menuAnim, {
      toValue: 1,
      duration: 170,
      useNativeDriver: useNative,
    }).start();
  };

  const closeMenu = () =>
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 130,
      useNativeDriver: useNative,
    }).start(() => setMenuOpen(false));

  const toggleMenu = () => {
    if (menuOpen) closeMenu();
    else {
      closeNotifs();
      openMenu();
    }
  };

  // NOTIFICATIONS PANEL
  const [notifsOpen, setNotifsOpen] = useState(false);
  const notifAnim = useRef(new Animated.Value(0)).current;

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

  const openNotifs = () => {
    closeMenu();
    setNotifsOpen(true);
    notifAnim.setValue(0);
    Animated.timing(notifAnim, {
      toValue: 1,
      duration: 170,
      useNativeDriver: useNative,
    }).start();
  };

  const closeNotifs = () =>
    Animated.timing(notifAnim, {
      toValue: 0,
      duration: 130,
      useNativeDriver: useNative,
    }).start(() => setNotifsOpen(false));

  const toggleNotifs = () => {
    if (notifsOpen) closeNotifs();
    else openNotifs();
  };

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
      notifRows.forEach((n) => {
        batch.delete(doc(db as any, `users/${uid}/notifications/${n.id}`));
      });
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
      closeNotifs();
      router.push(
        {
          pathname: "/family",
          params: n.familyId
            ? { from: "notif", familyId: n.familyId }
            : { from: "notif" },
        } as any
      );
    }
  };

  // NAV BUTTON
  const NavButton = ({
    icon,
    label,
    route,
    premium,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    route: string;
    premium?: boolean;
  }) => {
    const active = pathname === route || pathname?.startsWith(route);
    const scale = useRef(new Animated.Value(1)).current;
    const [hovered, setHovered] = useState(false);

    const onPressIn = () =>
      Animated.spring(scale, {
        toValue: 0.95,
        useNativeDriver: useNative,
        friction: 6,
        tension: 220,
      }).start();

    const onPressOut = () =>
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: useNative,
        friction: 6,
        tension: 220,
      }).start();

    const hoverHandlers =
      isWeb
        ? ({
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          } as any)
        : {};

    return (
      <Pressable
        onPress={() => router.push(route as any)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        {...hoverHandlers}
        style={[
          styles.navBtn,
          hovered && styles.navBtnHover,
          active && styles.navBtnActive,
        ]}
      >
        <Animated.View style={[styles.navInner, { transform: [{ scale }] }]}>
          <Ionicons
            name={icon}
            size={18}
            color={active ? palette.navIconActive : palette.navIcon}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text
              style={[styles.navLabel, active && styles.navLabelActive]}
            >
              {label}
            </Text>

            {premium && (
              <Ionicons
                name="sparkles"
                size={14}
                color={ACCENT_PREMIUM}
                style={{ marginTop: 1 }}
              />
            )}
          </View>
        </Animated.View>
      </Pressable>
    );
  };

  // MENU ITEM
  const MenuItem = ({
    icon,
    label,
    onPress,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && styles.menuItemPressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={palette.menuText}
        style={{ marginRight: 8 }}
      />
      <Text style={styles.menuItemText}>{label}</Text>
    </Pressable>
  );

  useEffect(() => {
    if (menuOpen) closeMenu();
    if (notifsOpen) closeNotifs();
  }, [pathname]);

  // RENDER
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.main}>
        <View style={styles.left}>
          <Pressable onPress={() => router.push("/")} style={styles.logoWrap}>
            <Text style={styles.logoTop}>Mission</Text>
            <Text style={styles.logoBottom}>Home</Text>
          </Pressable>

          <Pressable
            onPress={toggleTheme}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.card,
              },
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Ionicons
              name="color-palette"
              size={18}
              color={palette.accent}
            />
            {Platform.OS === "web" && (
              <Text
                style={{ color: palette.text, fontWeight: "700" }}
              >
                {theme.toUpperCase()}
              </Text>
            )}
          </Pressable>
        </View>

        {!user ? null : (
          <>
            <View style={styles.center}>
              <NavButton
                icon="calendar-outline"
                label="Kalendarz"
                route="/calendar"
              />

              <NavButton
                icon="people-outline"
                label="Rodzina"
                route="/family"
                premium
              />

              <NavButton
                icon="stats-chart-outline"
                label="Statystyki"
                route="/stats"
              />

              <NavButton
                icon="trophy-outline"
                label="Osiągnięcia"
                route="/achievements"
              />

              <NavButton
                icon="podium-outline"
                label="Ranking"
                route="/Ranking"
              />
            </View>

            <View style={styles.right}>
              <Pressable
                onPress={() => router.push("/premium")}
                style={({ pressed }) => [
                  styles.premiumBtn,
                  pressed && styles.premiumBtnPressed,
                ]}
              >
                {isWeb && (
                  <Text style={styles.premiumText}>Premium</Text>
                )}

                <Ionicons
                  name="sparkles"
                  size={18}
                  color={ACCENT_PREMIUM}
                />
              </Pressable>

              <Pressable
                onPress={() => router.push("/messages")}
                style={({ pressed }) => [
                  styles.bellBtn,
                  pressed && {
                    opacity: 0.9,
                    transform: [{ scale: 0.98 }],
                  },
                ]}
              >
                <Ionicons
                  name="chatbubbles-outline"
                  size={20}
                  color={palette.navIcon}
                />

                {isWeb && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text style={styles.bellLabel}>Wiadomości</Text>
                    <Ionicons
                      name="sparkles"
                      size={14}
                      color={ACCENT_PREMIUM}
                    />
                  </View>
                )}
              </Pressable>

              <Pressable
                onPress={toggleNotifs}
                style={({ pressed }) => [
                  styles.bellBtn,
                  pressed && {
                    opacity: 0.9,
                    transform: [{ scale: 0.98 }],
                  },
                ]}
              >
                <View style={{ position: "relative" }}>
                  <Ionicons
                    name={
                      notifsOpen ? "notifications" : "notifications-outline"
                    }
                    size={20}
                    color={palette.navIcon}
                  />
                  <Badge count={unreadCount} />
                </View>

                {isWeb && (
                  <Text style={styles.bellLabel}>Powiadomienia</Text>
                )}
              </Pressable>

              <Pressable
                onPress={toggleMenu}
                style={({ pressed }) => [
                  styles.profileBtn,
                  pressed && styles.profileBtnPressed,
                ]}
              >
                <View style={styles.avatarOuter}>
                  <View style={styles.avatarInner}>
                    {user?.photoURL ? (
                      <Image
                        source={{ uri: user.photoURL }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarFallbackText}>
                          {initials}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text
                  style={styles.profileName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {shownName}
                </Text>

                <Ionicons
                  name={menuOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={palette.profileChevron}
                />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* MENU DROPDOWN */}
      {user && menuOpen && (
        <>
          <Pressable
            style={styles.backdrop}
            onPress={closeMenu}
            pointerEvents="auto"
          />

          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.menu,
              {
                opacity: menuAnim,
                transform: [
                  {
                    translateY: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                  {
                    scale: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <MenuItem
              icon="person-outline"
              label="Profil"
              onPress={() => {
                closeMenu();
                router.push("/Profile");
              }}
            />

            <MenuItem
              icon="settings-outline"
              label="Ustawienia"
              onPress={() => {
                closeMenu();
                router.push("/settings");
              }}
            />

            <MenuItem
              icon="bug-outline"
              label="Zgłoś błąd"
              onPress={() => {
                closeMenu();
                router.push("/bug");
              }}
            />

            <View style={styles.menuSeparator} />

            <MenuItem
              icon="log-out-outline"
              label="Wyloguj"
              onPress={async () => {
                try {
                  await auth.signOut();
                } catch {}
                closeMenu();
                router.replace("/login");
              }}
            />
          </Animated.View>
        </>
      )}

      {/* NOTIFICATION PANEL */}
      {user && notifsOpen && (
        <>
          <Pressable
            style={styles.backdrop}
            onPress={closeNotifs}
            pointerEvents="auto"
          />

          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.notifPanel,
              {
                opacity: notifAnim,
                transform: [
                  {
                    translateY: notifAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                  {
                    scale: notifAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.notifHeader}>
              <Text style={styles.notifTitle}>Powiadomienia</Text>

              <TouchableOpacity
                onPress={markVisibleRead}
                activeOpacity={0.9}
                style={styles.notifAction}
              >
                <Ionicons name="checkmark-done" size={14} color="#fff" />
                <Text style={styles.notifActionText}>Przeczytane</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.notifSeparator} />

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
                <Text style={{ color: palette.muted }}>
                  Brak powiadomień
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.notifScroll}
                contentContainerStyle={styles.notifList}
              >
                {notifRows.map((n) => {
                  const icon = notifIconFor(n.type);
                  const unread = !n.read;

                  return (
                    <TouchableOpacity
                      key={n.id}
                      activeOpacity={0.92}
                      onPress={() => handleNotifPress(n)}
                      style={[
                        styles.notifRow,
                        unread && styles.notifRowUnread,
                      ]}
                    >
                      <Ionicons
                        name={icon as any}
                        size={18}
                        color={unread ? ACCENT_NOTIF : palette.navIcon}
                        style={{ marginRight: 10 }}
                      />

                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.notifRowTitle,
                            { fontWeight: unread ? "900" : "700" },
                          ]}
                        >
                          {n.title || "Powiadomienie"}
                        </Text>

                        {!!n.body && (
                          <Text
                            numberOfLines={2}
                            style={styles.notifRowBody}
                          >
                            {n.body}
                          </Text>
                        )}
                      </View>

                      {unread ? <View style={styles.dot} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* FOOTER — BUTTON „Zobacz wszystkie” USUNIĘTY */}
            <View style={styles.notifFooter}>

              {/* ❌ REMOVED BUTTON
              <TouchableOpacity
                onPress={() => {
                  closeNotifs();
                  router.push("/notifications");
                }}
                activeOpacity={0.9}
                style={[
                  styles.footerBtn,
                  { backgroundColor: ACCENT_NOTIF },
                ]}
              >
                <Ionicons name="open-outline" size={14} color="#fff" />
                <Text style={styles.footerBtnText}>Zobacz wszystkie</Text>
              </TouchableOpacity>
              */}

              <TouchableOpacity
                onPress={clearVisible}
                activeOpacity={0.9}
                style={[
                  styles.footerBtn,
                  { backgroundColor: "#6B7280" },
                ]}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.footerBtnText}>Wyczyść</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

/* HELPERS */
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
    accent: colors.accent,

    navIcon: isDark ? "#cbd5f5" : "#0f172a",
    navIconActive: colors.accent,
    navText: colors.text,
    navTextActive: colors.accent,

    themePillBg: isDark ? "#020617" : "#e2f5f3",
    themePillBorder: colors.border,
    themeIcon: isDark ? "#cbd5e1" : "#0f172a",
    themeIconActive: "#fefce8",

    profileChevron: isDark ? "#94a3b8" : "#475569",

    menuBg: isDark ? "#020617" : "#ffffff",
    menuBorder: isDark ? "rgba(148,163,184,0.4)" : "rgba(15,23,42,0.12)",
    menuText: isDark ? "#e5e7eb" : "#0f172a",
    menuItemHover: isDark ? "rgba(15,23,42,0.92)" : "rgba(15,23,42,0.04)",

    chipBg: colors.card,

    avatarRing: colors.border,
    avatarBg: colors.card,
    avatarText: colors.text,
  };
}

function makeStyles(palette: ReturnType<typeof makePalette>, isWeb: boolean) {
  return StyleSheet.create({
    wrap: {
      width: "100%",
      backgroundColor: palette.bg,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      zIndex: 100,
    },
    main: {
      width: "100%",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 6,
    },

    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    logoWrap: {
      paddingRight: 6,
      paddingVertical: 4,
      ...(isWeb ? ({ cursor: "pointer" } as any) : null),
    },
    logoTop: {
      fontSize: 18,
      fontWeight: "900",
      color: palette.text,
      lineHeight: 18,
    },
    logoBottom: {
      fontSize: 18,
      fontWeight: "900",
      color: "#1dd4c7",
      lineHeight: 20,
      marginTop: -2,
    },

    center: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 20,
      gap: 18,
    },

    navBtn: {
      borderRadius: 999,
      paddingHorizontal: 2,
      paddingVertical: 2,
      ...(isWeb ? ({ cursor: "pointer" } as any) : null),
    },
    navBtnHover: {
      backgroundColor: "rgba(15,23,42,0.12)",
    },
    navBtnActive: {
      backgroundColor: "rgba(15,23,42,0.18)",
    },

    navInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    navLabel: {
      fontSize: 14,
      color: palette.navText,
      fontWeight: "600",
    },
    navLabelActive: {
      color: palette.navTextActive,
      fontWeight: "700",
    },

    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginLeft: 12,
    },

    bellBtn: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: "transparent",
      ...(isWeb ? ({ cursor: "pointer" } as any) : null),
    },
    bellLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: palette.text,
    },

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
    badgeText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "900",
    },

    premiumBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: "transparent",
      ...(isWeb ? ({ cursor: "pointer" } as any) : null),
    },
    premiumBtnPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    premiumText: {
      fontSize: 14,
      fontWeight: "700",
      color: ACCENT_PREMIUM,
    },

    profileBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: palette.chipBg,
      borderWidth: 1,
      borderColor: palette.border,
      ...(isWeb ? ({ cursor: "pointer" } as any) : null),
    },
    profileBtnPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },

    avatarOuter: {
      width: 30,
      height: 30,
      borderRadius: 999,
      padding: 2,
      backgroundColor: palette.avatarRing,
    },
    avatarInner: {
      flex: 1,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: palette.avatarBg,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },

    avatarFallback: {
      width: "100%",
      height: "100%",
      borderRadius: 999,
      backgroundColor: palette.avatarBg,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarFallbackText: {
      color: palette.avatarText,
      fontSize: 11,
      fontWeight: "800",
    },

    profileName: {
      fontSize: 14,
      fontWeight: "800",
      color: palette.text,
      maxWidth: isWeb ? 160 : 120,
    },

    backdrop: {
      position: Platform.OS === "web" ? "fixed" : "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "transparent",
      zIndex: 999,
    },

    menu: {
      position: "absolute",
      right: 18,
      top: 56,
      width: 210,
      backgroundColor: palette.menuBg,
      borderRadius: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      zIndex: 1000,
      ...(isWeb
        ? ({ boxShadow: "0 14px 32px rgba(0,0,0,0.35)" } as any)
        : null),
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    menuItemPressed: {
      backgroundColor: palette.menuItemHover,
    },
    menuItemText: {
      fontSize: 14,
      fontWeight: "600",
      color: palette.menuText,
    },
    menuSeparator: {
      height: 1,
      marginVertical: 4,
      backgroundColor: palette.menuBorder,
    },

    notifPanel: {
      position: "absolute",
      right: 18,
      top: 56,
      width: 360,
      maxWidth: "92%",
      backgroundColor: palette.menuBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      overflow: "hidden",
      zIndex: 1001,
      ...(isWeb
        ? ({ boxShadow: "0 16px 40px rgba(0,0,0,0.38)" } as any)
        : null),
    },

    notifHeader: {
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    notifTitle: {
      color: palette.text,
      fontSize: 15,
      fontWeight: "900",
    },
    notifAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: ACCENT_NOTIF,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    notifActionText: {
      color: "#fff",
      fontWeight: "900",
      fontSize: 12,
    },

    notifSeparator: {
      height: 1,
      backgroundColor: palette.menuBorder,
    },

    notifLoading: {
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    notifScroll: {
      maxHeight: 360,
    },
    notifList: {
      paddingVertical: 6,
    },

    notifRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      borderTopColor: palette.menuBorder,
      gap: 6,
    },
    notifRowUnread: {
      backgroundColor: isWeb
        ? "rgba(47,107,255,0.06)"
        : "rgba(47,107,255,0.08)",
    },
    notifRowTitle: {
      color: palette.text,
      fontSize: 13,
    },
    notifRowBody: {
      color: palette.muted,
      marginTop: 2,
      fontSize: 12,
      lineHeight: 16,
    },

    dot: {
      width: 10,
      height: 10,
      borderRadius: 10,
      backgroundColor: ACCENT_NOTIF,
      marginLeft: 6,
      marginTop: 3,
    },

    notifFooter: {
      flexDirection: "row",
      gap: 8,
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: palette.menuBorder,
    },
    footerBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    footerBtnText: {
      color: "#fff",
      fontWeight: "900",
      fontSize: 12,
    },
  });
}
