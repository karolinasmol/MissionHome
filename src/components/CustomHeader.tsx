// src/components/CustomHeader.tsx
// Native header – odpowiednik webowego headera, ale wszystkie dropdowny jako Modal (pewne kliki, brak zIndex problemów)

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
  useWindowDimensions,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";

import { useTheme, useThemeColors, THEMES, THEME_LABELS, Theme } from "../context/ThemeContext";
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
  Timestamp,
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
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  premium?: boolean;
};

function safeToDate(ts: any): Date | null {
  try {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (ts instanceof Timestamp) return ts.toDate();
    if (typeof ts?.toDate === "function") return ts.toDate();
    return null;
  } catch {
    return null;
  }
}

export default function CustomHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { theme, setTheme } = useTheme();
  const { colors, isDark } = useThemeColors();
  const palette = useMemo(() => makePalette({ isDark, colors }), [isDark, colors]);

  // Native-only file — ale zostawiamy ochronnie:
  const isWeb = Platform.OS === "web";
  const isNative = !isWeb;

  // Na native zawsze traktujemy jak "collapsed"
  const isMobileLike = true;

  const styles = useMemo(() => makeStyles(palette, isMobileLike), [palette, isMobileLike]);

  const AVAILABLE_THEMES = THEMES as Theme[];
  const themeLabel = THEME_LABELS?.[theme] ?? String(theme);
  const themeLabelUpper = String(themeLabel).toUpperCase();

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
        const n = typeof data?.nick === "string" ? data.nick.trim() : "";
        setUsername(u || n || null);
      },
      () => setUsername(null)
    );
    return () => unsub();
  }, [uid]);

  const fallbackName = user?.displayName || user?.email?.split("@")[0] || "Użytkownik";
  const shownName = username || fallbackName;
  const initials = getInitials(shownName);

  // NAV STRUCTURE
  const NAV_ITEMS: NavItem[] = [
    { icon: "calendar-outline", label: "Kalendarz", route: "/calendar" },
    { icon: "people-outline", label: "Rodzina", route: "/family", premium: true },
    { icon: "stats-chart-outline", label: "Statystyki", route: "/stats" },
    { icon: "trophy-outline", label: "Osiągnięcia", route: "/achievements" },
    { icon: "podium-outline", label: "Ranking", route: "/Ranking" },
  ];

  // ✅ UNREAD NOTIFS
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!uid) {
      setUnreadCount(0);
      return;
    }
    const qUnread = query(collection(db as any, `users/${uid}/notifications`), where("read", "==", false));
    const unsub = onSnapshot(
      qUnread,
      (snap) => setUnreadCount(snap.size || 0),
      () => setUnreadCount(0)
    );
    return () => unsub();
  }, [uid]);

  // ✅ UNREAD MESSAGES (licznik wątków z nieprzeczytanym lastMessage)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  useEffect(() => {
    if (!uid) {
      setUnreadMsgCount(0);
      return;
    }

    const qy = query(
      collection(db as any, "messages"),
      where("users", "array-contains", uid),
      orderBy("lastMessageAt", "desc"),
      fsLimit(40)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        let c = 0;
        snap.forEach((d) => {
          const data = d.data() as any;

          const lastSender = data?.lastMessageSender;
          const lastAt = safeToDate(data?.lastMessageAt);
          const readAt = safeToDate(data?.readAt?.[uid]);

          if (!lastAt) return;
          if (!lastSender || String(lastSender) === String(uid)) return;

          if (!readAt || lastAt.getTime() > readAt.getTime()) c++;
        });

        setUnreadMsgCount(c);
      },
      () => setUnreadMsgCount(0)
    );

    return () => unsub();
  }, [uid]);

  // ======= MODALE / PANELE (theme/menu/notifs/nav) =======
  const [themeOpen, setThemeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // zamykaj wszystko przy zmianie trasy
  useEffect(() => {
    setThemeOpen(false);
    setMenuOpen(false);
    setNotifsOpen(false);
    setNavOpen(false);
  }, [pathname]);

  const closeAllPanels = () => {
    setThemeOpen(false);
    setMenuOpen(false);
    setNotifsOpen(false);
    setNavOpen(false);
  };

  const openTheme = () => {
    setMenuOpen(false);
    setNotifsOpen(false);
    setNavOpen(false);
    setThemeOpen(true);
  };

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

  // NOTIFS PANEL DATA
  const [notifRows, setNotifRows] = useState<NotifRow[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    if (!notifsOpen || !uid) {
      setNotifRows(notifsOpen ? [] : null);
      return;
    }

    setNotifLoading(true);
    const qy = query(collection(db as any, `users/${uid}/notifications`), orderBy("createdAt", "desc"), fsLimit(20));

    const off = onSnapshot(
      qy,
      (snap) => {
        const arr: NotifRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
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

    setNotifRows((prev) => (prev ? prev.map((row) => (row.id === n.id ? { ...row, read: nextRead } : row)) : prev));

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

  const MenuItem = ({
    icon,
    label,
    onPress,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
      <Ionicons name={icon} size={18} color={palette.menuText} style={{ marginRight: 8 }} />
      <Text style={styles.menuItemText}>{label}</Text>
    </Pressable>
  );

  // Header ma być widoczny na loginie jak na webie (logo + motywy)
  const authHeaderRoutes = new Set(["/login", "/register", "/forgot", "/reset"]);
  const isAuthRoute = authHeaderRoutes.has(pathname);


  const panelTop = Math.max(insets.top + 54, 84);

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeWrap, { backgroundColor: palette.bg }]}>
      <View style={styles.main}>
        <View style={styles.left}>
          <Pressable onPress={() => router.push("/" as any)} style={styles.logoWrap}>
            <Text style={styles.logoTop}>Mission</Text>
            <Text style={styles.logoBottom}>Home</Text>
          </Pressable>

          {/* Theme button (na native bez labela – jak web collapsed) */}
          <Pressable onPress={openTheme} style={({ pressed }) => [styles.themeBtn, pressed && styles.themeBtnPressed]}>
            <Ionicons name="color-palette" size={18} color={palette.muted} />
          </Pressable>
        </View>

        {!user || isAuthRoute ? null : (
          <View style={styles.mobileActions}>
            <Pressable onPress={() => setNavOpen(true)} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
              <Ionicons name="ellipsis-horizontal" size={20} color={palette.navIcon} />
            </Pressable>

            <Pressable
              onPress={() => router.push("/messages" as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <View style={{ position: "relative" }}>
                <Ionicons name="chatbubbles-outline" size={20} color={palette.navIcon} />
                <Badge count={unreadMsgCount} />
              </View>
            </Pressable>

            <Pressable
              onPress={() => setNotifsOpen(true)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <View style={{ position: "relative" }}>
                <Ionicons name={notifsOpen ? "notifications" : "notifications-outline"} size={20} color={palette.navIcon} />
                <Badge count={unreadCount} />
              </View>
            </Pressable>

            <Pressable
              onPress={() => router.push("/premium" as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Ionicons name="sparkles" size={18} color={ACCENT_PREMIUM} />
            </Pressable>

            <Pressable onPress={() => setMenuOpen(true)} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
              <View style={styles.avatarOuterSmall}>
                <View style={styles.avatarInner}>
                  {user?.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{initials}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          </View>
        )}
      </View>

      {/* ===================== THEME MODAL ===================== */}
      {isNative && (
        <Modal transparent visible={themeOpen} animationType="fade" onRequestClose={() => setThemeOpen(false)}>
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalOverlay} onPress={() => setThemeOpen(false)} />
            <View style={[styles.modalCard, { marginTop: panelTop }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Motywy</Text>
                <Text style={styles.modalTitleSmall}>{themeLabelUpper}</Text>
              </View>

              <View style={styles.modalSep} />

              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 6 }}>
                {AVAILABLE_THEMES.map((t) => {
                  const active = t === theme;
                  const labelUpper = String(THEME_LABELS?.[t] ?? t).toUpperCase();
                  const swatch = themeSwatchColor(t);

                  const safeTextColor = active ? palette.navIconActive : ensureReadableColor(swatch, palette.menuBg, palette.menuText);

                  return (
                    <Pressable
                      key={String(t)}
                      onPress={() => handleThemeSelect(t)}
                      style={({ pressed }) => [styles.themeItem, active && styles.themeItemActive, pressed && styles.themeItemPressed]}
                    >
                      <View style={styles.themeItemLeft}>
                        <View style={[styles.themeSwatch, { backgroundColor: swatch, borderColor: palette.border }]} />
                        <Text style={[styles.themeItemText, { color: safeTextColor }]} numberOfLines={1}>
                          {labelUpper}
                        </Text>
                      </View>

                      {active ? <Ionicons name="checkmark" size={16} color={palette.navIconActive} /> : <View style={{ width: 16 }} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ===================== NAV MODAL ===================== */}
      {isNative && (
        <Modal transparent visible={navOpen} animationType="fade" onRequestClose={() => setNavOpen(false)}>
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalOverlay} onPress={() => setNavOpen(false)} />
            <View style={[styles.modalCard, { marginTop: panelTop }]}>
              <Text style={styles.modalTitle}>Nawigacja</Text>
              <View style={styles.modalSep} />

              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 6 }}>
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.route || pathname?.startsWith(item.route);
                  const isMessages = item.route === "/messages";

                  return (
                    <Pressable
                      key={item.route}
                      onPress={() => {
                        setNavOpen(false);
                        router.push(item.route as any);
                      }}
                      style={({ pressed }) => [styles.navRow, active && styles.navRowActive, pressed && { opacity: 0.92 }]}
                    >
                      <View style={{ position: "relative" }}>
                        <Ionicons name={item.icon} size={18} color={active ? palette.navIconActive : palette.navIcon} />
                        {isMessages ? <Badge count={unreadMsgCount} /> : null}
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Text style={[styles.navRowText, active && styles.navRowTextActive]}>{item.label}</Text>
                        {item.premium ? <Ionicons name="sparkles" size={14} color={ACCENT_PREMIUM} /> : null}
                      </View>

                      <Ionicons name="chevron-forward" size={16} color={palette.muted} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ===================== PROFILE MENU MODAL ===================== */}
      {isNative && (
        <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)} />

            <View style={[styles.modalCard, { marginTop: panelTop }]}>
              <View style={styles.profileHeader}>
                <View style={styles.avatarOuter}>
                  <View style={styles.avatarInner}>
                    {user?.photoURL ? (
                      <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarFallbackText}>{initials}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.profileHeaderName} numberOfLines={1}>
                    {shownName}
                  </Text>
                  <Text style={styles.profileHeaderSub} numberOfLines={1}>
                    {user?.email || ""}
                  </Text>
                </View>

                <Pressable onPress={() => setMenuOpen(false)} style={styles.closeChip}>
                  <Ionicons name="close" size={16} color={palette.muted} />
                </Pressable>
              </View>

              <View style={styles.modalSep} />

              <MenuItem
                icon="person-outline"
                label="Profil"
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/Profile" as any);
                }}
              />

              <MenuItem
                icon="settings-outline"
                label="Ustawienia"
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/settings" as any);
                }}
              />

              <MenuItem
                icon="bug-outline"
                label="Zgłoś błąd"
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/bug" as any);
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
                  setMenuOpen(false);
                  router.replace("/login" as any);
                }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* ===================== NOTIFS MODAL ===================== */}
      {isNative && (
        <Modal transparent visible={notifsOpen} animationType="fade" onRequestClose={() => setNotifsOpen(false)}>
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalOverlay} onPress={() => setNotifsOpen(false)} />

            <View style={[styles.notifCard, { marginTop: panelTop }]}>
              <View style={styles.notifHeader}>
                <Text style={styles.notifTitle}>Powiadomienia</Text>

                <TouchableOpacity onPress={markVisibleRead} activeOpacity={0.9} style={styles.notifAction}>
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
                  <Text style={{ color: palette.muted }}>Brak powiadomień</Text>
                </View>
              ) : (
                <ScrollView style={styles.notifScroll} contentContainerStyle={styles.notifList}>
                  {notifRows.map((n) => {
                    const icon = notifIconFor(n.type);
                    const unread = !n.read;

                    return (
                      <TouchableOpacity
                        key={n.id}
                        activeOpacity={0.92}
                        onPress={() => handleNotifPress(n)}
                        onLongPress={() => toggleNotifRead(n)}
                        style={[styles.notifRow, unread && styles.notifRowUnread]}
                      >
                        <Ionicons
                          name={icon as any}
                          size={18}
                          color={unread ? ACCENT_NOTIF : palette.navIcon}
                          style={{ marginRight: 10, marginTop: 2 }}
                        />

                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={[styles.notifRowTitle, { fontWeight: unread ? "900" : "700" }]}>
                            {n.title || "Powiadomienie"}
                          </Text>

                          {!!n.body && (
                            <Text numberOfLines={2} style={styles.notifRowBody}>
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

              <View style={styles.notifFooter}>
                <TouchableOpacity onPress={clearVisible} activeOpacity={0.9} style={[styles.footerBtn, { backgroundColor: "#6B7280" }]}>
                  <Ionicons name="trash-outline" size={14} color="#fff" />
                  <Text style={styles.footerBtnText}>Wyczyść</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setNotifsOpen(false)} activeOpacity={0.9} style={[styles.footerBtn, { backgroundColor: palette.accent }]}>
                  <Ionicons name="close" size={14} color="#022c22" />
                  <Text style={[styles.footerBtnText, { color: "#022c22" }]}>Zamknij</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

/* ========================== HELPERS + STYLES ========================== */

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

function hexToRgba(hex: string, alpha: number) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function makePalette({ isDark, colors }: any) {
  const accentSoft = hexToRgba(colors.accent, isDark ? 0.18 : 0.12);

  return {
    bg: colors.bg,
    card: colors.card,
    border: colors.border,
    text: colors.text,
    muted: colors.textMuted,
    accent: colors.accent,
    accentSoft,

    navIcon: isDark ? "#cbd5f5" : "#0f172a",
    navIconActive: colors.accent,

    profileChevron: isDark ? "#94a3b8" : "#475569",

    menuBg: colors.card,
    menuBorder: colors.border,
    menuText: colors.text,
    menuItemHover: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",

    chipBg: colors.card,

    avatarRing: colors.border,
    avatarBg: colors.card,
    avatarText: colors.text,
  };
}

function themeSwatchColor(t: Theme): string {
  const key = String(t || "").toLowerCase();
  const THEME_COLORS: Record<string, string> = {
    dark: "#0b1220",
    light: "#e2e8f0",
    slate: "#475569",
    midnight: "#111827",
    ocean: "#06b6d4",
    forest: "#22c55e",
    coffee: "#b45309",
    sand: "#f59e0b",
    blue: "#3b82f6",
    green: "#10b981",
    mint: "#34d399",
    teal: "#14b8a6",
    purple: "#a855f7",
    rose: "#fb7185",
    crimson: "#dc2626",
    orange: "#f97316",
    sunset: "#f59e0b",
    yellow: "#eab308",
    cyber: "#22d3ee",
  };
  return THEME_COLORS[key] ?? "#22d3ee";
}

function ensureReadableColor(colorHex: string, _bgHex: string, fallback: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(colorHex)) return fallback;
  return colorHex;
}

function makeStyles(palette: ReturnType<typeof makePalette>, isMobileLike: boolean) {
  return StyleSheet.create({
    safeWrap: {
      width: "100%",
      backgroundColor: palette.bg,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingHorizontal: 8,
      paddingBottom: 6,
      zIndex: 100,
    },

    main: {
      width: "100%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 0,
    },

    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
      minWidth: 0,
    },

    logoWrap: {
      paddingRight: 4,
      paddingVertical: 4,
    },
    logoTop: {
      fontSize: 16,
      fontWeight: "900",
      color: palette.text,
      lineHeight: 16,
    },
    logoBottom: {
      fontSize: 16,
      fontWeight: "900",
      color: "#1dd4c7",
      lineHeight: 18,
      marginTop: -2,
    },

    themeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      width: 34,
      height: 34,
      backgroundColor: "transparent",
    },
    themeBtnPressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },

    mobileActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 6,
      marginLeft: 8,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
    },
    iconBtnPressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },

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

    avatarOuter: {
      width: 30,
      height: 30,
      borderRadius: 999,
      padding: 2,
      backgroundColor: palette.avatarRing,
    },
    avatarOuterSmall: {
      width: 28,
      height: 28,
      borderRadius: 999,
      padding: 1,
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
    avatarImage: { width: "100%", height: "100%" },
    avatarFallback: {
      width: "100%",
      height: "100%",
      borderRadius: 999,
      backgroundColor: palette.avatarBg,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarFallbackText: { color: palette.avatarText, fontSize: 11, fontWeight: "800" },

    // MODALS
    modalContainer: { flex: 1, justifyContent: "flex-start", alignItems: "center", paddingTop: 10 },
    modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
    modalCard: {
      backgroundColor: palette.menuBg,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      borderRadius: 16,
      padding: 14,
      width: "92%",
      maxWidth: 420,
      maxHeight: "80%",
    },
    modalHeaderRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    modalTitle: { fontSize: 15, fontWeight: "900", color: palette.text },
    modalTitleSmall: { fontSize: 12, fontWeight: "900", color: palette.muted },

    modalSep: { height: 1, backgroundColor: palette.menuBorder, marginVertical: 8 },

    // Theme items
    themeItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    themeItemPressed: { backgroundColor: palette.menuItemHover },
    themeItemActive: { backgroundColor: palette.accentSoft },

    themeItemLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
      paddingRight: 10,
      gap: 10,
    },
    themeSwatch: { width: 12, height: 12, borderRadius: 999, borderWidth: 1 },
    themeItemText: { fontSize: 12, fontWeight: "900", flex: 1, minWidth: 0 },

    // Nav rows
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    navRowActive: { backgroundColor: "rgba(47,107,255,0.08)" },
    navRowText: { fontSize: 14, fontWeight: "800", color: palette.text, flex: 1 },
    navRowTextActive: { color: palette.navIconActive },

    // Menu
    menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12 },
    menuItemPressed: { backgroundColor: palette.menuItemHover },
    menuItemText: { fontSize: 14, fontWeight: "700", color: palette.menuText },
    menuSeparator: { height: 1, marginVertical: 8, backgroundColor: palette.menuBorder },

    profileHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    profileHeaderName: { color: palette.text, fontWeight: "900", fontSize: 14 },
    profileHeaderSub: { color: palette.muted, fontWeight: "700", fontSize: 12, marginTop: 2 },
    closeChip: {
      width: 34,
      height: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bg,
      alignItems: "center",
      justifyContent: "center",
    },

    // Notifs card
    notifCard: {
      backgroundColor: palette.menuBg,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      borderRadius: 16,
      width: "92%",
      maxWidth: 520,
      maxHeight: "82%",
      overflow: "hidden",
    },

    notifHeader: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    notifTitle: { color: palette.text, fontSize: 15, fontWeight: "900" },
    notifAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: ACCENT_NOTIF,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    notifActionText: { color: "#fff", fontWeight: "900", fontSize: 12 },

    notifSeparator: { height: 1, backgroundColor: palette.menuBorder },
    notifLoading: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },

    notifScroll: { maxHeight: 420 },
    notifList: { paddingVertical: 6 },

    notifRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      borderTopColor: palette.menuBorder,
      gap: 6,
    },
    notifRowUnread: { backgroundColor: "rgba(47,107,255,0.08)" },
    notifRowTitle: { color: palette.text, fontSize: 13 },
    notifRowBody: { color: palette.muted, marginTop: 2, fontSize: 12, lineHeight: 16 },

    dot: {
      width: 10,
      height: 10,
      borderRadius: 10,
      backgroundColor: ACCENT_NOTIF,
      marginLeft: 6,
      marginTop: 4,
    },

    notifFooter: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: palette.menuBorder },
    footerBtn: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    footerBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  });
}

// src/components/CustomHeader.tsx
