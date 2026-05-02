import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadTokens, saveTokens, clearTokens, authLogin, authSignup, authJoin, authPinLogin, authMe, authLogout, getAccessToken, type AuthResult } from '../lib/api';

interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string;
}

interface AuthHousehold {
  id: string;
  name: string;
  inviteCode?: string;
}

interface AuthMember {
  id: number;
  name: string;
  role: string;
  avatarColor: string;
  easyMode?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  household: AuthHousehold | null;
  member: AuthMember | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  pinLogin: (householdId: string, pin: string) => Promise<void>;
  signup: (data: { email?: string; username?: string; password: string; displayName: string; householdName: string }) => Promise<void>;
  join: (data: { inviteCode: string; email?: string; username?: string; password: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [household, setHousehold] = useState<AuthHousehold | null>(null);
  const [member, setMember] = useState<AuthMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleAuthResult = useCallback(async (result: AuthResult) => {
    await saveTokens(result.accessToken, result.refreshToken);
    // Fetch full user info (includes inviteCode for parents, avatarColor, etc.)
    try {
      const me = await authMe();
      setUser(me.user);
      setHousehold(me.household);
      setMember(me.member);
    } catch {
      // Fallback to login response data
      setUser(result.user);
      setHousehold(result.household);
      setMember({ id: result.member.id, name: result.user.displayName, role: result.member.role, avatarColor: '#3B82F6' });
    }
  }, []);

  // Load tokens on mount and fetch user info
  useEffect(() => {
    (async () => {
      try {
        await loadTokens();
        if (getAccessToken()) {
          const me = await authMe();
          setUser(me.user);
          setHousehold(me.household);
          setMember(me.member);
        }
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await authLogin({ identifier, password });
    await handleAuthResult(result);
  }, [handleAuthResult]);

  const pinLogin = useCallback(async (householdId: string, pin: string) => {
    const result = await authPinLogin({ householdId, pin });
    await handleAuthResult(result);
  }, [handleAuthResult]);

  const signup = useCallback(async (data: { email?: string; username?: string; password: string; displayName: string; householdName: string }) => {
    const result = await authSignup(data);
    await handleAuthResult(result);
  }, [handleAuthResult]);

  const join = useCallback(async (data: { inviteCode: string; email?: string; username?: string; password: string; displayName: string }) => {
    const result = await authJoin(data);
    await handleAuthResult(result);
  }, [handleAuthResult]);

  const logout = useCallback(async () => {
    try {
      const { getItem } = await import('../lib/storage');
      const rt = await getItem('refreshToken');
      if (rt) await authLogout(rt);
    } catch { /* ignore */ }
    await clearTokens();
    setUser(null);
    setHousehold(null);
    setMember(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await authMe();
      setUser(me.user);
      setHousehold(me.household);
      setMember(me.member);
    } catch {
      await logout();
    }
  }, [logout]);

  return (
    <AuthContext.Provider value={{
      user, household, member, isLoading,
      isAuthenticated: !!user,
      login, pinLogin, signup, join, logout, refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
