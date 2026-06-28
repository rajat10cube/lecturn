import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getMe, login as apiLogin, logout as apiLogout, setUnauthorizedHandler } from "./api";

interface AuthCtx {
  ready: boolean;
  user: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within <AuthProvider>");
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const me = await getMe();
    setUser(me ? me.username : null);
    setReady(true);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null)); // session expired mid-use -> back to login
    void refresh();
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const signIn = async (username: string, password: string) => {
    const me = await apiLogin(username, password);
    setUser(me.username);
  };
  const signOut = async () => {
    await apiLogout();
    setUser(null);
  };

  return <Ctx.Provider value={{ ready, user, signIn, signOut }}>{children}</Ctx.Provider>;
}
