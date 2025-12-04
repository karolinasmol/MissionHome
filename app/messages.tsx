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

export default function MessagesScreen() {
  const { colors } = useThemeColors();
  const { members } = useFamily();
  const router = useRouter();

  const user = auth.currentUser;
  const myUid = user?.uid ?? null;

  const [isPremium, setIsPremium] = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);

  const [selectedUid, setSelectedUid] = useState(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [loadingMsg, setLoadingMsg] = useState(false);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (!myUid) return;
    if (!members) return;

    const userRef = doc(db, "users", myUid);

    const unsub = onSnapshot(userRef, async (snap) => {
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
  }, [myUid, members]);

  const familyMembers = useMemo(() => {
    if (!members || !myUid) return [];
    return members.filter(
      (m) => String(m.uid || m.userId || m.id) !== String(myUid)
    );
  }, [members, myUid]);

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

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(arr);
        setLoadingMsg(false);

        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 150);
      },
      () => setLoadingMsg(false)
    );

    return () => unsub();
  }, [myUid, selectedUid]);

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
    } catch (err) {
      console.log("MESSAGE ERROR:", err);
    }
  };

  const handleKeyPress = (e) => {
    if (Platform.OS !== "web") return;
    if (e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
      e.preventDefault?.();
      sendMessage();
    }
  };

  const isWeb = Platform.OS === "web";

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flex: 1,
          flexDirection: isWeb ? "row" : "column",
          padding: 16,
          gap: 16,
        }}
      >
        {/* LEFT LIST */}
        <View
          style={{
            width: isWeb ? 280 : "100%",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 12,
            maxHeight: isWeb ? "100%" : 180,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontWeight: "800",
              fontSize: 16,
              marginBottom: 12,
            }}
          >
            Wiadomości
          </Text>

          {familyMembers.map((m) => {
            const uid = m.uid || m.userId || m.id;

            return (
              <TouchableOpacity
                key={uid}
                onPress={() => setSelectedUid(String(uid))}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor:
                    selectedUid === String(uid) ? colors.accent + "22" : "transparent",
                  borderWidth: 1,
                  borderColor:
                    selectedUid === String(uid) ? colors.accent : colors.border,
                  marginBottom: 8,
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
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {m.displayName || "Członek rodziny"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CHAT */}
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 12,
          }}
        >
          {!isPremium && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.accent + "22",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.accent,
                gap: 8,
              }}
            >
              <Ionicons name="star" size={20} color={colors.accent} />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: "600",
                  flex: 1,
                }}
              >
                Wysyłanie wiadomości dostępne tylko w obrębie rodziny Premium.
              </Text>
            </View>
          )}

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
                size={48}
                color={colors.textMuted}
              />
              <Text style={{ marginTop: 12, color: colors.textMuted }}>
                Wybierz osobę, aby rozpocząć rozmowę
              </Text>
            </View>
          ) : (
            <>
              {/* HEADER */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  marginBottom: 8,
                }}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={30}
                  color={colors.textMuted}
                />
                <View style={{ marginLeft: 10 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: "800",
                    }}
                  >
                    {
                      familyMembers.find(
                        (x) => String(x.uid || x.userId || x.id) === selectedUid
                      )?.displayName
                    }
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    dostępny
                  </Text>
                </View>
              </View>

              {/* MESSAGES */}
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}
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
                        maxWidth: "75%",
                        marginBottom: 12,
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
                        }}
                      >
                        {msg.text}
                      </Text>

                      {/* UPDATED TIMESTAMP STYLE */}
                      <Text
                        style={{
                          marginTop: 4,
                          fontSize: 11,
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
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: !isPremium ? colors.accent : colors.border,
                    backgroundColor: !isPremium ? colors.accent + "11" : colors.bg,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    marginTop: 6,
                  }}
                >
                  <TextInput
                    placeholder="Napisz wiadomość…"
                    placeholderTextColor={colors.textMuted}
                    value={text}
                    onChangeText={setText}
                    onKeyPress={handleKeyPress}
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: 14,
                      opacity: !isPremium ? 0.7 : 1,

                      // FIX WEB OUTLINE
                      outlineStyle: "none",
                      outlineWidth: 0,
                      outlineColor: "transparent",
                    }}
                  />

                  <TouchableOpacity
                    onPress={sendMessage}
                    style={{
                      padding: 6,
                      opacity: !isPremium ? 0.7 : 1,
                    }}
                  >
                    <Ionicons name="send" size={20} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
