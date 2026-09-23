import type { User } from "@fh/shared";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NetworkError } from "@/core/api";
import { api, sessionEvents, sync } from "@/services";
import { type PushStatus, disablePush, enablePush } from "@/services/push";
import { cachedUser } from "@/services/storage";

interface Auth {
  status: "loading" | "signedOut" | "signedIn";
  user: User | null;
  /** Set when the session ended on its own (e.g. password changed elsewhere). */
  expired: boolean;
  push: PushStatus | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  enableNotifications(): Promise<PushStatus>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Auth["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [expired, setExpired] = useState(false);
  const [push, setPush] = useState<PushStatus | null>(null);

  const becomeSignedIn = useCallback((u: User) => {
    setUser(u);
    setStatus("signedIn");
    setExpired(false);
    sync.setUser(u.id);
    // Only asks for permission from Settings; here it just re-registers if already allowed.
    void enablePush(false).then(setPush);
  }, []);

  // Start from the remembered user, so the app works offline; then check with the server.
  useEffect(() => {
    void (async () => {
      const [hasSession, remembered] = await Promise.all([api.hasSession(), cachedUser.get()]);
      if (!hasSession || !remembered) return setStatus("signedOut");
      becomeSignedIn(remembered);
      try {
        const fresh = await api.me();
        setUser(fresh);
        await cachedUser.set(fresh);
      } catch (err) {
        if (!(err instanceof NetworkError)) return; // a 401 is handled by onSignedOut
      }
    })();
  }, [becomeSignedIn]);

  // The session ended by itself: show sign-in, but keep the phone's matches (some may not be uploaded yet).
  useEffect(() => {
    sessionEvents.onSignedOut = () => {
      setStatus("signedOut");
      setExpired(true);
      sync.setUser(null);
    };
  }, []);

  const value = useMemo<Auth>(
    () => ({
      status,
      user,
      expired,
      push,
      async signIn(email, password) {
        const previous = await cachedUser.get();
        const signedIn = await api.login(email.trim(), password);
        // A different umpire on this phone: don't mix their matches with the last one's.
        if (previous && previous.id !== signedIn.id) await sync.clear();
        await cachedUser.set(signedIn);
        becomeSignedIn(signedIn);
      },
      async signOut() {
        await disablePush(push);
        await api.logout();
        await sync.clear();
        await cachedUser.set(null);
        setUser(null);
        setPush(null);
        setStatus("signedOut");
      },
      async enableNotifications() {
        const result = await enablePush(true);
        setPush(result);
        return result;
      },
    }),
    [status, user, expired, push, becomeSignedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth outside AuthProvider");
  return auth;
}
