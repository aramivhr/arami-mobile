import React from "react";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/ui";
import { useUserType } from "@/hooks/permissions";
import { canSeeScreen, type ScreenKey } from "@/lib/access";

/** Shows a screen only to user types allowed to see it, like the website's PageGate. */
export function RequireScreen({ screen, children }: { screen: ScreenKey; children: React.ReactNode }) {
  const { data: type, isLoading } = useUserType();
  if (isLoading) return null;
  if (!canSeeScreen(type, screen)) {
    return (
      <Screen>
        <Text muted>You don't have access to this page.</Text>
      </Screen>
    );
  }
  return <>{children}</>;
}
