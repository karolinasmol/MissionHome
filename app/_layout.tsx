// --- app/_layout.tsx ---
import "../src/firebase/firebase";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, Animated, ActivityIndicator } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";

import { Ionicons } from "@expo/vector-icons";
import * as Font from "expo-font"; // 👈 ważne

import CustomHeader from "../src/components/CustomHeader";

import { TasksProvider } from "../src/context/TasksContext";
import { ThemeProvider, useTheme, useThemeColors } from "../src/context/ThemeContext";

// challenges
import {
  NoweWyzwanieProvider,
  NoweWyzwanieModalRN,
} from "../src/context/nowewyzwanie";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/firebase/firebase";

export default function RootLayout() {
  /* ============================================================
     FIX IONICONS – kluczowa poprawka zapobiegająca kwadratom na WEB
     ============================================================ */

  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        await Font.loadAsync({
          Ionicons: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"),
        });
      } catch (e) {
        console.warn("Błąd ładowania fontów Ionicons:", e);
      } finally {
        setFontsLoaded(true);
      }
    }
    load();
  }, []);

  // Web-only CSS (scrollbars)
  useEffect(() => {
    if (typeof document !== "undefined") {
      const style = document.createElement("style");
      style.innerHTML = `
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.25); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.4); }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <TasksProvider>
        <NoweWyzwanieProvider>
          <AuthGate>
            <NoweWyzwanieModalRN />
            <HeaderWithMenu />
          </AuthGate>
        </NoweWyzwanieProvider>
      </TasksProvider>
    </ThemeProvider>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useThemeColors();

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<any>(null);

  const isAuthRoute = useMemo(() => {
    const first = segments?.[0] ?? "";
    return (
      first === "login" ||
      first === "register" ||
      first === "forgot-password"
    );
  }, [segments]);

  // Listen auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Routing rules
  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      if (!isAuthRoute) router.replace("/login");
      return;
    }

    if (!user.emailVerified) {
      if (!isAuthRoute) router.replace("/login");
      return;
    }

    if (isAuthRoute) router.replace("/");
  }, [authReady, user, isAuthRoute, router]);

  if (!authReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return <>{children}</>;
}

function HeaderWithMenu() {
  const { colors } = useThemeColors();
  useTheme();

  const [menuOpen, setMenuOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: menuOpen ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [menuOpen, anim]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <CustomHeader menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {menuOpen && (
        <>
          <Pressable
            onPress={() => setMenuOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "transparent",
              zIndex: 50,
            }}
          />

          <Animated.View
            style={{
              position: "absolute",
              top: 68,
              right: 16,
              width: 200,
              paddingVertical: 6,
              borderRadius: 12,
              borderWidth: 1,
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: anim,
              transform: [
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1],
                  }),
                },
              ],
              zIndex: 100,
            }}
          >
            {/* menu */}
          </Animated.View>
        </>
      )}

      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}
