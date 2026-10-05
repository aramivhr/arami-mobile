import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ReservationsList } from "@/components/ReservationsList";

export default function ReservationsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Older links (and alerts) point here with ?id=; open that reservation's own page.
  useEffect(() => {
    if (id) router.push({ pathname: "/reservation/[id]", params: { id } });
  }, [id]);
  return <ReservationsList />;
}
