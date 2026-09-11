import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  Clock,
  Tags,
  Tag,
  Rows3,
  LayoutGrid,
  Search,
  Mail,
  Phone,
  LogIn,
  Sparkles,
  ChevronDown,
  DollarSign,
  FileText,
  Users as UsersIcon,
  Wrench as ServicesIcon,
  Banknote as PaymentIcon,
  Wallet as ExpensesIcon,
  Link2 as TeamLinkIcon,
  ShieldCheck as PermissionsIcon,
  GripVertical as DragHandleIcon,
  CalendarOff as DaysOffIcon,
  History as ActivityLogIcon,
  Globe as LandingIcon,
  Smartphone as MobileAppIcon,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  AlertTriangle,
  Ruler,
  Armchair,
  Eye,
  EyeOff,
  Layers,
  Percent as CommissionsIcon,
  Target,
  ShieldAlert,
  UserCheck,
  MessageCircle as LiveChatIcon,
  Map as RiyadhZonesIcon,
  Languages as TranslationsIcon,
  Car as VehiclesIcon,
  Warehouse as FacilitiesIcon,
  Maximize2,
  MapPin as MapIcon,
  Paperclip,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { AR_TO_EN, AR_TO_BN, AR_TO_UR } from '../lib/translations.js';
import type {
  Profile,
  Service,
  ServicePricingModel,
  ServicePricingTier,
  UserRole,
  PaymentMethodOption,
  ServiceCategory,
  ExpenseCategoryItem,
  LeaveRecord,
  LeaveType,
  Appointment,
  ActivityLogEntry,
  LandingPageSettings,
  LandingService,
  MobileAppSettings,
  CommissionConfig,
  CommissionTier,
  CommissionEligibility,
  CompanyBankAccount,
  SalesDiscountKind,
  TranslationLanguage,
  Vehicle,
  VehicleOwnershipType,
  VehicleRentalFrequency,
  Expense,
  Facility,
  PaymentStatus,
  NeighborhoodZoneAssignment,
  DistrictGeocode,
} from '../../shared/types.js';
import {
  DEFAULT_LANDING_SETTINGS,
  DEFAULT_MOBILE_APP_SETTINGS,
  DEFAULT_COMMISSION_CONFIG,
  VEHICLE_OWNERSHIP_TYPE_LABELS_AR,
  VEHICLE_RENTAL_FREQUENCY_LABELS_AR,
  COMPANY_LEGAL_NAME,
  FACILITY_TYPE_LABELS_AR,
  FACILITY_RENT_FREQUENCY_LABELS_AR,
} from '../../shared/types.js';
import {
  SETTINGS_ACCESS_ROLES,
  PERMISSIONS_ACCESS_ROLES,
  ACTIVITY_LOG_DELETE_ROLES,
  LEAVE_TYPE_LABELS_AR,
  ANNUAL_LEAVE_BALANCE_DAYS,
  SERVICE_PRICING_MODEL_LABELS_AR,
} from '../../shared/types.js';
import { formatMoney, formatDuration, formatDateAr, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { WEEKDAYS } from '../../shared/weekdays.js';
import { leaveTypeDisplay } from '../../shared/leaves.js';
import { compressImageToDataUrl } from '../lib/image.js';
import LiveChatAdminPanel from '../components/LiveChatAdminPanel.js';
import EmployeeFormModal from '../components/EmployeeFormModal.js';
import RiyadhZonesTab from './RiyadhZonesTab.js';

// Leaflet محمَّل عالمياً عبر <script> في index.html — نفس أسلوب
// RiyadhZonesTab.tsx/CustomerHeatMapTab.tsx بالضبط (بلا حزمة npm ولا
// مفتاح API)، يُستخدَم هنا لمعاينة موقع المرفق المصغَّرة (انظر
// FacilityLocationMap أدناه).
declare const L: any;

const ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'marketer', 'accountant', 'supervisor', 'technician'];

const ROLE_PLURAL_LABELS_AR: Record<UserRole, string> = {
  general_manager: 'المدير العام',
  admin: 'مدراء النظام',
  admin_supervisor: 'مشرفين إداريين',
  supervisor: 'مشرفين ميدانيين',
  technician: 'فنيين ميدانيين',
  marketer: 'مسوّقين',
  accountant: 'محاسبين',
};

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  general_manager: 'bg-violet-100 text-violet-700',
  admin: 'bg-rose-100 text-rose-700',
  admin_supervisor: 'bg-amber-100 text-amber-700',
  supervisor: 'bg-blue-100 text-blue-700',
  technician: 'bg-emerald-100 text-emerald-700',
  marketer: 'bg-fuchsia-100 text-fuchsia-700',
  accountant: 'bg-cyan-100 text-cyan-700',
};

function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center gap-1.5 font-medium text-slate-600">
        {label}
        {icon}
      </span>
      {children}
    </label>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------
function UsersTab() {
  const { user: currentUser, loginAs, refreshProfiles } = useAuth();
  const { t, tt, roleLabel, lang } = useI18n();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');

  function refresh() {
    api.get<Profile[]>('/profiles').then(setProfiles);
  }
  useEffect(refresh, []);

  const supervisors = profiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');

  const filtered = profiles.filter((p) => {
    if (roleFilter !== 'all' && p.role !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && ![p.full_name, p.phone, p.email].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  function switchToAccount(p: Profile) {
    loginAs(p.id);
    navigate('/');
  }

  async function handleDeleteUser(p: Profile) {
    if (
      !window.confirm(
        tt(`حذف حساب "${p.full_name}"؟ لا يمكن التراجع عن هذا الإجراء.`, `Delete account "${p.full_name}"? This action cannot be undone.`),
      )
    )
      return;
    try {
      await api.del(`/profiles/${p.id}`);
      refresh();
      refreshProfiles();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('تعذّر حذف الحساب'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('إدارة فريق العمل والهيكل التنظيمي')}</h2>
          <p className="text-sm text-slate-400">{t('توزيع أدوار المشرفين الميدانيين والإداريين، وربط الفنيين بالمشرف المسؤول')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('إضافة عضو جديد')}
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('grid')}
              title={t('مربعات')}
              className={`rounded-lg p-1.5 ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title={t('صفوف')}
              className={`rounded-lg p-1.5 ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <Rows3 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setRoleFilter('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${roleFilter === 'all' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          {t('الكل')} ({profiles.length})
        </button>
        {ROLES.filter((r) => profiles.some((p) => p.role === r)).map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${roleFilter === r ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {t(ROLE_PLURAL_LABELS_AR[r])} ({profiles.filter((p) => p.role === r).length})
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('بحث بالاسم أو الهاتف...')}
          className="input ps-9"
        />
      </div>

      {view === 'list' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="min-w-[960px] divide-y divide-slate-100">
            {filtered.map((p) => {
              const isSelf = p.id === currentUser?.id;
              const isLastManager = p.role === 'general_manager' && profiles.filter((x) => x.role === 'general_manager').length <= 1;
              // منع "الدخول بهذا الحساب" لأي حساب مدير عام من أي حساب آخر —
              // حتى لو كان الحساب الحالي يملك صلاحية الاطلاع على هذه الصفحة
              // (admin_supervisor مثلاً)، لا يمكنه ترقية نفسه فعلياً بالدخول
              // مباشرة كمدير عام عبر هذا الزر.
              const isTargetGM = p.role === 'general_manager';
              const team = profiles.filter((tech) => tech.role === 'technician' && tech.supervisor_id === p.id);
              const supervisor = profiles.find((s) => s.id === p.supervisor_id);
              const initial = p.full_name.trim().charAt(0);
              return (
                <div key={p.id} className={`flex items-center gap-4 whitespace-nowrap p-3 ${isSelf ? 'bg-brand-50/40' : ''}`}>
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ROLE_BADGE_STYLES[p.role]}`}
                  >
                    {initial}
                  </div>
                  <div className="flex w-40 shrink-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-800">{p.full_name}</span>
                    {isSelf && (
                      <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{t('أنت')}</span>
                    )}
                  </div>
                  <span className={`w-28 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${ROLE_BADGE_STYLES[p.role]}`}>
                    {roleLabel(p.role)}
                  </span>
                  <div className="flex w-44 shrink-0 items-center gap-1 text-xs text-slate-500">
                    {p.email && (
                      <>
                        <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{p.email}</span>
                      </>
                    )}
                  </div>
                  <div className="flex w-32 shrink-0 items-center gap-1 text-xs text-slate-500">
                    {p.phone && (
                      <>
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {p.phone}
                      </>
                    )}
                  </div>
                  <div className="w-44 shrink-0 text-xs text-slate-500">
                    {(p.role === 'supervisor' || p.role === 'admin_supervisor') && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" dir={lang === 'en' ? 'ltr' : undefined}>
                        {team.length} {t('فني تابع له')}
                      </span>
                    )}
                    {p.role === 'technician' &&
                      (supervisor ? (
                        <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {t('مشرفه:')} {supervisor.full_name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">{t('بدون مشرف')}</span>
                      ))}
                  </div>
                  <span
                    className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                  >
                    {p.is_active ? t('نشط') : t('موقوف')}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleDeleteUser(p)}
                      disabled={isSelf || isLastManager}
                      title={isSelf ? t('لا يمكن حذف حسابك الحالي') : isLastManager ? t('لا يمكن حذف آخر مدير عام') : t('حذف')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(p);
                        setShowForm(true);
                      }}
                      disabled={isTargetGM && !isSelf}
                      title={isTargetGM && !isSelf ? t('لا يمكن تعديل حساب مدير عام من حساب آخر') : t('تعديل')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="shrink-0">
                    {isSelf ? (
                      <span className="text-xs font-medium text-slate-300">{t('الحساب الفعلي')}</span>
                    ) : isTargetGM ? (
                      <span className="text-xs font-medium text-slate-300" title={t('لا يمكن الدخول لحساب مدير عام من حساب آخر')}>
                        {t('مقيَّد')}
                      </span>
                    ) : (
                      <button
                        onClick={() => switchToAccount(p)}
                        className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                      >
                        {t('دخول')} <LogIn className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="p-10 text-center text-slate-400">{t('لا يوجد أعضاء مطابقون')}</div>}
          </div>
        </div>
      )}

      {view === 'grid' && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {filtered.map((p) => {
          const isSelf = p.id === currentUser?.id;
          const isLastManager = p.role === 'general_manager' && profiles.filter((x) => x.role === 'general_manager').length <= 1;
          // منع "الدخول بهذا الحساب" لأي حساب مدير عام من أي حساب آخر — حتى
          // لو كان الحساب الحالي يملك صلاحية الاطلاع على هذه الصفحة
          // (admin_supervisor مثلاً)، لا يمكنه ترقية نفسه فعلياً بالدخول
          // مباشرة كمدير عام عبر هذا الزر.
          const isTargetGM = p.role === 'general_manager';
          const team = profiles.filter((tech) => tech.role === 'technician' && tech.supervisor_id === p.id);
          const supervisor = profiles.find((s) => s.id === p.supervisor_id);
          const initial = p.full_name.trim().charAt(0);
          const wrapperClass = `rounded-2xl border bg-white p-4 ${isSelf ? 'border-brand-400 ring-1 ring-brand-200' : 'border-slate-200'}`;

          return (
            <div key={p.id} className={wrapperClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ROLE_BADGE_STYLES[p.role]}`}
                  >
                    {initial}
                  </div>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                        {p.is_active ? t('نشط') : t('موقوف')}
                      </span>
                      {isSelf && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{t('أنت')}</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{p.full_name}</div>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_STYLES[p.role]}`}>
                      {roleLabel(p.role)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {p.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {p.email}
                  </div>
                )}
                {p.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {p.phone}
                  </div>
                )}
              </div>

              {(p.role === 'supervisor' || p.role === 'admin_supervisor') && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t('الفنيين التابعين للمشرف:')}</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-600" dir={lang === 'en' ? 'ltr' : undefined}>
                      {team.length} {t('فني')}
                    </span>
                  </div>
                  {team.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {team.map((tech) => (
                        <span key={tech.id} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
                          {tech.full_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">{t('لا يوجد فنيين مرتبطين بعد')}</div>
                  )}
                </div>
              )}

              {p.role === 'technician' && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="mb-1.5 text-xs text-slate-500">{t('المشرف الميداني المسؤول:')}</div>
                  {supervisor ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
                      {supervisor.full_name} ({roleLabel(supervisor.role)})
                    </span>
                  ) : (
                    <div className="text-[11px] text-slate-400">{t('بدون مشرف محدد')}</div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDeleteUser(p)}
                    disabled={isSelf || isLastManager}
                    title={isSelf ? t('لا يمكن حذف حسابك الحالي') : isLastManager ? t('لا يمكن حذف آخر مدير عام') : t('حذف')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(p);
                      setShowForm(true);
                    }}
                    disabled={isTargetGM && !isSelf}
                    title={isTargetGM && !isSelf ? t('لا يمكن تعديل حساب مدير عام من حساب آخر') : t('تعديل')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {isSelf ? (
                  <span className="rounded-lg px-2 py-1 text-xs font-medium text-slate-300">{t('الحساب الفعلي')}</span>
                ) : isTargetGM ? (
                  <span
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-300"
                    title={t('لا يمكن الدخول لحساب مدير عام من حساب آخر')}
                  >
                    {t('مقيَّد')}
                  </span>
                ) : (
                  <button
                    onClick={() => switchToAccount(p)}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    {t('الدخول بهذا الحساب')} <LogIn className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            {t('لا يوجد أعضاء مطابقون')}
          </div>
        )}
      </div>
      )}

      {showForm && (
        <EmployeeFormModal
          editing={editing}
          supervisors={supervisors}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services tab
// ---------------------------------------------------------------------------
function ServicesTab() {
  const { t, tt } = useI18n();
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [category, setCategory] = useState<string>('__all__');
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  function refresh() {
    api.get<Service[]>('/services').then(setServices);
  }
  function refreshCategories() {
    api.get<ServiceCategory[]>('/service-categories').then(setCategories);
  }
  useEffect(() => {
    refresh();
    refreshCategories();
  }, []);

  const filtered = category === '__all__' ? services : services.filter((s) => s.category === category);

  async function handleDelete(s: Service) {
    if (!window.confirm(tt(`حذف خدمة "${s.name}"؟ لا يمكن التراجع عن هذا الإجراء.`, `Delete service "${s.name}"? This action cannot be undone.`)))
      return;
    await api.del(`/services/${s.id}`);
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('دليل الخدمات وقائمة الأسعار')}</h2>
          <p className="text-sm text-slate-400">{t('إدارة خدمات النظافة والصيانة والمدد التقديرية والتسعيرات الافتراضية')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategories(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Tags className="h-4 w-4" /> {t('تعديل التصنيف')}
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('إضافة خدمة جديدة')}
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('grid')}
              title={t('مربعات')}
              className={`rounded-lg p-1.5 ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title={t('صفوف')}
              className={`rounded-lg p-1.5 ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <Rows3 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('__all__')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${category === '__all__' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          {t('جميع الخدمات')}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.name)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${category === c.name ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {view === 'grid' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                >
                  {s.is_active ? t('نشطة') : t('موقوفة')}
                </span>
                {s.category && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{s.category}</span>
                )}
              </div>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                {s.pricing_model && s.pricing_model !== 'fixed' && (
                  <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                    {s.pricing_model === 'per_sqm' ? <Ruler className="h-3 w-3" /> : <Armchair className="h-3 w-3" />}
                    {t(SERVICE_PRICING_MODEL_LABELS_AR[s.pricing_model])}
                  </span>
                )}
              </div>
              {s.description && <p className="mb-3 text-xs leading-relaxed text-slate-500">{s.description}</p>}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="mb-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" /> {t('المدة المقدرة')}
                  </div>
                  <div className="text-sm font-semibold text-slate-700">{formatDuration(s.default_duration_minutes)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="mb-0.5 text-[11px] text-slate-400">
                    {s.pricing_model === 'per_sqm'
                      ? tt('السعر لكل متر مربع', 'Price per m²')
                      : s.pricing_model === 'per_seat'
                        ? tt('السعر لكل مقعد', 'Price per seat')
                        : t('السعر الافتراضي (شامل الضريبة)')}
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    {formatMoney(s.pricing_model && s.pricing_model !== 'fixed' ? s.unit_price ?? 0 : s.default_price)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3">
                <button
                  onClick={() => handleDelete(s)}
                  title={t('حذف')}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setEditing(s);
                    setShowForm(true);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              {t('لا توجد خدمات بعد')}
            </div>
          )}
        </div>
      )}

      {view === 'list' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="min-w-[900px] divide-y divide-slate-100">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-4 whitespace-nowrap p-3">
                <span
                  className={`w-16 shrink-0 rounded-full px-2.5 py-1 text-center text-xs font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                >
                  {s.is_active ? t('نشطة') : t('موقوفة')}
                </span>
                <div className="w-48 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-800">{s.name}</span>
                    {s.pricing_model && s.pricing_model !== 'fixed' && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                        {s.pricing_model === 'per_sqm' ? <Ruler className="h-3 w-3" /> : <Armchair className="h-3 w-3" />}
                      </span>
                    )}
                  </div>
                  {s.description && <div className="truncate text-xs text-slate-400">{s.description}</div>}
                </div>
                <span className="w-32 shrink-0 truncate text-xs font-medium text-slate-500">{s.category || '—'}</span>
                <span className="flex w-32 shrink-0 items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> {formatDuration(s.default_duration_minutes)}
                </span>
                <span className="w-28 shrink-0 text-sm font-semibold text-slate-700">
                  {formatMoney(s.pricing_model && s.pricing_model !== 'fixed' ? s.unit_price ?? 0 : s.default_price)}
                  {s.pricing_model === 'per_sqm' && <span className="text-[10px] font-normal text-slate-400"> / {t('م²')}</span>}
                  {s.pricing_model === 'per_seat' && <span className="text-[10px] font-normal text-slate-400"> / {t('مقعد')}</span>}
                </span>
                <div className="mr-auto flex items-center gap-1">
                  <button
                    onClick={() => handleDelete(s)}
                    title={t('حذف')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(s);
                      setShowForm(true);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="p-10 text-center text-slate-400">{t('لا توجد خدمات بعد')}</div>}
          </div>
        </div>
      )}

      {showForm && (
        <ServiceFormModal
          editing={editing}
          categories={categories}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {showCategories && (
        <CategoriesModal
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={() => {
            refreshCategories();
            refresh();
          }}
        />
      )}
    </div>
  );
}

// نموذج إضافة/تعديل خدمة — مستخرج كمكوّن مستقل (بنفس نمط LandingServiceForm)
// حتى تُعاد تهيئة حالة "نموذج التسعير" من الصفر عند كل فتح (mount/unmount
// كامل بفضل `{showForm && (...)}` في المكوّن الأب)، بدل أن تبقى عالقة من
// فتحة سابقة. حقل السعر واحد فقط ظاهر دائماً (name="price_value") ويُعاد
// تفسيره حسب pricingModel عند الإرسال: سعر ثابت (default_price) أو سعر
// الوحدة للمتر المربع/المقعد (unit_price) — وفي الحالة الثانية يُخزَّن نفس
// الرقم أيضاً كـ default_price (سعر الوحدة الواحدة) لأن الحقل مطلوب دوماً.
function ServiceFormModal({
  editing,
  categories,
  onClose,
  onSaved,
}: {
  editing: Service | null;
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tt } = useI18n();
  const [pricingModel, setPricingModel] = useState<ServicePricingModel>(editing?.pricing_model ?? 'fixed');
  const [submitting, setSubmitting] = useState(false);
  // مستويات تسعير اختيارية (مثال: تنظيف سطحي/عميق للكنب) — كل صف عبارة عن
  // نص مؤقّت (state) قبل تحويله لأرقام عند الإرسال، لتفادي مشاكل التحقق
  // أثناء الكتابة (مثلاً حقل سعر فارغ مؤقتاً بينما يكتب المستخدم).
  // مدة الوحدة (المستوى، وunit_duration_seconds العام أدناه) تُدخَل وتُعرَض
  // بالدقيقة هنا (نفس وحدة "المدة التقريبية" الأخرى في هذا النموذج، أسهل
  // للإدخال اليدوي من الثواني) — تُحوَّل لثوانٍ فقط عند الإرسال (× 60)؛
  // التخزين الفعلي (Service.unit_duration_seconds/ServicePricingTier.
  // unit_duration_seconds) يبقى بالثواني كما هو دون أي تغيير في الـschema
  // أو في منطق حساب المدة عند الحجز (NewAppointmentModal.tsx).
  const [tiers, setTiers] = useState<{ key: string; label: string; unit_price: string; unit_duration_minutes: string }[]>(
    () =>
      (editing?.pricing_tiers ?? []).map((tier) => ({
        key: tier.key,
        label: tier.label,
        unit_price: String(tier.unit_price),
        unit_duration_minutes: tier.unit_duration_seconds ? String(tier.unit_duration_seconds / 60) : '',
      })),
  );

  function addTier() {
    setTiers((prev) => [
      ...prev,
      { key: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: '', unit_price: '', unit_duration_minutes: '' },
    ]);
  }
  function updateTier(key: string, patch: Partial<{ label: string; unit_price: string; unit_duration_minutes: string }>) {
    setTiers((prev) => prev.map((tier) => (tier.key === key ? { ...tier, ...patch } : tier)));
  }
  function removeTier(key: string) {
    setTiers((prev) => prev.filter((tier) => tier.key !== key));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const priceValue = Number(form.get('price_value'));
    // مُدخَلة بالدقيقة (انظر تعليق tiers أعلاه) — تُحوَّل هنا لثوانٍ للتخزين.
    const unitDurationMinutesRaw = form.get('unit_duration_minutes');
    const pricingTiers: ServicePricingTier[] | undefined =
      pricingModel !== 'fixed'
        ? tiers
            .filter((tier) => tier.label.trim() && Number(tier.unit_price) > 0)
            .map((tier) => ({
              key: tier.key,
              label: tier.label.trim(),
              unit_price: Number(tier.unit_price),
              unit_duration_seconds: tier.unit_duration_minutes ? Math.round(Number(tier.unit_duration_minutes) * 60) : undefined,
            }))
        : undefined;
    const payload = {
      name: form.get('name'),
      description: form.get('description') || undefined,
      category: form.get('category') || undefined,
      default_price: priceValue,
      default_duration_minutes: Number(form.get('default_duration_minutes')),
      is_active: form.get('is_active') === 'on',
      pricing_model: pricingModel === 'fixed' ? undefined : pricingModel,
      unit_price: pricingModel === 'fixed' ? undefined : priceValue,
      unit_duration_seconds:
        pricingModel !== 'fixed' && unitDurationMinutesRaw && Number(unitDurationMinutesRaw) > 0
          ? Math.round(Number(unitDurationMinutesRaw) * 60)
          : undefined,
      pricing_tiers: pricingTiers && pricingTiers.length > 0 ? pricingTiers : undefined,
    };
    try {
      if (editing) {
        await api.patch(`/services/${editing.id}`, payload);
      } else {
        await api.post('/services', payload);
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  const priceLabel =
    pricingModel === 'per_sqm'
      ? t('سعر المتر المربع الواحد (SAR، شامل الضريبة) *')
      : pricingModel === 'per_seat'
        ? t('سعر المقعد الواحد (SAR، شامل الضريبة) *')
        : t('السعر الافتراضي (SAR، شامل الضريبة) *');
  const priceDefaultValue = pricingModel === 'fixed' ? editing?.default_price : editing?.unit_price;

  return (
    <Modal
      title={editing ? tt(`تعديل ${editing.name}`, `Edit ${editing.name}`) : t('إضافة خدمة جديدة')}
      subtitle={t('تحديد تفاصيل وباقة الخدمة والأسعار الافتراضية بالريال السعودي')}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('اسم الخدمة *')} icon={<Sparkles className="h-3.5 w-3.5 text-brand-500" />}>
          <input
            name="name"
            defaultValue={editing?.name}
            required
            placeholder={t('مثال: تنظيف وتلميع واجهات الزجاج')}
            className="input"
          />
        </Field>

        <Field label={t('تصنيف وقسم الخدمة')} icon={<Tag className="h-3.5 w-3.5 text-brand-500" />}>
          <div className="relative">
            <select name="category" defaultValue={editing?.category ?? ''} className="input appearance-none pe-9">
              <option value="">{t('بدون تصنيف')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </Field>

        <Field label={t('نموذج التسعير')} icon={<Ruler className="h-3.5 w-3.5 text-brand-500" />}>
          <div className="relative">
            <select
              value={pricingModel}
              onChange={(e) => setPricingModel(e.target.value as ServicePricingModel)}
              className="input appearance-none pe-9"
            >
              {(Object.keys(SERVICE_PRICING_MODEL_LABELS_AR) as ServicePricingModel[]).map((m) => (
                <option key={m} value={m}>
                  {t(SERVICE_PRICING_MODEL_LABELS_AR[m])}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          {pricingModel !== 'fixed' && (
            <p className="mt-1.5 text-xs text-slate-400">
              {pricingModel === 'per_sqm'
                ? tt(
                    'سيُطلب إدخال عدد الأمتار (م²) عند إضافة الخدمة لموعد، ويُحسب السعر تلقائياً (قابل للتعديل).',
                    'You will be asked for the area (m²) when adding this service to an appointment — the price is calculated automatically (still editable).',
                  )
                : tt(
                    'سيُطلب إدخال عدد المقاعد عند إضافة الخدمة لموعد، ويُحسب السعر تلقائياً (قابل للتعديل).',
                    'You will be asked for the number of seats when adding this service to an appointment — the price is calculated automatically (still editable).',
                  )}
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('المدة التقريبية (دقيقة) *')} icon={<Clock className="h-3.5 w-3.5 text-brand-500" />}>
            <input
              type="number"
              name="default_duration_minutes"
              min={1}
              defaultValue={editing?.default_duration_minutes ?? 60}
              required
              className="input"
            />
          </Field>
          <Field label={priceLabel} icon={<DollarSign className="h-3.5 w-3.5 text-brand-500" />}>
            <input
              key={pricingModel}
              type="number"
              name="price_value"
              min={0}
              step="0.01"
              defaultValue={priceDefaultValue}
              required
              className="input"
            />
          </Field>
        </div>

        {pricingModel !== 'fixed' && (
          <Field
            label={
              pricingModel === 'per_sqm'
                ? t('مدة المتر المربع الواحد (دقيقة) — اختياري')
                : t('مدة المقعد الواحد (دقيقة) — اختياري')
            }
            icon={<Clock className="h-3.5 w-3.5 text-brand-500" />}
          >
            <input
              key={`dur-${pricingModel}`}
              type="number"
              name="unit_duration_minutes"
              min={0}
              step="0.5"
              defaultValue={editing?.unit_duration_seconds ? editing.unit_duration_seconds / 60 : undefined}
              placeholder={t('اتركه فارغاً لتبقى المدة الكلية ثابتة (المدة التقريبية أعلاه)')}
              className="input"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {tt(
                'عند تحديدها، مدة الموعد الكلية لهذه الخدمة = الكمية المُدخَلة عند الحجز × هذه القيمة، بدل المدة التقريبية الثابتة أعلاه.',
                'When set, the total appointment duration for this service = the quantity entered at booking × this value, instead of the fixed estimated duration above.',
              )}
            </p>
          </Field>
        )}

        {pricingModel !== 'fixed' && (
          <Field label={t('مستويات تسعير إضافية (اختياري)')} icon={<Layers className="h-3.5 w-3.5 text-brand-500" />}>
            <p className="mb-2 text-xs text-slate-400">
              {tt(
                'مثال: تنظيف سطحي وتنظيف عميق بسعر ومدة مختلفة لكل منهما. عند إضافة مستوى واحد على الأقل، يُطلَب من العميل اختيار المستوى عند الحجز بدل استخدام السعر/المدة أعلاه.',
                'Example: light vs. deep cleaning with a different price and duration each. Once at least one tier is added, the customer must pick a tier when booking instead of using the price/duration above.',
              )}
            </p>
            <div className="space-y-2">
              {tiers.map((tier) => (
                <div key={tier.key} className="flex items-center gap-2">
                  <input
                    value={tier.label}
                    onChange={(e) => updateTier(tier.key, { label: e.target.value })}
                    placeholder={t('اسم المستوى (مثال: تنظيف سطحي)')}
                    className="input flex-[2]"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tier.unit_price}
                    onChange={(e) => updateTier(tier.key, { unit_price: e.target.value })}
                    placeholder={t('السعر')}
                    className="input flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={tier.unit_duration_minutes}
                    onChange={(e) => updateTier(tier.key, { unit_duration_minutes: e.target.value })}
                    placeholder={t('المدة (دقيقة)')}
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(tier.key)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title={t('حذف المستوى')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTier}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('إضافة مستوى تسعير')}
            </button>
          </Field>
        )}

        <Field label={t('وصف الخدمة والمميزات المشمولة')} icon={<FileText className="h-3.5 w-3.5 text-brand-500" />}>
          <textarea
            name="description"
            defaultValue={editing?.description}
            rows={3}
            placeholder={t('مثال: يشمل غسيل الأرضيات، تلميع الأسطح، غسيل الشبابيك واستخدام مواد معتمدة...')}
            className="input resize-none"
          />
        </Field>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span>
            <span className="block text-sm font-medium text-slate-700">{t('حالة تفعيل الخدمة')}</span>
            <span className="block text-xs text-slate-400">{t('الخدمة متاحة للحجز في قائمة المواعيد')}</span>
          </span>
          <span className="relative inline-block h-6 w-11 shrink-0">
            <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} className="peer sr-only" />
            <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500" />
            <span className="absolute start-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" />
          </span>
        </label>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('إضافة الخدمة')}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium text-slate-400 hover:text-slate-600">
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: ServiceCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, tt } = useI18n();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function addCategory() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api.post('/service-categories', { name: newName.trim() });
      setNewName('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editValue.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/service-categories/${id}`, { name: editValue.trim() });
      setEditingId(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(c: ServiceCategory) {
    if (
      !window.confirm(
        tt(
          `حذف قسم "${c.name}"؟ ستفقد الخدمات المرتبطة به تصنيفها (بدون حذف الخدمات نفسها).`,
          `Delete the "${c.name}" category? Services linked to it will lose their category (the services themselves won't be deleted).`,
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await api.del(`/service-categories/${c.id}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('تعديل أقسام الخدمات')} onClose={onClose}>
      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            {editingId === c.id ? (
              <>
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="input flex-1"
                  autoFocus
                />
                <button
                  disabled={busy}
                  onClick={() => saveEdit(c.id)}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {t('حفظ')}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500"
                >
                  {t('إلغاء')}
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{c.name}</span>
                <button
                  onClick={() => {
                    setEditingId(c.id);
                    setEditValue(c.name);
                  }}
                  title={t('تعديل')}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  disabled={busy}
                  onClick={() => removeCategory(c)}
                  title={t('حذف')}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && <div className="text-center text-sm text-slate-400">{t('لا توجد أقسام بعد')}</div>}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('اسم قسم جديد')}
          className="input flex-1"
        />
        <button
          disabled={busy}
          onClick={addCategory}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {t('إضافة')}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Payment methods tab
// ---------------------------------------------------------------------------
function PaymentMethodsTab() {
  const { t, tt } = useI18n();
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [editing, setEditing] = useState<PaymentMethodOption | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.get<PaymentMethodOption[]>('/payment-methods').then(setMethods);
  }
  useEffect(refresh, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name'),
      is_active: form.get('is_active') === 'on',
    };
    try {
      if (editing) {
        await api.patch(`/payment-methods/${editing.id}`, payload);
      } else {
        await api.post('/payment-methods', payload);
      }
      setShowForm(false);
      setEditing(null);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{t('طرق الدفع المتاحة عند تسجيل المصروفات وتحصيل الدفعات')}</p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('طريقة دفع جديدة')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('طريقة الدفع')}</th>
              <th className="p-3 text-start font-medium">{t('الحالة')}</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium text-slate-700">{m.name}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${m.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {m.is_active ? t('مفعّلة') : t('موقوفة')}
                  </span>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => {
                      setEditing(m);
                      setShowForm(true);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                  </button>
                </td>
              </tr>
            ))}
            {methods.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-400">
                  {t('لا توجد طرق دفع بعد')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editing ? tt(`تعديل ${editing.name}`, `Edit ${editing.name}`) : t('طريقة دفع جديدة')}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label={t('اسم طريقة الدفع')}>
              <input name="name" defaultValue={editing?.name} required className="input" placeholder={t('مثال: آجل / شيك')} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
              {t('مفعّلة (تظهر عند تسجيل مصروف أو تحصيل دفعة)')}
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('حفظ طريقة الدفع')}
            </button>
          </form>
        </Modal>
      )}

      <BankAccountSettingsCard />
    </div>
  );
}

// بيانات الحساب البنكي للشركة — تُستخدَم لإنشاء صورة قابلة للمشاركة (واتساب/
// إيميل) عند اختيار "حوالة بنكية" عند تحصيل دفعة (انظر PayAppointmentModal
// وsrc/client/lib/bankAccountShare.ts). سجل واحد فقط (singleton)، بلا
// إضافة/حذف — فقط تعديل الحقول الخمسة.
function BankAccountSettingsCard() {
  const { t } = useI18n();
  const [account, setAccount] = useState<CompanyBankAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<CompanyBankAccount>('/company-bank-account').then(setAccount);
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const form = new FormData(e.currentTarget);
    const payload = {
      account_holder_name: form.get('account_holder_name'),
      bank_name: form.get('bank_name'),
      iban: form.get('iban'),
      account_number: form.get('account_number'),
      swift_code: form.get('swift_code'),
    };
    try {
      const updated = await api.patch<CompanyBankAccount>('/company-bank-account', payload);
      setAccount(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!account) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-1 text-sm font-bold text-slate-800">{t('بيانات الحساب البنكي')}</h3>
      <p className="mb-4 text-xs text-slate-400">
        {t('تُستخدَم لإنشاء صورة قابلة للمشاركة عبر واتساب أو الإيميل عند اختيار "حوالة بنكية" كطريقة دفع')}
      </p>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field label={t('اسم الحساب')}>
          <input name="account_holder_name" defaultValue={account.account_holder_name} className="input" />
        </Field>
        <Field label={t('اسم البنك')}>
          <input name="bank_name" defaultValue={account.bank_name} className="input" placeholder={t('مثال: البنك الأهلي')} />
        </Field>
        <Field label={t('رقم الآيبان (IBAN)')}>
          <input name="iban" defaultValue={account.iban} className="input" dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" />
        </Field>
        <Field label={t('رقم الحساب')}>
          <input name="account_number" defaultValue={account.account_number} className="input" dir="ltr" />
        </Field>
        <Field label={t('رمز السويفت (SWIFT)')}>
          <input name="swift_code" defaultValue={account.swift_code} className="input" dir="ltr" />
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {saving ? t('جارِ الحفظ…') : saved ? t('تم الحفظ ✓') : t('حفظ بيانات الحساب')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expense categories tab — two-level: main groups (e.g. مركبات، رواتب) each
// with optional sub-items (e.g. بنزين، صيانة under مركبات).
// ---------------------------------------------------------------------------
function ExpenseCategoriesTab() {
  const { t, tt, lang } = useI18n();
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>([]);
  const [editing, setEditing] = useState<ExpenseCategoryItem | null>(null);
  const [formParentId, setFormParentId] = useState<string | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function refresh() {
    api.get<ExpenseCategoryItem[]>('/expense-categories').then(setCategories);
  }
  useEffect(refresh, []);

  const mainCategories = categories.filter((c) => !c.parent_id);
  const subsOf = (id: string) => categories.filter((c) => c.parent_id === id);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(item: ExpenseCategoryItem) {
    const isMain = !item.parent_id;
    const childCount = isMain ? subsOf(item.id).length : 0;
    const message =
      childCount > 0
        ? tt(
            `حذف "${item.name}" سيحذف أيضاً ${childCount} بنداً فرعياً تحته. هل أنت متأكد؟`,
            `Deleting "${item.name}" will also delete the ${childCount} sub-item(s) under it. Are you sure?`,
          )
        : tt(`حذف "${item.name}"؟`, `Delete "${item.name}"?`);
    if (!window.confirm(message)) return;
    await api.del(`/expense-categories/${item.id}`);
    refresh();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      if (editing) {
        await api.patch(`/expense-categories/${editing.id}`, { name: form.get('name') });
      } else {
        await api.post('/expense-categories', { name: form.get('name'), parent_id: formParentId });
      }
      setShowForm(false);
      setEditing(null);
      setFormParentId(undefined);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const parentNameOf = (id?: string) => mainCategories.find((m) => m.id === id)?.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('العهد والمصروفات')}</h2>
          <p className="text-sm text-slate-400">{t('إدارة بنود المصروفات الرئيسية (مثل مركبات، رواتب) والبنود الفرعية تحت كل بند')}</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormParentId(undefined);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('إضافة بند رئيسي')}
        </button>
      </div>

      <div className="space-y-3">
        {mainCategories.map((main) => {
          const subs = subsOf(main.id);
          const isCollapsed = collapsed.has(main.id);
          return (
            <div key={main.id} className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 p-4">
                <button
                  type="button"
                  onClick={() => toggleCollapse(main.id)}
                  className="flex items-center gap-2 text-sm font-semibold text-slate-800"
                >
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  {main.name}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500" dir={lang === 'en' ? 'ltr' : undefined}>
                    {subs.length} {t('بند فرعي')}
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditing(null);
                      setFormParentId(main.id);
                      setShowForm(true);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t('إضافة بند فرعي')}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(main);
                      setShowForm(true);
                    }}
                    title={t('تعديل')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(main)}
                    title={t('حذف')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {subs.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between gap-2 px-4 py-2.5 ps-10">
                      <span className="text-sm text-slate-600">{sub.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing(sub);
                            setShowForm(true);
                          }}
                          title={t('تعديل')}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-brand-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(sub)}
                          title={t('حذف')}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {subs.length === 0 && <div className="px-4 py-3 ps-10 text-xs text-slate-400">{t('لا توجد بنود فرعية بعد')}</div>}
                </div>
              )}
            </div>
          );
        })}
        {mainCategories.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            {t('لا توجد بنود بعد')}
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          title={editing ? tt(`تعديل ${editing.name}`, `Edit ${editing.name}`) : formParentId ? t('بند فرعي جديد') : t('بند رئيسي جديد')}
          subtitle={
            editing?.parent_id
              ? tt(`بند فرعي تحت "${parentNameOf(editing.parent_id) ?? ''}"`, `Sub-item under "${parentNameOf(editing.parent_id) ?? ''}"`)
              : formParentId
                ? tt(`تحت "${parentNameOf(formParentId) ?? ''}"`, `Under "${parentNameOf(formParentId) ?? ''}"`)
                : undefined
          }
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            setFormParentId(undefined);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label={t('الاسم')}>
              <input name="name" defaultValue={editing?.name} required className="input" placeholder={t('مثال: بنزين')} />
            </Field>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('حفظ')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team links tab — ربط الفنيين بالمشرفين: يحدد أي مشرف "يملك" كل فني، بحيث
// أي موعد يُسند لهذا المشرف يظهر تلقائياً في بوابة الفني لكل فني مرتبط به
// (انظر الفلترة الإضافية في Appointments.tsx و TechnicianPortal.tsx).
// يعيد استخدام نفس PATCH /profiles/:id (supervisor_id) الذي يستخدمه نموذج
// تعديل المستخدم في تبويب "المستخدمون" — فقط بواجهة مخصصة لهذا الغرض.
// ---------------------------------------------------------------------------
function TeamLinksTab() {
  const { t, roleLabel } = useI18n();
  const { refreshProfiles } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  function refresh() {
    api.get<Profile[]>('/profiles').then(setProfiles);
  }
  useEffect(refresh, []);

  const supervisors = profiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicians = profiles.filter((p) => p.role === 'technician');
  const supervisorIds = new Set(supervisors.map((s) => s.id));
  const unlinked = technicians.filter((tech) => !tech.supervisor_id || !supervisorIds.has(tech.supervisor_id));

  async function setSupervisor(techId: string, supervisorId: string) {
    setSavingId(techId);
    try {
      // null (not undefined) — JSON.stringify drops undefined keys
      // entirely, so choosing "بدون تحديد" would never actually reach the
      // server and silently fail to clear the existing link.
      await api.patch(`/profiles/${techId}`, { supervisor_id: supervisorId || null });
      refresh();
      // بدون هذا، بوابة الفني (وأي مكان آخر يعتمد على allProfiles) تبقى
      // ترى الربط القديم حتى إعادة تحميل الصفحة كاملة — نفس سبب مشكلة
      // تنبيه الإجازة الأسبوعية أعلاه.
      refreshProfiles();
    } finally {
      setSavingId(null);
    }
  }

  function TechRow({ tech }: { tech: Profile }) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            {tech.full_name.trim().charAt(0)}
          </div>
          <span className="truncate text-sm font-medium text-slate-700">{tech.full_name}</span>
        </div>
        <select
          value={tech.supervisor_id ?? ''}
          disabled={savingId === tech.id}
          onChange={(e) => setSupervisor(tech.id, e.target.value)}
          className="input w-auto shrink-0 text-xs"
        >
          <option value="">{t('بدون تحديد')}</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name} ({roleLabel(s.role)})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
        {t('اختر لكل فني المشرف الذي يتبع له — أي موعد يُسند لهذا المشرف سيظهر تلقائياً في بوابة الفني لكل فني مرتبط به.')}
      </div>

      {supervisors.map((s) => {
        const team = technicians.filter((tech) => tech.supervisor_id === s.id);
        return (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{s.full_name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{roleLabel(s.role)}</span>
            </div>
            <div className="space-y-1.5">
              {team.map((tech) => (
                <TechRow key={tech.id} tech={tech} />
              ))}
              {team.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                  {t('لا يوجد فنيون مرتبطون بهذا المشرف بعد')}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {supervisors.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
          {t('لا يوجد مشرفون بعد — أضِفهم أولاً من تبويب المستخدمون')}
        </div>
      )}

      {unlinked.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">{t('فنيون بلا مشرف محدد')}</div>
          <div className="space-y-1.5">
            {unlinked.map((tech) => (
              <TechRow key={tech.id} tech={tech} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaves tab — قسمان: (1) أيام الإجازة الأسبوعية الثابتة لكل مشرف ميداني
// وفني — لا تمنع حجز موعد في ذلك اليوم، فقط تُستخدم لاحقاً كتنبيه تأكيدي
// (انظر findDayOffConflicts في src/shared/weekdays.ts). (2) الإجازات
// السنوية — فترة محددة بتاريخين تمنع فعلياً إسناد موعد جديد خلالها (انظر
// findLeaveConflicts في src/shared/leaves.ts). كلاهما تحت صلاحية
// edit_days_off نفسها، ومواضع الاستخدام: NewAppointmentModal
// وAppointmentDetailModal.
// ---------------------------------------------------------------------------
function DaysOffTab() {
  const { t, tt, roleLabel } = useI18n();
  const { user, refreshProfiles } = useAuth();
  const isGeneralManager = user?.role === 'general_manager';
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null);
  const [approvingLeaveId, setApprovingLeaveId] = useState<string | null>(null);
  const [leaveTypeInput, setLeaveTypeInput] = useState<LeaveType>('sick');
  // خيار صريح لكل إجازة — هل تُخصَم من رصيد الـ٢١ يوماً السنوي؟ لا افتراض
  // تلقائي حسب النوع، يبدأ غير محدَّد (false) في كل نموذج جديد.
  const [deductFromBalance, setDeductFromBalance] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [leavePhotoPreview, setLeavePhotoPreview] = useState<string | null>(null);
  const [compressingPhoto, setCompressingPhoto] = useState(false);
  // موعد قائم يتعارض مع فترة إجازة مقترحة (لشخص كان مسنَداً له فعلاً قبل
  // إضافة الإجازة) — يجب إعادة إسناده لشخص آخر قبل الموافقة على الإجازة
  // نفسها. انظر checkConflictsAndProceed أدناه.
  const [conflictAppts, setConflictAppts] = useState<Appointment[] | null>(null);
  const [conflictPerson, setConflictPerson] = useState<Profile | null>(null);
  const [pendingLeavePayload, setPendingLeavePayload] = useState<Record<string, unknown> | null>(null);
  const [reassignments, setReassignments] = useState<Record<string, string>>({});
  const [savingReschedule, setSavingReschedule] = useState(false);

  function refresh() {
    api.get<Profile[]>('/profiles').then(setProfiles);
  }
  function refreshLeaves() {
    api.get<LeaveRecord[]>('/leaves').then(setLeaves);
  }
  function refreshAppointments() {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }
  useEffect(refresh, []);
  useEffect(refreshLeaves, []);
  useEffect(refreshAppointments, []);

  const people = profiles.filter((p) => p.role === 'supervisor' || p.role === 'technician');

  async function toggleDay(person: Profile, dayKey: string) {
    const current = person.weekly_days_off ?? [];
    const next = current.includes(dayKey) ? current.filter((d) => d !== dayKey) : [...current, dayKey];
    setSavingId(person.id);
    try {
      await api.patch(`/profiles/${person.id}`, { weekly_days_off: next });
      refresh();
      // بدون هذا، نافذة حجز موعد جديد المفتوحة بالفعل (أو حتى المفتوحة
      // لاحقاً في نفس الجلسة) تبقى ترى allProfiles القديمة من AuthProvider
      // (تُحمَّل مرة واحدة فقط عند بدء الجلسة)، فلا يظهر تنبيه الإجازة.
      refreshProfiles();
    } finally {
      setSavingId(null);
    }
  }

  // إرسال طلب الإجازة فعلياً — يُستدعى مباشرة لو لم يوجد أي تعارض، أو بعد
  // إتمام إعادة جدولة كل المواعيد المتعارضة (انظر confirmRescheduleAndApprove).
  async function submitLeave(payload: Record<string, unknown>) {
    setSubmittingLeave(true);
    try {
      await api.post('/leaves', payload);
      setShowLeaveForm(false);
      setLeaveTypeInput('sick');
      setDeductFromBalance(false);
      setSelectedProfileId('');
      setLeavePhotoPreview(null);
      refreshLeaves();
    } finally {
      setSubmittingLeave(false);
    }
  }

  async function handleAddLeave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const profileId = form.get('profile_id') as string;
    const start = form.get('start_date') as string;
    const end = form.get('end_date') as string;
    if (end < start) {
      window.alert(t('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء'));
      return;
    }
    if (leaveTypeInput === 'other' && !(form.get('other_type_label') as string)?.trim()) {
      window.alert(t('يجب كتابة نوع الإجازة عند اختيار "أخرى"'));
      return;
    }
    if (leaveTypeInput === 'paid' && !isEligibleForPaidLeave) {
      window.alert(t('لا يحق لهذا الموظف إجازة مدفوعة قبل إتمام ١٢ شهراً من تاريخ التعيين'));
      return;
    }
    const payload = {
      profile_id: profileId,
      leave_type: form.get('leave_type'),
      other_type_label: leaveTypeInput === 'other' ? form.get('other_type_label') : undefined,
      start_date: start,
      end_date: end,
      notes: form.get('notes') || undefined,
      deduct_from_annual_balance: deductFromBalance,
      photo_data_url: leavePhotoPreview || undefined,
    };

    const person = people.find((p) => p.id === profileId);
    const conflicts = person
      ? appointments
          .filter((a) => a.status !== 'cancelled')
          .filter((a) => {
            const d = a.scheduled_at.slice(0, 10);
            return d >= start && d <= end;
          })
          .filter((a) =>
            person.role === 'technician'
              ? a.assignments.some((x) => x.technician_id === person.id)
              : a.supervisor_id === person.id,
          )
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      : [];

    if (conflicts.length > 0) {
      setConflictPerson(person ?? null);
      setConflictAppts(conflicts);
      setPendingLeavePayload(payload);
      setReassignments({});
      return;
    }

    await submitLeave(payload);
  }

  // بعد اختيار بديل لكل موعد متعارض: يعيد إسناد كل موعد لصاحبه الجديد،
  // ثم يُتمّ حفظ الإجازة نفسها (نفس منطق submitLeave).
  async function confirmRescheduleAndApprove() {
    if (!conflictAppts || !conflictPerson || !pendingLeavePayload) return;
    if (conflictAppts.some((a) => !reassignments[a.id])) return;
    setSavingReschedule(true);
    try {
      for (const appt of conflictAppts) {
        const newId = reassignments[appt.id];
        if (conflictPerson.role === 'technician') {
          const newTech = profiles.find((p) => p.id === newId);
          await api.patch(`/appointments/${appt.id}`, {
            assignments: [
              { id: appt.assignments[0]?.id ?? crypto.randomUUID(), technician_id: newId, technician_name: newTech?.full_name },
            ],
          });
        } else {
          await api.patch(`/appointments/${appt.id}`, { supervisor_id: newId });
        }
      }
      await submitLeave(pendingLeavePayload);
      refreshAppointments();
    } finally {
      setSavingReschedule(false);
      setConflictAppts(null);
      setConflictPerson(null);
      setPendingLeavePayload(null);
      setReassignments({});
    }
  }

  async function handleLeavePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingPhoto(true);
    try {
      setLeavePhotoPreview(await compressImageToDataUrl(file));
    } finally {
      setCompressingPhoto(false);
    }
  }

  async function deleteLeave(leave: LeaveRecord) {
    const person = people.find((p) => p.id === leave.profile_id);
    if (
      !window.confirm(
        tt(
          `حذف إجازة ${person?.full_name ?? ''} (${leaveTypeDisplay(leave)}، ${leave.start_date} - ${leave.end_date})؟`,
          `Delete ${person?.full_name ?? ''}'s leave (${leaveTypeDisplay(leave)}, ${leave.start_date} - ${leave.end_date})?`,
        ),
      )
    )
      return;
    setDeletingLeaveId(leave.id);
    try {
      await api.del(`/leaves/${leave.id}`);
      refreshLeaves();
    } finally {
      setDeletingLeaveId(null);
    }
  }

  // المدير العام فقط يوافق على إجازة تجاوزت الرصيد السنوي (pending_gm_
  // approval) — الموافقة لا تغيّر تاريخ/أيام الإجازة نفسها، فقط تُسقِط
  // علامة الانتظار.
  async function approveLeave(leave: LeaveRecord) {
    setApprovingLeaveId(leave.id);
    try {
      await api.patch(`/leaves/${leave.id}`, { pending_gm_approval: false });
      refreshLeaves();
    } finally {
      setApprovingLeaveId(null);
    }
  }

  const currentYear = new Date().getFullYear();

  // أيام هذا العام المخصومة فعلاً من رصيد الموظف (deduct_from_annual_
  // balance فقط) — الأساس المشترك لنموذج الإضافة وجدول الأرصدة أدناه.
  function usedAnnualBalance(profileId: string): number {
    return leaves
      .filter((l) => l.profile_id === profileId && l.deduct_from_annual_balance && l.start_date.slice(0, 4) === String(currentYear))
      .reduce((sum, l) => sum + l.days_count, 0);
  }
  function remainingAnnualBalance(profileId: string): number {
    return ANNUAL_LEAVE_BALANCE_DAYS - usedAnnualBalance(profileId);
  }

  const selectedProfile = people.find((p) => p.id === selectedProfileId);
  // إجازة مدفوعة تحتاج إتمام ١٢ شهراً من تاريخ التعيين — بموجب نظام العمل
  // السعودي. بلا تاريخ تعيين مسجَّل، لا نمنع (لا بيانات كافية للحكم).
  const isEligibleForPaidLeave = (() => {
    if (!selectedProfile?.hire_date) return true;
    const oneYearAfterHire = new Date(selectedProfile.hire_date);
    oneYearAfterHire.setFullYear(oneYearAfterHire.getFullYear() + 1);
    return new Date() >= oneYearAfterHire;
  })();
  const remainingBalanceForSelected = selectedProfileId ? remainingAnnualBalance(selectedProfileId) : ANNUAL_LEAVE_BALANCE_DAYS;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
          {t('حدِّد يوم أو أكثر كإجازة أسبوعية ثابتة لكل مشرف ميداني أو فني. لا يمنع هذا حجز موعد له في ذلك اليوم، لكن يظهر تنبيه تأكيدي عند محاولة ذلك قبل تسجيل الموعد.')}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="p-3 text-start font-medium">{t('الاسم')}</th>
                <th className="p-3 text-start font-medium">{t('المسمى الوظيفي')}</th>
                {WEEKDAYS.map((d) => (
                  <th key={d.key} className="p-3 text-center font-medium">
                    {t(d.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="p-3 font-medium text-slate-700">{p.full_name}</td>
                  <td className="p-3 text-slate-500">{roleLabel(p.role)}</td>
                  {WEEKDAYS.map((d) => (
                    <td key={d.key} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={(p.weekly_days_off ?? []).includes(d.key)}
                        disabled={savingId === p.id}
                        onChange={() => toggleDay(p, d.key)}
                        className="h-4 w-4"
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={2 + WEEKDAYS.length} className="p-8 text-center text-slate-400">
                    {t('لا يوجد مشرفون أو فنيون بعد')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t('الإجازات السنوية')}</h3>
            <p className="text-xs text-slate-400">
              {t('فترة محددة بتاريخين — لا يمكن إسناد موعد جديد لصاحبها خلالها إطلاقاً.')}
            </p>
          </div>
          <button
            onClick={() => setShowLeaveForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> {t('إضافة إجازة')}
          </button>
        </div>

        {showLeaveForm && (
          <form
            onSubmit={handleAddLeave}
            className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('الموظف')}</span>
                <select
                  name="profile_id"
                  required
                  className="input"
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                >
                  <option value="" disabled>
                    {t('اختر موظف')}
                  </option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({roleLabel(p.role)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('نوع الإجازة')}</span>
                <select
                  name="leave_type"
                  required
                  value={leaveTypeInput}
                  onChange={(e) => setLeaveTypeInput(e.target.value as LeaveType)}
                  className="input"
                >
                  {(Object.keys(LEAVE_TYPE_LABELS_AR) as LeaveType[]).map((key) => (
                    <option key={key} value={key}>
                      {t(LEAVE_TYPE_LABELS_AR[key])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {leaveTypeInput === 'other' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('حدِّد نوع الإجازة')}</span>
                <input name="other_type_label" required className="input" />
              </label>
            )}
            {leaveTypeInput === 'paid' && !isEligibleForPaidLeave && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {t('لا يحق لهذا الموظف إجازة مدفوعة قبل إتمام ١٢ شهراً من تاريخ التعيين')}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deductFromBalance}
                onChange={(e) => setDeductFromBalance(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span className="font-medium text-slate-600">{t('خصم من رصيد الإجازة السنوي (٢١ يوماً/سنة)')}</span>
            </label>
            {deductFromBalance && selectedProfileId && (
              <div className={`rounded-lg px-3 py-2 text-xs ${remainingBalanceForSelected <= 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>
                {tt(`المتبقي من رصيده حالياً: ${remainingBalanceForSelected} يوماً`, `Their remaining balance: ${remainingBalanceForSelected} days`)}
                {remainingBalanceForSelected <= 0 &&
                  ' — ' + t('إن تجاوزت هذه الإجازة الرصيد، سيصل تنبيه للمدير العام للموافقة عليها')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('من تاريخ')}</span>
                <input type="date" name="start_date" required className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('إلى تاريخ')}</span>
                <input type="date" name="end_date" required className="input" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('ملاحظات (اختياري)')}</span>
              <input name="notes" className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('صورة مرفقة بالملاحظات (اختياري)')}</span>
              <input type="file" accept="image/*" onChange={handleLeavePhotoChange} className="input" />
              {compressingPhoto && <span className="mt-1 block text-xs text-slate-400">{t('جارِ تجهيز الصورة…')}</span>}
              {leavePhotoPreview && !compressingPhoto && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={leavePhotoPreview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => setLeavePhotoPreview(null)}
                    className="text-xs font-medium text-red-500 hover:underline"
                  >
                    {t('إزالة الصورة')}
                  </button>
                </div>
              )}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submittingLeave}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> {submittingLeave ? t('جارِ الحفظ…') : t('حفظ')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLeaveForm(false);
                  setLeaveTypeInput('sick');
                  setDeductFromBalance(false);
                  setSelectedProfileId('');
                  setLeavePhotoPreview(null);
                }}
                className="text-xs font-medium text-slate-400 hover:text-slate-600"
              >
                {t('إلغاء')}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {people.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
              {t('لا يوجد مشرفون أو فنيون بعد')}
            </div>
          )}
          {people.map((p) => {
            const personLeaves = leaves
              .filter((l) => l.profile_id === p.id)
              .sort((a, b) => b.start_date.localeCompare(a.start_date));
            const daysThisYear = personLeaves
              .filter((l) => l.start_date.slice(0, 4) === String(currentYear))
              .reduce((sum, l) => sum + l.days_count, 0);
            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {p.full_name} <span className="font-normal text-slate-400">({roleLabel(p.role)})</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      {tt(`${daysThisYear} يوم إجازة هذا العام`, `${daysThisYear} leave days this year`)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${remainingAnnualBalance(p.id) < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
                    >
                      {tt(
                        `المتبقي من الرصيد السنوي: ${remainingAnnualBalance(p.id)} من ${ANNUAL_LEAVE_BALANCE_DAYS}`,
                        `Annual balance remaining: ${remainingAnnualBalance(p.id)} of ${ANNUAL_LEAVE_BALANCE_DAYS}`,
                      )}
                    </span>
                  </div>
                </div>
                {personLeaves.length > 0 ? (
                  <div className="space-y-1.5">
                    {personLeaves.map((l) => (
                      <div
                        key={l.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-600">{t(leaveTypeDisplay(l))}</span>
                        <span dir="ltr" className="text-slate-500">
                          {l.start_date} → {l.end_date} ({l.days_count} {t('يوم')})
                        </span>
                        {l.deduct_from_annual_balance && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                            {t('من الرصيد السنوي')}
                          </span>
                        )}
                        {l.pending_gm_approval &&
                          (isGeneralManager ? (
                            <button
                              onClick={() => approveLeave(l)}
                              disabled={approvingLeaveId === l.id}
                              className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                            >
                              {approvingLeaveId === l.id ? t('جارِ الموافقة…') : t('بانتظار موافقتك — اعتماد')}
                            </button>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                              {t('بانتظار موافقة المدير العام')}
                            </span>
                          ))}
                        {l.notes && <span className="truncate text-slate-400">{l.notes}</span>}
                        {l.photo_url && (
                          <a
                            href={l.photo_url}
                            target="_blank"
                            rel="noreferrer"
                            title={t('عرض الصورة المرفقة')}
                            className="shrink-0"
                          >
                            <img src={l.photo_url} alt="" className="h-8 w-8 rounded-md object-cover" />
                          </a>
                        )}
                        <button
                          onClick={() => deleteLeave(l)}
                          disabled={deletingLeaveId === l.id}
                          title={t('حذف الإجازة')}
                          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{t('لا توجد إجازات مسجَّلة له بعد')}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {conflictAppts && conflictPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-2 border-b border-slate-200 bg-amber-50 px-5 py-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <h2 className="text-sm font-bold text-amber-800">
                  {tt(
                    `لدى ${conflictPerson.full_name} ${conflictAppts.length} موعد ضمن فترة الإجازة المقترحة`,
                    `${conflictPerson.full_name} has ${conflictAppts.length} appointment(s) within the proposed leave period`,
                  )}
                </h2>
                <p className="mt-1 text-xs text-amber-700">
                  {t('حدِّد بديلاً لكل موعد أدناه قبل المتابعة والموافقة على الإجازة.')}
                </p>
              </div>
            </div>

            <div className="space-y-2 p-5">
              {conflictAppts.map((a) => {
                const replacementOptions =
                  conflictPerson.role === 'technician'
                    ? profiles.filter((p) => p.role === 'technician' && p.id !== conflictPerson.id)
                    : profiles.filter(
                        (p) => (p.role === 'supervisor' || p.role === 'admin_supervisor') && p.id !== conflictPerson.id,
                      );
                return (
                  <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-700">{a.customer_name_snapshot ?? t('عميل')}</span>
                      <span dir="ltr" className="text-slate-400">
                        {formatDateAr(a.scheduled_at)} · {formatTimeAr(a.scheduled_at)}
                      </span>
                    </div>
                    <select
                      value={reassignments[a.id] ?? ''}
                      onChange={(e) => setReassignments((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      className="input"
                    >
                      <option value="">
                        {conflictPerson.role === 'technician' ? t('-- اختر الفني البديل --') : t('-- اختر المشرف البديل --')}
                      </option>
                      {replacementOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={confirmRescheduleAndApprove}
                disabled={savingReschedule || conflictAppts.some((a) => !reassignments[a.id])}
                className="flex items-center gap-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {savingReschedule ? t('جارِ الحفظ…') : t('متابعة والموافقة على الإجازة')}
              </button>
              <button
                onClick={() => {
                  setConflictAppts(null);
                  setConflictPerson(null);
                  setPendingLeavePayload(null);
                  setReassignments({});
                }}
                className="text-sm font-medium text-slate-400 hover:text-slate-600"
              >
                {t('إلغاء')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing page tab — الإعدادات ← الطلبات الخارجية: تحكم كامل بمحتوى صفحة
// "اطلب الخدمة" العامة (OrderPage.tsx) بلا حاجة لتعديل الكود — الألوان
// ونصوص الهيرو من إعدادات واحدة (LandingPageSettings)، وبطاقات الخدمات
// المعروضة (LandingService، منفصلة عمداً عن دليل الخدمات التشغيلي) بصورة
// ووصف قابلين للتعديل لكل بطاقة. خلف صلاحية edit_landing_page.
// ---------------------------------------------------------------------------
function LandingColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-200 p-0.5"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className="input font-mono"
        />
      </div>
    </label>
  );
}

// دردشة مباشرة — بطاقة كاملة العرض داخل الإعدادات ← الطلبات الخارجية،
// تُغلِّف اللوحة المشتركة LiveChatAdminPanel (نفس اللوحة المستخدَمة داخل
// الأيقونة العائمة الظاهرة في كل صفحات النظام — انظر AdminLiveChatWidget
// في Layout.tsx). بشرية بالكامل عمداً — بلا أي رد آلي، انظر تعليق
// LiveChatThread في shared/types.ts.
function LiveChatSection() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-lg font-bold text-slate-800">
          <LiveChatIcon className="h-4 w-4 text-brand-600" /> {t('الدردشة المباشرة')}
        </h2>
        <p className="text-sm text-slate-400">
          {t('محادثات وصلت من أيقونة الدردشة في صفحة "اطلب الخدمة" العامة — رد بشري يدوي بالكامل، بلا ذكاء اصطناعي. تظهر أيضاً كأيقونة عائمة في كل صفحات النظام للرد السريع')}
        </p>
      </div>
      <LiveChatAdminPanel />
    </div>
  );
}

function LandingPageTab() {
  const { t, tt } = useI18n();
  const [settings, setSettings] = useState<LandingPageSettings>(DEFAULT_LANDING_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [items, setItems] = useState<LandingService[] | null>(null);
  const [editing, setEditing] = useState<LandingService | null>(null);
  const [showForm, setShowForm] = useState(false);
  // ترتيب معرّفات الخدمات الحالي — مرجع متزامن (وليس state) يُستخدَم أثناء
  // السحب والإفلات فقط، مطابقةً لنفس نمط PermissionsTab أدناه. يُحدَّث من
  // items في كل تحميل ومن move()/السحب مباشرةً حتى لا يختلّ لو بدأ المستخدم
  // سحباً جديداً بعد إعادة ترتيب سابقة بلا انتظار استجابة الخادم.
  const orderRef = useRef<string[]>([]);
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [uploadingPopupAd, setUploadingPopupAd] = useState(false);

  function refreshSettings() {
    api.get<LandingPageSettings>('/landing-settings').then(setSettings);
  }

  async function handlePopupAdImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPopupAd(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const { url } = await api.post<{ url: string }>('/landing-images', { data_url: dataUrl });
      setSettings((s) => ({ ...s, popup_ad_image_url: url }));
    } finally {
      setUploadingPopupAd(false);
      e.target.value = '';
    }
  }
  function refreshItems() {
    api.get<LandingService[]>('/landing-services').then((list) => {
      orderRef.current = list.map((s) => s.id);
      setItems(list);
    });
  }
  useEffect(() => {
    refreshSettings();
    refreshItems();
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api.patch('/landing-settings', settings);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleDelete(s: LandingService) {
    if (!window.confirm(tt(`حذف خدمة "${s.title}" من الصفحة الخارجية؟`, `Delete "${s.title}" from the external page?`))) return;
    await api.del(`/landing-services/${s.id}`);
    refreshItems();
  }

  async function toggleActive(s: LandingService) {
    setItems((prev) => prev && prev.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
    await api.patch(`/landing-services/${s.id}`, { is_active: !s.is_active });
  }

  async function move(index: number, dir: -1 | 1) {
    if (!items) return;
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    orderRef.current = next.map((s) => s.id);
    setItems(next);
    await api.patch('/landing-services/reorder', { order: next.map((s) => s.id) });
  }

  // سحب وإفلات بديل لأزرار الأعلى/الأسفل — نفس منطق PermissionsTab
  // بالضبط: إعادة ترتيب items بصرياً بشكل حي أثناء السحب فوق أي بطاقة
  // أخرى، ثم حفظ الترتيب الكامل الجديد بطلب واحد فور الإفلات.
  function handleDragStart(id: string) {
    dragIdRef.current = id;
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>, overId: string) {
    e.preventDefault();
    setDragOverId(overId);
    const draggedId = dragIdRef.current;
    if (!items || !draggedId || draggedId === overId) return;
    const order = orderRef.current;
    const fromIdx = order.indexOf(draggedId);
    const toIdx = order.indexOf(overId);
    if (fromIdx === -1 || toIdx === -1) return;
    const nextOrder = [...order];
    const [moved] = nextOrder.splice(fromIdx, 1);
    nextOrder.splice(toIdx, 0, moved);
    orderRef.current = nextOrder;
    const byId = new Map(items.map((s) => [s.id, s]));
    setItems(nextOrder.map((id) => byId.get(id)!));
  }
  async function handleDrop() {
    dragIdRef.current = null;
    setDragOverId(null);
    await api.patch('/landing-services/reorder', { order: orderRef.current });
  }
  function handleDragEnd() {
    dragIdRef.current = null;
    setDragOverId(null);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{t('الهوية والألوان')}</h2>
            <p className="text-sm text-slate-400">{t('تظهر هذه الألوان والنصوص مباشرة في صفحة "اطلب الخدمة" العامة')}</p>
          </div>
          <a
            href="/order"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" /> {t('معاينة الصفحة')}
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LandingColorField
            label={t('اللون الأساسي (الرأس والأزرار)')}
            value={settings.colors.primary}
            onChange={(v) => setSettings((s) => ({ ...s, colors: { ...s.colors, primary: v } }))}
          />
          <LandingColorField
            label={t('اللون الثانوي')}
            value={settings.colors.secondary}
            onChange={(v) => setSettings((s) => ({ ...s, colors: { ...s.colors, secondary: v } }))}
          />
          <LandingColorField
            label={t('لون الخلفية')}
            value={settings.colors.background}
            onChange={(v) => setSettings((s) => ({ ...s, colors: { ...s.colors, background: v } }))}
          />
          <LandingColorField
            label={t('لون التمييز (أزرار الدعوة للتواصل)')}
            value={settings.colors.accent}
            onChange={(v) => setSettings((s) => ({ ...s, colors: { ...s.colors, accent: v } }))}
          />
        </div>

        <div className="mt-4 grid gap-4">
          <Field label={t('العنوان الرئيسي (الهيرو)')}>
            <input
              value={settings.hero_title}
              onChange={(e) => setSettings((s) => ({ ...s, hero_title: e.target.value }))}
              className="input"
            />
          </Field>
          <Field label={t('الوصف أسفل العنوان الرئيسي')}>
            <textarea
              value={settings.hero_subtitle}
              onChange={(e) => setSettings((s) => ({ ...s, hero_subtitle: e.target.value }))}
              rows={2}
              className="input resize-none"
            />
          </Field>
          <Field label={t('الشعار المختصر (يظهر أعلى الصفحة بجانب الاسم)')}>
            <input
              value={settings.tagline}
              onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))}
              className="input"
            />
          </Field>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span>
              <span className="block text-sm font-medium text-slate-700">{t('شريط التقسيط عبر تابي وتمارا')}</span>
              <span className="block text-xs text-slate-400">
                {t('يظهر أسفل قسم الهيرو مباشرة: "لا تشيل هم الدفع! يمكنك التقسيط عن طريق تابي وتمارا"')}
              </span>
            </span>
            <span className="relative inline-block h-6 w-11 shrink-0">
              <input
                type="checkbox"
                checked={settings.show_installments_banner ?? true}
                onChange={(e) => setSettings((s) => ({ ...s, show_installments_banner: e.target.checked }))}
                className="peer sr-only"
              />
              <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500" />
              <span className="absolute start-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" />
            </span>
          </label>

          {/* الإعلان المنبثق — صورة تظهر وسط الصفحة عند فتحها، بعلامة X
              لإغلاقها في زاويتها (انظر PopupAdModal في OrderPage.tsx). */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="flex cursor-pointer items-center justify-between">
              <span>
                <span className="block text-sm font-medium text-slate-700">{t('الإعلان المنبثق')}</span>
                <span className="block text-xs text-slate-400">{t('صورة إعلانية تظهر في وسط الصفحة عند فتحها، ويمكن للزائر إغلاقها بعلامة X')}</span>
              </span>
              <span className="relative inline-block h-6 w-11 shrink-0">
                <input
                  type="checkbox"
                  checked={settings.popup_ad_enabled ?? false}
                  onChange={(e) => setSettings((s) => ({ ...s, popup_ad_enabled: e.target.checked }))}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500" />
                <span className="absolute start-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" />
              </span>
            </label>
            <div className="mt-3 flex items-center gap-3">
              {settings.popup_ad_image_url && (
                <img src={settings.popup_ad_image_url} alt={t('الإعلان المنبثق')} className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" />
              )}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePopupAdImageChange}
                  className="input file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-600"
                />
                {uploadingPopupAd && <span className="mt-1 block text-xs text-slate-400">{t('جارِ رفع الصورة…')}</span>}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={saveSettings}
          disabled={savingSettings}
          className="mt-4 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {savingSettings ? t('جارِ الحفظ…') : t('حفظ الألوان والنصوص')}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{t('الخدمات المعروضة في الصفحة')}</h2>
            <p className="text-sm text-slate-400">{t('صورة ووصف كل خدمة كما تظهر للعميل، بمعزل عن أسعار الخدمات الفعلية')}</p>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('إضافة خدمة')}
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-400">{t('اسحب أي بطاقة من مقبض السحب لإعادة ترتيبها، أو استخدم سهمي الأعلى والأسفل')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(items ?? []).map((s, idx) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => handleDragStart(s.id)}
              onDragOver={(e) => handleDragOver(e, s.id)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              className={`overflow-hidden rounded-2xl border bg-white transition ${
                dragOverId === s.id ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200'
              }`}
            >
              <div className="flex h-28 items-center justify-center bg-slate-50">
                {s.image_url ? (
                  <img src={s.image_url} alt={s.title} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-slate-300" />
                )}
              </div>
              <div className="p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                  >
                    {s.is_active ? t('معروضة') : t('مخفية')}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <span className="cursor-grab p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing" title={t('اسحب لإعادة الترتيب')}>
                      <DragHandleIcon className="h-3.5 w-3.5" />
                    </span>
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} title={t('تحريك لأعلى')} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => move(idx, 1)} disabled={idx === (items?.length ?? 1) - 1} title={t('تحريك لأسفل')} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-800">{s.title}</div>
                {s.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{s.description}</p>}
                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2.5">
                  <button onClick={() => handleDelete(s)} title={t('حذف')} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => toggleActive(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title={s.is_active ? t('إخفاء من الصفحة') : t('إظهار في الصفحة')}>
                    {s.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(s);
                      setShowForm(true);
                    }}
                    className="mr-auto flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {items && items.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              {t('لا توجد خدمات معروضة بعد')}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <LandingServiceForm
          editing={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            refreshItems();
          }}
        />
      )}

      <LiveChatSection />
    </div>
  );
}

function LandingServiceForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: LandingService | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const { url } = await api.post<{ url: string }>('/landing-images', { data_url: dataUrl });
      setImageUrl(url);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const payload = { title: title.trim(), description: description.trim() || undefined, image_url: imageUrl || undefined };
      if (editing) {
        await api.patch(`/landing-services/${editing.id}`, payload);
      } else {
        await api.post('/landing-services', payload);
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={editing ? t('تعديل الخدمة') : t('إضافة خدمة جديدة')}
      subtitle={t('كما ستظهر بالضبط في صفحة "اطلب الخدمة" العامة')}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('اسم الخدمة *')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={t('مثال: تنظيف شقق وفلل شامل')} className="input" />
        </Field>
        <Field label={t('وصف مختصر للخدمة')}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input resize-none" />
        </Field>
        <Field label={t('صورة الخدمة')} icon={<ImageIcon className="h-3.5 w-3.5 text-brand-500" />}>
          <div className="flex items-center gap-3">
            {imageUrl && <img src={imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50">
              {uploading ? t('جارِ الرفع…') : t('اختر صورة')}
              <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploading} className="hidden" />
            </label>
          </div>
        </Field>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || uploading || !title.trim()}
            className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('إضافة الخدمة')}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium text-slate-400 hover:text-slate-600">
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Mobile app tab — بانر الشاشة الرئيسية ونصوص شاشة الدخول في تطبيق زهى
// للجوال (مشروع React Native منفصل، zaha-mobile). قائمة الخدمات نفسها لا
// تُدار من هنا — التطبيق يقرأها مباشرة من نفس LandingService/landing-services
// المُدارة في تبويب "الطلبات الخارجية" أعلاه، فلا داعي لتكرارها هنا.
// ---------------------------------------------------------------------------
function MobileAppTab() {
  const { t, tt } = useI18n();
  const [settings, setSettings] = useState<MobileAppSettings>(DEFAULT_MOBILE_APP_SETTINGS);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<MobileAppSettings>('/mobile-app-settings').then(setSettings);
  }, []);

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const { url } = await api.post<{ url: string }>('/landing-images', { data_url: dataUrl });
      setSettings((prev) => ({ ...prev, home_banner_image_url: url }));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.patch<MobileAppSettings>('/mobile-app-settings', settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{t('تطبيق الجوال')}</h2>
        <p className="text-sm text-slate-400">
          {t('بانر الشاشة الرئيسية ونصوص شاشة الدخول في تطبيق زهى للجوال — قائمة الخدمات نفسها تُدار من تبويب "الطلبات الخارجية"')}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-800">{t('بانر الشاشة الرئيسية')}</h3>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('صورة البانر (اختياري)')}</span>
            {settings.home_banner_image_url && (
              <img src={settings.home_banner_image_url} alt="" className="mb-2 h-32 w-full rounded-xl object-cover" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={uploading}
              className="input file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-600"
            />
            {uploading && <span className="mt-1 block text-xs text-slate-400">{t('جارِ الرفع…')}</span>}
            {settings.home_banner_image_url && (
              <button
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, home_banner_image_url: undefined }))}
                className="mt-1.5 text-xs font-medium text-red-600 hover:underline"
              >
                {t('إزالة الصورة')}
              </button>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('عنوان البانر (اختياري)')}</span>
            <input
              value={settings.home_banner_title ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, home_banner_title: e.target.value }))}
              className="input"
              placeholder={t('مثال: عرض الشهر — خصم على التنظيف الشامل')}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('وصف البانر (اختياري)')}</span>
            <textarea
              value={settings.home_banner_subtitle ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, home_banner_subtitle: e.target.value }))}
              rows={2}
              className="input resize-none"
            />
          </label>
          <p className="text-xs text-slate-400">{t('اترك العنوان فارغاً لإخفاء البانر بالكامل من الشاشة الرئيسية')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-800">{t('نصوص شاشة تسجيل الدخول')}</h3>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('عنوان الشاشة')}</span>
            <input
              value={settings.login_title ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, login_title: e.target.value }))}
              className="input"
              placeholder={t('ابدأ الآن')}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('الوصف')}</span>
            <input
              value={settings.login_subtitle ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, login_subtitle: e.target.value }))}
              className="input"
              placeholder={tt('اكتب جوالك عشان تسجّل الدخول', 'e.g. Enter your phone to sign in')}
            />
          </label>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? t('جارِ الحفظ…') : saved ? t('تم الحفظ ✓') : t('حفظ')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Translations tab — صفحة الإعدادات ← الترجمة: كل كلمة عربية تُستخدَم في
// الموقع (اتحاد مفاتيح قواميس translations.ts الثابتة الثلاثة — AR_TO_EN
// بصفتها الأشمل — بالإضافة لأي كلمة أُضيف لها تعديل يدوي فقط)، مقابلها
// خانة نص لكل لغة يُعدَّل عليها هنا مباشرة (PATCH /translations، دمج فوري
// عند كل خروج من الخانة). أي كلمة جديدة يُستحدثها تحديث لاحق للنظام تظهر
// هنا تلقائياً بخانات فارغة بانتظار ترجمتها، دون أي إعداد إضافي. لغات
// إضافية (بعد الأربع الأساسية) تُدار من نفس الصفحة عبر translationLanguages
// (PATCH /translations/languages) — عمود جديد فوراً، لكن تفعيلها الفعلي في
// مُبدِّل اللغة (TopBar.tsx/Login.tsx) يبقى تعديلاً برمجياً منفصلاً وصغيراً.
// ---------------------------------------------------------------------------
const BUILT_IN_TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: 'en', label: 'الإنجليزية' },
  { code: 'ur', label: 'الأردية' },
  { code: 'bn', label: 'البنغالية' },
];

function staticTranslationValue(ar: string, code: string): string {
  if (code === 'en') return AR_TO_EN[ar] ?? '';
  if (code === 'bn') return AR_TO_BN[ar] ?? '';
  if (code === 'ur') return AR_TO_UR[ar] ?? '';
  return '';
}

function TranslationsTab() {
  const { t } = useI18n();
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>> | null>(null);
  const [extraLanguages, setExtraLanguages] = useState<TranslationLanguage[]>([]);
  const [search, setSearch] = useState('');
  const [showAddLang, setShowAddLang] = useState(false);

  function refresh() {
    api
      .get<{ overrides: { ar: string; values: Record<string, string> }[]; languages: TranslationLanguage[] }>('/translations')
      .then((data) => {
        const map: Record<string, Record<string, string>> = {};
        for (const row of data.overrides) map[row.ar] = row.values;
        setOverrides(map);
        setExtraLanguages(data.languages);
      });
  }
  useEffect(refresh, []);

  const languages = [...BUILT_IN_TRANSLATION_LANGUAGES, ...extraLanguages];

  // القائمة الكاملة بالكلمات العربية — مرتَّبة أبجدياً (عربي) لتسهيل
  // التصفح، مع بحث نصي حي بدل أي تجميع حسب الصفحة (خارج نطاق هذه النسخة).
  const allWords = useMemo(() => {
    const set = new Set<string>([...Object.keys(AR_TO_EN), ...Object.keys(AR_TO_BN), ...Object.keys(AR_TO_UR), ...Object.keys(overrides ?? {})]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [overrides]);

  function cellValue(ar: string, code: string): string {
    return overrides?.[ar]?.[code] ?? staticTranslationValue(ar, code);
  }

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return allWords;
    const qLower = q.toLowerCase();
    return allWords.filter((ar) => {
      if (ar.includes(q)) return true;
      return languages.some((l) => cellValue(ar, l.code).toLowerCase().includes(qLower));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWords, search, overrides, extraLanguages]);

  async function saveCell(ar: string, code: string, value: string) {
    setOverrides((prev) => ({ ...prev, [ar]: { ...prev?.[ar], [code]: value } }));
    await api.patch('/translations', { ar, values: { [code]: value } });
  }

  async function addLanguage(code: string, label: string) {
    const next = [...extraLanguages, { code, label }];
    setExtraLanguages(next);
    await api.patch('/translations/languages', { languages: next });
    setShowAddLang(false);
  }

  async function removeLanguage(code: string) {
    if (!confirm(t('حذف هذه اللغة؟ ستبقى الترجمات المحفوظة لها دون عرض، ويمكن استرجاعها بإضافتها مرة أخرى بنفس الرمز.'))) return;
    const next = extraLanguages.filter((l) => l.code !== code);
    setExtraLanguages(next);
    await api.patch('/translations/languages', { languages: next });
  }

  if (!overrides) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">{t('جارِ التحميل…')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
        {t(
          'كل كلمة عربية تظهر في الموقع، مقابلها ترجمتها الحالية بكل لغة — عدِّل أي خانة واضغط خارجها لحفظها فوراً. الكلمات الجديدة التي تُستحدَث مستقبلاً بتحديثات النظام تظهر هنا تلقائياً بخانات فارغة (بخلفية صفراء) بانتظار ترجمتها.',
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ابحث عن كلمة أو ترجمة...')}
            className="input pr-9"
          />
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {t('عدد الكلمات:')} {filtered.length}
          </span>
          <button
            onClick={() => setShowAddLang(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t('إضافة لغة')}
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="sticky right-0 z-10 bg-white p-3 text-start font-medium">{t('العربي')}</th>
              {languages.map((l) => (
                <th key={l.code} className="p-3 text-start font-medium">
                  <div className="flex items-center gap-1.5">
                    {l.label}
                    {!BUILT_IN_TRANSLATION_LANGUAGES.some((k) => k.code === l.code) && (
                      <button onClick={() => removeLanguage(l.code)} className="text-slate-300 hover:text-red-500" title={t('حذف هذه اللغة')}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((ar) => (
              <tr key={ar} className="border-b border-slate-50 last:border-0 align-top">
                <td className="sticky right-0 z-10 max-w-[260px] bg-white p-3 font-medium text-slate-700">{ar}</td>
                {languages.map((l) => {
                  const value = cellValue(ar, l.code);
                  const isMissing = !value;
                  return (
                    <td key={l.code} className="p-2">
                      <input
                        key={`${ar}-${l.code}-${value}`}
                        defaultValue={value}
                        onBlur={(e) => {
                          const next = e.target.value;
                          if (next !== value) saveCell(ar, l.code, next);
                        }}
                        placeholder={t('بلا ترجمة بعد')}
                        dir={l.code === 'ur' ? 'rtl' : 'ltr'}
                        className={`w-full min-w-[180px] rounded-lg border px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none ${
                          isMissing ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200'
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddLang && <AddLanguageModal onClose={() => setShowAddLang(false)} onAdd={addLanguage} />}
    </div>
  );
}

function AddLanguageModal({ onClose, onAdd }: { onClose: () => void; onAdd: (code: string, label: string) => Promise<void> }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim() || !label.trim()) return;
    setSubmitting(true);
    try {
      await onAdd(code.trim().toLowerCase(), label.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-800">{t('إضافة لغة جديدة')}</h2>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('اسم اللغة (بالعربي)')}</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} required className="input" placeholder={t('مثال: الفرنسية')} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('رمز اللغة')}</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required className="input" placeholder="fr" dir="ltr" />
          </label>
          <p className="text-xs text-slate-400">
            {t('رمز قصير مميّز (حرفان عادة، مثل en أو fr) يُستخدم داخلياً فقط — تفعيل اللغة فعلياً في مُبدِّل اللغة يحتاج خطوة برمجية بسيطة منفصلة.')}
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الإضافة…') : t('إضافة اللغة')}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vehicles tab — صفحة الإعدادات ← المركبات: سجل بيانات مركبات الشركة
// (استمارة، لوحة، تأمين، فحص دوري، من يقودها، والمشرف التابعة له). لا
// علاقة له بجدولة المواعيد أو تتبّع الموقع — بيانات ثابتة/شبه ثابتة فقط.
// ---------------------------------------------------------------------------
function vehicleExpiryClass(dateStr?: string): string {
  if (!dateStr) return 'text-slate-400';
  const diffDays = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'font-semibold text-red-600';
  if (diffDays <= 30) return 'font-semibold text-amber-600';
  return 'text-slate-700';
}

function VehiclesTab() {
  const { t, tt, roleLabel } = useI18n();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingVehicle, setViewingVehicle] = useState<Vehicle | null>(null);
  // مُتحكَّم به (لا defaultValue) لأن الحقول التالية له تتغيّر حسب قيمته —
  // "ملكية الشركة" لا تحتاج أي حقل إضافي (المالك يُضبَط تلقائياً)،
  // "مستأجرة" تُظهر حقول عقد الإيجار، و"أقساط" تُظهر حقول التمويل.
  const [ownershipType, setOwnershipType] = useState<VehicleOwnershipType | ''>('');
  const [registrationPhotoFile, setRegistrationPhotoFile] = useState<File | null>(null);
  const [removeRegistrationPhoto, setRemoveRegistrationPhoto] = useState(false);

  function refresh() {
    api.get<Vehicle[]>('/vehicles').then(setVehicles);
    api.get<Profile[]>('/profiles').then(setProfiles);
    // كل مصروفات النظام — تُفلتَر محلياً حسب vehicle_id عند عرض تفاصيل
    // مركبة بعينها (انظر VehicleDetailModal أدناه)، بدل نقطة API منفصلة
    // لكل مركبة.
    api.get<Expense[]>('/expenses').then(setExpenses);
  }
  useEffect(refresh, []);

  // أي موظف (فني، مشرف ميداني، أو أي دور آخر) — وليس المشرفين فقط.
  const assigneeName = (id?: string) => (id ? profiles.find((p) => p.id === id)?.full_name : undefined);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const registration_photo_data_url = registrationPhotoFile ? await compressImageToDataUrl(registrationPhotoFile) : undefined;
    const payload = {
      // "النوع" لم يعد حقلاً يُكتَب هنا — الخادم يشتقّه تلقائياً من شركة
      // الصنع/الطراز/الموديل (composeVehicleType في api.ts).
      manufacturer: form.get('manufacturer') || undefined,
      model_trim: form.get('model_trim') || undefined,
      model_year: form.get('model_year') || undefined,
      vehicle_class: form.get('vehicle_class') || undefined,
      registration_number: form.get('registration_number') || undefined,
      registration_photo_data_url,
      remove_registration_photo: !registrationPhotoFile && removeRegistrationPhoto ? true : undefined,
      // حقل "المالك" مُعطَّل (disabled) عند "ملكية الشركة" فلا يُرسَل ضمن
      // FormData إطلاقاً — القيمة الثابتة تُضبَط هنا مباشرة بدل الاعتماد
      // على حقل نموذج فعلي.
      owner: ownershipType === 'company' ? COMPANY_LEGAL_NAME : form.get('owner') || undefined,
      plate_number: form.get('plate_number'),
      serial_number: form.get('serial_number') || undefined,
      registration_expiry: form.get('registration_expiry') || undefined,
      inspection_expiry: form.get('inspection_expiry') || undefined,
      insurance_expiry: form.get('insurance_expiry') || undefined,
      authorized_driver: form.get('authorized_driver') || undefined,
      assigned_profile_id: form.get('assigned_profile_id') || undefined,
      ownership_type: ownershipType || undefined,
      rental_company_name: ownershipType === 'rented' ? form.get('rental_company_name') || undefined : undefined,
      rental_contract_duration: ownershipType === 'rented' ? form.get('rental_contract_duration') || undefined : undefined,
      rental_contract_value: ownershipType === 'rented' ? form.get('rental_contract_value') || undefined : undefined,
      rental_contract_start_date: ownershipType === 'rented' ? form.get('rental_contract_start_date') || undefined : undefined,
      rental_contract_end_date: ownershipType === 'rented' ? form.get('rental_contract_end_date') || undefined : undefined,
      rental_amount: ownershipType === 'rented' ? form.get('rental_amount') || undefined : undefined,
      rental_amount_frequency: ownershipType === 'rented' ? form.get('rental_amount_frequency') || undefined : undefined,
      finance_provider: ownershipType === 'installments' ? form.get('finance_provider') || undefined : undefined,
      installment_duration: ownershipType === 'installments' ? form.get('installment_duration') || undefined : undefined,
      installment_count: ownershipType === 'installments' ? form.get('installment_count') || undefined : undefined,
      installment_monthly_amount: ownershipType === 'installments' ? form.get('installment_monthly_amount') || undefined : undefined,
      installments_remaining_count: ownershipType === 'installments' ? form.get('installments_remaining_count') || undefined : undefined,
      installments_remaining_amount: ownershipType === 'installments' ? form.get('installments_remaining_amount') || undefined : undefined,
      final_payment_amount: ownershipType === 'installments' ? form.get('final_payment_amount') || undefined : undefined,
      last_oil_change: form.get('last_oil_change') || undefined,
      last_oil_change_odometer: form.get('last_oil_change_odometer') || undefined,
    };
    try {
      if (editing) {
        await api.patch(`/vehicles/${editing.id}`, payload);
      } else {
        await api.post('/vehicles', payload);
      }
      setShowForm(false);
      setEditing(null);
      setRegistrationPhotoFile(null);
      setRemoveRegistrationPhoto(false);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(v: Vehicle) {
    if (!window.confirm(tt(`حذف مركبة "${v.type}" (${v.plate_number})؟ لا يمكن التراجع عن هذا الإجراء.`, `Delete vehicle "${v.type}" (${v.plate_number})? This action cannot be undone.`)))
      return;
    await api.del(`/vehicles/${v.id}`);
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{t('بيانات مركبات الشركة: الاستمارة، اللوحة، التأمين، الفحص الدوري، ومن يقودها')}</p>
        <button
          onClick={() => {
            setEditing(null);
            setOwnershipType('');
            setRegistrationPhotoFile(null);
            setRemoveRegistrationPhoto(false);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('مركبة جديدة')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('النوع')}</th>
              <th className="p-3 text-start font-medium">{t('رقم اللوحة')}</th>
              <th className="p-3 text-start font-medium">{t('المالك')}</th>
              <th className="p-3 text-start font-medium">{t('تابعة لـ')}</th>
              <th className="p-3 text-start font-medium">{t('نوع التملك')}</th>
              <th className="p-3 text-start font-medium">{t('انتهاء الاستمارة')}</th>
              <th className="p-3 text-start font-medium">{t('انتهاء الفحص الدوري')}</th>
              <th className="p-3 text-start font-medium">{t('انتهاء التأمين')}</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium text-slate-700">{v.type}</td>
                <td className="p-3 text-slate-700" dir="ltr">{v.plate_number}</td>
                <td className="p-3 text-slate-600">{v.owner || '—'}</td>
                <td className="p-3 text-slate-600">{assigneeName(v.assigned_profile_id) || '—'}</td>
                <td className="p-3 text-slate-600">{v.ownership_type ? t(VEHICLE_OWNERSHIP_TYPE_LABELS_AR[v.ownership_type]) : '—'}</td>
                <td className={`p-3 ${vehicleExpiryClass(v.registration_expiry)}`} dir="ltr">{v.registration_expiry || '—'}</td>
                <td className={`p-3 ${vehicleExpiryClass(v.inspection_expiry)}`} dir="ltr">{v.inspection_expiry || '—'}</td>
                <td className={`p-3 ${vehicleExpiryClass(v.insurance_expiry)}`} dir="ltr">{v.insurance_expiry || '—'}</td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setViewingVehicle(v)} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline">
                      <Eye className="h-3.5 w-3.5" /> {t('التفاصيل')}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(v);
                        setOwnershipType(v.ownership_type ?? '');
                        setRegistrationPhotoFile(null);
                        setRemoveRegistrationPhoto(false);
                        setShowForm(true);
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                    </button>
                    <button onClick={() => handleDelete(v)} className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline">
                      <Trash2 className="h-3.5 w-3.5" /> {t('حذف')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  {t('لا توجد مركبات مسجَّلة بعد')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editing ? tt(`تعديل مركبة "${editing.type}"`, `Edit vehicle "${editing.type}"`) : t('مركبة جديدة')}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            setOwnershipType('');
            setRegistrationPhotoFile(null);
            setRemoveRegistrationPhoto(false);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('شركة الصنع')}>
                <input name="manufacturer" defaultValue={editing?.manufacturer} required className="input" placeholder={t('مثال: تويوتا')} />
              </Field>
              <Field label={t('رقم اللوحة')}>
                <input name="plate_number" defaultValue={editing?.plate_number} required className="input" dir="ltr" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('طراز المركبة')}>
                <input name="model_trim" defaultValue={editing?.model_trim} className="input" placeholder={t('مثال: هايلكس')} />
              </Field>
              <Field label={t('موديل')}>
                <input name="model_year" defaultValue={editing?.model_year} className="input" dir="ltr" placeholder={t('مثال: ٢٠٢٣')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('فئة المركبة')}>
                <input name="vehicle_class" defaultValue={editing?.vehicle_class} className="input" placeholder={t('مثال: بيك أب')} />
              </Field>
              <Field label={t('رقم الاستمارة')}>
                <input name="registration_number" defaultValue={editing?.registration_number} className="input" dir="ltr" />
              </Field>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('صورة الاستمارة (اختياري)')}</span>
              {editing?.registration_photo_url && !removeRegistrationPhoto && !registrationPhotoFile && (
                <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                  <img src={editing.registration_photo_url} alt={t('صورة الاستمارة')} className="h-10 w-10 shrink-0 rounded object-cover" />
                  <span className="flex-1 truncate text-slate-600">{t('صورة مرفقة حالياً')}</span>
                  <button
                    type="button"
                    onClick={() => setRemoveRegistrationPhoto(true)}
                    className="shrink-0 font-medium text-red-600 hover:underline"
                  >
                    {t('إزالة')}
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setRegistrationPhotoFile(e.target.files?.[0] ?? null);
                  setRemoveRegistrationPhoto(false);
                }}
                className="input file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-600"
              />
              {registrationPhotoFile && (
                <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Paperclip className="h-3 w-3" /> {registrationPhotoFile.name}
                </span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('المالك')}>
                {ownershipType === 'company' ? (
                  <input value={COMPANY_LEGAL_NAME} disabled className="input bg-slate-50 text-slate-500" />
                ) : (
                  <input name="owner" defaultValue={editing?.owner} className="input" />
                )}
              </Field>
              <Field label={t('الرقم التسلسلي')}>
                <input name="serial_number" defaultValue={editing?.serial_number} className="input" dir="ltr" placeholder={t('رقم الهيكل (VIN)')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('تاريخ انتهاء الاستمارة')}>
                <input type="date" name="registration_expiry" defaultValue={editing?.registration_expiry} className="input" />
              </Field>
              <Field label={t('تاريخ انتهاء الفحص الدوري')}>
                <input type="date" name="inspection_expiry" defaultValue={editing?.inspection_expiry} className="input" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('تاريخ انتهاء التأمين')}>
                <input type="date" name="insurance_expiry" defaultValue={editing?.insurance_expiry} className="input" />
              </Field>
              <Field label={t('نوع التملك')}>
                <select
                  value={ownershipType}
                  onChange={(e) => setOwnershipType(e.target.value as VehicleOwnershipType | '')}
                  className="input"
                >
                  <option value="">{t('بدون تحديد')}</option>
                  {(Object.keys(VEHICLE_OWNERSHIP_TYPE_LABELS_AR) as VehicleOwnershipType[]).map((k) => (
                    <option key={k} value={k}>
                      {t(VEHICLE_OWNERSHIP_TYPE_LABELS_AR[k])}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* مستأجرة — عقد الإيجار */}
            {ownershipType === 'rented' && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                <Field label={t('اسم الشركة المؤجرة')}>
                  <input name="rental_company_name" defaultValue={editing?.rental_company_name} required className="input" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('مدة العقد')}>
                    <input
                      name="rental_contract_duration"
                      defaultValue={editing?.rental_contract_duration}
                      className="input"
                      placeholder={t('مثال: سنة واحدة')}
                    />
                  </Field>
                  <Field label={t('قيمة العقد (ر.س)')}>
                    <input type="number" name="rental_contract_value" defaultValue={editing?.rental_contract_value} min={0} step="0.01" className="input" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('تاريخ بداية العقد')}>
                    <input type="date" name="rental_contract_start_date" defaultValue={editing?.rental_contract_start_date} className="input" />
                  </Field>
                  <Field label={t('تاريخ نهاية العقد')}>
                    <input type="date" name="rental_contract_end_date" defaultValue={editing?.rental_contract_end_date} className="input" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('مبلغ الإيجار (ر.س)')}>
                    <input type="number" name="rental_amount" defaultValue={editing?.rental_amount} min={0} step="0.01" className="input" />
                  </Field>
                  <Field label={t('دورية الإيجار')}>
                    <select name="rental_amount_frequency" defaultValue={editing?.rental_amount_frequency ?? ''} className="input">
                      <option value="">{t('بدون تحديد')}</option>
                      {(Object.keys(VEHICLE_RENTAL_FREQUENCY_LABELS_AR) as VehicleRentalFrequency[]).map((k) => (
                        <option key={k} value={k}>
                          {t(VEHICLE_RENTAL_FREQUENCY_LABELS_AR[k])}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {/* أقساط — التمويل */}
            {ownershipType === 'installments' && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                <Field label={t('الجهة التمويلية')}>
                  <input name="finance_provider" defaultValue={editing?.finance_provider} required className="input" placeholder={t('اسم البنك / شركة التمويل')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('مدة الأقساط')}>
                    <input name="installment_duration" defaultValue={editing?.installment_duration} className="input" placeholder={t('مثال: ٣ سنوات')} />
                  </Field>
                  <Field label={t('عدد الأقساط')}>
                    <input type="number" name="installment_count" defaultValue={editing?.installment_count} min={0} step="1" className="input" />
                  </Field>
                </div>
                <Field label={t('قيمة القسط الشهري (ر.س)')}>
                  <input type="number" name="installment_monthly_amount" defaultValue={editing?.installment_monthly_amount} min={0} step="0.01" className="input" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('الأقساط المتبقية (عدد)')}>
                    <input
                      type="number"
                      name="installments_remaining_count"
                      defaultValue={editing?.installments_remaining_count}
                      min={0}
                      step="1"
                      className="input"
                    />
                  </Field>
                  <Field label={t('إجمالي المبلغ المتبقي (ر.س)')}>
                    <input
                      type="number"
                      name="installments_remaining_amount"
                      defaultValue={editing?.installments_remaining_amount}
                      min={0}
                      step="0.01"
                      className="input"
                    />
                  </Field>
                </div>
                <Field label={t('قيمة الدفعة الأخيرة (ر.س)')}>
                  <input type="number" name="final_payment_amount" defaultValue={editing?.final_payment_amount} min={0} step="0.01" className="input" />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('تاريخ آخر تغيير زيت')}>
                <input type="date" name="last_oil_change" defaultValue={editing?.last_oil_change} className="input" />
              </Field>
              <Field label={t('العداد وقت تغيير الزيت')}>
                <input
                  type="number"
                  name="last_oil_change_odometer"
                  defaultValue={editing?.last_oil_change_odometer}
                  className="input"
                  dir="ltr"
                  min={0}
                  placeholder={t('بالكيلومتر')}
                />
              </Field>
            </div>
            <Field label={t('الشخص المفوَّض بالقيادة')}>
              <input name="authorized_driver" defaultValue={editing?.authorized_driver} className="input" />
            </Field>
            <Field label={t('تابعة لـ')}>
              <select name="assigned_profile_id" defaultValue={editing?.assigned_profile_id ?? ''} className="input">
                <option value="">{t('بدون تحديد')}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} — {roleLabel(p.role)}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('حفظ المركبة')}
            </button>
          </form>
        </Modal>
      )}

      {viewingVehicle && (
        <VehicleDetailModal vehicle={viewingVehicle} expenses={expenses} onClose={() => setViewingVehicle(null)} />
      )}
    </div>
  );
}

// تفاصيل مركبة — كل المصروفات المرتبطة بها (Expense.vehicle_id، تُسجَّل من
// نموذج إضافة مصروف عام عند اختيار تصنيف "مركبات") مجمَّعة في مكان واحد،
// مع إجماليها. عرض فقط، بلا تعديل — التعديل يبقى من نفس صفحة المصروفات.
function VehicleDetailModal({ vehicle, expenses, onClose }: { vehicle: Vehicle; expenses: Expense[]; onClose: () => void }) {
  const { t, tt } = useI18n();
  const linked = expenses
    .filter((e) => e.vehicle_id === vehicle.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = linked.reduce((s, e) => s + (e.entry_type === 'income' ? -e.amount : e.amount), 0);

  return (
    <Modal title={tt(`مصروفات مركبة "${vehicle.type}" (${vehicle.plate_number})`, `Expenses for "${vehicle.type}" (${vehicle.plate_number})`)} onClose={onClose}>
      {(vehicle.manufacturer || vehicle.model_trim || vehicle.model_year || vehicle.vehicle_class) && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
          {vehicle.manufacturer && (
            <div>
              <div className="text-[11px] text-slate-400">{t('شركة الصنع')}</div>
              <div className="font-medium text-slate-700">{vehicle.manufacturer}</div>
            </div>
          )}
          {vehicle.model_trim && (
            <div>
              <div className="text-[11px] text-slate-400">{t('طراز المركبة')}</div>
              <div className="font-medium text-slate-700">{vehicle.model_trim}</div>
            </div>
          )}
          {vehicle.model_year && (
            <div>
              <div className="text-[11px] text-slate-400">{t('موديل')}</div>
              <div className="font-medium text-slate-700" dir="ltr">{vehicle.model_year}</div>
            </div>
          )}
          {vehicle.vehicle_class && (
            <div>
              <div className="text-[11px] text-slate-400">{t('فئة المركبة')}</div>
              <div className="font-medium text-slate-700">{vehicle.vehicle_class}</div>
            </div>
          )}
        </div>
      )}
      {vehicle.registration_photo_url && (
        <a href={vehicle.registration_photo_url} target="_blank" rel="noreferrer" className="mb-3 block">
          <img
            src={vehicle.registration_photo_url}
            alt={t('صورة الاستمارة')}
            className="h-40 w-full rounded-xl border border-slate-200 object-cover"
          />
        </a>
      )}
      {vehicle.ownership_type === 'rented' && (
        <div className="mb-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
          <h3 className="mb-1 text-xs font-semibold text-slate-500">{t(VEHICLE_OWNERSHIP_TYPE_LABELS_AR.rented)}</h3>
          {vehicle.rental_company_name && <div>{t('اسم الشركة المؤجرة')}: {vehicle.rental_company_name}</div>}
          {vehicle.rental_contract_duration && <div>{t('مدة العقد')}: {vehicle.rental_contract_duration}</div>}
          {(vehicle.rental_contract_start_date || vehicle.rental_contract_end_date) && (
            <div dir="ltr">
              {t('العقد')}: {vehicle.rental_contract_start_date || '—'} → {vehicle.rental_contract_end_date || '—'}
            </div>
          )}
          {vehicle.rental_contract_value != null && <div>{t('قيمة العقد (ر.س)')}: {formatMoney(vehicle.rental_contract_value)}</div>}
          {vehicle.rental_amount != null && (
            <div>
              {t('مبلغ الإيجار')}: {formatMoney(vehicle.rental_amount)}
              {vehicle.rental_amount_frequency && ` (${t(VEHICLE_RENTAL_FREQUENCY_LABELS_AR[vehicle.rental_amount_frequency])})`}
            </div>
          )}
        </div>
      )}
      {vehicle.ownership_type === 'installments' && (
        <div className="mb-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
          <h3 className="mb-1 text-xs font-semibold text-slate-500">{t(VEHICLE_OWNERSHIP_TYPE_LABELS_AR.installments)}</h3>
          {vehicle.finance_provider && <div>{t('الجهة التمويلية')}: {vehicle.finance_provider}</div>}
          {vehicle.installment_duration && <div>{t('مدة الأقساط')}: {vehicle.installment_duration}</div>}
          {vehicle.installment_count != null && vehicle.installment_monthly_amount != null && (
            <div>
              {tt(
                `${vehicle.installment_count} قسطاً — بواقع ${formatMoney(vehicle.installment_monthly_amount)} شهرياً`,
                `${vehicle.installment_count} installments — ${formatMoney(vehicle.installment_monthly_amount)}/month`,
              )}
            </div>
          )}
          {vehicle.installments_remaining_count != null && vehicle.installments_remaining_amount != null && (
            <div className="font-medium text-amber-700">
              {tt(
                `متبقٍ ${vehicle.installments_remaining_count} قسطاً — بإجمالي ${formatMoney(vehicle.installments_remaining_amount)}`,
                `${vehicle.installments_remaining_count} installments remaining — totaling ${formatMoney(vehicle.installments_remaining_amount)}`,
              )}
            </div>
          )}
          {vehicle.final_payment_amount != null && <div>{t('قيمة الدفعة الأخيرة (ر.س)')}: {formatMoney(vehicle.final_payment_amount)}</div>}
        </div>
      )}
      <div className="mb-3 rounded-xl bg-slate-50 p-3 text-center">
        <div className="text-xs text-slate-400">{t('إجمالي المصروفات')}</div>
        <div className="text-lg font-bold text-slate-800">{formatMoney(total)}</div>
      </div>
      {linked.length > 0 ? (
        <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto">
          {linked.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                <div className="font-medium text-slate-700">{e.title}</div>
                <div className="text-xs text-slate-400">
                  {e.date} — {e.category}
                  {e.sub_category ? ` — ${e.sub_category}` : ''}
                </div>
              </div>
              <span className={`text-sm font-semibold ${e.entry_type === 'income' ? 'text-emerald-600' : 'text-slate-700'}`}>
                {formatMoney(e.amount)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-slate-400">{t('لا توجد مصروفات مرتبطة بهذه المركبة بعد')}</p>
      )}
    </Modal>
  );
}

// يحاول استخراج إحداثيات (خط العرض، خط الطول) من رابط خرائط جوجل كامل —
// !3d/!4d أولاً (موقع العلامة الدقيق — يظهر حتى في روابط "مكان" التي لا
// تحمل @lat,lng إطلاقاً)، ثم @lat,lng (مركز نافذة العرض، أقل دقة)، ثم
// q=/ll=. روابط جوجل المختصرة (goo.gl/maps، maps.app.goo.gl) لا تحمل
// إحداثيات قابلة للقراءة مباشرة من الرابط نفسه — ترجع null هنا، لكن
// FacilityLocationMap أدناه ما زال يحاول معاينة تقريبية من العنوان.
function parseLatLngFromUrl(url: string): [number, number] | null {
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

// معاينة موقع المرفق: خريطة مصغَّرة (Leaflet، غير تفاعلية)، والنقر عليها
// يفتح رابط خرائط جوجل الأصلي كاملاً — "التوسعة" التي طلبها المستخدم.
// الإحداثيات: من الرابط نفسه إن أمكن (الأدق)، وإلا تُقدَّر تقريبياً من
// عنوان المرفق (عادة اسم حيّ) عبر بحث Nominatim مرة واحدة فقط لكل عنوان
// جديد — محفوظة بعدها في district-geocodes (نفس الذاكرة المؤقتة المشتركة
// التي تستخدمها "الخريطة الحرارية" في صفحة العملاء، انظر
// CustomerHeatMapTab.tsx) فلا يُعاد البحث لاحقاً. لو تعذَّر كل ذلك يُعرَض
// رابط عادي فقط بلا معاينة.
function FacilityLocationMap({ locationUrl, address }: { locationUrl: string; address?: string }) {
  const { t } = useI18n();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [coords, setCoords] = useState<[number, number] | null>(() => parseLatLngFromUrl(locationUrl));
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const direct = parseLatLngFromUrl(locationUrl);
    if (direct) {
      setCoords(direct);
      return;
    }
    const district = address?.trim();
    if (!district) {
      setCoords(null);
      return;
    }
    let cancelled = false;
    async function resolveApprox() {
      setResolving(true);
      try {
        const cached = await api.get<DistrictGeocode[]>('/district-geocodes');
        const hit = cached.find((g) => g.district === district);
        if (hit) {
          if (!cancelled) setCoords([hit.lat, hit.lng]);
          return;
        }
        const q = encodeURIComponent(`${district}, الرياض, السعودية`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`);
        const data: { lat: string; lon: string }[] = await res.json();
        if (data[0] && !cancelled) {
          const lat = Number(data[0].lat);
          const lng = Number(data[0].lon);
          setCoords([lat, lng]);
          api.post('/district-geocodes', { district, lat, lng }).catch(() => {});
        }
      } catch {
        // تعذَّر تحديد موقع تقريبي — يبقى بلا معاينة، رابط عادي فقط أدناه.
      } finally {
        if (!cancelled) setResolving(false);
      }
    }
    resolveApprox();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationUrl, address]);

  useEffect(() => {
    if (!coords || !mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
      attributionControl: false,
    }).setView(coords, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.marker(coords).addTo(map);
    mapInstance.current = map;
    map.whenReady(() => map.invalidateSize());
    return () => {
      map.remove();
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  if (!coords) {
    return resolving ? (
      <p className="text-xs text-slate-400">{t('جارِ تحديد الموقع تقريبياً…')}</p>
    ) : (
      <a href={locationUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <MapIcon className="h-4 w-4" /> {t('فتح الموقع في خرائط جوجل')}
      </a>
    );
  }

  return (
    <a
      href={locationUrl}
      target="_blank"
      rel="noreferrer"
      title={t('توسيع في خرائط جوجل')}
      className="group relative block h-40 w-full overflow-hidden rounded-xl border border-slate-200"
    >
      <div ref={mapRef} className="pointer-events-none h-full w-full" />
      <div className="absolute inset-0 flex items-end justify-end bg-slate-900/0 p-2 transition-colors group-hover:bg-slate-900/10">
        <span className="flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow">
          <Maximize2 className="h-3.5 w-3.5" /> {t('توسيع في خرائط جوجل')}
        </span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// مرافق الشركة — صفحة الإعدادات ← المرافق (FacilitiesTab). مباني سكن،
// مستودعات، وخلافه، بتفاصيل عقد إيجارها وجدول دفعاته (نفس بنية جدول دفعات
// العقود في Contracts.tsx بالضبط — انظر ContractScheduleItem). كل دفعة
// فعلية تُسجَّل من صفحة المصروفات العامة (فئة "إيجار مبنى") — انظر
// FACILITY_CATEGORY_NAME.
// ---------------------------------------------------------------------------
function FacilitiesTab() {
  const { t, tt } = useI18n();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingFacility, setViewingFacility] = useState<Facility | null>(null);
  const [scheduleRows, setScheduleRows] = useState<{ percent: string; amount: string; due_date: string }[]>([]);
  // هل عدَّل المستخدم جدول الدفعات فعلياً خلال هذه الجلسة من النموذج؟ عند
  // التعديل (editing !== null)، scheduleRows تُملأ ابتداءً من الجدول
  // الحالي للعرض فقط — إرسالها دوماً ضمن PATCH كان يُعيد توليد الجدول بمعرّفات
  // جديدة ويُصفِّر paid_amount حتى عند تعديل حقل آخر لا علاقة له بالجدول
  // إطلاقاً (مثال: إضافة كهرباء/ماء). الآن لا يُرسَل payment_schedule ضمن
  // PATCH إلا إن غيَّر المستخدم صراحةً بنداً هنا (انظر handleSubmit أدناه).
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [formRentalAmount, setFormRentalAmount] = useState('');
  // مشمول/غير مشمول تتحكّم بإظهار حقول مبلغ الفاتورة الدورية لكل من الماء
  // والكهرباء — نفس فكرة ownershipType في VehiclesTab (حقول لاحقة تتغيّر
  // حسب هذا الاختيار).
  const [waterIncluded, setWaterIncluded] = useState(false);
  const [electricityIncluded, setElectricityIncluded] = useState(false);
  // ترشيحات حقل "العنوان" — من سجل أحياء الرياض المسجَّلة في الإعدادات ←
  // مناطق الرياض، نفس نمط Customers.tsx/Contracts.tsx بالضبط (اقتراح فقط
  // لا قيد صارم).
  const [neighborhoodZones, setNeighborhoodZones] = useState<NeighborhoodZoneAssignment[]>([]);

  function refresh() {
    api.get<Facility[]>('/facilities').then(setFacilities);
    api.get<Expense[]>('/expenses').then(setExpenses);
    api.get<NeighborhoodZoneAssignment[]>('/neighborhood-zones').then(setNeighborhoodZones).catch(() => {});
  }
  useEffect(refresh, []);

  function addScheduleRow() {
    setScheduleTouched(true);
    setScheduleRows((prev) => [...prev, { percent: '', amount: '', due_date: '' }]);
  }
  function removeScheduleRow(idx: number) {
    setScheduleTouched(true);
    setScheduleRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateScheduleRow(idx: number, field: 'percent' | 'amount' | 'due_date', value: string, totalAmount: number) {
    setScheduleTouched(true);
    setScheduleRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (field === 'percent') {
          const percent = Number(value) || 0;
          const amount = totalAmount > 0 ? Math.round(((totalAmount * percent) / 100) * 100) / 100 : row.amount;
          return { ...row, percent: value, amount: totalAmount > 0 ? String(amount) : row.amount };
        }
        return { ...row, [field]: value };
      }),
    );
  }
  const scheduleTotalAmount = scheduleRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  // بنود سبق سداد جزء منها — تحذير عند التعديل فقط (انظر التعليق على PATCH
  // /facilities/:id في api.ts: استبدال الجدول كاملاً يُصفِّر paid_amount).
  const hasPaidScheduleItems = (editing?.payment_schedule ?? []).some((s) => s.paid_amount > 0);

  function openCreate() {
    setEditing(null);
    setScheduleRows([]);
    setScheduleTouched(false);
    setFormRentalAmount('');
    setWaterIncluded(false);
    setElectricityIncluded(false);
    setShowForm(true);
  }
  function openEdit(f: Facility) {
    setEditing(f);
    setScheduleRows((f.payment_schedule ?? []).map((s) => ({ percent: s.percent != null ? String(s.percent) : '', amount: String(s.amount), due_date: s.due_date })));
    setScheduleTouched(false);
    setFormRentalAmount(f.rental_amount != null ? String(f.rental_amount) : '');
    setWaterIncluded(f.water_included ?? false);
    setElectricityIncluded(f.electricity_included ?? false);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name'),
      type: form.get('type'),
      address: form.get('address') || undefined,
      location_url: form.get('location_url') || undefined,
      notes: form.get('notes') || undefined,
      is_active: form.get('is_active') === 'on',
      landlord_name: form.get('landlord_name') || undefined,
      rental_contract_number: form.get('rental_contract_number') || undefined,
      rental_contract_start_date: form.get('rental_contract_start_date') || undefined,
      rental_contract_end_date: form.get('rental_contract_end_date') || undefined,
      rental_amount: formRentalAmount || undefined,
      rental_amount_frequency: form.get('rental_amount_frequency') || undefined,
      office_fee_amount: form.get('office_fee_amount') || undefined,
      water_included: waterIncluded,
      water_amount: !waterIncluded ? form.get('water_amount') || undefined : undefined,
      water_amount_frequency: !waterIncluded ? form.get('water_amount_frequency') || undefined : undefined,
      electricity_included: electricityIncluded,
      electricity_amount: !electricityIncluded ? form.get('electricity_amount') || undefined : undefined,
      electricity_amount_frequency: !electricityIncluded ? form.get('electricity_amount_frequency') || undefined : undefined,
      // عند الإنشاء يُرسَل الجدول دوماً (قد يكون فارغاً). عند التعديل لا
      // يُرسَل إلا إن لمسه المستخدم فعلياً هنا — إرساله دوماً كان يُصفِّر
      // كل ما سُدِّد سابقاً على بنوده حتى عند تعديل حقل آخر لا علاقة له
      // بالجدول (انظر تعليق scheduleTouched أعلاه).
      ...(!editing || scheduleTouched
        ? {
            payment_schedule: scheduleRows
              .filter((r) => r.amount && r.due_date)
              .map((r) => ({ percent: r.percent ? Number(r.percent) : undefined, amount: Number(r.amount), due_date: r.due_date })),
          }
        : {}),
    };
    try {
      if (editing) {
        await api.patch(`/facilities/${editing.id}`, payload);
      } else {
        await api.post('/facilities', payload);
      }
      setShowForm(false);
      setEditing(null);
      setScheduleRows([]);
      setScheduleTouched(false);
      setFormRentalAmount('');
      setWaterIncluded(false);
      setElectricityIncluded(false);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(f: Facility) {
    if (!window.confirm(tt(`حذف مرفق "${f.name}"؟ لا يمكن التراجع عن هذا الإجراء.`, `Delete facility "${f.name}"? This action cannot be undone.`))) return;
    await api.del(`/facilities/${f.id}`);
    refresh();
  }

  return (
    <div className="space-y-5">
      <datalist id="riyadh-districts-list">
        {Array.from(new Set(neighborhoodZones.map((n) => n.neighborhood)))
          .sort((a, b) => a.localeCompare(b, 'ar'))
          .map((name) => (
            <option key={name} value={name} />
          ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{t('مباني السكن والمستودعات وخلافها — تفاصيل عقد الإيجار وجدول دفعاته')}</p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('مرفق جديد')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('الاسم')}</th>
              <th className="p-3 text-start font-medium">{t('النوع')}</th>
              <th className="p-3 text-start font-medium">{t('المؤجِّر')}</th>
              <th className="p-3 text-start font-medium">{t('مبلغ الإيجار')}</th>
              <th className="p-3 text-start font-medium">{t('نهاية العقد')}</th>
              <th className="p-3 text-start font-medium">{t('الحالة')}</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((f) => (
              <tr key={f.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium text-slate-700">{f.name}</td>
                <td className="p-3 text-slate-600">{t(FACILITY_TYPE_LABELS_AR[f.type])}</td>
                <td className="p-3 text-slate-600">{f.landlord_name || '—'}</td>
                <td className="p-3 text-slate-600">
                  {f.rental_amount != null ? (
                    <>
                      {formatMoney(f.rental_amount)}
                      {f.rental_amount_frequency && ` (${t(FACILITY_RENT_FREQUENCY_LABELS_AR[f.rental_amount_frequency])})`}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="p-3 text-slate-600" dir="ltr">{f.rental_contract_end_date || '—'}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${f.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {t(f.is_active ? 'فعّال' : 'غير فعّال')}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setViewingFacility(f)} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline">
                      <Eye className="h-3.5 w-3.5" /> {t('التفاصيل')}
                    </button>
                    <button onClick={() => openEdit(f)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                      <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                    </button>
                    <button onClick={() => handleDelete(f)} className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline">
                      <Trash2 className="h-3.5 w-3.5" /> {t('حذف')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {facilities.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  {t('لا توجد مرافق مسجَّلة بعد')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editing ? tt(`تعديل مرفق "${editing.name}"`, `Edit facility "${editing.name}"`) : t('مرفق جديد')}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            setScheduleRows([]);
            setScheduleTouched(false);
            setFormRentalAmount('');
            setWaterIncluded(false);
            setElectricityIncluded(false);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label={t('اسم المرفق')}>
              <input name="name" defaultValue={editing?.name} required className="input" placeholder={t('مثال: مبنى سكن العمال — حي الشفا')} />
            </Field>
            <Field label={t('النوع')}>
              <select name="type" defaultValue={editing?.type ?? 'housing'} required className="input">
                <option value="housing">{t(FACILITY_TYPE_LABELS_AR.housing)}</option>
                <option value="warehouse">{t(FACILITY_TYPE_LABELS_AR.warehouse)}</option>
                <option value="apartment">{t(FACILITY_TYPE_LABELS_AR.apartment)}</option>
                <option value="office">{t(FACILITY_TYPE_LABELS_AR.office)}</option>
                <option value="shop">{t(FACILITY_TYPE_LABELS_AR.shop)}</option>
                <option value="other">{t(FACILITY_TYPE_LABELS_AR.other)}</option>
              </select>
            </Field>
            <Field label={t('العنوان (اختياري)')}>
              <input name="address" defaultValue={editing?.address} list="riyadh-districts-list" className="input" />
            </Field>
            <Field label={t('رابط الموقع (خرائط جوجل)')}>
              <div className="flex gap-2">
                <input name="location_url" defaultValue={editing?.location_url} className="input" placeholder="https://maps.google.com/..." />
                <a
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noreferrer"
                  title={t('فتح خرائط جوجل لتحديد الموقع يدويًا ولصق رابطه هنا')}
                  className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-500 hover:bg-slate-50 hover:text-brand-600"
                >
                  <MapIcon className="h-4 w-4" />
                </a>
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} className="h-4 w-4 rounded border-slate-300" />
              {t('فعّال')}
            </label>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <h3 className="text-xs font-semibold text-slate-500">{t('تفاصيل عقد الإيجار (اختياري)')}</h3>
              <Field label={t('اسم المؤجِّر/المالك')}>
                <input name="landlord_name" defaultValue={editing?.landlord_name} className="input" />
              </Field>
              <Field label={t('رقم عقد الإيجار')}>
                <input name="rental_contract_number" defaultValue={editing?.rental_contract_number} className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('تاريخ بداية العقد')}>
                  <input type="date" name="rental_contract_start_date" defaultValue={editing?.rental_contract_start_date} className="input" />
                </Field>
                <Field label={t('تاريخ نهاية العقد')}>
                  <input type="date" name="rental_contract_end_date" defaultValue={editing?.rental_contract_end_date} className="input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('مبلغ الإيجار (ر.س)')}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="input"
                    value={formRentalAmount}
                    onChange={(e) => setFormRentalAmount(e.target.value)}
                  />
                </Field>
                <Field label={t('دورية الإيجار')}>
                  <select name="rental_amount_frequency" defaultValue={editing?.rental_amount_frequency ?? 'monthly'} className="input">
                    <option value="monthly">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.monthly)}</option>
                    <option value="quarterly">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.quarterly)}</option>
                    <option value="semi_annual">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.semi_annual)}</option>
                    <option value="annual">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.annual)}</option>
                  </select>
                </Field>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="text-xs font-semibold text-slate-500">{t('مبالغ إضافية على العقد (اختياري)')}</h3>
              <Field label={t('رسوم المكتب/الوساطة (ر.س)')}>
                <input type="number" min={0} step="0.01" name="office_fee_amount" defaultValue={editing?.office_fee_amount} className="input" />
              </Field>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={waterIncluded}
                    onChange={(e) => setWaterIncluded(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t('الماء مشمول ضمن الإيجار')}
                </label>
                {!waterIncluded && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('مبلغ فاتورة الماء (ر.س)')}>
                      <input type="number" min={0} step="0.01" name="water_amount" defaultValue={editing?.water_amount} className="input" />
                    </Field>
                    <Field label={t('دورية فاتورة الماء')}>
                      <select name="water_amount_frequency" defaultValue={editing?.water_amount_frequency ?? 'monthly'} className="input">
                        <option value="monthly">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.monthly)}</option>
                        <option value="quarterly">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.quarterly)}</option>
                        <option value="semi_annual">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.semi_annual)}</option>
                        <option value="annual">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.annual)}</option>
                      </select>
                    </Field>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={electricityIncluded}
                    onChange={(e) => setElectricityIncluded(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t('الكهرباء مشمولة ضمن الإيجار')}
                </label>
                {!electricityIncluded && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('مبلغ فاتورة الكهرباء (ر.س)')}>
                      <input type="number" min={0} step="0.01" name="electricity_amount" defaultValue={editing?.electricity_amount} className="input" />
                    </Field>
                    <Field label={t('دورية فاتورة الكهرباء')}>
                      <select name="electricity_amount_frequency" defaultValue={editing?.electricity_amount_frequency ?? 'monthly'} className="input">
                        <option value="monthly">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.monthly)}</option>
                        <option value="quarterly">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.quarterly)}</option>
                        <option value="semi_annual">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.semi_annual)}</option>
                        <option value="annual">{t(FACILITY_RENT_FREQUENCY_LABELS_AR.annual)}</option>
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            </div>

            {/* جدول دفعات اختياري — نفس فكرة جدول دفعات العقد في Contracts.tsx
                بالضبط: يقسّم قيمة الإيجار على بنود بنسبة ومبلغ وتاريخ استحقاق
                مستقل لكل بند، لتتّضح المستحقة والمسدَّدة والمتبقية بمرور
                الوقت من صفحة المصروفات ← إيجار مبنى. */}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">{t('جدول دفعات الإيجار (اختياري)')}</span>
                <button
                  type="button"
                  onClick={addScheduleRow}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('إضافة دفعة')}
                </button>
              </div>
              {editing && hasPaidScheduleItems && (
                <p className="mb-2 text-xs font-medium text-amber-600">
                  {t('تنبيه: تعديل هذا الجدول يُعيد تصفير المبالغ المسدَّدة المسجَّلة سابقاً على بنوده')}
                </p>
              )}
              {scheduleRows.length > 0 && (
                <div className="space-y-2">
                  {scheduleRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-lg bg-slate-50 p-2">
                      <label className="text-xs">
                        <span className="mb-1 block text-slate-500">{t('النسبة (%)')}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={row.percent}
                          onChange={(e) => updateScheduleRow(idx, 'percent', e.target.value, Number(formRentalAmount) || 0)}
                          className="input"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="mb-1 block text-slate-500">{t('المبلغ (ر.س)')}</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => updateScheduleRow(idx, 'amount', e.target.value, Number(formRentalAmount) || 0)}
                          className="input"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="mb-1 block text-slate-500">{t('تاريخ الاستحقاق')}</span>
                        <input
                          type="date"
                          value={row.due_date}
                          onChange={(e) => updateScheduleRow(idx, 'due_date', e.target.value, Number(formRentalAmount) || 0)}
                          className="input"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeScheduleRow(idx)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="text-xs text-slate-400">
                    {tt(
                      `إجمالي بنود الجدول: ${formatMoney(scheduleTotalAmount)}`,
                      `Schedule total: ${formatMoney(scheduleTotalAmount)}`,
                    )}
                  </div>
                </div>
              )}
              {scheduleRows.length === 0 && (
                <p className="text-xs text-slate-400">{t('بلا جدول دفعات — لن تظهر دفعات مستحقة لهذا المرفق في صفحة المصروفات')}</p>
              )}
            </div>

            <Field label={t('ملاحظات (اختياري)')}>
              <textarea name="notes" defaultValue={editing?.notes} rows={2} className="input" />
            </Field>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : t('حفظ')}
            </button>
          </form>
        </Modal>
      )}

      {viewingFacility && (
        <FacilityDetailModal
          facility={facilities.find((f) => f.id === viewingFacility.id) ?? viewingFacility}
          expenses={expenses}
          onClose={() => setViewingFacility(null)}
        />
      )}
    </div>
  );
}

// شارة حالة بند من جدول الدفعات — نفس ألوان/تسميات القسم المماثل في
// ContractDetailModal (Contracts.tsx) بالضبط.
function FacilityScheduleStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  const style =
    status === 'paid' ? 'bg-emerald-100 text-emerald-700' : status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  const label = status === 'paid' ? 'مسدَّدة بالكامل' : status === 'partial' ? 'جزئية' : 'مستحقة';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{t(label)}</span>;
}

function FacilityDetailModal({ facility, expenses, onClose }: { facility: Facility; expenses: Expense[]; onClose: () => void }) {
  const { t, tt } = useI18n();
  const linked = expenses.filter((e) => e.facility_id === facility.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = linked.reduce((s, e) => s + e.amount, 0);

  return (
    <Modal title={tt(`مرفق "${facility.name}"`, `Facility "${facility.name}"`)} onClose={onClose}>
      <div className="mb-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
        <div>{t('النوع')}: {t(FACILITY_TYPE_LABELS_AR[facility.type])}</div>
        {facility.address && <div>{t('العنوان')}: {facility.address}</div>}
        {facility.location_url && (
          <div className="pt-1">
            <FacilityLocationMap locationUrl={facility.location_url} address={facility.address} />
          </div>
        )}
        {facility.landlord_name && <div>{t('اسم المؤجِّر/المالك')}: {facility.landlord_name}</div>}
        {facility.rental_contract_number && <div>{t('رقم عقد الإيجار')}: {facility.rental_contract_number}</div>}
        {(facility.rental_contract_start_date || facility.rental_contract_end_date) && (
          <div dir="ltr">{t('العقد')}: {facility.rental_contract_start_date || '—'} → {facility.rental_contract_end_date || '—'}</div>
        )}
        {facility.rental_amount != null && (
          <div>
            {t('مبلغ الإيجار')}: {formatMoney(facility.rental_amount)}
            {facility.rental_amount_frequency && ` (${t(FACILITY_RENT_FREQUENCY_LABELS_AR[facility.rental_amount_frequency])})`}
          </div>
        )}
        {facility.office_fee_amount != null && (
          <div className="flex items-center gap-2">
            <span>{t('رسوم المكتب/الوساطة')}: {formatMoney(facility.office_fee_amount)}</span>
            {facility.office_fee_status && <FacilityScheduleStatusBadge status={facility.office_fee_status} />}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span>
            {t('الماء')}:{' '}
            {facility.water_included
              ? t('مشمول ضمن الإيجار')
              : facility.water_amount != null
                ? `${formatMoney(facility.water_amount)}${facility.water_amount_frequency ? ` (${t(FACILITY_RENT_FREQUENCY_LABELS_AR[facility.water_amount_frequency])})` : ''}`
                : t('غير مشمول')}
          </span>
          {!facility.water_included && facility.water_status && <FacilityScheduleStatusBadge status={facility.water_status} />}
        </div>
        <div className="flex items-center gap-2">
          <span>
            {t('الكهرباء')}:{' '}
            {facility.electricity_included
              ? t('مشمولة ضمن الإيجار')
              : facility.electricity_amount != null
                ? `${formatMoney(facility.electricity_amount)}${facility.electricity_amount_frequency ? ` (${t(FACILITY_RENT_FREQUENCY_LABELS_AR[facility.electricity_amount_frequency])})` : ''}`
                : t('غير مشمولة')}
          </span>
          {!facility.electricity_included && facility.electricity_status && <FacilityScheduleStatusBadge status={facility.electricity_status} />}
        </div>
        {facility.notes && <div>{t('ملاحظات')}: {facility.notes}</div>}
      </div>

      {facility.payment_schedule && facility.payment_schedule.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-500">{t('جدول دفعات الإيجار — المستحقة والمسدَّدة')}</h3>
          <div className="space-y-1.5">
            {facility.payment_schedule.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                <div>
                  <div className="font-medium text-slate-700" dir="ltr">{s.due_date}</div>
                  <div className="text-xs text-slate-400">
                    {formatMoney(s.paid_amount)} / {formatMoney(s.amount)}
                    {s.status !== 'paid' && ` — ${tt('متبقٍ', 'remaining')} ${formatMoney(Math.max(s.amount - s.paid_amount, 0))}`}
                  </div>
                </div>
                <FacilityScheduleStatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 rounded-xl bg-slate-50 p-3 text-center">
        <div className="text-xs text-slate-400">{t('إجمالي المصروفات المرتبطة')}</div>
        <div className="text-lg font-bold text-slate-800">{formatMoney(total)}</div>
      </div>
      {linked.length > 0 ? (
        <div className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto">
          {linked.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                <div className="font-medium text-slate-700">{e.title}</div>
                <div className="text-xs text-slate-400">{e.date}</div>
              </div>
              <span className="text-sm font-semibold text-slate-700">{formatMoney(e.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-slate-400">{t('لا توجد مصروفات مرتبطة بهذا المرفق بعد')}</p>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Permissions tab — صفحة الصلاحيات: جدول (صلاحية × مسمى وظيفي)، كل خانة
// مربع اختيار يُحفظ فوراً عند تبديله عبر PATCH /api/permissions/:key. تظهر
// فقط للمدير العام ومدير النظام (PERMISSIONS_ACCESS_ROLES، مقيَّدة أيضاً في
// Settings() أدناه). الأعمدة الخمسة هي كل مسمى وظيفي موجود في النظام
// (ROLES) — فتشمل تلقائياً أي موظف جديد يُضاف مستقبلاً بأحد هذه المسميات،
// بلا حاجة لأي إعداد إضافي هنا.
// ---------------------------------------------------------------------------
type PermissionRow = [string, { label: string; roles: UserRole[] }];

function PermissionsTab() {
  const { t, roleLabel } = useI18n();
  const { refreshPermissions } = useAuth();
  // مصفوفة مرتَّبة (لا كائن) عمداً — السحب والإفلات يعيد ترتيب هذه
  // المصفوفة مباشرة، والخادم يرجعها مرتَّبة بالفعل حسب permissionsOrder
  // المحفوظة (انظر orderedPermissionKeys في api.ts).
  const [rows, setRows] = useState<PermissionRow[] | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const dragKeyRef = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // ترتيب المفاتيح الحالي، مُحدَّث بشكل متزامن (لا عبر setState) في كل
  // dragover — React يجمّع تحديثات useState فلا تنعكس بالضرورة في نفس
  // اللحظة، فلو اعتمد handleDrop على rows من الإغلاق (closure) مباشرة قد
  // يرسل ترتيباً قديماً عند سحب سريع (drop يتبع dragover الأخير بلا فاصل
  // إعادة رسم بينهما). هذا المرجع يبقى صحيحاً دائماً بغض النظر عن التوقيت.
  const orderRef = useRef<string[]>([]);

  function refresh() {
    api.get<Record<string, { label: string; roles: UserRole[] }>>('/permissions').then((data) => {
      const entries = Object.entries(data);
      orderRef.current = entries.map(([k]) => k);
      setRows(entries);
    });
  }
  useEffect(refresh, []);

  async function toggle(key: string, role: UserRole, checked: boolean) {
    if (!rows) return;
    // حماية إضافية على مستوى الدالة نفسها، وليس فقط تعطيل مربع الاختيار
    // بالواجهة — صلاحيات المدير العام غير قابلة للتعديل من هذا الجدول
    // إطلاقاً، من أي حساب.
    if (role === 'general_manager') return;
    const idx = rows.findIndex(([k]) => k === key);
    if (idx === -1) return;
    const current = rows[idx][1].roles;
    const nextRoles = checked ? [...current, role] : current.filter((r) => r !== role);
    setSavingKey(key);
    // تحديث متفائل فوري في الجدول المحلي، ثم حفظ على الخادم — يبقى
    // متجاوباً بصرياً حتى مع بطء الشبكة.
    const next = [...rows];
    next[idx] = [key, { ...next[idx][1], roles: nextRoles }];
    setRows(next);
    try {
      await api.patch(`/permissions/${key}`, { roles: nextRoles });
      // يحدّث can() في كل الواجهة فوراً (مثلاً لو عدَّل المدير العام صلاحية
      // نفسه بينما الصفحة مفتوحة) بدل انتظار إعادة تحميل الصفحة بالكامل.
      refreshPermissions();
    } finally {
      setSavingKey(null);
    }
  }

  // سحب وإفلات (Drag & Drop) لإعادة ترتيب الصفوف — يعيد ترتيب rows بصرياً
  // بشكل حي أثناء السحب فوق أي صف آخر، ثم يحفظ الترتيب الكامل الجديد على
  // الخادم فور الإفلات (PATCH واحد بكل المفاتيح، لا عنصراً عنصراً).
  function handleDragStart(key: string) {
    dragKeyRef.current = key;
  }
  function handleDragOver(e: DragEvent<HTMLTableRowElement>, overKey: string) {
    e.preventDefault();
    setDragOverKey(overKey);
    const draggedKey = dragKeyRef.current;
    if (!rows || !draggedKey || draggedKey === overKey) return;
    const order = orderRef.current;
    const fromIdx = order.indexOf(draggedKey);
    const toIdx = order.indexOf(overKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const nextOrder = [...order];
    const [moved] = nextOrder.splice(fromIdx, 1);
    nextOrder.splice(toIdx, 0, moved);
    orderRef.current = nextOrder; // synchronous — correct even if drop follows immediately
    const byKey = new Map(rows.map((r) => [r[0], r]));
    setRows(nextOrder.map((k) => byKey.get(k)!));
  }
  async function handleDrop() {
    dragKeyRef.current = null;
    setDragOverKey(null);
    await api.patch('/permissions/order', { order: orderRef.current });
  }
  function handleDragEnd() {
    dragKeyRef.current = null;
    setDragOverKey(null);
  }

  if (!rows) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">{t('جارِ التحميل…')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
        {t('حدِّد لكل صلاحية المسميات الوظيفية المسموح لها بها — التغيير يُحفظ فوراً وينطبق على كل من يحمل هذا المسمى، بمن فيهم من يُضاف مستقبلاً. اسحب أي صف من مقبض السحب لإعادة ترتيب الصلاحيات.')}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="w-8 p-3"></th>
              <th className="p-3 text-start font-medium">{t('الصلاحية')}</th>
              {ROLES.map((role) => (
                <th key={role} className="p-3 text-center font-medium">
                  {roleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, { label, roles }]) => (
              <tr
                key={key}
                draggable
                onDragStart={() => handleDragStart(key)}
                onDragOver={(e) => handleDragOver(e, key)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`border-b border-slate-50 last:border-0 ${savingKey === key ? 'opacity-50' : ''} ${
                  dragOverKey === key ? 'bg-brand-50/60' : ''
                }`}
              >
                <td className="cursor-grab p-3 text-slate-300 hover:text-slate-500 active:cursor-grabbing" title={t('اسحب لإعادة الترتيب')}>
                  <DragHandleIcon className="h-4 w-4" />
                </td>
                <td className="p-3 font-medium text-slate-700">{t(label)}</td>
                {ROLES.map((role) => {
                  // صلاحيات المدير العام محمية من التعديل عبر هذا الجدول
                  // نهائياً (حتى من حساب مدير نظام آخر يملك وصولاً لهذه
                  // الصفحة) — يبقى دوره الأعلى غير قابل للتقييد من أي مكان
                  // في الواجهة.
                  const isGMColumn = role === 'general_manager';
                  return (
                    <td key={role} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={roles.includes(role)}
                        disabled={savingKey === key || isGMColumn}
                        title={isGMColumn ? t('لا يمكن تعديل صلاحيات المدير العام') : undefined}
                        onChange={(e) => toggle(key, role, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400 disabled:cursor-not-allowed"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// كود خصم مسوّق واحد — عنصر مستقل (بدل حقل نموذج عام) حتى يحمل حالة
// محلية خاصة به لنوع الخصم (نسبة/مبلغ ثابت)، تُهيَّأ من قيمة entry الحالية
// عند كل mount؛ الأب يستخدمه بـ key={entry.id + entry.discount_kind}
// فتُعاد تهيئته تلقائياً بعد كل حفظ ناجح، بنفس نمط DiscountSettingsCard
// في Sales.tsx. يُدخِله من يحجز موعداً جديداً (NewAppointmentModal)
// فيمنح خصماً حقيقياً على السعر ويربط عائد ذلك الموعد بهذا المسوّق مباشرة
// (انظر Appointment.marketer_id/computeCommissionReport في api.ts).
function MarketerCodeFields({ entry, onSave }: { entry: CommissionEligibility; onSave: (patch: Partial<CommissionEligibility>) => Promise<void> }) {
  const { t } = useI18n();
  const [code, setCode] = useState(entry.discount_code ?? '');
  const [kind, setKind] = useState<SalesDiscountKind>(entry.discount_kind ?? 'percent');
  const [percent, setPercent] = useState(entry.discount_percent ?? 0);
  const [amount, setAmount] = useState(entry.discount_amount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave({ discount_code: code.trim(), discount_kind: kind, discount_percent: percent, discount_amount: amount });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      let message = t('تعذّر الحفظ');
      try {
        const parsed = JSON.parse((err as Error).message);
        if (parsed?.error) message = parsed.error;
      } catch {
        // ignore parse errors, use default message
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2">
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-500">{t('كود الخصم')}</span>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('مثال: AHMED10')}
          className="input w-32 py-1 text-xs"
        />
      </label>
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
        <button
          type="button"
          onClick={() => setKind('percent')}
          className={`rounded-md px-2 py-1 text-[11px] font-medium ${kind === 'percent' ? 'bg-brand-600 text-white' : 'text-slate-500'}`}
        >
          {t('نسبة مئوية')}
        </button>
        <button
          type="button"
          onClick={() => setKind('fixed')}
          className={`rounded-md px-2 py-1 text-[11px] font-medium ${kind === 'fixed' ? 'bg-brand-600 text-white' : 'text-slate-500'}`}
        >
          {t('مبلغ ثابت')}
        </button>
      </div>
      {kind === 'percent' ? (
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-500">{t('النسبة (٪)')}</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value) || 0)}
            className="input w-20 py-1 text-xs"
          />
        </label>
      ) : (
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-500">{t('المبلغ (ر.س)')}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="input w-24 py-1 text-xs"
          />
        </label>
      )}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? t('جارِ الحفظ…') : saved ? t('تم الحفظ ✓') : t('حفظ')}
      </button>
      {error && <span className="text-xs font-medium text-red-600">{error}</span>}
    </div>
  );
}

// تبويب "العمولات" — إعداد نظام عمولات المسوّق والمشرف (نقطة التعادل،
// المستهدفات، الشرائح التصاعدية، ومن يستحق فعلياً). هذا تبويب الإعداد
// فقط — الأرقام الفعلية المحسوبة لكل شهر (الإيراد، من يستحق كم) تُعرَض
// في تبويب "العمولات" داخل صفحة المحاسبة، وليس هنا.
function CommissionsTab() {
  const { t } = useI18n();
  const { allProfiles } = useAuth();
  const [configForm, setConfigForm] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG);
  const [tiers, setTiers] = useState<CommissionTier[]>([]);
  const [eligibility, setEligibility] = useState<CommissionEligibility[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  function refresh() {
    api.get<CommissionConfig>('/commission-config').then(setConfigForm);
    api.get<CommissionTier[]>('/commission-tiers').then(setTiers);
    api.get<CommissionEligibility[]>('/commission-eligibility').then(setEligibility);
  }
  useEffect(refresh, []);

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const saved = await api.patch<CommissionConfig>('/commission-config', configForm);
      setConfigForm(saved);
    } finally {
      setSavingConfig(false);
    }
  }

  const dailyBreakeven = configForm.effective_work_days > 0 ? configForm.monthly_fixed_expenses / configForm.effective_work_days : 0;

  async function addTier() {
    const lastTier = tiers[tiers.length - 1];
    const from = lastTier ? (lastTier.to ?? lastTier.from + 5000) : configForm.base_target;
    const created = await api.post<CommissionTier>('/commission-tiers', { from, to: null, marketer_rate: 0.05, supervisor_rate: 0.02 });
    setTiers((prev) => [...prev, created].sort((a, b) => a.from - b.from));
  }
  async function updateTier(id: string, patch: Partial<CommissionTier>) {
    const updated = await api.patch<CommissionTier>(`/commission-tiers/${id}`, patch);
    setTiers((prev) => prev.map((tr) => (tr.id === id ? updated : tr)).sort((a, b) => a.from - b.from));
  }
  async function removeTier(id: string) {
    if (!window.confirm(t('حذف هذه الشريحة؟'))) return;
    await api.del(`/commission-tiers/${id}`);
    setTiers((prev) => prev.filter((tr) => tr.id !== id));
  }

  const [newEligibleProfile, setNewEligibleProfile] = useState('');
  const [newEligibleRole, setNewEligibleRole] = useState<'marketer' | 'supervisor'>('marketer');
  async function addEligibility() {
    if (!newEligibleProfile) return;
    const created = await api.post<CommissionEligibility>('/commission-eligibility', {
      profile_id: newEligibleProfile,
      role: newEligibleRole,
    });
    setEligibility((prev) => [...prev, created]);
    setNewEligibleProfile('');
  }
  async function toggleEligibilityActive(entry: CommissionEligibility) {
    const updated = await api.patch<CommissionEligibility>(`/commission-eligibility/${entry.id}`, { active: !entry.active });
    setEligibility((prev) => prev.map((x) => (x.id === entry.id ? updated : x)));
  }
  async function removeEligibility(id: string) {
    if (!window.confirm(t('حذف هذا المستحق؟'))) return;
    await api.del(`/commission-eligibility/${id}`);
    setEligibility((prev) => prev.filter((x) => x.id !== id));
  }
  async function saveMarketerCode(id: string, patch: Partial<CommissionEligibility>) {
    const updated = await api.patch<CommissionEligibility>(`/commission-eligibility/${id}`, patch);
    setEligibility((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{t('إعدادات العمولات')}</h2>
        <p className="text-sm text-slate-400">
          {t('نقطة التعادل، المستهدفات الشهرية، الشرائح التصاعدية، ومن يستحق فعلياً — الأرقام الفعلية لكل شهر في تبويب "العمولات" داخل المحاسبة')}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-700">{t('نقطة التعادل والمستهدفات الشهرية')}</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('المصاريف التشغيلية الثابتة شهرياً (ر.س)')}</span>
            <input
              type="number"
              min={0}
              value={configForm.monthly_fixed_expenses}
              onChange={(e) => setConfigForm((p) => ({ ...p, monthly_fixed_expenses: Number(e.target.value) || 0 }))}
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('أيام العمل الفعالة شهرياً')}</span>
            <input
              type="number"
              min={1}
              value={configForm.effective_work_days}
              onChange={(e) => setConfigForm((p) => ({ ...p, effective_work_days: Number(e.target.value) || 1 }))}
              className="input"
            />
          </label>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="text-xs text-slate-400">{t('نقطة التعادل اليومية (محسوبة)')}</div>
            <div className="mt-1 font-bold text-slate-800">{formatMoney(dailyBreakeven)}</div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('المستوى الأول — تغطية التكاليف (ر.س)')}</span>
            <input
              type="number"
              min={0}
              value={configForm.base_target}
              onChange={(e) => setConfigForm((p) => ({ ...p, base_target: Number(e.target.value) || 0 }))}
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('المستوى الثاني — النمو (ر.س)')}</span>
            <input
              type="number"
              min={0}
              value={configForm.growth_target}
              onChange={(e) => setConfigForm((p) => ({ ...p, growth_target: Number(e.target.value) || 0 }))}
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('المستوى الثالث — التجاوز (ر.س)')}</span>
            <input
              type="number"
              min={0}
              value={configForm.stretch_target}
              onChange={(e) => setConfigForm((p) => ({ ...p, stretch_target: Number(e.target.value) || 0 }))}
              className="input"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-slate-600">{t('حدود الأمان')}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('أقصى نسبة شكاوى مسموحة لاستحقاق المشرف (%)')}</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={Math.round(configForm.supervisor_max_complaint_rate * 1000) / 10}
              onChange={(e) => setConfigForm((p) => ({ ...p, supervisor_max_complaint_rate: (Number(e.target.value) || 0) / 100 }))}
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('أدنى حصة تبقى للشركة من الفائض (%)')}</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={Math.round(configForm.min_company_share * 1000) / 10}
              onChange={(e) => setConfigForm((p) => ({ ...p, min_company_share: (Number(e.target.value) || 0) / 100 }))}
              className="input"
            />
          </label>
        </div>
        <button
          onClick={saveConfig}
          disabled={savingConfig}
          className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {savingConfig ? t('جارِ الحفظ…') : t('حفظ الإعدادات')}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-700">{t('شرائح العمولة التصاعدية')}</h3>
          </div>
          <button
            onClick={addTier}
            className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600"
          >
            <Plus className="h-3.5 w-3.5" /> {t('إضافة شريحة')}
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          {t('تُطبَّق على إجمالي إيراد الشركة المحصَّل شهرياً (لا إيراد كل شخص وحده) — كل شريحة على الجزء الواقع داخل حدودها فقط')}
        </p>
        <div className="space-y-2">
          {tiers.map((tier) => (
            <div key={tier.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-2 rounded-xl bg-slate-50 p-2.5">
              <input
                type="number"
                value={tier.from}
                onChange={(e) => updateTier(tier.id, { from: Number(e.target.value) || 0 })}
                className="input py-1 text-sm"
                placeholder={t('من')}
              />
              <input
                type="number"
                value={tier.to ?? ''}
                onChange={(e) => updateTier(tier.id, { to: e.target.value === '' ? null : Number(e.target.value) })}
                className="input py-1 text-sm"
                placeholder={t('إلى (فارغ = بلا حد)')}
              />
              <input
                type="number"
                step="0.1"
                value={Math.round(tier.marketer_rate * 1000) / 10}
                onChange={(e) => updateTier(tier.id, { marketer_rate: (Number(e.target.value) || 0) / 100 })}
                className="input py-1 text-sm"
                placeholder={t('% المسوّق')}
              />
              <input
                type="number"
                step="0.1"
                value={Math.round(tier.supervisor_rate * 1000) / 10}
                onChange={(e) => updateTier(tier.id, { supervisor_rate: (Number(e.target.value) || 0) / 100 })}
                className="input py-1 text-sm"
                placeholder={t('% المشرف')}
              />
              <button onClick={() => removeTier(tier.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {tiers.length === 0 && <div className="py-4 text-center text-xs text-slate-400">{t('لا توجد شرائح بعد')}</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-700">{t('المستحقون فعلياً')}</h3>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          {t('تعيين يدوي مستقل عن دور الحساب في النظام — إيقاف التفعيل يوقف الاستحقاق فوراً دون حذف السجل')}
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={newEligibleProfile} onChange={(e) => setNewEligibleProfile(e.target.value)} className="input flex-1">
            <option value="">{t('-- اختر موظف --')}</option>
            {allProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <select
            value={newEligibleRole}
            onChange={(e) => setNewEligibleRole(e.target.value as 'marketer' | 'supervisor')}
            className="input w-40"
          >
            <option value="marketer">{t('مسوّق')}</option>
            <option value="supervisor">{t('مشرف')}</option>
          </select>
          <button
            onClick={addEligibility}
            className="flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('إضافة')}
          </button>
        </div>
        <div className="space-y-2">
          {eligibility.map((entry) => (
            <div key={entry.id} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-700">{entry.profile_name}</div>
                  <div className="text-xs text-slate-400">{entry.role === 'marketer' ? t('مسوّق') : t('مشرف')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEligibilityActive(entry)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${entry.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                  >
                    {entry.active ? t('مفعَّل') : t('موقَّف')}
                  </button>
                  <button
                    onClick={() => removeEligibility(entry.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {entry.role === 'marketer' && (
                <MarketerCodeFields
                  key={`${entry.id}-${entry.discount_code ?? ''}-${entry.discount_kind ?? ''}`}
                  entry={entry}
                  onSave={(patch) => saveMarketerCode(entry.id, patch)}
                />
              )}
            </div>
          ))}
          {eligibility.length === 0 && <div className="py-4 text-center text-xs text-slate-400">{t('لا يوجد مستحقون بعد')}</div>}
        </div>
      </div>
    </div>
  );
}

// سجل العمليات — الإعدادات ← سجل العمليات (خلف صلاحية ديناميكية
// view_activity_log). كل عملية تعديل/إضافة/حذف مؤثرة في التطبيق تُسجَّل
// تلقائياً من الخادم (انظر logActivity في src/server/routes/api.ts) مع
// من قام بها ووقتها — هذه الصفحة تعرضها فقط، الأحدث أولاً (الخادم
// يرجعها بهذا الترتيب أصلاً). حذف سطور منه (تحديد سطر أو الكل ثم زر
// حذف) محصور بالمدير العام فقط (ACTIVITY_LOG_DELETE_ROLES، ثابتة وغير
// قابلة للتعديل من صفحة الصلاحيات، بخلاف صلاحية الاطلاع نفسها).
function ActivityLogTab() {
  const { t, tt } = useI18n();
  const { user } = useAuth();
  const canDelete = user ? ACTIVITY_LOG_DELETE_ROLES.includes(user.role) : false;
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function refresh() {
    api.get<ActivityLogEntry[]>('/activity-log').then(setEntries);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!entries) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">{t('جارِ التحميل…')}</div>;
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? entries.filter((e) => [e.action, e.actor_name].filter(Boolean).join(' ').toLowerCase().includes(q))
    : entries;

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        // إلغاء تحديد الصفوف الظاهرة حالياً فقط (يحافظ على أي تحديد سابق
        // من بحث مختلف لا يظهر ضمن النتائج الحالية).
        const next = new Set(prev);
        for (const e of filtered) next.delete(e.id);
        return next;
      }
      const next = new Set(prev);
      for (const e of filtered) next.add(e.id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        tt(
          `حذف ${selected.size} من سجلات العمليات نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
          `Permanently delete ${selected.size} activity log ${selected.size === 1 ? 'entry' : 'entries'}? This cannot be undone.`,
        ),
      )
    )
      return;
    setDeleting(true);
    try {
      await api.del('/activity-log', { ids: [...selected] });
      setSelected(new Set());
      refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
        {canDelete
          ? t('سجل كامل بكل عملية إضافة أو تعديل أو حذف مؤثرة في النظام، مع من قام بها ووقتها. يمكن للمدير العام وحده حذف سطور منه بتحديدها.')
          : t('سجل كامل بكل عملية إضافة أو تعديل أو حذف مؤثرة في النظام، مع من قام بها ووقتها — لا يمكن التعديل عليه، وحذف عناصره محصور بالمدير العام.')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ابحث بنوع العملية أو اسم المستخدم...')}
            className="input ps-9"
          />
        </div>
        {canDelete && (
          <button
            onClick={deleteSelected}
            disabled={selected.size === 0 || deleting}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> {deleting ? t('جارِ الحذف…') : t('حذف المحدد')} {selected.size > 0 && `(${selected.size})`}
          </button>
        )}
      </div>
      {canDelete && filtered.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-slate-500">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleAllFiltered}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
          />
          {t('تحديد الكل')}
        </label>
      )}
      <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
        {filtered.map((e) => (
          <div key={e.id} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            {canDelete && (
              <input
                type="checkbox"
                checked={selected.has(e.id)}
                onChange={() => toggleOne(e.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-700">{e.action}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                {tt(`بواسطة ${e.actor_name ?? 'مستخدم غير معروف'}`, `by ${e.actor_name ?? 'Unknown user'}`)}
                {' — '}
                {formatDateAr(e.created_at)} {t('الساعة')} {formatTimeAr(e.created_at)}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="p-6 text-center text-xs text-slate-400">{t('لا توجد عمليات مسجَّلة بعد')}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function Settings() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const canUsers = user ? SETTINGS_ACCESS_ROLES.includes(user.role) : false;
  const canTeamLinks = can('edit_tech_supervisor_links');
  const canServices = can('edit_services');
  const canPaymentMethods = can('edit_payment_methods');
  const canExpenseCategories = can('edit_custody_expenses');
  const canDaysOff = can('edit_days_off');
  const canLandingPage = can('edit_landing_page');
  const canPermissions = user ? PERMISSIONS_ACCESS_ROLES.includes(user.role) : false;
  const canTranslations = user ? SETTINGS_ACCESS_ROLES.includes(user.role) : false;
  const canVehicles = user ? SETTINGS_ACCESS_ROLES.includes(user.role) : false;
  const canFacilities = user ? SETTINGS_ACCESS_ROLES.includes(user.role) : false;
  const canActivityLog = can('view_activity_log');
  const canCommissions = can('manage_commissions');
  const canRiyadhZones = can('manage_riyadh_zones');

  type SettingsTab =
    | 'users'
    | 'services'
    | 'payment_methods'
    | 'expense_categories'
    | 'team_links'
    | 'days_off'
    | 'landing_page'
    | 'mobile_app'
    | 'permissions'
    | 'translations'
    | 'vehicles'
    | 'facilities'
    | 'commissions'
    | 'riyadh_zones'
    | 'activity_log';
  const [tab, setTab] = useState<SettingsTab>(() => {
    // أول تبويب فعلياً متاح لهذا المستخدم — بترتيب أولوية ثابت، بدل
    // افتراض "المستخدمون" دائماً (لم يعد كل من يفتح الصفحة يملكه).
    if (canUsers) return 'users';
    if (canTeamLinks) return 'team_links';
    if (canServices) return 'services';
    if (canPaymentMethods) return 'payment_methods';
    if (canExpenseCategories) return 'expense_categories';
    if (canDaysOff) return 'days_off';
    if (canLandingPage) return 'landing_page';
    if (canPermissions) return 'permissions';
    if (canTranslations) return 'translations';
    if (canVehicles) return 'vehicles';
    if (canFacilities) return 'facilities';
    if (canCommissions) return 'commissions';
    if (canRiyadhZones) return 'riyadh_zones';
    return 'activity_log';
  });

  // "الاطلاع على الاعدادات" هي البوابة الرئيسية لدخول الصفحة كاملة (نفس
  // الصلاحية التي تتحكم بظهور رابط "الإعدادات" في القائمة الجانبية —
  // Layout.tsx). أي تبويب داخلها يبقى محكوماً بصلاحيته الخاصة أدناه.
  if (user && !can('view_settings_page')) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('الإعدادات')}</h1>
        <p className="text-sm text-slate-400">{t('إدارة المستخدمين والوظائف، وإدارة خدمات النظافة وأسعارها')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 w-fit">
        {canUsers && (
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'users' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <UsersIcon className="h-4 w-4" /> {t('المستخدمون')}
          </button>
        )}
        {canTeamLinks && (
          <button
            onClick={() => setTab('team_links')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'team_links' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <TeamLinkIcon className="h-4 w-4" /> {t('ربط الفنيين بالمشرفين')}
          </button>
        )}
        {canServices && (
          <button
            onClick={() => setTab('services')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'services' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <ServicesIcon className="h-4 w-4" /> {t('الخدمات')}
          </button>
        )}
        {canPaymentMethods && (
          <button
            onClick={() => setTab('payment_methods')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'payment_methods' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <PaymentIcon className="h-4 w-4" /> {t('طرق الدفع')}
          </button>
        )}
        {canExpenseCategories && (
          <button
            onClick={() => setTab('expense_categories')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'expense_categories' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <ExpensesIcon className="h-4 w-4" /> {t('العهد والمصروفات')}
          </button>
        )}
        {canDaysOff && (
          <button
            onClick={() => setTab('days_off')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'days_off' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <DaysOffIcon className="h-4 w-4" /> {t('الإجازات')}
          </button>
        )}
        {canLandingPage && (
          <button
            onClick={() => setTab('landing_page')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'landing_page' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <LandingIcon className="h-4 w-4" /> {t('الطلبات الخارجية')}
          </button>
        )}
        {canLandingPage && (
          <button
            onClick={() => setTab('mobile_app')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'mobile_app' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <MobileAppIcon className="h-4 w-4" /> {t('تطبيق الجوال')}
          </button>
        )}
        {canPermissions && (
          <button
            onClick={() => setTab('permissions')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'permissions' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <PermissionsIcon className="h-4 w-4" /> {t('الصلاحيات')}
          </button>
        )}
        {canTranslations && (
          <button
            onClick={() => setTab('translations')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'translations' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <TranslationsIcon className="h-4 w-4" /> {t('الترجمة')}
          </button>
        )}
        {canVehicles && (
          <button
            onClick={() => setTab('vehicles')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'vehicles' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <VehiclesIcon className="h-4 w-4" /> {t('المركبات')}
          </button>
        )}
        {canFacilities && (
          <button
            onClick={() => setTab('facilities')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'facilities' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <FacilitiesIcon className="h-4 w-4" /> {t('المرافق')}
          </button>
        )}
        {canCommissions && (
          <button
            onClick={() => setTab('commissions')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'commissions' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <CommissionsIcon className="h-4 w-4" /> {t('العمولات')}
          </button>
        )}
        {canRiyadhZones && (
          <button
            onClick={() => setTab('riyadh_zones')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'riyadh_zones' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <RiyadhZonesIcon className="h-4 w-4" /> {t('مناطق الرياض')}
          </button>
        )}
        {canActivityLog && (
          <button
            onClick={() => setTab('activity_log')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'activity_log' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <ActivityLogIcon className="h-4 w-4" /> {t('سجل العمليات')}
          </button>
        )}
      </div>

      {tab === 'users' && canUsers ? (
        <UsersTab />
      ) : tab === 'team_links' && canTeamLinks ? (
        <TeamLinksTab />
      ) : tab === 'services' && canServices ? (
        <ServicesTab />
      ) : tab === 'payment_methods' && canPaymentMethods ? (
        <PaymentMethodsTab />
      ) : tab === 'expense_categories' && canExpenseCategories ? (
        <ExpenseCategoriesTab />
      ) : tab === 'days_off' && canDaysOff ? (
        <DaysOffTab />
      ) : tab === 'landing_page' && canLandingPage ? (
        <LandingPageTab />
      ) : tab === 'mobile_app' && canLandingPage ? (
        <MobileAppTab />
      ) : tab === 'permissions' && canPermissions ? (
        <PermissionsTab />
      ) : tab === 'translations' && canTranslations ? (
        <TranslationsTab />
      ) : tab === 'vehicles' && canVehicles ? (
        <VehiclesTab />
      ) : tab === 'facilities' && canFacilities ? (
        <FacilitiesTab />
      ) : tab === 'commissions' && canCommissions ? (
        <CommissionsTab />
      ) : tab === 'riyadh_zones' && canRiyadhZones ? (
        <RiyadhZonesTab />
      ) : canActivityLog ? (
        <ActivityLogTab />
      ) : null}
    </div>
  );
}
