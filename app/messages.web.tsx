import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Image,
  Animated,
  useWindowDimensions,
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
} from "firebase/firestore";

function conversationIdFor(a, b) {
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
  // bardzo prosty heurystyczny wzorzec na coś "adresopodobnego"
  const addrRegex =
    /\b(ul\.?|al\.?|os\.?|pl\.?|plac|ulicy)\s+[0-9A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż.\-]+/i;
  return addrRegex.test(message);
}

function containsPhoneLike(message: string) {
  // szukamy ciągu cyfr wyglądającego na numer tel. (9–12 cyfr z opcjonalnym + i separatorami)
  const phoneRegex = /(\+?\d[\s\-]?){9,12}/;
  return phoneRegex.test(message);
}

function containsEmailLike(message: string) {
  const emailRegex =
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  return emailRegex.test(message);
}

function containsUntrustedLink(message: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = message.toLowerCase().match(urlRegex);
  if (!urls) return false;

  return urls.some((url) => {
    const isTrusted = trustedDomains.some((domain) =>
      url.includes(domain)
    );
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
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= 900;
  const headerHeight = 56;
  const isVerySmallWidth = width < 360;

  const drawerWidth = isDesktop
    ? 280
    : Math.min(260, Math.max(200, width * 0.7));

  const messageMaxWidth = isVerySmallWidth ? "78%" : "85%";

  const keyboardOffset = headerHeight + 8;

  return {
    drawerWidth,
    messageMaxWidth,
    headerHeight,
    keyboardOffset,
    isDesktop,
  };
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
  const [messages, setMessages] = useState<any[]>([]);
  const scrollRef = useRef<ScrollView | null>(null);

  const {
    drawerWidth,
    messageMaxWidth,
    headerHeight,
    keyboardOffset,
    isDesktop,
  } = useChatLayout();

  const drawerX = useRef(new Animated.Value(-drawerWidth)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [blockedModalOpen, setBlockedModalOpen] = useState(false);

  const toggleDrawer = () => {
    if (isDesktop) return;
    Animated.timing(drawerX, {
      toValue: drawerOpen ? -drawerWidth : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    setDrawerOpen(!drawerOpen);
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
    return members.filter(
      (m) => String(m.uid || m.userId || m.id) !== String(myUid)
    );
  }, [members, myUid]);

  /* ------------------ LOAD MESSAGES ------------------ */
  useEffect(() => {
    if (!myUid || !selectedUid) {
      setMessages([]);
      return;
    }

    const convId = conversationIdFor(myUid, selectedUid);

    const qy = query(
      collection(db, `messages/${convId}/messages`),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(qy, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(arr);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });

    return () => unsub();
  }, [myUid, selectedUid]);

  /* ------------------ SEND MESSAGE ------------------ */
  const sendMessage = async () => {
    if (!myUid || !selectedUid) return;
    if (!text.trim()) return;

    if (!isMessageAllowed(text)) {
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
      }

      await addDoc(collection(db, `messages/${convId}/messages`), {
        sender: myUid,
        text: text.trim(),
        createdAt: serverTimestamp(),
      });

      setText("");

      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
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
        <Text style={{ color: colors.textMuted }}>Ładowanie…</Text>
      </SafeAreaView>
    );
  }

  /* ------------------ MAIN UI ------------------ */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* TOP BAR */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          height: headerHeight,
        }}
      >
        {!isDesktop && (
          <TouchableOpacity onPress={toggleDrawer}>
            <Ionicons name="menu" size={26} color={colors.text} />
          </TouchableOpacity>
        )}

        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "800",
            marginLeft: !isDesktop ? 12 : 0,
          }}
        >
          Wiadomości
        </Text>
      </View>

      {/* MOBILE DRAWER */}
      {!isDesktop && (
        <Animated.View
          style={{
            position: "absolute",
            top: headerHeight,
            bottom: 0,
            left: 0,
            width: drawerWidth,
            backgroundColor: colors.card,
            borderRightWidth: 1,
            borderColor: colors.border,
            padding: 10,
            transform: [{ translateX: drawerX }],
            zIndex: 20,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontWeight: "800",
              fontSize: 15,
              marginBottom: 10,
            }}
          >
            Rodzina
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            {familyMembers.map((m) => {
              const uid = m.uid || m.userId || m.id;

              const pURL = m.photoURL || m.avatarUrl;

              return (
                <TouchableOpacity
                  key={uid}
                  onPress={() => {
                    setSelectedUid(String(uid));
                    toggleDrawer();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 8,
                    borderRadius: 8,
                    marginBottom: 6,
                    backgroundColor:
                      selectedUid === String(uid)
                        ? colors.accent + "22"
                        : "transparent",
                    borderWidth: 1,
                    borderColor:
                      selectedUid === String(uid)
                        ? colors.accent
                        : colors.border,
                  }}
                >
                  {pURL ? (
                    <Image
                      source={{ uri: pURL }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        marginRight: 10,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        backgroundColor: colors.bg,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {m.displayName?.[0] ?? "?"}
                      </Text>
                    </View>
                  )}

                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {m.displayName || "Członek"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}

      {/* CHAT WINDOW */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardOffset}
      >
        <View
          style={{
            flex: 1,
            flexDirection: isDesktop ? "row" : "column",
          }}
        >
          {/* DESKTOP SIDE LIST */}
          {isDesktop && (
            <View
              style={{
                width: drawerWidth,
                backgroundColor: colors.card,
                borderRightWidth: 1,
                borderColor: colors.border,
                padding: 10,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "800",
                  fontSize: 15,
                  marginBottom: 10,
                }}
              >
                Rodzina
              </Text>

              <ScrollView keyboardShouldPersistTaps="handled">
                {familyMembers.map((m) => {
                  const uid = m.uid || m.userId || m.id;

                  const pURL = m.photoURL || m.avatarUrl;

                  return (
                    <TouchableOpacity
                      key={uid}
                      onPress={() => setSelectedUid(String(uid))}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 8,
                        borderRadius: 8,
                        marginBottom: 6,
                        backgroundColor:
                          selectedUid === String(uid)
                            ? colors.accent + "22"
                            : "transparent",
                        borderWidth: 1,
                        borderColor:
                          selectedUid === String(uid)
                            ? colors.accent
                            : colors.border,
                      }}
                    >
                      {pURL ? (
                        <Image
                          source={{ uri: pURL }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            marginRight: 10,
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            backgroundColor: colors.bg,
                            justifyContent: "center",
                            alignItems: "center",
                            marginRight: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <Text style={{ color: colors.text, fontWeight: "700" }}>
                            {m.displayName?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}

                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
                        {m.displayName || "Członek"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* CHAT PANEL */}
          <View
            style={{
              flex: 1,
              paddingHorizontal: 10,
              paddingTop: 8,
            }}
          >
            {!selectedUid ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="chatbubbles-outline"
                  size={44}
                  color={colors.textMuted}
                />
                <Text
                  style={{
                    marginTop: 10,
                    color: colors.textMuted,
                    textAlign: "center",
                  }}
                >
                  Wybierz osobę, aby rozpocząć rozmowę
                </Text>
              </View>
            ) : (
              <>
                {/* ----------------- CHAT HEADER WITH AVATAR ----------------- */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingBottom: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    marginBottom: 6,
                  }}
                >
                  {(() => {
                    const member = familyMembers.find(
                      (x) =>
                        String(x.uid || x.userId || x.id) === selectedUid
                    );

                    const pURL = member?.photoURL || member?.avatarUrl;

                    if (pURL) {
                      return (
                        <Image
                          source={{ uri: pURL }}
                          style={{
                            width: 40,
                            height: 40,
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
                          width: 40,
                          height: 40,
                          borderRadius: 999,
                          backgroundColor: colors.bg,
                          borderWidth: 1,
                          borderColor: colors.border,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {member?.displayName?.[0] ?? "?"}
                        </Text>
                      </View>
                    );
                  })()}

                  <Text
                    style={{
                      marginLeft: 12,
                      color: colors.text,
                      fontSize: 17,
                      fontWeight: "800",
                    }}
                  >
                    {
                      familyMembers.find(
                        (x) =>
                          String(x.uid || x.userId || x.id) === selectedUid
                      )?.displayName
                    }
                  </Text>
                </View>

                {/* ----------------- MESSAGES ----------------- */}
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 10 }}
                  onContentSizeChange={() =>
                    scrollRef.current?.scrollToEnd({ animated: true })
                  }
                >
                  {messages.map((msg) => {
                    const isMine = msg.sender === myUid;

                    const time =
                      msg.createdAt?.toDate?.()?.toLocaleString("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      }) ?? "";

                    return (
                      <View
                        key={msg.id}
                        style={{
                          alignSelf: isMine ? "flex-end" : "flex-start",
                          backgroundColor: isMine ? colors.accent : colors.bg,
                          padding: 10,
                          borderRadius: 14,
                          maxWidth: messageMaxWidth,
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: isMine
                            ? colors.accent + "55"
                            : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: isMine ? "#022c22" : colors.text,
                            fontWeight: "600",
                            fontSize: 14,
                          }}
                        >
                          {msg.text}
                        </Text>

                        <Text
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            color: isMine ? "#01403A" : colors.textMuted,
                            alignSelf: "flex-end",
                          }}
                        >
                          {time}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* ----------------- INPUT FIELD ----------------- */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: !isPremium ? colors.accent : colors.border,
                    backgroundColor: !isPremium
                      ? colors.accent + "11"
                      : colors.bg,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: Platform.OS === "ios" ? 10 : 6,
                    marginTop: 4,
                    marginBottom: 6,
                  }}
                >
                  <TextInput
                    placeholder="Napisz wiadomość…"
                    placeholderTextColor={colors.textMuted}
                    value={text}
                    onChangeText={setText}
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: 15,
                      paddingVertical: Platform.OS === "ios" ? 4 : 0,
                    }}
                    multiline={false}
                    blurOnSubmit={false}
                    returnKeyType="send"
                    onSubmitEditing={sendMessage}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === "Enter") {
                        // na webie unikamy nowej linii
                        // @ts-ignore
                        e.preventDefault?.();
                        sendMessage();
                      }
                    }}
                  />

                  <TouchableOpacity onPress={sendMessage}>
                    <Ionicons name="send" size={20} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ----------------- BLOCKED MESSAGE MODAL ----------------- */}
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
            zIndex: 300,
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#fbbf2422",
                  borderWidth: 1,
                  borderColor: "#fbbf2466",
                  marginRight: 10,
                }}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color="#fbbf24"
                />
              </View>

              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "900",
                }}
              >
                ⚠️ System przeciążony emocjami
              </Text>
            </View>

            <Text
              style={{
                color: colors.text,
                opacity: 0.85,
                marginBottom: 12,
              }}
            >
              Wykryto słowa, których mój procesor nie uniesie.
              {"\n"}
              Zrestartuj kulturę osobistą i spróbuj ponownie.
            </Text>

            <TouchableOpacity
              onPress={() => setBlockedModalOpen(false)}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#022c22",
                  fontWeight: "800",
                }}
              >
                Resetuję kulturę
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

//src/views/messages.web.tsx
