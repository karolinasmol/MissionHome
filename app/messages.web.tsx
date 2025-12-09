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

/**
 * Hook odpowiedzialny za layout czatu na różnych rozmiarach ekranu.
 * - na desktopie stały panel z rodziną po lewej
 * - na mobile: wysuwany drawer
 */
function useChatLayout() {
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= 900; // breakpoint desktop/laptop

  const headerHeight = 56; // wysokość top bara + cienka linia
  const isVerySmallWidth = width < 360;
  const isShortScreen = height < 700;

  const drawerWidth = isDesktop
    ? 280
    : Math.min(260, Math.max(200, width * 0.7));
  const messageMaxWidth = isVerySmallWidth ? "78%" : "85%";

  // offset dla KeyboardAvoidingView (top bar + mały margines)
  const keyboardOffset = headerHeight + 8;

  return {
    drawerWidth,
    messageMaxWidth,
    headerHeight,
    keyboardOffset,
    isShortScreen,
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
  const [loadingMsg, setLoadingMsg] = useState(false);
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

  const toggleDrawer = () => {
    // Na desktopie nie otwieramy drawer’a – tam lista jest stała po lewej
    if (isDesktop) return;

    Animated.timing(drawerX, {
      toValue: drawerOpen ? -drawerWidth : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    setDrawerOpen(!drawerOpen);
  };

  /* ------------------------- PREMIUM CHECK ------------------------- */
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

  /* ------------------------- MEMBERS LIST ------------------------- */
  const familyMembers = useMemo(() => {
    if (!members || !myUid) return [];
    return members.filter(
      (m) => String(m.uid || m.userId || m.id) !== String(myUid)
    );
  }, [members, myUid]);

  /* ------------------------- LOAD MESSAGES ------------------------- */
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

    setLoadingMsg(true);

    const unsub = onSnapshot(qy, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(arr);
      setLoadingMsg(false);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });

    return () => unsub();
  }, [myUid, selectedUid]);

  /* ------------------------- SEND MSG ------------------------- */
  const sendMessage = async () => {
    if (!myUid || !selectedUid) return;
    if (!text.trim()) return;

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

  /* ------------------------- LOADING ------------------------- */
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

  /* ------------------------- MAIN UI ------------------------- */
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
        {/* Hamburger tylko na smartfonach / małych ekranach */}
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

      {/* MOBILE: wysuwany drawer z lewej */}
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
                  {m.avatarUrl ? (
                    <Image
                      source={{ uri: m.avatarUrl }}
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

      {/* CHAT + (desktop: stała lista po lewej) w KeyboardAvoidingView */}
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
          {/* DESKTOP: stały panel Rodzina po lewej */}
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
                      {m.avatarUrl ? (
                        <Image
                          source={{ uri: m.avatarUrl }}
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
                          <Text
                            style={{ color: colors.text, fontWeight: "700" }}
                          >
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

          {/* PRAWY PANEL – CZAT */}
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
                  paddingHorizontal: 20,
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
                {/* CHAT HEADER (w obrębie widoku czatu) */}
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
                  <Ionicons
                    name="person-circle-outline"
                    size={32}
                    color={colors.textMuted}
                  />
                  <View style={{ marginLeft: 10 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 15,
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
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.textMuted,
                      }}
                    >
                      dostępny
                    </Text>
                  </View>
                </View>

                {/* MESSAGES */}
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
                          maxWidth: messageMaxWidth as any,
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: isMine
                            ? (colors.accent as string) + "55"
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
                            fontWeight: "600",
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

                {/* INPUT */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: !isPremium ? colors.accent : colors.border,
                    backgroundColor: !isPremium
                      ? (colors.accent as string) + "11"
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
                    multiline
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
    </SafeAreaView>
  );
}

//src/views/MessagesMobile.tsx
