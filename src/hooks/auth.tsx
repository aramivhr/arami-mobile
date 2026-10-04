import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { unregisterPush } from "@/hooks/push";
import { loginEmail } from "@/lib/access";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export { loginEmail };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(identifier), password });
    return { error: error ? error.message : null };
  }, []);

  const logout = useCallback(async () => {
    // Remove this phone's alert token while still signed in (its row is only deletable by its owner).
    await unregisterPush();
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
