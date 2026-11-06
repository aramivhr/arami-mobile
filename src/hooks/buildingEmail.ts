import { useMutation } from "@tanstack/react-query";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { supabase } from "@/lib/supabase";
import type { BuildingEmailPurpose } from "@/lib/buildingEmail";

// Email a building's management about a unit through the website's
// send-building-email function (rent-halo-system src/hooks/use-building-email.ts).
// The function picks the recipient from the unit/building on file, sends from
// Arami's Gmail and refuses anyone but admins and super admins.

export interface BuildingEmailAttachment {
  filename: string;
  content_type: string;
  base64: string;
}

export interface BuildingEmailRequest {
  apartment_id: string;
  reservation_id?: string;
  purpose: BuildingEmailPurpose;
  guest_name?: string;
  guest_phone?: string;
  check_in?: string;
  check_out?: string;
  visit_date?: string;
  visitors?: string;
  notes?: string;
  attachments: BuildingEmailAttachment[];
  /** One per opening of the form, so a double tap sends once. */
  request_id: string;
}

export function useSendBuildingEmail() {
  return useMutation({
    mutationFn: async (body: BuildingEmailRequest) => {
      const { data, error } = await supabase.functions.invoke("send-building-email", { body });
      if (error) {
        // A refusal carries its reason in the JSON body.
        let message = error.message;
        try {
          const b = await (error as { context?: Response }).context?.json();
          if (b?.error) message = String(b.error);
        } catch {
          /* keep the generic message */
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(String(data.error));
      return data as { sent: true; sent_to: string; sent_at: string };
    },
  });
}

const MAX_SIDE = 1600;

/** A passport or ID photo shrunk to at most 1600px as JPEG, like the website, so several fit in one email. */
export async function photoAttachment(uri: string, width: number, height: number, index: number): Promise<BuildingEmailAttachment> {
  const resize = Math.max(width, height) > MAX_SIDE ? [width >= height ? { resize: { width: MAX_SIDE } } : { resize: { height: MAX_SIDE } }] : [];
  const out = await manipulateAsync(uri, resize, { compress: 0.85, format: SaveFormat.JPEG, base64: true });
  return { filename: `id-${index + 1}.jpg`, content_type: "image/jpeg", base64: out.base64 ?? "" };
}
