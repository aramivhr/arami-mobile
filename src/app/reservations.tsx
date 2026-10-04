import { useLocalSearchParams } from "expo-router";
import { ReservationsList } from "@/components/ReservationsList";

// Reservations as a full page (opened from More, or from a notification with ?id=).
export default function ReservationsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ReservationsList openId={id} />;
}
