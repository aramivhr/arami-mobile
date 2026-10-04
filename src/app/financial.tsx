import React from "react";
import { Screen } from "@/components/Screen";
import { Card, PageHeader, Text } from "@/components/ui";
import { RequireScreen } from "@/components/RequireScreen";

// Placeholder: Financial comes after version 1.
export default function FinancialScreen() {
  return (
    <RequireScreen screen="financial">
      <Screen>
        <PageHeader title="Financial" />
        <Card style={{ padding: 24 }}>
          <Text muted style={{ textAlign: "center" }}>
            Financial is coming in a later version of the app. It's available on the website in the meantime.
          </Text>
        </Card>
      </Screen>
    </RequireScreen>
  );
}
