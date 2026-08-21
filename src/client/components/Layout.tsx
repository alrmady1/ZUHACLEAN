import { NavLink, Outlet, Navigate } from 'react-router-dom';
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
  { to: '/expenses', label: 'المصروفات', icon: Wallet, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/sales', label: 'المبيعات والفواتير', icon: Receipt, roles: ['general_manager', 'admin'] },
  { to: '/contracts', label: 'العقود', icon: FileSignature, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/technician', label: 'بوابة الفني', icon: Smartphone, roles: ['general_manager', 'admin', 'technician'] },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon, roles: ['general_manager', 'admin'] },
];

export default function Layout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">جارِ التحميل…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-s border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <Sparkles className="h-6 w-6 text-brand-600" />
          <div>
            <div className="text-lg font-bold text-slate-800">زهى للأعمال</div>
            <div className="text-xs text-slate-400">نظام التشغيل والصيانة</div>
          </div>
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
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
