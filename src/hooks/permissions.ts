import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/auth";
import type { UserType } from "@/lib/access";

// Both hooks copy the website's logic (rent-halo-system src/hooks/use-users.ts)
// so every person gets the same access in the app as on the website.

/** super_admin, admin, or owner (everyone else). */
export function useUserType() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-type", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UserType> => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      const roles = (data || []).map((r: { role: string }) => r.role);
      if (roles.includes("super_admin")) return "super_admin";
      if (roles.includes("admin")) return "admin";
      return "owner";
    },
  });
}

export interface MyPermissions {
  isAdmin: boolean;
  access_all_units: boolean;
  show_financial: boolean;
  show_contacts: boolean;
  can_edit_reservations: boolean;
  can_add_reservations: boolean;
}

export function useMyPermissions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyPermissions> => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (roleData) {
        return {
          isAdmin: true,
          access_all_units: true,
          show_financial: true,
          show_contacts: true,
          can_edit_reservations: true,
          can_add_reservations: true,
        };
      }
      const { data: perm } = await supabase
        .from("user_permissions")
        .select("access_all_units, show_financial, show_contacts, can_edit_reservations, can_add_reservations")
        .eq("user_id", user!.id)
        .maybeSingle();
      return {
        isAdmin: false,
        access_all_units: perm?.access_all_units ?? false,
        show_financial: perm?.show_financial ?? false,
        show_contacts: perm?.show_contacts ?? false,
        can_edit_reservations: perm?.can_edit_reservations ?? false,
        can_add_reservations: perm?.can_add_reservations ?? false,
      };
    },
  });
}
