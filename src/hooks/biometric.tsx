import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { Button, Text } from "@/components/ui";
import { useColors } from "@/lib/theme";
import { useAuth } from "@/hooks/auth";

// Face ID / fingerprint unlock. The person signs in once with their website
// login; after that the app asks for Face ID or fingerprint when it opens and
// when it comes back after more than a minute in the background.

const KEY = "biometric-enabled";
const RELOCK_AFTER_MS = 60_000;

export async function biometricAvailable() {
  const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  return hw && enrolled;
}

export async function getBiometricEnabled() {
  try {
    return (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(on: boolean) {
  await AsyncStorage.setItem(KEY, on ? "1" : "0");
}

export async function biometricLabel() {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Face ID";
  return "Fingerprint";
}

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const { session, logout } = useAuth();
  const [locked, setLocked] = useState<boolean | null>(null);
  const backgroundAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Arami Portal" });
    if (res.success) setLocked(false);
  }, []);

  // Decide on first load whether to lock.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const on = session ? await getBiometricEnabled() : false;
      if (cancelled) return;
      setLocked(on);
      if (on) unlock();
    })();
    return () => {
      cancelled = true;
    };
    // Only on first load and when the person signs in or out.
  }, [!!session]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "background") backgroundAt.current = Date.now();
      if (state === "active" && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_AFTER_MS) {
        backgroundAt.current = null;
        if (session && (await getBiometricEnabled())) {
          setLocked(true);
          unlock();
        }
      }
    });
    return () => sub.remove();
  }, [session, unlock]);

  if (locked === null) return null;
  if (!locked) return <>{children}</>;

  return (
    <View style={{ flex: 1, backgroundColor: c.slate900, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
      <Image source={require("../../assets/icon.png")} style={{ width: 84, height: 84, borderRadius: 20 }} />
      <Text weight="bold" size={22} style={{ color: "#fff" }}>
        Arami Portal
      </Text>
      <Button title="Unlock" variant="accent" onPress={unlock} style={{ alignSelf: "stretch" }} />
      <Button title="Sign in with password instead" variant="ghost" onPress={logout} style={{ alignSelf: "stretch" }} />
    </View>
  );
}
