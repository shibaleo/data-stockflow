"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { LoginPage } from "./login-page";

// ── UserContext ──

export interface MeUser {
  id: number;
  code: string;
  name: string;
  email: string;
  role_id: number;
  role: string;
  role_name: string;
  role_color: string | null;
}

interface UserContextValue {
  me: MeUser;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function useMe(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useMe must be used within AuthGate");
  return ctx;
}

// ── AuthGate ──

interface AuthGateProps {
  children: React.ReactNode;
}

type AuthState = "loading" | "authenticated" | "unauthenticated";

export function AuthGate({ children }: AuthGateProps) {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const [state, setState] = useState<AuthState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [checkKey, setCheckKey] = useState(0);
  const [me, setMe] = useState<MeUser | null>(null);

  const verifySession = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/v1/users/me");
      if (res.ok) {
        const json = await res.json() as { data: MeUser };
        setMe(json.data);
        setState("authenticated");
      } else {
        if (isSignedIn) {
          setError("このメールアドレスは登録されていません");
          await signOut();
        }
        setState("unauthenticated");
      }
    } catch {
      setState("unauthenticated");
    }
  }, [isSignedIn, signOut]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/users/me");
      if (res.ok) {
        const json = await res.json() as { data: MeUser };
        setMe(json.data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      verifySession();
    } else {
      fetch("/api/v1/users/me")
        .then(async (res) => {
          if (res.ok) {
            const json = await res.json() as { data: MeUser };
            setMe(json.data);
            setState("authenticated");
          } else {
            setState("unauthenticated");
          }
        })
        .catch(() => setState("unauthenticated"));
    }
  }, [isLoaded, isSignedIn, checkKey, verifySession]);

  if (state === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">読み込み中...</div>
      </div>
    );
  }

  if (state === "unauthenticated" || !me) {
    return (
      <LoginPage
        error={error}
        onPasswordLogin={() => setCheckKey((k) => k + 1)}
      />
    );
  }

  return (
    <UserContext.Provider value={{ me, refresh }}>
      {children}
    </UserContext.Provider>
  );
}
