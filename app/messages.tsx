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
  useWindowDimensions,
  FlatList,
  Alert,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  return String(
    m?.uid ??
      m?.userUid ??
      m?.userId ??
      m?.memberUid ??
      m?.memberId ??
      m?.id ??
      ""
  ).trim();
}

/* ------------------ LAYOUT ------------------ */

function useChatLayout() {
  const { width } = useWindowDimensions();

  const isPhone = width < 520;
  const isNarrow = width < 420;

  const headerH = isNarrow ? 56 : 60;
  const railW = isPhone ? 72 : 88;
  const messageMaxWidth = isNarrow ? "86%" : "82%";

  return { headerH, railW, messageMaxWidth, isNarrow, isPhone };
}

export default function MessagesMobile() {
  const { colors } = useThemeColors();
  const { members } = useFamily();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const user = auth.currentUser;
  const myUid = user?.uid ?? null;

  const layout = useChatLayout();
  const isWeb = Platform.OS === "web";

  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<ChatItem> | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  /* ------------------ PREMIUM CHECK ------------------ */

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

      setIsPremiumUser(isPremiumFlag && activeByUntil);
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
      .slice(0, 20);
  }, [members, myUid]);

  const selectedMember = useMemo(() => {
    if (!selectedUid) return null;
    return familyMembers.find((x: any) => String(x.__uid) === String(selectedUid)) ?? null;
  }, [familyMembers, selectedUid]);

  const hasFamily = familyMembers.length > 0;

  /* ------------------ LOAD MESSAGES ------------------ */

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
          await setDoc(convRef, { createdAt: serverTimestamp(), users: [myUid, selectedUid] });
        }
      } catch (e) {
        console.log("CONV ENSURE ERROR:", e);
      }

      if (cancelled) return;

      const qy = query(collection(db, `messages/${convId}/messages`), orderBy("createdAt", "desc"));

      unsub = onSnapshot(
        qy,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatMsg[];
          setMessages(arr);

          requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          });
        },
        (err) => console.log("MESSAGE LIST ERROR:", err)
      );
    })();

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [myUid, selectedUid, canChat]);

  const chatItems = useMemo(() => buildChatItemsForInverted(messages), [messages]);

  /* ------------------ NAV ------------------ */

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
      "Aby pisać z członkami rodziny w MissionHome, potrzebujesz Premium.",
      [
        { text: "Nie teraz", style: "cancel" },
        { text: "Przejdź do Premium", onPress: goPremium },
      ]
    );
  };

  /* ------------------ SEND ------------------ */

  const sendMessage = async () => {
    if (!myUid || !selectedUid) return;
    if (sending) return;

    if (!canChat) {
      showPremiumGate();
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
        await setDoc(convRef, { createdAt: serverTimestamp(), users: [myUid, selectedUid] });
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

  /* ------------------ UI HELPERS ------------------ */

  const renderAvatar = (pURL?: string | null, fallbackLetter?: string, size = 52, active = false) => {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          padding: 2,
          borderWidth: 2,
          borderColor: active ? colors.accent : "transparent",
        }}
      >
        {pURL ? (
          <Image
            source={{ uri: pURL }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        ) : (
          <View
            style={{
              flex: 1,
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
        )}
      </View>
    );
  };

  const canSend = !!text.trim() && !!selectedUid && !sending && canChat;

  /* ------------------ MESSAGE ITEM ------------------ */

  const renderItem = ({ item }: { item: ChatItem }) => {
    if (item.type === "sep") {
      return (
        <View style={{ alignSelf: "center", marginVertical: 10 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "1000" }}>
              {item.label}
            </Text>
          </View>
        </View>
      );
    }

    const msg = item.msg;
    const isMine = msg.sender === myUid;
    const time = formatTimePL(msg.createdAt);

    return (
      <View style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: layout.messageMaxWidth, marginBottom: 10 }}>
        <View
          style={{
            backgroundColor: isMine ? colors.accent : colors.card,
            borderWidth: 1,
            borderColor: isMine ? colors.accent + "55" : colors.border,
            paddingHorizontal: layout.isNarrow ? 10 : 12,
            paddingVertical: layout.isNarrow ? 9 : 10,
            borderRadius: 18,
          }}
        >
          {!!time && (
            <Text style={{ fontSize: 11, color: isMine ? "#01403A" : colors.textMuted, fontWeight: "900", marginBottom: 6, textAlign: "right" }}>
              {time}
            </Text>
          )}
          <Text style={{ color: isMine ? "#022c22" : colors.text, fontWeight: "800", fontSize: 14, lineHeight: 19 }}>
            {msg.text}
          </Text>
        </View>
      </View>
    );
  };

  /* ------------------ LOADING ------------------ */

  if (checkingPremium) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.textMuted, fontWeight: "800" }}>Ładowanie…</Text>
      </SafeAreaView>
    );
  }

  /* ------------------ TOP BAR ------------------ */

  const TopBar = (
    <View
      style={{
        height: layout.headerH,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.bg,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ width: 40, height: 40, marginRight: 10 }} />

      <View style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "1100" }}>Wiadomości</Text>
        <Text style={{ marginTop: 1, color: colors.textMuted, fontSize: 12, fontWeight: "800" }} numberOfLines={1}>
          {selectedMember?.displayName ? `Rozmowa: ${selectedMember.displayName}` : "Wybierz osobę z listy"}
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
          marginLeft: 10,
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="arrow-back" size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  /* ------------------ LEFT RAIL ------------------ */

  const Rail = (
    <View
      style={{
        width: layout.railW,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        backgroundColor: colors.bg,
        paddingVertical: 10,
      }}
    >
      <FlatList
        data={familyMembers}
        keyExtractor={(m: any) => String(m.__uid)}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, width: "100%" }}
        contentContainerStyle={{ alignItems: "center", paddingTop: 6, paddingBottom: 10 }}
        renderItem={({ item: m }: any) => {
          const uid = String(m.__uid);
          const pURL = m.photoURL || m.avatarUrl;
          const name = m.displayName || "Członek";
          const active = selectedUid === uid;

          return (
            <TouchableOpacity
              onPress={() => {
                setSelectedUid(uid);

                // ✅ ważne: focus po chwili, żeby iOS nie olał
                setTimeout(() => {
                  inputRef.current?.focus();
                }, 80);
              }}
              activeOpacity={0.85}
              style={{ marginBottom: 10 }}
            >
              {renderAvatar(pURL, name[0], 52, active)}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ marginTop: 10, paddingHorizontal: 10, alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontWeight: "900", fontSize: 12, textAlign: "center" }}>
              Brak domowników
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={{ width: "100%", alignItems: "center", paddingTop: 6, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={goFamily}
              activeOpacity={0.85}
              style={{
                width: layout.railW - 16,
                height: 44,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
              }}
            >
              <Ionicons name="settings-outline" size={12} color={colors.text} />
              <Text style={{ marginLeft: 6, color: colors.text, fontWeight: "1000", fontSize: 8 }}>
                Rodzina
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );

  /* ------------------ CHAT PANEL ------------------ */

  const ChatPanel = (
    <View style={{ flex: 1, minWidth: 0 }}>
      {!canChat ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}>
          <Text style={{ color: colors.text, fontWeight: "1100", fontSize: 18, textAlign: "center" }}>
            Aby pisać wiadomości, potrzebujesz Premium
          </Text>

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
              Przejdź do Premium
            </Text>
          </TouchableOpacity>
        </View>
      ) : !hasFamily ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}>
          <Text style={{ color: colors.text, fontWeight: "1100", fontSize: 18, textAlign: "center" }}>
            Dodaj domowników, żeby pisać wiadomości
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
        </View>
      ) : !selectedUid ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}>
          <Ionicons name="chatbubbles-outline" size={54} color={colors.textMuted} />
          <Text style={{ marginTop: 12, color: colors.textMuted, fontWeight: "900", textAlign: "center" }}>
            Wybierz osobę z listy po lewej
          </Text>
        </View>
      ) : (
        <>
          <View style={{ flex: 1, minHeight: 0, padding: 12 }}>
            <View
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bg,
                overflow: "hidden",
                paddingHorizontal: 10,
                paddingTop: 8,
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
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }}
                onScrollBeginDrag={() => inputRef.current?.blur()}
              />
            </View>
          </View>

          <View
            style={{
              paddingHorizontal: 12,
              paddingBottom: Math.max(insets.bottom, 10),
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.bg,
            }}
          >
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "flex-end",
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
                  flex: 1,
                  color: colors.text,
                  fontSize: 15,
                  fontWeight: "800",
                  maxHeight: 120,
                  paddingRight: 10,
                  ...(isWeb
                    ? ({
                        outlineStyle: "none",
                        outlineWidth: 0,
                        boxShadow: "none",
                      } as any)
                    : {}),
                }}
                multiline
                blurOnSubmit={false}
                returnKeyType="send"
                onSubmitEditing={sendMessage}
                // ✅ NAJWAŻNIEJSZE: NIE ZAMYKAJ KLAWIATURY NA FOCUS!
                onFocus={() => {}}
              />

              <TouchableOpacity
                onPress={sendMessage}
                activeOpacity={0.85}
                disabled={!canSend}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: canSend ? colors.accent : colors.border,
                  borderWidth: 1,
                  borderColor: canSend ? colors.accent + "66" : colors.border,
                }}
              >
                <Ionicons name={"send"} size={18} color={canSend ? "#022c22" : colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );

  const Screen = (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {TopBar}

      <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
        {Rail}
        {ChatPanel}
      </View>

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
            zIndex: 999,
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
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "1100", marginBottom: 10 }}>
              ⚠️ System przeciążony emocjami
            </Text>

            <Text style={{ color: colors.text, opacity: 0.88, marginBottom: 14, fontWeight: "800", lineHeight: 19 }}>
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

  const keyboardOffset = layout.headerH + insets.top + (Platform.OS === "ios" ? 6 : 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {isWeb ? (
        Screen
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardOffset}
        >
          {Screen}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
// app/messages.tsx
