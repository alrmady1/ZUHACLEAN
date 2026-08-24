import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile, PermissionKey, UserRole } from '../../shared/types.js';
import { DEFAULT_PERMISSIONS } from '../../shared/types.js';
import { api } from './api.js';

interface AuthState {
  user: Profile | null;
  allProfiles: Profile[];
  loading: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  loginAs: (profileId: string) => void;
  logout: () => void;
  // هل يملك المستخدم الحالي هذه الصلاحية؟ يُقرأ من جدول الصلاحيات
  // الديناميكي (صفحة الإعدادات ← الصلاحيات)، ويرجع افتراضياً إلى
  // DEFAULT_PERMISSIONS قبل اكتمال أول تحميل أو لصلاحية لم تُعدَّل بعد.
  can: (key: PermissionKey) => boolean;
  refreshPermissions: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const STORAGE_KEY = 'zaha-ops:userId';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Partial<Record<PermissionKey, UserRole[]>>>({});

  function refreshPermissions() {
    api
      .get<Record<PermissionKey, { label: string; roles: UserRole[] }>>('/permissions')
      .then((data) => {
        const roles: Partial<Record<PermissionKey, UserRole[]>> = {};
        for (const key of Object.keys(data) as PermissionKey[]) roles[key] = data[key].roles;
        setPermissions(roles);
      })
      .catch(() => {
        // لو فشل التحميل (شبكة، نشر لم يكتمل...) تبقى DEFAULT_PERMISSIONS
        // سارية عبر can() أدناه — لا تعطُّل للتطبيق.
      });
  }

  function can(key: PermissionKey): boolean {
    if (!user) return false;
    const roles = permissions[key] ?? DEFAULT_PERMISSIONS[key];
    return roles.includes(user.role);
  }

  useEffect(() => {
    api.get<Profile[]>('/profiles').then((profiles) => {
      setAllProfiles(profiles);
      const savedId = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
      const restored = profiles.find((p) => p.id === savedId);
      if (restored) setUser(restored);
      setLoading(false);
    });
    refreshPermissions();
  }, []);

  // Real sign-in with username + password (set from Settings → المستخدمون).
  const login = async (username: string, password: string, remember: boolean) => {
    const profile = await api.post<Profile>('/auth/login', { username, password });
    setUser(profile);
    setAllProfiles((prev) => (prev.some((p) => p.id === profile.id) ? prev : [...prev, profile]));
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, profile.id);
  };

  // Manager-only account impersonation from Settings (jump into another
  // user's account without their password).
  const loginAs = (profileId: string) => {
    const profile = allProfiles.find((p) => p.id === profileId) ?? null;
    setUser(profile);
    if (profile) localStorage.setItem(STORAGE_KEY, profile.id);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, allProfiles, loading, login, loginAs, logout, can, refreshPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
