import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../../shared/types.js';
import { api } from './api.js';

interface AuthState {
  user: Profile | null;
  allProfiles: Profile[];
  loading: boolean;
  loginAs: (profileId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const STORAGE_KEY = 'zaha-ops:userId';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Profile[]>('/profiles').then((profiles) => {
      setAllProfiles(profiles);
      const savedId = localStorage.getItem(STORAGE_KEY);
      const restored = profiles.find((p) => p.id === savedId);
      if (restored) setUser(restored);
      setLoading(false);
    });
  }, []);

  const loginAs = (profileId: string) => {
    const profile = allProfiles.find((p) => p.id === profileId) ?? null;
    setUser(profile);
    if (profile) localStorage.setItem(STORAGE_KEY, profile.id);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, allProfiles, loading, loginAs, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
