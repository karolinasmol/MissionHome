import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  Image,
  Animated,
  useWindowDimensions,
  FlatList,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";
import { useFamily } from "../src/hooks/useFamily";
import { auth, db } from "../src/firebase/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

/**
 * ✅ app/premium.* => route w expo-router to "/premium"
 */
const PREMIUM_ROUTE = "/premium" as any;

/**
 * ✅ Zakładka "Rodzina" (dopasuj jeśli masz inną ścieżkę)
 */
const FAMILY_ROUTE = "/family" as any;

function conversationIdFor(a: string, b: string) {
  return [a, b].sort().join("_");
}

/* ------------------ SAFE MESSAGE FILTER ------------------ */

const badWords = [
  "kurwa",
  "k**wa",
  "k*wa",
  "k#rwa",
  "chuj",
  "ch*j",
  "huj",
  "huja",
  "jebac",
  "jebać",
  "jebac",
  "j3bac",
  "j3bać",
  "jebie",
  "pierdolić",
  "pierdolic",
  "p!erdolic",
  "p!erdol",
  "p1erdol",
  "pierdol",
  "pierdziel",
  "pizda",
  "p!zda",
  "p1zda",
  "pedal",
  "pedał",
  "p3dal",
  "p3dał",
  "spierdalaj",
  "s*pierdalaj",
];

const threatPhrases = [
  "zabije",
  "zabiję",
  "zabij cie",
  "zabije cie",
  "zniszczę cię",
  "zniszcze cie",
  "odnajdę cię",
  "odnajde cie",
  "mam twój adres",
  "mam twoj adres",
  "pier*** cię",
  "pier*** cie",
  "roz*** cię",
  "roz*** cie",
  "jeb** ci łeb",
  "jeb** ci leb",
];

const trustedDomains = [
  "google.com",
  "google.pl",
  "youtube.com",
  "youtu.be",
  "wikipedia.org",
  "gov.pl",
  "allegro.pl",
  "olx.pl",
  "onet.pl",
  "wp.pl",
  "interia.pl",
  "facebook.com",
  "messenger.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "linkedin.com",
  "github.com",
  "gitlab.com",
  "microsoft.com",
  "apple.com",
];

function containsBadWords(message: string) {
  const m = message.toLowerCase();
  return badWords.some((w) => m.includes(w));
}
function containsThreats(message: string) {
  const m = message.toLowerCase();
  return threatPhrases.some((t) => m.includes(t));
}
function containsAddressLike(message: string) {
  const addrRegex =
    /\b(ul\.?|al\.?|os\.?|pl\.?|plac|ulicy)\s+[0-9A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż.\-]+/i;
  return addrRegex.test(message);
}
function containsPhoneLike(message: string) {
  const phoneRegex = /(\+?\d[\s\-]?){9,12}/;
  return phoneRegex.test(message);
}
function containsEmailLike(message: string) {
  const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  return emailRegex.test(message);
}
function containsUntrustedLink(message: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = message.toLowerCase().match(urlRegex);
  if (!urls) return false;

  return urls.some((url) => {
    const isTrusted = trustedDomains.some((domain) => url.includes(domain));
    return !isTrusted;
  });
}
function isMessageAllowed(rawMessage: string) {
  const message = rawMessage.trim();
  if (!message) return true;

  return !(
    containsBadWords(message) ||
    containsThreats(message) ||
    containsAddressLike(message) ||
    containsPhoneLike(message) ||
    containsEmailLike(message) ||
    containsUntrustedLink(message)
  );
}

/* ------------------ LAYOUT ------------------ */
function useChatLayout() {
  const { width, height } = useWindowDimensions();

  const isNarrow = width < 420;
  const isShort = height < 700;

  const headerHeight = isNarrow ? 52 : 56;
  const sidePadding = isNarrow ? 10 : 12;

  const messageMaxWidth = isNarrow ? "86%" : "82%";

  // Native only — web nie używa KAV (mobilny Safari potrafi “pchać” w bok)
  const keyboardOffset = headerHeight + (Platform.OS === "ios" ? 14 : 10);

  const chatTopPadding = isShort ? 6 : 8;
  const chatBoxTopMargin = isShort ? 8 : 10;

  return {
    headerHeight,
    sidePadding,
    messageMaxWidth,
    keyboardOffset,
    chatTopPadding,
    chatBoxTopMargin,
    isNarrow,
  };
}

/* ------------------ DATE HELPERS ------------------ */
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

function formatTimePL(ts: any) {
  const d = safeToDate(ts);
  if (!d) return "";
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabelPL(ts: any) {
  const d = safeToDate(ts);
  if (!d) return "";
  return d.toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

type ChatMsg = {
  id: string;
  sender: string;
  text: string;
  createdAt?: any;
};

type ChatItem =
  | { type: "sep"; id: string; label: string }
  | { type: "msg"; id: string; msg: ChatMsg };

function buildChatItemsForInverted(messagesDesc: ChatMsg[]): ChatItem[] {
  const items: ChatItem[] = [];

  for (let i = 0; i < messagesDesc.length; i++) {
    const m = messagesDesc[i];
    items.push({ type: "msg", id: m.id, msg: m });

    const curLabel = formatDayLabelPL(m.createdAt);
    const next = messagesDesc[i + 1];
    const nextLabel = next ? formatDayLabelPL(next.createdAt) : "";

    const dayEndsHere = !!curLabel && curLabel !== nextLabel;
    if (dayEndsHere) {
      items.push({
        type: "sep",
        id: `sep-${curLabel}-${m.id}`,
        label: curLabel,
      });
    }
  }

  return items;
}

function pickMemberUid(m: any) {
  return String(m?.uid ?? m?.userId ?? m?.id ?? "").trim();
}

export default function MessagesMobile() {
  const { colors } = useThemeColors();
  const { members } = useFamily();
  const router = useRouter();
  const user = auth.currentUser;
  const myUid = user?.uid ?? null;

  const isWeb = Platform.OS === "web";

  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const layout = useChatLayout();

  const listRef = useRef<FlatList<ChatItem> | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  // ✅ WEB: stabilna wysokość viewportu (ważne na mobile z klawiaturą)
  const [webViewportH, setWebViewportH] = useState<number | null>(null);

  useEffect(() => {
    if (!isWeb) return;

    // @ts-ignore
    const w = typeof window !== "undefined" ? window : null;
    // @ts-ignore
    const d = typeof document !== "undefined" ? document : null;
    if (!w || !d) return;

    const prevBodyOverflowX = d.body.style.overflowX;
    const prevHtmlOverflowX = d.documentElement.style.overflowX;

    const prevBodyWidth = d.body.style.width;
    const prevHtmlWidth = d.documentElement.style.width;

    d.body.style.overflowX = "hidden";
    d.documentElement.style.overflowX = "hidden";
    d.body.style.width = "100%";
    d.documentElement.style.width = "100%";

    const getH = () => {
      // visualViewport daje realną wysokość po otwarciu klawiatury
      // @ts-ignore
      const vv = w.visualViewport;
      const h = vv?.height ? Math.round(vv.height) : Math.round(w.innerHeight);
      setWebViewportH(h);
    };

    getH();

    // @ts-ignore
    const vv = w.visualViewport;
    vv?.addEventListener?.("resize", getH);
    vv?.addEventListener?.("scroll", getH);
    w.addEventListener("resize", getH);

    return () => {
      vv?.removeEventListener?.("resize", getH);
      vv?.removeEventListener?.("scroll", getH);
      w.removeEventListener("resize", getH);

      d.body.style.overflowX = prevBodyOverflowX;
      d.documentElement.style.overflowX = prevHtmlOverflowX;
      d.body.style.width = prevBodyWidth;
      d.documentElement.style.width = prevHtmlWidth;
    };
  }, [isWeb]);

  const goPremium = () => {
    try {
      router.push(PREMIUM_ROUTE);
    } catch {
      Alert.alert("Premium", "Nie mogę otworzyć ekranu Premium. Sprawdź PREMIUM_ROUTE.");
    }
  };

  const goFamily = () => {
    try {
      router.push(FAMILY_ROUTE);
    } catch {
      Alert.alert("Rodzina", "Nie mogę otworzyć zakładki Rodzina. Sprawdź FAMILY_ROUTE.");
    }
  };

  const showPremiumGate = () => {
    Alert.alert(
      "Wiadomości są w Premium",
      "Aby pisać z członkami rodziny w MissionHome, potrzebujesz Premium. Po zakupie od razu odblokujesz czat.",
      [
        { text: "Nie teraz", style: "cancel" },
        { text: "Przejdź do Premium", onPress: goPremium },
      ]
    );
  };

  /* ------------------ FAMILY PICKER (MODAL) ------------------ */
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false);
  const pickerY = useRef(new Animated.Value(40)).current;
  const pickerOpacity = useRef(new Animated.Value(0)).current;

  const openPicker = () => {
    setFamilyPickerOpen(true);
    pickerY.setValue(40);
    pickerOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(pickerOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(pickerY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closePicker = () => {
    Animated.parallel([
      Animated.timing(pickerOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(pickerY, {
        toValue: 30,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => setFamilyPickerOpen(false));
  };

  /* ------------------ PREMIUM CHECK (USER ONLY) ------------------ */
  useEffect(() => {
    if (!myUid) return;

    const unsub = onSnapshot(doc(db, "users", myUid), (snap) => {
      if (!snap.exists()) {
        setIsPremiumUser(false);
        setCheckingPremium(false);
        return;
      }

      const data = snap.data();
      const isPremiumFlag = data?.isPremium === true;

      const until = data?.premiumUntil;
      const untilDate = safeToDate(until);
      const activeByUntil = !untilDate ? true : untilDate.getTime() > new Date().getTime();

      const active = isPremiumFlag && activeByUntil;

      setIsPremiumUser(active);
      setCheckingPremium(false);
    });

    return () => unsub();
  }, [myUid]);

  const canChat = isPremiumUser;

  /* ------------------ FAMILY MEMBERS ------------------ */
  const familyMembers = useMemo(() => {
    if (!members || !myUid) return [];
    return (members as any[])
      .map((m) => ({ ...m, __uid: pickMemberUid(m) }))
      .filter((m) => m.__uid && String(m.__uid) !== String(myUid))
      .slice(0, 6);
  }, [members, myUid]);

  const selectedMember = useMemo(() => {
    if (!selectedUid) return null;
    return familyMembers.find((x: any) => String(x.__uid) === String(selectedUid)) ?? null;
  }, [familyMembers, selectedUid]);

  const hasFamily = familyMembers.length > 0;

  /* ------------------ LOAD MESSAGES + MARK READ ------------------ */
  useEffect(() => {
    if (!canChat) {
      setMessages([]);
      return;
    }
    if (!myUid || !selectedUid) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    let unsub: any = null;

    const convId = conversationIdFor(myUid, selectedUid);
    const convRef = doc(db, "messages", convId);

    (async () => {
      try {
        const snap = await getDoc(convRef);
        if (!snap.exists()) {
          await setDoc(convRef, {
            createdAt: serverTimestamp(),
            users: [myUid, selectedUid],
          });
        }
      } catch (e) {
        console.log("CONV ENSURE ERROR:", e);
      }

      if (cancelled) return;

      const qy = query(collection(db, `messages/${convId}/messages`), orderBy("createdAt", "desc"));

      unsub = onSnapshot(
        qy,
        (snap) => {
          const arr = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as ChatMsg[];
          setMessages(arr);

          const latest = arr?.[0];
          if (latest?.sender && latest.sender !== myUid) {
            updateDoc(convRef, {
              [`readAt.${myUid}`]: serverTimestamp(),
            }).catch(() => {});
          }

          requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          });
        },
        (err) => {
          console.log("MESSAGE LIST ERROR:", err);
        }
      );
    })();

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [myUid, selectedUid, canChat]);

  const chatItems = useMemo(() => buildChatItemsForInverted(messages), [messages]);

  /* ------------------ SEND MESSAGE ------------------ */
  const sendMessage = async () => {
    if (!myUid || !selectedUid) return;
    if (sending) return;

    if (!canChat) {
      showPremiumGate();
      return;
    }

    const isSelectedInFamily = familyMembers.some((m: any) => String(m.__uid) === String(selectedUid));
    if (!isSelectedInFamily) {
      Alert.alert(
        "Tylko rodzina",
        "Możesz wysyłać wiadomości wyłącznie do członków rodziny dodanych w MissionHome."
      );
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    if (!isMessageAllowed(trimmed)) {
      setBlockedModalOpen(true);
      return;
    }

    const convId = conversationIdFor(myUid, selectedUid);

    setSending(true);
    try {
      const convRef = doc(db, "messages", convId);
      const snap = await getDoc(convRef);

      if (!snap.exists()) {
        await setDoc(convRef, {
          createdAt: serverTimestamp(),
          users: [myUid, selectedUid],
        });
      }

      await addDoc(collection(db, `messages/${convId}/messages`), {
        sender: myUid,
        text: trimmed,
        createdAt: serverTimestamp(),
      });

      await updateDoc(convRef, {
        lastMessageAt: serverTimestamp(),
        lastMessageSender: myUid,
        lastMessageText: trimmed,
        [`readAt.${myUid}`]: serverTimestamp(),
      });

      setText("");

      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    } catch (err: any) {
      console.log("MESSAGE ERROR:", err);
      Alert.alert("Błąd wysyłania", "Nie udało się wysłać wiadomości. Sprawdź logi.");
    } finally {
      setSending(false);
    }
  };

  if (checkingPremium) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          alignSelf: "stretch",
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: colors.border,
            borderTopColor: colors.accent,
            marginBottom: 12,
          }}
        />
        <Text style={{ color: colors.textMuted, fontWeight: "800" }}>Ładowanie…</Text>
      </SafeAreaView>
    );
  }

  const renderAvatar = (pURL?: string | null, fallbackLetter?: string, size = 40) => {
    if (pURL) {
      return (
        <Image
          source={{ uri: pURL }}
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      );
    }

    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: colors.bg,
          justifyContent: "center",
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.text, fontWeight: "1000" }}>
          {(fallbackLetter ?? "?").toUpperCase()}
        </Text>
      </View>
    );
  };

  const canSend = !!text.trim() && !!selectedUid && !sending && canChat;

  const bubbleRadii = (isMine: boolean, joinTop: boolean, joinBottom: boolean) => {
    const R = 18;
    const s = 8;
    const tl = isMine ? R : joinTop ? s : R;
    const tr = isMine ? (joinTop ? s : R) : R;
    const bl = isMine ? R : joinBottom ? s : R;
    const br = isMine ? (joinBottom ? s : R) : R;
    return {
      borderTopLeftRadius: tl,
      borderTopRightRadius: tr,
      borderBottomLeftRadius: bl,
      borderBottomRightRadius: br,
    };
  };

  const renderItem = ({ item, index }: { item: ChatItem; index: number }) => {
    if (item.type === "sep") {
      return (
        <View
          style={{
            alignSelf: "center",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bg,
            marginVertical: 10,
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "1000" }}>
            {item.label}
          </Text>
        </View>
      );
    }

    const msg = item.msg;
    const isMine = msg.sender === myUid;

    const prev = chatItems[index - 1];
    const next = chatItems[index + 1];
    const prevMsg = prev?.type === "msg" ? prev.msg : null;
    const nextMsg = next?.type === "msg" ? next.msg : null;

    const joinBottom = !!prevMsg && prevMsg.sender === msg.sender;
    const joinTop = !!nextMsg && nextMsg.sender === msg.sender;

    const time = formatTimePL(msg.createdAt);
    const isIncomingFromFamily = !isMine && !!selectedUid && msg.sender === selectedUid;

    return (
      <View
        style={{
          alignSelf: isMine ? "flex-end" : "flex-start",
          maxWidth: layout.messageMaxWidth,
          marginBottom: joinTop ? 6 : 10,
          minWidth: 0,
        }}
      >
        <View
          style={{
            backgroundColor: isMine ? colors.accent : colors.card,
            borderWidth: 1,
            borderColor: isMine ? colors.accent + "55" : colors.border,
            paddingHorizontal: layout.isNarrow ? 10 : 12,
            paddingVertical: layout.isNarrow ? 9 : 10,
            ...bubbleRadii(isMine, joinTop, joinBottom),
          }}
        >
          {(!!time || isIncomingFromFamily) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              {isIncomingFromFamily ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="arrow-down-circle" size={12} color={colors.textMuted} />
                  <Text
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: colors.textMuted,
                      fontWeight: "900",
                    }}
                  >
                    Rodzina
                  </Text>
                </View>
              ) : (
                <View />
              )}

              {!!time && (
                <Text
                  style={{
                    fontSize: 11,
                    color: isMine ? "#01403A" : colors.textMuted,
                    fontWeight: "900",
                  }}
                >
                  {time}
                </Text>
              )}
            </View>
          )}

          <Text
            style={{
              color: isMine ? "#022c22" : colors.text,
              fontWeight: "800",
              fontSize: layout.isNarrow ? 13.5 : 14,
              lineHeight: layout.isNarrow ? 18 : 19,
            }}
          >
            {msg.text}
          </Text>
        </View>
      </View>
    );
  };

  const FamilyDock = () => {
    return (
      <View
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          alignSelf: "stretch",
          minWidth: 0,
        }}
      >
        <TouchableOpacity
          onPress={openPicker}
          activeOpacity={0.85}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bg,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
            flexShrink: 0,
          }}
        >
          <Ionicons name="people" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, minWidth: 0 }}>
          <FlatList
            data={familyMembers}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(m: any) => String(m.__uid)}
            contentContainerStyle={{ paddingRight: 4 }}
            renderItem={({ item: m }: any) => {
              const uid = String(m.__uid);
              const pURL = m.photoURL || m.avatarUrl;
              const isActive = selectedUid === uid;
              const name = m.displayName || "Członek";

              return (
                <TouchableOpacity
                  key={uid}
                  onPress={() => {
                    setSelectedUid(uid);
                    // fokus tylko po zmianie — sticky header zostaje na web
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  activeOpacity={0.85}
                  style={{ alignItems: "center", marginRight: 10 }}
                >
                  <View
                    style={{
                      padding: 2,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: isActive ? colors.accent : "transparent",
                      backgroundColor: "transparent",
                    }}
                  >
                    {renderAvatar(pURL, name[0], 38)}
                  </View>

                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: 5,
                      maxWidth: 62,
                      color: isActive ? colors.text : colors.textMuted,
                      fontSize: 11,
                      fontWeight: isActive ? "1000" : "800",
                      textAlign: "center",
                    }}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  justifyContent: "center",
                  minWidth: 220,
                }}
              >
                <Text style={{ color: colors.textMuted, fontWeight: "900", fontSize: 12 }}>
                  Brak domowników w rodzinie
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    color: colors.textMuted,
                    fontWeight: "800",
                    fontSize: 11,
                  }}
                  numberOfLines={1}
                >
                  Dodaj osoby w zakładce „Rodzina”
                </Text>
              </View>
            }
          />
        </View>

        <View style={{ marginLeft: 10, alignItems: "flex-end", flexShrink: 0 }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: canChat ? colors.border : colors.accent + "66",
              backgroundColor: canChat ? colors.bg : colors.accent + "14",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name={canChat ? "checkmark-circle" : "lock-closed"}
              size={14}
              color={canChat ? colors.textMuted : colors.accent}
            />
            <Text
              style={{
                marginLeft: 6,
                color: canChat ? colors.textMuted : colors.accent,
                fontWeight: "1000",
                fontSize: 12,
              }}
            >
              {canChat ? "Odblokowane" : "Wymaga Premium"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const FamilyPicker = () => {
    if (!familyPickerOpen) return null;

    return (
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 500,
          opacity: pickerOpacity,
        }}
      >
        <Pressable
          onPress={closePicker}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,0.55)",
          }}
        />

        <Animated.View
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            top: layout.headerHeight + 14,
            transform: [{ translateY: pickerY }],
          }}
        >
          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <View>
                <Text style={{ color: colors.text, fontWeight: "1100", fontSize: 16 }}>
                  Wybierz rozmowę
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    color: colors.textMuted,
                    fontWeight: "800",
                    fontSize: 12,
                  }}
                >
                  Maks 6 osób — szybki przełącznik
                </Text>
              </View>

              <TouchableOpacity
                onPress={closePicker}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              {familyMembers.map((m: any) => {
                const uid = String(m.__uid);
                const pURL = m.photoURL || m.avatarUrl;
                const name = m.displayName || "Członek";
                const isActive = selectedUid === uid;

                return (
                  <TouchableOpacity
                    key={uid}
                    onPress={() => {
                      setSelectedUid(uid);
                      closePicker();
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    activeOpacity={0.85}
                    style={{
                      width: layout.isNarrow ? "100%" : "48%",
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: isActive ? colors.accent + "66" : colors.border,
                      backgroundColor: isActive ? colors.accent + "18" : colors.bg,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        padding: 2,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: isActive ? colors.accent : "transparent",
                      }}
                    >
                      {renderAvatar(pURL, name[0], 40)}
                    </View>

                    <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "1100", fontSize: 14 }}>
                        {name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          marginTop: 2,
                          color: colors.textMuted,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        Kliknij, aby pisać
                      </Text>
                    </View>

                    <Ionicons
                      name={isActive ? "checkmark-circle" : "chatbubble-ellipses-outline"}
                      size={18}
                      color={isActive ? colors.accent : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}

              {familyMembers.length === 0 && (
                <View
                  style={{
                    width: "100%",
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "1100", fontSize: 14 }}>
                    Nie masz jeszcze dodanych domowników
                  </Text>
                  <Text
                    style={{
                      marginTop: 4,
                      color: colors.textMuted,
                      fontWeight: "800",
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    Przejdź do zakładki „Rodzina”, dodaj osoby i wróć tutaj, żeby pisać wiadomości.
                  </Text>

                  <TouchableOpacity
                    onPress={() => {
                      closePicker();
                      goFamily();
                    }}
                    activeOpacity={0.85}
                    style={{
                      marginTop: 12,
                      borderRadius: 14,
                      paddingVertical: 11,
                      paddingHorizontal: 12,
                      backgroundColor: colors.accent,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="people" size={16} color="#022c22" />
                    <Text style={{ marginLeft: 8, color: "#022c22", fontWeight: "1100" }}>
                      Przejdź do Rodziny
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    );
  };

  const renderChatHeader = () => {
    if (!selectedMember) return null;

    const pURL = selectedMember.photoURL || selectedMember.avatarUrl;
    const name = selectedMember.displayName || "Rozmowa";

    return (
      <View
        style={{
          marginTop: 10,
          padding: layout.isNarrow ? 10 : 12,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          alignSelf: "stretch",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 }}>
          <View
            style={{
              padding: 2,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: colors.accent + "55",
              flexShrink: 0,
            }}
          >
            {renderAvatar(pURL, name[0], 40)}
          </View>
          <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontWeight: "1100", fontSize: 16 }} numberOfLines={1}>
              {name}
            </Text>
            <Text
              style={{
                marginTop: 2,
                color: colors.textMuted,
                fontWeight: "800",
                fontSize: 12,
              }}
              numberOfLines={1}
            >
              Prywatna rozmowa (rodzina)
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={openPicker}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 10,
            flexShrink: 0,
          }}
        >
          <Ionicons name="swap-horizontal" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
  };

  const PremiumGateScreen = ({
    title,
    subtitle,
    showSelectedHint,
  }: {
    title: string;
    subtitle: string;
    showSelectedHint?: boolean;
  }) => {
    const selectedName = selectedMember?.displayName;

    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: layout.isNarrow ? 14 : 20,
          width: "100%",
          alignSelf: "stretch",
        }}
      >
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 24,
            backgroundColor: colors.accent + "14",
            borderWidth: 1,
            borderColor: colors.accent + "66",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="people" size={38} color={colors.accent} />
        </View>

        <Text
          style={{
            color: colors.text,
            fontWeight: "1100",
            fontSize: 18,
            textAlign: "center",
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            marginTop: 8,
            color: colors.textMuted,
            textAlign: "center",
            fontWeight: "800",
            lineHeight: 19,
            maxWidth: 520,
          }}
        >
          {subtitle}
        </Text>

        {showSelectedHint && !!selectedName && (
          <View
            style={{
              marginTop: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 12,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons name="person-circle-outline" size={18} color={colors.textMuted} />
            <Text style={{ marginLeft: 8, color: colors.text, fontWeight: "900" }} numberOfLines={1}>
              Wybrana rozmowa: {selectedName}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={goPremium}
          style={{
            marginTop: 16,
            backgroundColor: colors.accent,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 14,
            flexDirection: "row",
            alignItems: "center",
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="sparkles" size={18} color="#022c22" />
          <Text style={{ marginLeft: 8, color: "#022c22", fontWeight: "1100" }}>
            Przejdź do subskrypcji Premium
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const PremiumNoFamilyScreen = () => {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: layout.isNarrow ? 14 : 20,
          width: "100%",
          alignSelf: "stretch",
        }}
      >
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 24,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="people-outline" size={38} color={colors.textMuted} />
        </View>

        <Text
          style={{
            color: colors.text,
            fontWeight: "1100",
            fontSize: 18,
            textAlign: "center",
          }}
        >
          Dodaj domowników, żeby pisać wiadomości
        </Text>

        <Text
          style={{
            marginTop: 8,
            color: colors.textMuted,
            textAlign: "center",
            fontWeight: "800",
            lineHeight: 19,
            maxWidth: 520,
          }}
        >
          Masz Premium, ale nie masz jeszcze członków rodziny.
          {"\n"}Przejdź do „Rodzina”, aby dodać osoby, z którymi możesz pisać.
        </Text>

        <TouchableOpacity
          onPress={goFamily}
          style={{
            marginTop: 16,
            backgroundColor: colors.accent,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 14,
            flexDirection: "row",
            alignItems: "center",
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="people" size={18} color="#022c22" />
          <Text style={{ marginLeft: 8, color: "#022c22", fontWeight: "1100" }}>
            Przejdź do Rodziny
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={openPicker}
          style={{
            marginTop: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bg,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 14,
            flexDirection: "row",
            alignItems: "center",
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="list" size={18} color={colors.textMuted} />
          <Text style={{ marginLeft: 8, color: colors.text, fontWeight: "1000", fontSize: 13 }}>
            Zobacz panel rozmów
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ✅ Sticky header/dock na web — dzięki temu nie “znikają” po focussie inputa
  const TopBar = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: layout.sidePadding,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        height: layout.headerHeight,
        backgroundColor: colors.bg,
        width: "100%",
        alignSelf: "stretch",
        ...(isWeb
          ? ({
              position: "sticky",
              top: 0,
              zIndex: 300,
            } as any)
          : {}),
      }}
    >
      <View style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "1100" }}>Wiadomości</Text>
        <Text
          style={{
            marginTop: 1,
            color: colors.textMuted,
            fontSize: 12,
            fontWeight: "800",
          }}
          numberOfLines={1}
        >
          {selectedMember?.displayName ? `Rozmowa: ${selectedMember.displayName}` : "Wybierz osobę z docka"}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          flexShrink: 0,
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="arrow-back" size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  const DockWrap = (
    <View
      style={{
        paddingHorizontal: layout.sidePadding,
        width: "100%",
        alignSelf: "stretch",
        ...(isWeb
          ? ({
              position: "sticky",
              top: layout.headerHeight,
              zIndex: 290,
              backgroundColor: colors.bg,
              paddingBottom: 8,
            } as any)
          : {}),
      }}
    >
      <FamilyDock />
    </View>
  );

  const Content = (
    <View
      style={{
        flex: 1,
        paddingHorizontal: layout.sidePadding,
        paddingTop: layout.chatTopPadding,
        width: "100%",
        alignSelf: "stretch",
        minWidth: 0,
      }}
    >
      {!canChat ? (
        <PremiumGateScreen
          title={
            hasFamily ? "Aby wysyłać wiadomości, potrzebujesz Premium" : "Dołącz do rodziny, aby wysyłać wiadomości"
          }
          subtitle={
            hasFamily
              ? selectedUid
                ? "Ta rozmowa jest zablokowana. Przejdź do subskrypcji Premium, aby wysyłać wiadomości do rodziny."
                : "Wybierz domownika z docka — a potem przejdź do Premium, żeby pisać wiadomości."
              : "Dodaj domowników w zakładce „Rodzina”. Gdy będziesz mieć rodzinę, przejdź do Premium i zacznij pisać."
          }
          showSelectedHint={!!selectedUid}
        />
      ) : !hasFamily ? (
        <PremiumNoFamilyScreen />
      ) : !selectedUid ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: layout.isNarrow ? 14 : 20,
          }}
        >
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 22,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Ionicons name="chatbubbles-outline" size={36} color={colors.textMuted} />
          </View>

          <Text style={{ color: colors.text, fontWeight: "1100", fontSize: 16, textAlign: "center" }}>
            Wybierz osobę z docka
          </Text>

          <Text style={{ marginTop: 6, color: colors.textMuted, textAlign: "center", fontWeight: "800" }}>
            Masz max 6 osób, więc dock jest najszybszy.
          </Text>

          <TouchableOpacity
            onPress={openPicker}
            style={{
              marginTop: 16,
              backgroundColor: colors.accent,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="swap-horizontal" size={18} color="#022c22" />
            <Text style={{ marginLeft: 8, color: "#022c22", fontWeight: "1100" }}>Otwórz wybór rozmowy</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {renderChatHeader()}

          <View
            style={{
              flex: 1,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              paddingHorizontal: layout.isNarrow ? 8 : 10,
              paddingTop: 8,
              overflow: "hidden",
              marginTop: layout.chatBoxTopMargin,
              width: "100%",
              alignSelf: "stretch",
              minWidth: 0,
            }}
          >
            <FlatList
              ref={(r) => (listRef.current = r)}
              data={chatItems}
              keyExtractor={(it) => it.id}
              renderItem={renderItem}
              inverted
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingTop: 12,
                paddingBottom: 12,
              }}
              onScrollBeginDrag={() => inputRef.current?.blur()}
            />
          </View>

          <View
            style={{
              marginTop: 10,
              marginBottom: 8,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 10,
              width: "100%",
              alignSelf: "stretch",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 16,
                  backgroundColor: "transparent",
                  paddingHorizontal: 12,
                  paddingVertical: Platform.OS === "ios" ? 10 : 6,
                  marginRight: 10,
                  opacity: !sending ? 1 : 0.75,
                  minWidth: 0,
                }}
              >
                <TextInput
                  ref={(r) => (inputRef.current = r)}
                  placeholder={"Napisz wiadomość…"}
                  placeholderTextColor={colors.textMuted}
                  value={text}
                  onChangeText={setText}
                  editable={!sending}
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "800",
                    maxHeight: 110,
                    backgroundColor: "transparent",
                    borderWidth: 0,

                    // ✅ WEB: usuwa brzydką niebieską ramkę (focus ring)
                    ...(isWeb
                      ? ({
                          outlineStyle: "none",
                          outlineWidth: 0,
                          boxShadow: "none",
                          WebkitTapHighlightColor: "transparent",
                        } as any)
                      : {}),
                  }}
                  multiline
                  blurOnSubmit={false}
                  returnKeyType="send"
                  onSubmitEditing={() => sendMessage()}
                  onKeyPress={(e) => {
                    if (Platform.OS === "web") {
                      // @ts-ignore
                      const isEnter = e?.nativeEvent?.key === "Enter";
                      // @ts-ignore
                      const shift = e?.nativeEvent?.shiftKey === true;
                      if (isEnter && !shift) {
                        // @ts-ignore
                        e.preventDefault?.();
                        sendMessage();
                      }
                    }
                  }}
                />
              </View>

              <TouchableOpacity
                onPress={() => sendMessage()}
                activeOpacity={0.85}
                disabled={sending}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: canSend ? colors.accent : colors.border,
                  borderWidth: 1,
                  borderColor: canSend ? colors.accent + "66" : colors.border,
                  flexShrink: 0,
                }}
              >
                <Ionicons name={"send"} size={18} color={canSend ? "#022c22" : colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                marginTop: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setText("");
                  inputRef.current?.focus();
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: colors.text, fontWeight: "1000", fontSize: 12 }}>Wyczyść</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      <FamilyPicker />

      {blockedModalOpen && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,0.75)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 700,
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: colors.card,
              borderRadius: 18,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#fbbf2422",
                  borderWidth: 1,
                  borderColor: "#fbbf2466",
                  marginRight: 10,
                }}
              >
                <Ionicons name="alert-circle-outline" size={18} color="#fbbf24" />
              </View>

              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "1100" }}>
                ⚠️ System przeciążony emocjami
              </Text>
            </View>

            <Text
              style={{
                color: colors.text,
                opacity: 0.88,
                marginBottom: 14,
                fontWeight: "800",
                lineHeight: 19,
              }}
            >
              Wykryto treść, której nie puszczę dalej.
              {"\n"}
              Zmień wiadomość na spokojniejszą i spróbuj ponownie.
            </Text>

            <TouchableOpacity
              onPress={() => setBlockedModalOpen(false)}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: "#022c22", fontWeight: "1100" }}>Okej, poprawiam</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const Body = (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        minWidth: 0,

        ...(isWeb
          ? ({
              // ✅ scroll tylko w środku — header/dock sticky trzymają się dobrze
              overflowY: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
            } as any)
          : {}),
      }}
    >
      {TopBar}
      {DockWrap}
      {Content}
    </View>
  );

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        width: "100%",
        alignSelf: "stretch",
        ...(isWeb
          ? ({
              height: webViewportH ?? "100vh",
              minHeight: webViewportH ?? "100vh",
              overflow: "hidden",
            } as any)
          : {}),
      }}
    >
      {isWeb ? (
        // ✅ WEB: bez KAV (mniej bugów z klawiaturą i przesuwaniem w bok)
        Body
      ) : (
        // ✅ NATIVE: KAV OK
        <KeyboardAvoidingView
          style={{ flex: 1, width: "100%", alignSelf: "stretch" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={layout.keyboardOffset}
        >
          {Body}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
//app/messages.mobile.tsx
