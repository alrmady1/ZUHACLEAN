import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarClock,
  FileSignature,
  Wallet,
  Receipt,
  Tag,
  Inbox,
  Users,
  Smartphone,
  Settings as SettingsIcon,
  LogOut,
  Sparkles,
  MapPin,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import type { UserRole, PermissionKey } from '../../shared/types.js';
import { useI18n } from '../lib/i18n.js';
import TopBar from './TopBar.js';
import { ensurePushSubscribed } from '../lib/push.js';
import { api } from '../lib/api.js';
import { startLocationSharing, stopLocationSharing } from '../lib/locationSharing.js';

// من يملك جدوى فعلية من مشاركة موقعه — الفريق الميداني فقط، وليس
// الإدارة (هم من يطّلع على الموقع، لا من يشاركه). زر "مشاركة موقعي"
// أدناه يظهر فقط لهذه الأدوار.
const LOCATION_SHARING_ROLES: UserRole[] = ['supervisor', 'admin_supervisor', 'technician'];

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  // إما مصفوفة أدوار ثابتة (غير خاضعة لصفحة "الإعدادات ← الصلاحيات")، أو
  // مفتاح صلاحية ديناميكي يُقرأ عبر useAuth().can(). عنصر واحد فقط من
  // الاثنين لكل رابط.
  roles?: UserRole[];
  permissionKey?: PermissionKey;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/appointments', label: 'المواعيد', icon: CalendarClock, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  // طلبات واردة من صفحة "اطلب الخدمة" العامة (OrderPage.tsx) — عملاء
  // محتملون لم يتحولوا بعد إلى موعد فعلي.
  { to: '/leads', label: 'طلبات جديدة', icon: Inbox, permissionKey: 'view_leads_page' },
  { to: '/sales', label: 'المبيعات والفواتير', icon: Receipt, permissionKey: 'view_sales_invoices' },
  // كانت تبويباً داخل صفحة العقود، صارت صفحة مستقلة بعد "المبيعات والفواتير".
  { to: '/quotes', label: 'عرض سعر', icon: Tag, permissionKey: 'view_quotes_page' },
  { to: '/contracts', label: 'العقود', icon: FileSignature, permissionKey: 'view_contracts_page' },
  { to: '/expenses', label: 'المصروفات', icon: Wallet, permissionKey: 'view_expenses_page' },
  { to: '/customers', label: 'العملاء', icon: Users, permissionKey: 'view_customer_history' },
  // في حساب المدير — يعرض آخر موقع أبلغ عنه كل موظف مفعِّل لمشاركة
  // موقعه بنفسه (زر "مشاركة موقعي" أسفل هذه القائمة).
  { to: '/tracking', label: 'تتبع الموظفين', icon: MapPin, permissionKey: 'view_employee_tracking' },
  { to: '/technician', label: 'بوابة الفني', icon: Smartphone, roles: ['general_manager', 'admin', 'technician'] },
  // المشرف الإداري يرى الإعدادات أيضاً افتراضياً — يفتح له تلقائياً على
  // تبويب "ربط الفنيين بالمشرفين" فقط (انظر Settings.tsx)، وليس بقية
  // التبويبات. صار الوصول نفسه صلاحية ديناميكية قابلة للتعديل.
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon, permissionKey: 'view_settings_page' },
];

export default function Layout() {
  const { user, loading, logout, can, refreshProfiles } = useAuth();
  const { t, tt, roleLabel } = useI18n();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [locationToggleBusy, setLocationToggleBusy] = useState(false);

  // The nav is an overlay, not a docked sidebar: it opens only via the
  // hamburger button and closes itself the moment the route changes
  // (i.e. the user actually navigated somewhere).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // التنبيهات مفعّلة دائماً بدون زر تحكم في الواجهة — تُشترك تلقائياً بمجرد
  // تسجيل الدخول، والتحكم الفعلي بها يصير من إعدادات الجهاز (انظر push.ts).
  useEffect(() => {
    if (user) ensurePushSubscribed(user.id).catch(() => {});
  }, [user?.id]);

  // يبدأ/يوقف إرسال نبضات الموقع مع كل تغيّر في حالة التفعيل نفسها —
  // يعمل طالما التطبيق مفتوحاً في المتصفح بغض النظر عن الصفحة الحالية،
  // ويتوقف تلقائياً بمجرد تسجيل الخروج (user يصبح null).
  useEffect(() => {
    if (user?.location_sharing_enabled) {
      startLocationSharing(user.id);
    } else {
      stopLocationSharing();
    }
    return () => stopLocationSharing();
  }, [user?.id, user?.location_sharing_enabled]);

  const canShareLocation = user ? LOCATION_SHARING_ROLES.includes(user.role) : false;

  async function toggleLocationSharing() {
    if (!user || locationToggleBusy) return;
    setLocationToggleBusy(true);
    try {
      await api.patch(`/profiles/${user.id}/location-sharing`, { enabled: !user.location_sharing_enabled });
      await refreshProfiles();
    } finally {
      setLocationToggleBusy(false);
    }
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">{t('جارِ التحميل…')}</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const items = NAV_ITEMS.filter((item) => (item.permissionKey ? can(item.permissionKey) : item.roles!.includes(user.role)));

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
              <div className="text-lg font-bold text-white">{t('زهى')}</div>
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
          {canShareLocation && (
            <label className="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2.5">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-300" />
                <span>
                  <span className="block text-sm font-medium text-white">{t('مشاركة موقعي')}</span>
                  <span className="block text-[11px] text-slate-400">{tt('يظهر موقعك للإدارة أثناء التفعيل', 'Your location is visible to management while enabled')}</span>
                </span>
              </span>
              <span className="relative inline-block h-6 w-11 shrink-0">
                <input
                  type="checkbox"
                  checked={!!user.location_sharing_enabled}
                  disabled={locationToggleBusy}
                  onChange={toggleLocationSharing}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-slate-600 transition-colors peer-checked:bg-emerald-500" />
                <span className="absolute start-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" />
              </span>
            </label>
          )}
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
