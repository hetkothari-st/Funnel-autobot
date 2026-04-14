import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
const STORAGE_USER_KEY = 'funnel_autobot_auth_user';
const STORAGE_TOKEN_KEY = 'funnel_autobot_session_token';

export function buildWsCredential(user) {
  if (!user) return null;
  const raw = user.email || user.name || 'anon';
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36).slice(0, 4);
  return `autobot_${raw.split('@')[0]}_${suffix}`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Validate stored session on mount
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (!token || !user) {
      setLoading(false);
      return;
    }
    fetch('/api/validate-session', {
      headers: { 'x-session-token': token },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Invalid session');
        return r.json();
      })
      .then((data) => {
        setUser(data.user);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem(STORAGE_USER_KEY);
        localStorage.removeItem(STORAGE_TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setUser(data.user);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
    localStorage.setItem(STORAGE_TOKEN_KEY, data.sessionToken);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'x-session-token': token },
      });
    } catch {}
    setUser(null);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
