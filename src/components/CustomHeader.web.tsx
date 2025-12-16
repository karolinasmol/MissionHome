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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";

import { subscribeTourStep5, setTourStep5Open as setTourStep5OpenBus } from "../utils/tourStep5Bus";
import { subscribeTourStep6, setTourStep6Open as setTourStep6OpenBus } from "../utils/tourStep6Bus";
import { subscribeTourStep7, setTourStep7Open as setTourStep7OpenBus } from "../utils/tourStep7Bus";
import { subscribeTourStep8, setTourStep8Open as setTourStep8OpenBus } from "../utils/tourStep8Bus";
import { subscribeTourStep10, setTourStep10Open as setTourStep10OpenBus } from "../utils/tourStep10Bus";
import { subscribeTourStep11, setTourStep11Open as setTourStep11OpenBus } from "../utils/tourStep11Bus";
import { subscribeTourStep12, setTourStep12Open as setTourStep12OpenBus } from "../utils/tourStep12Bus";
import { subscribeTourStep13, setTourStep13Open as setTourStep13OpenBus } from "../utils/tourStep13Bus";
import { subscribeTourStep14, setTourStep14Open as setTourStep14OpenBus } from "../utils/tourStep14Bus";

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

type AnchorRect = { x: number; y: number; w: number; h: number };

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

function measureNodeToRect(node: any): AnchorRect | null {
  try {
    if (!node) return null;

    if (Platform.OS === "web" && typeof node.getBoundingClientRect === "function") {
      const r = node.getBoundingClientRect();
      if (Number.isFinite(r.left) && Number.isFinite(r.top) && Number.isFinite(r.width) && Number.isFinite(r.height)) {
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      }
      return null;
    }

    // native: measureInWindow async (obsługujemy w miejscu wywołania)
    return null;
  } catch {
    return null;
  }
}

export default function CustomHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const { theme, setTheme } = useTheme();
  const { colors, isDark } = useThemeColors();

  const palette = useMemo(() => makePalette({ isDark, colors }), [isDark, colors]);

  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const useNative = Platform.OS !== "web";
  const isMobileWeb = isWeb && width < 720;

  const styles = useMemo(() => makeStyles(palette, isWeb, isMobileWeb), [palette, isWeb, isMobileWeb]);

  const themeLabel = THEME_LABELS?.[theme] ?? String(theme);
  const themeLabelUpper = String(themeLabel).toUpperCase();

  const AVAILABLE_THEMES = THEMES as Theme[];

  // THEME DROPDOWN
  const [themeOpen, setThemeOpen] = useState(false);
  const themeAnim = useRef(new Animated.Value(0)).current;
  const themeBtnRef = useRef<any>(null);
  const [themeAnchor, setThemeAnchor] = useState<AnchorRect | null>(null);

  // PROFILE MENU
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  // NAV PANEL (MOBILE WEB)
  const [navOpen, setNavOpen] = useState(false);

  // NOTIFICATIONS PANEL
  const [notifsOpen, setNotifsOpen] = useState(false);
  const notifAnim = useRef(new Animated.Value(0)).current;

  const closeThemeInstant = () => {
    setThemeOpen(false);
    themeAnim.stopAnimation();
    themeAnim.setValue(0);
  };

  const closeMenuInstant = () => {
    setMenuOpen(false);
    menuAnim.stopAnimation();
    menuAnim.setValue(0);
  };

  const closeNotifsInstant = () => {
    setNotifsOpen(false);
    notifAnim.stopAnimation();
    notifAnim.setValue(0);
  };

  const measureThemeBtn = () => {
    try {
      const node = themeBtnRef.current;
      if (node && typeof node.measureInWindow === "function") {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          if (Number.isFinite(x) && Number.isFinite(y)) setThemeAnchor({ x, y, w, h });
          else setThemeAnchor(null);
        });
      } else {
        setThemeAnchor(null);
      }
    } catch {
      setThemeAnchor(null);
    }
  };

  const openTheme = () => {
    closeMenuInstant();
    closeNotifsInstant();
    closeNav();
    measureThemeBtn();
    setThemeOpen(true);
    themeAnim.setValue(0);
    Animated.timing(themeAnim, {
      toValue: 1,
      duration: 160,
      useNativeDriver: useNative,
    }).start();
  };

  const closeTheme = () =>
    Animated.timing(themeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: useNative,
    }).start(() => setThemeOpen(false));

  const toggleThemeDropdown = () => {
    if (themeOpen) closeTheme();
    else openTheme();
  };

  const handleThemeSelect = (t: Theme) => {
    if (t === theme) {
      closeTheme();
      return;
    }
    try {
      setTheme(t);
    } catch {}
    closeTheme();
  };

  const themeMenuPos = useMemo(() => {
    if (isWeb && themeAnchor) {
      if (isMobileWeb) {
        const menuW = Math.min(360, Math.max(220, width - 24));
        const left = Math.max(12, Math.min(themeAnchor.x, width - menuW - 12));
        return {
          position: "fixed" as const,
          left,
          top: Math.max(10, themeAnchor.y + themeAnchor.h + 8),
          width: menuW,
        };
      }

      return {
        position: "fixed" as const,
        left: Math.max(10, themeAnchor.x),
        top: Math.max(10, themeAnchor.y + themeAnchor.h + 8),
        width: 232,
      };
    }

    return {
      position: "absolute" as const,
      left: 12,
      top: 62,
      width: 232,
    };
  }, [isWeb, themeAnchor, isMobileWeb, width]);

  // NAV STRUCTURE (do użycia w panelu mobilnym)
  const NAV_ITEMS: NavItem[] = [
    { icon: "calendar-outline", label: "Kalendarz", route: "/calendar" },
    { icon: "people-outline", label: "Rodzina", route: "/family", premium: true },
    { icon: "stats-chart-outline", label: "Statystyki", route: "/stats" },
    { icon: "trophy-outline", label: "Osiągnięcia", route: "/achievements" },
    { icon: "podium-outline", label: "Ranking", route: "/Ranking" },
    { icon: "chatbubbles-outline", label: "Wiadomości", route: "/messages" },
  ];

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

  const fallbackName = user?.displayName || user?.email?.split("@")[0] || "Użytkownik";
  const shownName = username || fallbackName;
  const initials = getInitials(shownName);

  const openMenu = () => {
    closeThemeInstant();
    closeNav();
    closeNotifs();
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
    else openMenu();
  };

  const openNav = () => {
    if (!isMobileWeb) return;
    closeThemeInstant();
    closeMenuInstant();
    closeNotifsInstant();
    setNavOpen(true);
  };

  const closeNav = () => setNavOpen(false);

  const toggleNav = () => {
    if (!isMobileWeb) return;
    if (navOpen) closeNav();
    else openNav();
  };

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifRows, setNotifRows] = useState<NotifRow[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  // ✅ UNREAD MESSAGES
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

  const openNotifs = () => {
    closeThemeInstant();
    closeMenuInstant();
    closeNav();
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

    const qy = query(collection(db as any, `users/${uid}/notifications`), orderBy("createdAt", "desc"), fsLimit(20));

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

  // ✅ TOUR REFS + RECTS
  const profileBtnRef = useRef<any>(null);
  const premiumBtnRef = useRef<any>(null);
  const messagesBtnRef = useRef<any>(null);

  const navToggleRef = useRef<any>(null); // mobile web ellipsis
  const navCalRef = useRef<any>(null);
  const navFamilyRef = useRef<any>(null);
  const navStatsRef = useRef<any>(null);
  const navAchRef = useRef<any>(null);
  const navRankRef = useRef<any>(null);

  const [profileRect, setProfileRect] = useState<AnchorRect | null>(null);
  const [premiumRect, setPremiumRect] = useState<AnchorRect | null>(null);
  const [messagesRect, setMessagesRect] = useState<AnchorRect | null>(null);
  const [navToggleRect, setNavToggleRect] = useState<AnchorRect | null>(null);
  const [navCalRect, setNavCalRect] = useState<AnchorRect | null>(null);
  const [navFamilyRect, setNavFamilyRect] = useState<AnchorRect | null>(null);
  const [navStatsRect, setNavStatsRect] = useState<AnchorRect | null>(null);
  const [navAchRect, setNavAchRect] = useState<AnchorRect | null>(null);
  const [navRankRect, setNavRankRect] = useState<AnchorRect | null>(null);

  const measureAnyRef = (ref: any, setter: (r: AnchorRect | null) => void) => {
    try {
      const node = ref?.current;
      if (!node) return;

      const rWeb = measureNodeToRect(node);
      if (rWeb) {
        setter(rWeb);
        return;
      }

      if (typeof node.measureInWindow === "function") {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)) setter({ x, y, w, h });
        });
      }
    } catch {}
  };

  const measureTourAnchors = () => {
    measureAnyRef(profileBtnRef, setProfileRect);
    measureAnyRef(premiumBtnRef, setPremiumRect);
    measureAnyRef(messagesBtnRef, setMessagesRect);
    measureAnyRef(navToggleRef, setNavToggleRect);
    measureAnyRef(navCalRef, setNavCalRect);
    measureAnyRef(navFamilyRef, setNavFamilyRect);
    measureAnyRef(navStatsRef, setNavStatsRect);
    measureAnyRef(navAchRef, setNavAchRect);
    measureAnyRef(navRankRef, setNavRankRect);
  };

  // ✅ TOUR STATES (5,6,7,8,10,11,12,13,14)
  const [step5Open, setStep5Open] = useState(false);
  const [step6Open, setStep6Open] = useState(false);
  const [step7Open, setStep7Open] = useState(false);
  const [step8Open, setStep8Open] = useState(false);
  const [step10Open, setStep10Open] = useState(false);
  const [step11Open, setStep11Open] = useState(false);
  const [step12Open, setStep12Open] = useState(false);
  const [step13Open, setStep13Open] = useState(false);
  const [step14Open, setStep14Open] = useState(false);

  useEffect(() => subscribeTourStep5(setStep5Open), []);
  useEffect(() => subscribeTourStep6(setStep6Open), []);
  useEffect(() => subscribeTourStep7(setStep7Open), []);
  useEffect(() => subscribeTourStep8(setStep8Open), []);
  useEffect(() => subscribeTourStep10(setStep10Open), []);
  useEffect(() => subscribeTourStep11(setStep11Open), []);
  useEffect(() => subscribeTourStep12(setStep12Open), []);
  useEffect(() => subscribeTourStep13(setStep13Open), []);
  useEffect(() => subscribeTourStep14(setStep14Open), []);

  const tourFade = useRef(new Animated.Value(0)).current;
  const tourPulse = useRef(new Animated.Value(0)).current;

  const activeTourStep = useMemo(() => {
    if (step14Open) return 14;
    if (step13Open) return 13;
    if (step12Open) return 12;
    if (step11Open) return 11;
    if (step10Open) return 10;
    if (step8Open) return 8;
    if (step7Open) return 7;
    if (step6Open) return 6;
    if (step5Open) return 5;
    return null;
  }, [step5Open, step6Open, step7Open, step8Open, step10Open, step11Open, step12Open, step13Open, step14Open]);

  const setTourOpen = (step: number, open: boolean) => {
    try {
      switch (step) {
        case 5:
          setTourStep5OpenBus(open);
          break;
        case 6:
          setTourStep6OpenBus(open);
          break;
        case 7:
          setTourStep7OpenBus(open);
          break;
        case 8:
          setTourStep8OpenBus(open);
          break;
        case 10:
          setTourStep10OpenBus(open);
          break;
        case 11:
          setTourStep11OpenBus(open);
          break;
        case 12:
          setTourStep12OpenBus(open);
          break;
        case 13:
          setTourStep13OpenBus(open);
          break;
        case 14:
          setTourStep14OpenBus(open);
          break;
      }
    } catch {}
  };

  const closeAllTourSteps = () => {
    [5, 6, 7, 8, 10, 11, 12, 13, 14].forEach((s) => setTourOpen(s, false));
  };

  const markTourSeen = async () => {
    try {
      const uidLocal = auth.currentUser?.uid;
      if (!uidLocal) return;
      await updateDoc(doc(db as any, "users", uidLocal), {
        "onboarding.tourSeen": true,
        "onboarding.tourSeenAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
    } catch {}
  };

  const finishTour = async () => {
    await markTourSeen();
    closeAllTourSteps();
  };

  const goNext = (from: number) => {
    const nextMap: Record<number, number> = {
      5: 6,
      6: 7,
      7: 8,
      8: 10,
      10: 11,
      11: 12,
      12: 13,
      13: 14,
    };

    const next = nextMap[from];
    if (!next) {
      finishTour();
      return;
    }

    setTourOpen(from, false);
    setTourOpen(next, true);
  };

  const closeTourBubbleOnly = () => {
    if (!activeTourStep) return;
    setTourOpen(activeTourStep, false);
  };

  useEffect(() => {
    if (!activeTourStep) return;

    // porządki UI
    closeThemeInstant();
    closeNotifsInstant();
    closeNav();

    // krok 6 ma sens z otwartym menu profilu (żeby było widać Profil / Zgłoś błąd)
    if (activeTourStep === 6) {
      if (!menuOpen) openMenu();
    } else {
      // inne kroki: niech menu nie przeszkadza
      if (menuOpen) closeMenuInstant();
    }

    const t = setTimeout(() => measureTourAnchors(), 40);

    tourFade.setValue(0);
    tourPulse.setValue(0);

    Animated.timing(tourFade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: Platform.OS !== "web",
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(tourPulse, { toValue: 1, duration: 720, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(tourPulse, { toValue: 0, duration: 720, useNativeDriver: Platform.OS !== "web" }),
      ])
    );

    loop.start();

    return () => {
      clearTimeout(t);
      loop.stop();
      tourPulse.stopAnimation();
      tourPulse.setValue(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTourStep]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const on = () => measureTourAnchors();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);

    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNotifPress = (n: NotifRow) => {
    if (!n.read) toggleNotifRead(n);

    if (isFamilyOrFriendsNotif(n)) {
      closeNotifs();
      router.push(
        {
          pathname: "/family",
          params: n.familyId ? { from: "notif", familyId: n.familyId } : { from: "notif" },
        } as any
      );
    }
  };

  // NAV BUTTON (desktop / duży web) – z refem
  const NavButton = React.useMemo(() => {
    const Cmp = React.forwardRef(
      (
        {
          icon,
          label,
          route,
          premium,
        }: {
          icon: keyof typeof Ionicons.glyphMap;
          label: string;
          route: string;
          premium?: boolean;
        },
        ref: any
      ) => {
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

        const hoverHandlers = isWeb
          ? ({
              onMouseEnter: () => setHovered(true),
              onMouseLeave: () => setHovered(false),
            } as any)
          : ({} as any);

        return (
          <Pressable
            ref={ref}
            onLayout={measureTourAnchors}
            onPress={() => router.push(route as any)}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            {...hoverHandlers}
            style={[styles.navBtn, hovered && styles.navBtnHover, active && styles.navBtnActive]}
          >
            <Animated.View style={[styles.navInner, { transform: [{ scale }] }]}>
              <Ionicons name={icon} size={18} color={active ? palette.navIconActive : palette.navIcon} />

              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>

                {premium && <Ionicons name="sparkles" size={14} color={ACCENT_PREMIUM} style={{ marginTop: 1 }} />}
              </View>
            </Animated.View>
          </Pressable>
        );
      }
    );

    Cmp.displayName = "NavButtonWithRef";
    return Cmp;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, useNative, isWeb, palette, styles, router]);

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

  useEffect(() => {
    if (themeOpen) closeTheme();
    if (menuOpen) closeMenu();
    if (notifsOpen) closeNotifs();
    if (navOpen) closeNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const tourTotal = 14;

  const tourConfig = useMemo(() => {
    const cfg: Record<
      number,
      {
        title: string;
        body: string;
        anchorRect: AnchorRect | null;
        primaryLabel: string;
        onPrimary: () => void;
        onSkip: () => void;
        pad?: number;
      }
    > = {
      5: {
        title: "Ustawienia: profil, motyw i bezpieczeństwo",
        body:
          "Kliknij w prawym górnym rogu (avatar), żeby otworzyć opcje.\n\nWejdź w Ustawienia i dodaj swoje zdjęcie profilowe — rodzina od razu Cię rozpozna.\n\nTam też ogarniesz motyw i ważne opcje bezpieczeństwa konta.",
        anchorRect: profileRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(5),
        onSkip: () => finishTour(),
      },
      6: {
        title: "Profil i zgłaszanie błędów",
        body:
          "W menu pod avatarem znajdziesz Profil — tam ustawisz m.in. dane i prywatność.\n\nJest tu też opcja „Zgłoś błąd”, gdy coś nie działa albo chcesz coś zasugerować.",
        anchorRect: profileRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(6),
        onSkip: () => finishTour(),
      },
      7: {
        title: "Premium",
        body: "Premium odblokowuje dodatkowe funkcje i wspiera rozwój aplikacji. Jeśli korzystasz na co dzień — warto zerknąć. 🙂",
        anchorRect: premiumRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(7),
        onSkip: () => finishTour(),
      },
      8: {
        title: "Wiadomości",
        body: "Tu macie czat w rodzinie: dogadacie sprawy dnia, zadania i szybkie ustalenia bez wychodzenia z apki.",
        anchorRect: messagesRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(8),
        onSkip: () => finishTour(),
      },
      10: {
        title: "Kalendarz",
        body: "Kalendarz to centrum planu: zadania, terminy i ogarnianie tygodnia w jednym miejscu.",
        anchorRect: isMobileWeb ? navToggleRect : navCalRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(10),
        onSkip: () => finishTour(),
      },
      11: {
        title: "Rodzina",
        body: "W Rodzinie dodajesz domowników i zarządzasz wspólną przestrzenią oraz uprawnieniami.",
        anchorRect: isMobileWeb ? navToggleRect : navFamilyRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(11),
        onSkip: () => finishTour(),
      },
      12: {
        title: "Statystyki",
        body: "Statystyki pokazują jak idzie ogarnianie: postępy, aktywność i trendy w czasie.",
        anchorRect: isMobileWeb ? navToggleRect : navStatsRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(12),
        onSkip: () => finishTour(),
      },
      13: {
        title: "Osiągnięcia",
        body: "Osiągnięcia dodają trochę zabawy: odznaki za regularność i konkretne cele.",
        anchorRect: isMobileWeb ? navToggleRect : navAchRect,
        primaryLabel: "Dalej",
        onPrimary: () => goNext(13),
        onSkip: () => finishTour(),
      },
      14: {
        title: "Ranking",
        body:
          "Ranking porównuje wyniki w formie zabawy i motywacji.\n\nJeśli wolisz prywatność, możesz wyłączyć udostępnianie szczegółowych statystyk w Profilu.",
        anchorRect: isMobileWeb ? navToggleRect : navRankRect,
        primaryLabel: "Koniec",
        onPrimary: () => finishTour(),
        onSkip: () => finishTour(),
      },
    };

    return cfg;
  }, [
    profileRect,
    premiumRect,
    messagesRect,
    navToggleRect,
    navCalRect,
    navFamilyRect,
    navStatsRect,
    navAchRect,
    navRankRect,
    isMobileWeb,
  ]);

  const activeCfg = activeTourStep ? tourConfig[activeTourStep] : null;
  const showTour = !!activeTourStep && !!activeCfg && !!activeCfg.anchorRect;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.main}>
        <View style={styles.left}>
          <Pressable onPress={() => router.push("/" as any)} style={styles.logoWrap}>
            <Text style={styles.logoTop}>Mission</Text>
            <Text style={styles.logoBottom}>Home</Text>
          </Pressable>

          <Pressable
            ref={themeBtnRef}
            onPress={toggleThemeDropdown}
            style={({ pressed }) => [styles.themeBtn, pressed && styles.themeBtnPressed]}
          >
            <Ionicons name="color-palette" size={isMobileWeb ? 18 : 16} color={palette.muted} />

            {isWeb && !isMobileWeb && <Text style={styles.themeBtnText}>{themeLabelUpper}</Text>}

            {!isMobileWeb && <Ionicons name={themeOpen ? "chevron-up" : "chevron-down"} size={14} color={palette.muted} />}
          </Pressable>
        </View>

        {!user ? null : (
          <>
            {!isMobileWeb && (
              <>
                <View style={styles.center}>
                  <NavButton ref={navCalRef} icon="calendar-outline" label="Kalendarz" route="/calendar" />
                  <NavButton ref={navFamilyRef} icon="people-outline" label="Rodzina" route="/family" premium />
                  <NavButton ref={navStatsRef} icon="stats-chart-outline" label="Statystyki" route="/stats" />
                  <NavButton ref={navAchRef} icon="trophy-outline" label="Osiągnięcia" route="/achievements" />
                  <NavButton ref={navRankRef} icon="podium-outline" label="Ranking" route="/Ranking" />
                </View>

                <View style={styles.right}>
                  <Pressable
                    ref={premiumBtnRef}
                    onLayout={measureTourAnchors}
                    onPress={() => router.push("/premium" as any)}
                    style={({ pressed }) => [styles.premiumBtn, pressed && styles.premiumBtnPressed]}
                  >
                    {isWeb && <Text style={styles.premiumText}>Premium</Text>}
                    <Ionicons name="sparkles" size={18} color={ACCENT_PREMIUM} />
                  </Pressable>

                  <Pressable
                    ref={messagesBtnRef}
                    onLayout={measureTourAnchors}
                    onPress={() => router.push("/messages" as any)}
                    style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                  >
                    <View style={{ position: "relative" }}>
                      <Ionicons name="chatbubbles-outline" size={20} color={palette.navIcon} />
                      <Badge count={unreadMsgCount} />
                    </View>

                    {isWeb && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={styles.bellLabel}>Wiadomości</Text>
                        <Ionicons name="sparkles" size={14} color={ACCENT_PREMIUM} style={{ marginTop: 1 }} />
                      </View>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={toggleNotifs}
                    style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                  >
                    <View style={{ position: "relative" }}>
                      <Ionicons
                        name={notifsOpen ? "notifications" : "notifications-outline"}
                        size={20}
                        color={palette.navIcon}
                      />
                      <Badge count={unreadCount} />
                    </View>

                    {isWeb && <Text style={styles.bellLabel}>Powiadomienia</Text>}
                  </Pressable>

                  <Pressable
                    ref={profileBtnRef}
                    onLayout={measureTourAnchors}
                    onPress={toggleMenu}
                    style={({ pressed }) => [styles.profileBtn, pressed && styles.profileBtnPressed]}
                  >
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

                    <Text style={styles.profileName} numberOfLines={1} ellipsizeMode="tail">
                      {shownName}
                    </Text>

                    <Ionicons name={menuOpen ? "chevron-up" : "chevron-down"} size={16} color={palette.profileChevron} />
                  </Pressable>
                </View>
              </>
            )}

            {isMobileWeb && (
              <View style={styles.mobileActions}>
                <Pressable
                  ref={navToggleRef}
                  onLayout={measureTourAnchors}
                  onPress={toggleNav}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={palette.navIcon} />
                </Pressable>

                <Pressable onPress={toggleNotifs} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
                  <View style={{ position: "relative" }}>
                    <Ionicons
                      name={notifsOpen ? "notifications" : "notifications-outline"}
                      size={20}
                      color={palette.navIcon}
                    />
                    <Badge count={unreadCount} />
                  </View>
                </Pressable>

                <Pressable
                  ref={premiumBtnRef}
                  onLayout={measureTourAnchors}
                  onPress={() => router.push("/premium" as any)}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                >
                  <Ionicons name="sparkles" size={18} color={ACCENT_PREMIUM} />
                </Pressable>

                <Pressable
                  ref={profileBtnRef}
                  onLayout={measureTourAnchors}
                  onPress={toggleMenu}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                >
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
          </>
        )}
      </View>

      {themeOpen && (
        <>
          <Pressable style={isMobileWeb ? styles.backdropDimmed : styles.backdrop} onPress={closeTheme} pointerEvents="auto" />

          <Animated.View
            pointerEvents="auto"
            style={[
              styles.themeMenu,
              themeMenuPos as any,
              {
                opacity: themeAnim,
                transform: [
                  { translateY: themeAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
                  { scale: themeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
                ],
              },
            ]}
          >
            <View style={styles.themeMenuHeader}>
              <Text style={styles.themeMenuTitle}>Motywy</Text>
            </View>

            <View style={styles.themeMenuSeparator} />

            <ScrollView
              style={styles.themeMenuScroll}
              contentContainerStyle={styles.themeMenuList}
              showsVerticalScrollIndicator={true}
              indicatorStyle={isDark ? "white" : "black"}
              persistentScrollbar={true as any}
            >
              {AVAILABLE_THEMES.map((t) => {
                const active = t === theme;

                const swatch = themeSwatchColor(t);
                const safeTextColor = active ? palette.navIconActive : ensureReadableColor(swatch, palette.menuBg, palette.menuText);

                return (
                  <Pressable
                    key={t}
                    onPress={() => handleThemeSelect(t)}
                    style={({ pressed }) => [styles.themeItem, active && styles.themeItemActive, pressed && styles.themeItemPressed]}
                  >
                    <View style={styles.themeItemLeft}>
                      <View style={[styles.themeSwatch, { backgroundColor: swatch, borderColor: palette.border }]} />
                      <Text style={[styles.themeItemText, { color: safeTextColor }]} numberOfLines={1}>
                        {String(THEME_LABELS?.[t] ?? t).toUpperCase()}
                      </Text>
                    </View>

                    {active ? <Ionicons name="checkmark" size={16} color={palette.navIconActive} /> : <View style={{ width: 16 }} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </>
      )}

      {isMobileWeb && user && navOpen && (
        <>
          <Pressable style={styles.backdropDimmed} onPress={closeNav} pointerEvents="auto" />
          <View style={styles.mobileNavPanel}>
            <Text style={styles.mobileNavTitle}>Nawigacja</Text>
            <View style={styles.mobileNavSeparator} />
            <ScrollView style={styles.mobileNavScroll} contentContainerStyle={styles.mobileNavList}>
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.route || pathname?.startsWith(item.route);
                const isMessages = item.route === "/messages";

                return (
                  <Pressable
                    key={item.route}
                    onPress={() => {
                      closeNav();
                      router.push(item.route as any);
                    }}
                    style={({ pressed }) => [
                      styles.mobileNavItem,
                      active && styles.mobileNavItemActive,
                      pressed && styles.mobileNavItemPressed,
                    ]}
                  >
                    <View style={{ position: "relative" }}>
                      <Ionicons name={item.icon} size={18} color={active ? palette.navIconActive : palette.navIcon} />
                      {isMessages ? <Badge count={unreadMsgCount} /> : null}
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[styles.mobileNavText, active && styles.mobileNavTextActive]}>{item.label}</Text>
                      {item.premium && <Ionicons name="sparkles" size={14} color={ACCENT_PREMIUM} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}

      {user && menuOpen && (
        <>
          <Pressable style={isMobileWeb ? styles.backdropDimmed : styles.backdrop} onPress={closeMenu} pointerEvents="auto" />

          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.menu,
              {
                opacity: menuAnim,
                transform: [
                  { translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                  { scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            <MenuItem
              icon="person-outline"
              label="Profil"
              onPress={() => {
                closeMenu();
                router.push("/Profile" as any);
              }}
            />

            <MenuItem
              icon="settings-outline"
              label="Ustawienia"
              onPress={() => {
                closeMenu();
                router.push("/settings" as any);
              }}
            />

            <MenuItem
              icon="bug-outline"
              label="Zgłoś błąd"
              onPress={() => {
                closeMenu();
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
                closeMenu();
                router.replace("/login" as any);
              }}
            />
          </Animated.View>
        </>
      )}

      {user && notifsOpen && (
        <>
          <Pressable style={isMobileWeb ? styles.backdropDimmed : styles.backdrop} onPress={closeNotifs} pointerEvents="auto" />

          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.notifPanel,
              {
                opacity: notifAnim,
                transform: [
                  { translateY: notifAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                  { scale: notifAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
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
                      style={[styles.notifRow, unread && styles.notifRowUnread]}
                    >
                      <Ionicons
                        name={icon as any}
                        size={18}
                        color={unread ? ACCENT_NOTIF : palette.navIcon}
                        style={{ marginRight: 10 }}
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
              <TouchableOpacity
                onPress={clearVisible}
                activeOpacity={0.9}
                style={[styles.footerBtn, { backgroundColor: "#6B7280" }]}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.footerBtnText}>Wyczyść</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </>
      )}

      {/* ✅ TOUR (5,6,7,8,10,11,12,13,14) */}
      {showTour && user && activeCfg && activeCfg.anchorRect && (
        <View
          pointerEvents="box-none"
          style={{
            position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999999,
          }}
        >
          {(() => {
            const pad = 10;
            const a = activeCfg.anchorRect!;
            const hlX = Math.max(6, a.x - pad);
            const hlY = Math.max(6, a.y - pad);
            const hlW = a.w + pad * 2;
            const hlH = a.h + pad * 2;

            return (
              <>
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: hlX,
                    top: hlY,
                    width: hlW,
                    height: hlH,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: palette.accent,
                    backgroundColor: palette.accent + "10",
                    opacity: tourFade,
                  }}
                />

                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: hlX - 10,
                    top: hlY - 10,
                    width: hlW + 20,
                    height: hlH + 20,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: palette.accent,
                    backgroundColor: "transparent",
                    opacity: Animated.multiply(tourFade, tourPulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0] })),
                    transform: [{ scale: tourPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }) }],
                  }}
                />
              </>
            );
          })()}

          {(() => {
            const W = width;
            const pad = 12;
            const bubbleW = Math.min(420, Math.max(260, W - pad * 2));

            const a = activeCfg.anchorRect!;
            const bubbleX = Math.max(pad, Math.min(a.x + a.w - bubbleW, W - pad - bubbleW));

            const bubbleYBase = a.y + a.h + 14;

            // tylko dla kroków profilu (5/6) — obniżamy, gdy menu jest otwarte, żeby nie zasłaniać listy
            const shouldAvoidMenu = (activeTourStep === 5 || activeTourStep === 6) && menuOpen;
            const headerTopGuess = Math.max(0, a.y - 12);
            const menuTopWin = headerTopGuess + 56;
            const menuEstimatedH = 170;
            const safeBelowMenu = menuTopWin + menuEstimatedH + 14;

            const bubbleY = shouldAvoidMenu ? Math.max(bubbleYBase, safeBelowMenu) : bubbleYBase;

            const arrowX = a.x + a.w / 2 - 13;
            const arrowY = bubbleY - 28;

            return (
              <>
                <Animated.View pointerEvents="none" style={{ position: "absolute", left: arrowX, top: arrowY, opacity: tourFade }}>
                  <Ionicons name="arrow-up" size={26} color={palette.accent} />
                </Animated.View>

                <Animated.View
                  pointerEvents="auto"
                  style={{
                    position: "absolute",
                    left: bubbleX,
                    top: bubbleY,
                    width: bubbleW,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.card,
                    padding: 14,
                    opacity: tourFade,
                    ...(Platform.OS === "web"
                      ? ({ boxShadow: "0px 18px 50px rgba(0,0,0,0.35)" } as any)
                      : {
                          shadowColor: "#000",
                          shadowOpacity: 0.22,
                          shadowRadius: 20,
                          shadowOffset: { width: 0, height: 10 },
                          elevation: 10,
                        }),
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: palette.text, fontWeight: "900", fontSize: 14 }}>{activeCfg.title}</Text>

                    <TouchableOpacity
                      onPress={closeTourBubbleOnly}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: palette.border,
                        backgroundColor: palette.bg,
                        alignItems: "center",
                        justifyContent: "center",
                        ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
                      }}
                    >
                      <Ionicons name="close" size={16} color={palette.muted} />
                    </TouchableOpacity>
                  </View>

                  <Text style={{ color: palette.muted, fontSize: 13, marginTop: 10, lineHeight: 18, fontWeight: "700" }}>
                    {activeCfg.body}
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={activeCfg.onPrimary}
                      style={{
                        flex: 1,
                        paddingVertical: 11,
                        borderRadius: 999,
                        backgroundColor: palette.accent,
                        alignItems: "center",
                        justifyContent: "center",
                        ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
                      }}
                    >
                      <Text style={{ color: "#022c22", fontWeight: "900", fontSize: 13 }}>{activeCfg.primaryLabel}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={activeCfg.onSkip}
                      style={{
                        paddingVertical: 11,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: palette.border,
                        backgroundColor: palette.bg,
                        alignItems: "center",
                        justifyContent: "center",
                        ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
                      }}
                    >
                      <Text style={{ color: palette.text, fontWeight: "900", fontSize: 13 }}>Pomiń</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ color: palette.muted, marginTop: 10, fontSize: 11, fontWeight: "700" }}>
                    Krok {activeTourStep} / {tourTotal}
                  </Text>
                </Animated.View>
              </>
            );
          })()}
        </View>
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

function hexToRgba(hex: string, alpha: number) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function makePalette({
  isDark,
  colors,
}: {
  isDark: boolean;
  colors: { bg: string; card: string; text: string; textMuted: string; accent: string; border: string };
}) {
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
    navText: colors.text,
    navTextActive: colors.accent,

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

  return THEME_COLORS[key] ?? colorFromString(key);
}

function colorFromString(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const h = Math.abs(hash) % 360;
  return hslToHex(h, 78, 55);
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) => {
    const n = Math.round((v + m) * 255);
    return n.toString(16).padStart(2, "0");
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function ensureReadableColor(colorHex: string, bgHex: string, fallback: string) {
  const c = toRgb(colorHex);
  const b = toRgb(bgHex);
  if (!c || !b) return fallback;

  const ratio = contrastRatio(c, b);
  return ratio >= 3 ? colorHex : fallback;
}

function toRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = String(hex || "").trim();
  const m = /^#([0-9a-fA-F]{6})$/.exec(h);
  if (!m) return null;
  const s = m[1];
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

function srgbToLinear(v: number) {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function luminance(rgb: { r: number; g: number; b: number }) {
  const R = srgbToLinear(rgb.r);
  const G = srgbToLinear(rgb.g);
  const B = srgbToLinear(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function makeStyles(palette: ReturnType<typeof makePalette>, isWeb: boolean, isMobileWeb: boolean) {
  return StyleSheet.create({
    wrap: {
      width: "100%",
      backgroundColor: palette.bg,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingHorizontal: isMobileWeb ? 8 : 12,
      paddingVertical: isMobileWeb ? 6 : 6,
      zIndex: 100,
    },
    main: {
      width: "100%",
      borderRadius: isMobileWeb ? 16 : 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: isMobileWeb ? 10 : 14,
      paddingVertical: isMobileWeb ? 6 : 6,
      minHeight: isMobileWeb ? 48 : 0,
    },

    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: isMobileWeb ? 8 : 10,
      flexShrink: 1,
    },
    logoWrap: {
      paddingRight: isMobileWeb ? 4 : 6,
      paddingVertical: 4,
      ...(isWeb ? ({ cursor: "pointer" } as any) : {}),
    },
    logoTop: {
      fontSize: isMobileWeb ? 16 : 18,
      fontWeight: "900",
      color: palette.text,
      lineHeight: isMobileWeb ? 16 : 18,
    },
    logoBottom: {
      fontSize: isMobileWeb ? 16 : 18,
      fontWeight: "900",
      color: "#1dd4c7",
      lineHeight: isMobileWeb ? 18 : 20,
      marginTop: -2,
    },

    themeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: isMobileWeb ? 0 : 8,
      paddingHorizontal: isMobileWeb ? 0 : 10,
      paddingVertical: isMobileWeb ? 0 : 5,
      width: isMobileWeb ? 34 : undefined,
      height: isMobileWeb ? 34 : undefined,
      justifyContent: "center",
      borderRadius: isMobileWeb ? 12 : 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: "transparent",
      ...(isWeb ? ({ cursor: "pointer" } as any) : {}),
    },
    themeBtnPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    themeBtnText: {
      color: palette.muted,
      fontWeight: "900",
      fontSize: 12,
      letterSpacing: 0.35,
    },

    themeMenu: {
      zIndex: 2200,
      backgroundColor: palette.menuBg,
      borderRadius: 16,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      overflow: "hidden",
      ...(isWeb ? ({ boxShadow: "0 16px 40px rgba(0,0,0,0.28)" } as any) : {}),
    },
    themeMenuHeader: {
      paddingHorizontal: 12,
      paddingBottom: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    themeMenuTitle: {
      fontSize: 12,
      fontWeight: "900",
      color: palette.muted,
      letterSpacing: 0.5,
    },

    themeMenuSeparator: {
      height: 1,
      backgroundColor: palette.menuBorder,
      marginBottom: 6,
      opacity: 0.9,
    },
    themeMenuScroll: {
      maxHeight: 320,
      ...(isWeb
        ? ({
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: `${palette.muted} transparent`,
          } as any)
        : {}),
    },
    themeMenuList: {
      paddingHorizontal: 6,
      paddingBottom: 6,
    },
    themeItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    themeItemPressed: {
      backgroundColor: palette.menuItemHover,
    },
    themeItemActive: {
      backgroundColor: palette.accentSoft,
    },

    themeItemLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
      paddingRight: 10,
      gap: 10,
    },
    themeSwatch: {
      width: 12,
      height: 12,
      borderRadius: 999,
      borderWidth: 1,
    },
    themeItemText: {
      fontSize: 12,
      fontWeight: "900",
      flex: 1,
      minWidth: 0,
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
      ...(isWeb ? ({ cursor: "pointer" } as any) : {}),
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
      ...(isWeb ? ({ cursor: "pointer" } as any) : {}),
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
      ...(isWeb ? ({ cursor: "pointer" } as any) : {}),
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
      ...(isWeb ? ({ cursor: "pointer" } as any) : {}),
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
      ...(isWeb ? ({ cursor: "pointer" } as any) : {}),
    },
    iconBtnPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.96 }],
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
    backdropDimmed: {
      position: Platform.OS === "web" ? "fixed" : "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.35)",
      zIndex: 999,
    },

    menu: {
      position: "absolute",
      right: 18,
      top: isMobileWeb ? 56 : 56,
      width: 210,
      backgroundColor: palette.menuBg,
      borderRadius: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      zIndex: 1000,
      ...(isWeb ? ({ boxShadow: "0 14px 32px rgba(0,0,0,0.35)" } as any) : {}),
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
      top: isMobileWeb ? 60 : 56,
      width: isMobileWeb ? "92%" : 360,
      maxWidth: isMobileWeb ? "92%" : 360,
      backgroundColor: palette.menuBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      overflow: "hidden",
      zIndex: 1001,
      ...(isWeb ? ({ boxShadow: "0 16px 40px rgba(0,0,0,0.38)" } as any) : {}),
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
      backgroundColor: isWeb ? "rgba(47,107,255,0.06)" : "rgba(47,107,255,0.08)",
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

    mobileNavPanel: {
      position: "absolute",
      top: 60,
      left: 12,
      right: 12,
      borderRadius: 16,
      backgroundColor: palette.menuBg,
      borderWidth: 1,
      borderColor: palette.menuBorder,
      zIndex: 1002,
      ...(isWeb ? ({ boxShadow: "0 18px 40px rgba(0,0,0,0.45)" } as any) : {}),
    },
    mobileNavTitle: {
      fontSize: 15,
      fontWeight: "900",
      color: palette.text,
      paddingHorizontal: 14,
      paddingTop: 10,
    },
    mobileNavSeparator: {
      height: 1,
      backgroundColor: palette.menuBorder,
      marginTop: 8,
    },
    mobileNavScroll: {
      maxHeight: 380,
    },
    mobileNavList: {
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    mobileNavItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    mobileNavItemActive: {
      backgroundColor: "rgba(47,107,255,0.08)",
    },
    mobileNavItemPressed: {
      opacity: 0.9,
    },
    mobileNavText: {
      fontSize: 14,
      fontWeight: "700",
      color: palette.text,
    },
    mobileNavTextActive: {
      color: palette.navIconActive,
    },
  });
}
// src/components/CustomHeader.web.tsx
