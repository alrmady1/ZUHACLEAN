import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarClock,
  FileSignature,
  Wallet,
  Receipt,
  Users,
  Smartphone,
  Settings as SettingsIcon,
  LogOut,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { CAN_SEE_EXPENSES_ROLES, CAN_SEE_CONTRACTS_ROLES, type UserRole } from '../../shared/types.js';
import { useI18n } from '../lib/i18n.js';
import TopBar from './TopBar.js';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/appointments', label: 'المواعيد', icon: CalendarClock, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/customers', label: 'العملاء', icon: Users, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/sales', label: 'المبيعات والفواتير', icon: Receipt, roles: ['general_manager', 'admin'] },
  { to: '/contracts', label: 'العقود', icon: FileSignature, roles: CAN_SEE_CONTRACTS_ROLES },
  { to: '/expenses', label: 'المصروفات', icon: Wallet, roles: CAN_SEE_EXPENSES_ROLES },
  { to: '/technician', label: 'بوابة الفني', icon: Smartphone, roles: ['general_manager', 'admin', 'technician'] },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon, roles: ['general_manager', 'admin'] },
];

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const { t, roleLabel } = useI18n();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // The nav is an overlay, not a docked sidebar: it opens only via the
  // hamburger button and closes itself the moment the route changes
  // (i.e. the user actually navigated somewhere).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">{t('جارِ التحميل…')}</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <TopBar onOpenMenu={() => setMenuOpen(true)} />

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-64 flex-col bg-slate-900 shadow-2xl transition-transform duration-200 ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand-400" />
            <div>
              <div className="text-lg font-bold text-white">{t('زهى الأعمال')}</div>
              <div className="text-xs text-slate-400">{t('نظام التشغيل والصيانة')}</div>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label={t('إغلاق القائمة')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2.5 px-1 py-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {user.full_name.trim().charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{user.full_name}</div>
              <div className="text-xs text-slate-400">{roleLabel(user.role)}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            {t('تسجيل الخروج')}
          </button>
        </div>
      </aside>
    </div>
  );
}
