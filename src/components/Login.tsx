import React, { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Button, Card, Field, Input, Text } from "@/components/ui";
import { useColors } from "@/lib/theme";
import { useAuth } from "@/hooks/auth";
import { biometricAvailable, biometricLabel, setBiometricEnabled } from "@/hooks/biometric";

// Same sign-in as the website: email or username, plus password.
export function Login() {
  const c = useColors();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    const res = await login(identifier, password);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (await biometricAvailable()) {
      const label = await biometricLabel();
      Alert.alert(`Use ${label}?`, `Unlock Arami Portal with ${label} next time instead of your password.`, [
        { text: "Not now", style: "cancel", onPress: () => setBiometricEnabled(false) },
        { text: `Use ${label}`, onPress: () => setBiometricEnabled(true) },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
        <Card style={{ padding: 24, width: "100%", maxWidth: 400, alignSelf: "center", gap: 16 }}>
          <View style={{ alignItems: "center", gap: 6 }}>
            <Image source={require("../../assets/icon.png")} style={{ width: 56, height: 56, borderRadius: 14 }} />
            <Text weight="bold" size={20}>
              Arami Portal
            </Text>
            <Text muted>Sign in to your account</Text>
          </View>
          <Field label="Email or username">
            <Input
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              placeholder="Enter your email or username"
            />
          </Field>
          <Field label="Password">
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="Enter your password"
              onSubmitEditing={submit}
            />
          </Field>
          {!!error && (
            <Text size={13} style={{ color: c.destructive }}>
              {error}
            </Text>
          )}
          <Button title={loading ? "Signing in..." : "Sign In"} onPress={submit} loading={loading} disabled={!identifier || !password} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
