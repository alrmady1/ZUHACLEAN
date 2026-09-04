import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarClock,
  FileSignature,
  Calculator,
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
  // مفتاح/مفاتيح صلاحية ديناميكية تُقرأ عبر useAuth().can(). عنصر واحد فقط
  // من roles/permissionKey/permissionKeys لكل رابط. permissionKeys تُظهر
  // الرابط لمن يملك أي واحدة منها (أي-من) — تُستخدَم لرابط "المحاسبة"
  // المدمج الذي يجمع صفحتين لهما صلاحيتان مستقلتان أصلاً.
  roles?: UserRole[];
  permissionKey?: PermissionKey;
  permissionKeys?: PermissionKey[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  { to: '/appointments', label: 'المواعيد', icon: CalendarClock, roles: ['general_manager', 'admin', 'admin_supervisor', 'supervisor'] },
  // طلبات واردة من صفحة "اطلب الخدمة" العامة (OrderPage.tsx) — عملاء
  // محتملون لم يتحولوا بعد إلى موعد فعلي.
  { to: '/leads', label: 'طلبات جديدة', icon: Inbox, permissionKey: 'view_leads_page' },
  // يجمع "المبيعات والفواتير" و"المصروفات" (كانتا رابطين مستقلين) في
  // صفحة واحدة بتبويبين داخليين — انظر Accounting.tsx.
  { to: '/accounting', label: 'المحاسبة', icon: Calculator, permissionKeys: ['view_sales_invoices', 'view_expenses_page'] },
  // كانت تبويباً داخل صفحة العقود، صارت صفحة مستقلة بعد "المبيعات والفواتير".
  { to: '/quotes', label: 'عرض سعر', icon: Tag, permissionKey: 'view_quotes_page' },
  { to: '/contracts', label: 'العقود', icon: FileSignature, permissionKey: 'view_contracts_page' },
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

  // لا زر تحكم دائم في الواجهة — طلب واحد بشكل نافذة نظام (مثل طلب
  // الموقع في تطبيقات آندرويد/آيفون) يظهر أول مرة فقط لكل موظف معنيّ لم
  // يُقرِّر بعد (location_sharing_enabled لا تزال undefined). القرار
  // (سماح أو رفض) يُحفَظ ولا يُعاد السؤال بعده.
  const awaitingLocationDecision =
    !!user && LOCATION_SHARING_ROLES.includes(user.role) && user.location_sharing_enabled === undefined;

  async function respondToLocationPrompt(allow: boolean) {
    if (!user || locationToggleBusy) return;
    setLocationToggleBusy(true);
    try {
      await api.patch(`/profiles/${user.id}/location-sharing`, { enabled: allow });
      await refreshProfiles();
    } finally {
      setLocationToggleBusy(false);
    }
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">{t('جارِ التحميل…')}</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const items = NAV_ITEMS.filter((item) => {
    if (item.permissionKeys) return item.permissionKeys.some((k) => can(k));
    if (item.permissionKey) return can(item.permissionKey);
    return item.roles!.includes(user.role);
  });

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
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            {t('تسجيل الخروج')}
          </button>
        </div>
      </aside>

      {/* طلب مشاركة الموقع — بشكل نافذة نظام مثل تطبيقات آندرويد/آيفون
          (سؤال واحد، نص مختصر، زر سماح بارز وزر رفض بجانبه)، وليس زر
          تحكم دائم في الواجهة. يظهر مرة واحدة فقط لكل موظف معنيّ لم
          يُقرِّر بعد. */}
      {awaitingLocationDecision && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-[300px] overflow-hidden rounded-2xl bg-white text-center shadow-2xl">
            <div className="px-5 pb-4 pt-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <MapPin className="h-6 w-6 text-brand-600" />
              </div>
              <div className="text-[15px] font-semibold text-slate-800">
                {tt('"زهى" يرغب بمشاركة موقعك', '"Zaha" Would Like to Share Your Location')}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                {tt(
                  'يُستخدَم موقعك لتتبّع الفريق الميداني أثناء العمل فقط، ويظهر للإدارة طالما السماح مفعّل. يمكنك تغيير هذا لاحقاً.',
                  'Your location is used to track the field team while working, and stays visible to management while allowed. You can change this later.',
                )}
              </p>
            </div>
            <div className="border-t border-slate-100">
              <button
                type="button"
                disabled={locationToggleBusy}
                onClick={() => respondToLocationPrompt(false)}
                className="w-full border-b border-slate-100 py-3 text-[15px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('عدم السماح')}
              </button>
              <button
                type="button"
                disabled={locationToggleBusy}
                onClick={() => respondToLocationPrompt(true)}
                className="w-full py-3 text-[15px] font-semibold text-brand-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {locationToggleBusy ? t('جارِ الحفظ…') : t('السماح')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
