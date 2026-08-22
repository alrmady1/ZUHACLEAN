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
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { ROLE_LABELS_AR, type UserRole } from '../../shared/types.js';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/customers', label: 'العملاء', icon: Users, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/appointments', label: 'المواعيد', icon: CalendarClock, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/sales', label: 'المبيعات والفواتير', icon: Receipt, roles: ['general_manager', 'admin'] },
  { to: '/contracts', label: 'العقود', icon: FileSignature, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/expenses', label: 'المصروفات', icon: Wallet, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/technician', label: 'بوابة الفني', icon: Smartphone, roles: ['general_manager', 'admin', 'technician'] },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon, roles: ['general_manager', 'admin'] },
];

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // The nav is an overlay, not a docked sidebar: it opens only via the
  // hamburger button and closes itself the moment the route changes
  // (i.e. the user actually navigated somewhere).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">جارِ التحميل…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="فتح القائمة"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Sparkles className="h-5 w-5 text-brand-600" />
        <span className="text-sm font-bold text-slate-800">زهى للأعمال</span>
      </header>

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
        className={`fixed inset-y-0 right-0 z-50 flex w-64 flex-col border-s border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand-600" />
            <div>
              <div className="text-lg font-bold text-slate-800">زهى للأعمال</div>
              <div className="text-xs text-slate-400">نظام التشغيل والصيانة</div>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="إغلاق القائمة"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
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
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-sm font-semibold text-slate-800">{user.full_name}</div>
            <div className="text-xs text-slate-400">{ROLE_LABELS_AR[user.role]}</div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </div>
  );
}
