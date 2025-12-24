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

/* ------------------ LAYOUT HOOK ------------------ */
function useChatLayout() {
  const { width } = useWindowDimensions();

  const isDesktop = width >= 900;
  const headerHeight = 56;
  const isVerySmallWidth = width < 360;

  const messageMaxWidth = isVerySmallWidth ? "80%" : "86%";
  const keyboardOffset = headerHeight + 10;

  return { messageMaxWidth, headerHeight, keyboardOffset, isDesktop };
}

/* ------------------ HELPERS ------------------ */
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

function buildChatItems(messagesDesc: ChatMsg[]): ChatItem[] {
  const items: ChatItem[] = [];
  let lastDay = "";

  for (let i = 0; i < messagesDesc.length; i++) {
    const m = messagesDesc[i];
    const label = formatDayLabelPL(m.createdAt);
    if (label && label !== lastDay) {
      lastDay = label;
      items.push({ type: "sep", id: `sep-${label}-${m.id}`, label });
    }
    items.push({ type: "msg", id: m.id, msg: m });
  }
  return items;
}

export default function MessagesMobile() {
  const { colors } = useThemeColors();
  const { members } = useFamily();
  const router = useRouter();
  const user = auth.currentUser;
  const myUid = user?.uid ?? null;

  const [isPremium, setIsPremium] = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);

  const { messageMaxWidth, headerHeight, keyboardOffset, isDesktop } =
    useChatLayout();

  const listRef = useRef<FlatList<ChatItem> | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  /* ------------------ FAMILY PICKER (COMPACT MODAL) ------------------ */
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false);
  const pickerY = useRef(new Animated.Value(40)).current; // start slightly down
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

  /* ------------------ PREMIUM CHECK ------------------ */
  useEffect(() => {
    if (!myUid) return;

    const unsub = onSnapshot(doc(db, "users", myUid), async (snap) => {
      if (!snap.exists()) {
        setIsPremium(false);
        setCheckingPremium(false);
        return;
      }

      const data = snap.data();
      const personalPremium = data?.isPremium === true;
      const familyId = data?.familyId;

      if (personalPremium) {
        setIsPremium(true);
        setCheckingPremium(false);
        return;
      }

      if (familyId) {
        const famSnap = await getDoc(doc(db, "families", familyId));
        if (famSnap.exists() && famSnap.data()?.isPremium === true) {
          setIsPremium(true);
          setCheckingPremium(false);
          return;
        }
      }

      setIsPremium(false);
      setCheckingPremium(false);
    });

    return () => unsub();
  }, [myUid]);

  /* ------------------ FAMILY MEMBERS ------------------ */
  const familyMembers = useMemo(() => {
    if (!members || !myUid) return [];
    return members
      .filter((m) => String(m.uid || m.userId || m.id) !== String(myUid))
      .slice(0, 6); // max 6
  }, [members, myUid]);

  const selectedMember = useMemo(() => {
    if (!selectedUid) return null;
    return (
      familyMembers.find((x) => String(x.uid || x.userId || x.id) === selectedUid) ??
      null
    );
  }, [familyMembers, selectedUid]);

  /* ------------------ LOAD MESSAGES + MARK READ ------------------ */
  useEffect(() => {
    if (!myUid || !selectedUid) {
      setMessages([]);
      return;
    }

    const convId = conversationIdFor(myUid, selectedUid);
    const convRef = doc(db, "messages", convId);

    // Upewnij się, że dokument konwersacji istnieje (żeby updateDoc nie walił errorami)
    setDoc(
      convRef,
      { users: [myUid, selectedUid], createdAt: serverTimestamp() },
      { merge: true }
    ).catch(() => {});

    const qy = query(
      collection(db, `messages/${convId}/messages`),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(qy, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatMsg[];
      setMessages(arr);

      // ✅ Mark as read, jeśli ostatnia wiadomość jest "przychodząca"
      const latest = arr?.[0];
      if (latest?.sender && latest.sender !== myUid) {
        updateDoc(convRef, {
          [`readAt.${myUid}`]: serverTimestamp(),
        }).catch(() => {});
      }

      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    });

    return () => unsub();
  }, [myUid, selectedUid]);

  const chatItems = useMemo(() => buildChatItems(messages), [messages]);

  /* ------------------ SEND MESSAGE ------------------ */
  const sendMessage = async () => {
    if (!myUid || !selectedUid) return;

    // ✅ blokada po stronie UI (Premium wymagane)
    if (!isPremium) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    if (!isMessageAllowed(trimmed)) {
      setBlockedModalOpen(true);
      return;
    }

    const convId = conversationIdFor(myUid, selectedUid);

    try {
      const convRef = doc(db, "messages", convId);
      const snap = await getDoc(convRef);

      if (!snap.exists()) {
        await setDoc(convRef, {
          createdAt: serverTimestamp(),
          users: [myUid, selectedUid],
        });
      } else {
        // dbamy, żeby users zawsze były (na wypadek starych danych)
        await setDoc(convRef, { users: [myUid, selectedUid] }, { merge: true });
      }

      await addDoc(collection(db, `messages/${convId}/messages`), {
        sender: myUid,
        text: trimmed,
        createdAt: serverTimestamp(),
      });

      // ✅ Metadane rozmowy do badge/ikonki w headerze
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
    } catch (err) {
      console.log("MESSAGE ERROR:", err);
    }
  };

  /* ------------------ LOADING SCREEN ------------------ */
  if (checkingPremium) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
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
        <Text style={{ color: colors.textMuted, fontWeight: "800" }}>
          Ładowanie…
        </Text>
      </SafeAreaView>
    );
  }

  const renderAvatar = (
    pURL?: string | null,
    fallbackLetter?: string,
    size = 40
  ) => {
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

  // ✅ Premium gating: przycisk nieaktywny bez premium
  const canSend = !!text.trim() && !!selectedUid && isPremium;

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
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              fontWeight: "1000",
            }}
          >
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
          maxWidth: messageMaxWidth,
          marginBottom: joinTop ? 6 : 10,
        }}
      >
        <View
          style={{
            backgroundColor: isMine ? colors.accent : colors.card,
            borderWidth: 1,
            borderColor: isMine ? colors.accent + "55" : colors.border,
            paddingHorizontal: 12,
            paddingVertical: 10,
            ...bubbleRadii(isMine, joinTop, joinBottom),
            shadowColor: "#000",
            shadowOpacity: Platform.OS === "ios" ? 0.08 : 0,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: Platform.OS === "android" ? 1 : 0,
          }}
        >
          <Text
            style={{
              color: isMine ? "#022c22" : colors.text,
              fontWeight: "800",
              fontSize: 14,
              lineHeight: 19,
            }}
          >
            {msg.text}
          </Text>

          {(!!time || isIncomingFromFamily) && (
            <View
              style={{
                marginTop: 6,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10 as any,
              }}
            >
              {isIncomingFromFamily ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 as any }}>
                  <Ionicons
                    name="arrow-down-circle"
                    size={12}
                    color={colors.textMuted}
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.textMuted,
                      fontWeight: "900",
                    }}
                  >
                    Przychodząca (rodzina)
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
          }}
        >
          <Ionicons name="people" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, flexDirection: "row", gap: 10 as any }}>
          {familyMembers.map((m) => {
            const uid = String(m.uid || m.userId || m.id);
            const pURL = m.photoURL || m.avatarUrl;
            const isActive = selectedUid === uid;
            const name = m.displayName || "Członek";

            return (
              <TouchableOpacity
                key={uid}
                onPress={() => {
                  setSelectedUid(uid);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                activeOpacity={0.85}
                style={{ alignItems: "center" }}
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
          })}
        </View>

        <View style={{ marginLeft: 10, alignItems: "flex-end" }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: !isPremium ? colors.accent + "66" : colors.border,
              backgroundColor: !isPremium ? colors.accent + "14" : colors.bg,
              flexDirection: "row",
              alignItems: "center",
              gap: 6 as any,
            }}
          >
            <Ionicons
              name={!isPremium ? "sparkles" : "checkmark-circle"}
              size={14}
              color={!isPremium ? colors.accent : colors.textMuted}
            />
            <Text
              style={{
                color: !isPremium ? colors.accent : colors.textMuted,
                fontWeight: "1000",
                fontSize: 12,
              }}
            >
              {!isPremium ? "Dołącz do Rodziny, aby móc wysyłać wiadomości" : "Premium"}
            </Text>
          </View>

          <Text
            style={{
              marginTop: 6,
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: "800",
            }}
          >
            {selectedMember?.displayName ? "Rozmowa aktywna" : "Wybierz osobę"}
          </Text>
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
            top: headerHeight + 14,
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
                <Text style={{ marginTop: 2, color: colors.textMuted, fontWeight: "800", fontSize: 12 }}>
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

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 10 as any,
              }}
            >
              {familyMembers.map((m) => {
                const uid = String(m.uid || m.userId || m.id);
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
                      width: "48%",
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: isActive ? colors.accent + "66" : colors.border,
                      backgroundColor: isActive ? colors.accent + "18" : colors.bg,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
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

                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.text, fontWeight: "1100", fontSize: 14 }}
                      >
                        {name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ marginTop: 2, color: colors.textMuted, fontWeight: "800", fontSize: 12 }}
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
          padding: 12,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View style={{ padding: 2, borderRadius: 999, borderWidth: 2, borderColor: colors.accent + "55" }}>
            {renderAvatar(pURL, name[0], 42)}
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "1100", fontSize: 16 }} numberOfLines={1}>
              {name}
            </Text>
            <Text style={{ marginTop: 2, color: colors.textMuted, fontWeight: "800", fontSize: 12 }}>
              Prywatna rozmowa
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
          }}
        >
          <Ionicons name="swap-horizontal" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
  };

  /* ------------------ MAIN UI ------------------ */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* TOP BAR */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          height: headerHeight,
          backgroundColor: colors.bg,
        }}
      >
        <TouchableOpacity
          onPress={openPicker}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="people" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "1100" }}>
            Wiadomości
          </Text>
          <Text
            style={{
              marginTop: 1,
              color: colors.textMuted,
              fontSize: 12,
              fontWeight: "800",
            }}
            numberOfLines={1}
          >
            {selectedMember?.displayName
              ? `Rozmowa: ${selectedMember.displayName}`
              : "Wybierz osobę z docka"}
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
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* FAMILY DOCK (COMPACT, ALWAYS) */}
      <View style={{ paddingHorizontal: 12 }}>
        <FamilyDock />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardOffset}
      >
        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8 }}>
          {!selectedUid ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 20,
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

              <Text
                style={{
                  color: colors.text,
                  fontWeight: "1100",
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                Wybierz osobę z docka
              </Text>

              <Text
                style={{
                  marginTop: 6,
                  color: colors.textMuted,
                  textAlign: "center",
                  fontWeight: "800",
                }}
              >
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
                  gap: 8 as any,
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="swap-horizontal" size={18} color="#022c22" />
                <Text style={{ color: "#022c22", fontWeight: "1100" }}>
                  Otwórz wybór rozmowy
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {renderChatHeader()}

              {/* MESSAGES */}
              <View
                style={{
                  flex: 1,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  paddingHorizontal: 10,
                  paddingTop: 8,
                  overflow: "hidden",
                  marginTop: 10,
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

              {/* INPUT */}
              <View
                style={{
                  marginTop: 10,
                  marginBottom: 8,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: !isPremium ? colors.accent + "66" : colors.border,
                  backgroundColor: !isPremium ? colors.accent + "10" : colors.card,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      borderWidth: 0,
                      borderColor: "transparent",
                      backgroundColor: "transparent",
                      paddingHorizontal: 12,
                      paddingVertical: Platform.OS === "ios" ? 10 : 6,
                      marginRight: 10,
                      opacity: isPremium ? 1 : 0.75,
                    }}
                  >
                    <TextInput
                      ref={(r) => (inputRef.current = r)}
                      placeholder={
                        isPremium ? "Napisz wiadomość…" : "Premium wymagane do wysyłania…"
                      }
                      placeholderTextColor={colors.textMuted}
                      value={text}
                      onChangeText={setText}
                      editable={isPremium}
                      style={{
                        color: colors.text,
                        fontSize: 15,
                        fontWeight: "800",
                        maxHeight: 110,
                        backgroundColor: "transparent",
                        borderWidth: 0,
                        ...(Platform.OS === "web"
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
                    <Ionicons
                      name="send"
                      size={18}
                      color={canSend ? "#022c22" : colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    Enter = wyślij • Shift+Enter = nowa linia
                  </Text>

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
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "1000",
                        fontSize: 12,
                      }}
                    >
                      Wyczyść
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* FAMILY PICKER MODAL */}
      <FamilyPicker />

      {/* BLOCKED MESSAGE MODAL */}
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
            <View
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}
            >
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
              <Text style={{ color: "#022c22", fontWeight: "1100" }}>
                Okej, poprawiam
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
//src/views/messages.web.tsx
