import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
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
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  AlertTriangle,
  Ruler,
  Armchair,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type {
  Profile,
  Service,
  ServicePricingModel,
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
} from '../../shared/types.js';
import { DEFAULT_LANDING_SETTINGS } from '../../shared/types.js';
import {
  SETTINGS_ACCESS_ROLES,
  PERMISSIONS_ACCESS_ROLES,
  ACTIVITY_LOG_DELETE_ROLES,
  LEAVE_TYPE_LABELS_AR,
  SERVICE_PRICING_MODEL_LABELS_AR,
} from '../../shared/types.js';
import { formatMoney, formatDuration, formatDateAr, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { WEEKDAYS } from '../lib/weekdays.js';
import { leaveTypeDisplay } from '../lib/leaves.js';
import { compressImageToDataUrl } from '../lib/image.js';

const ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'supervisor', 'technician'];

const ROLE_PLURAL_LABELS_AR: Record<UserRole, string> = {
  general_manager: 'المدير العام',
  admin: 'مدراء النظام',
  admin_supervisor: 'مشرفين إداريين',
  supervisor: 'مشرفين ميدانيين',
  technician: 'فنيين ميدانيين',
};

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  general_manager: 'bg-violet-100 text-violet-700',
  admin: 'bg-rose-100 text-rose-700',
  admin_supervisor: 'bg-amber-100 text-amber-700',
  supervisor: 'bg-blue-100 text-blue-700',
  technician: 'bg-emerald-100 text-emerald-700',
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
  const [submitting, setSubmitting] = useState(false);
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      full_name: form.get('full_name'),
      email: form.get('email') || undefined,
      phone: form.get('phone') || undefined,
      role: form.get('role'),
      // null (not undefined) — JSON.stringify drops undefined keys
      // entirely, so an empty selection would never reach the server at
      // all and silently fail to clear an existing supervisor link.
      supervisor_id: form.get('supervisor_id') || null,
      username: form.get('username') || undefined,
      password: form.get('password') || undefined,
    };
    try {
      if (editing) {
        await api.patch(`/profiles/${editing.id}`, payload);
      } else {
        await api.post('/profiles', payload);
      }
      setShowForm(false);
      setEditing(null);
      refresh();
      refreshProfiles();
    } finally {
      setSubmitting(false);
    }
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
                      title={t('تعديل')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="shrink-0">
                    {isSelf ? (
                      <span className="text-xs font-medium text-slate-300">{t('الحساب الفعلي')}</span>
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
                    title={t('تعديل')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {isSelf ? (
                  <span className="rounded-lg px-2 py-1 text-xs font-medium text-slate-300">{t('الحساب الفعلي')}</span>
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
        <Modal
          title={editing ? tt(`تعديل ${editing.full_name}`, `Edit ${editing.full_name}`) : t('مستخدم جديد')}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label={t('الاسم الكامل')}>
              <input name="full_name" defaultValue={editing?.full_name} required className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('البريد الإلكتروني')}>
                <input type="email" name="email" defaultValue={editing?.email} className="input" />
              </Field>
              <Field label={t('الجوال')}>
                <input name="phone" defaultValue={editing?.phone} className="input" placeholder="05xxxxxxxx" />
              </Field>
            </div>
            <Field label={t('الوظيفة')}>
              <select name="role" defaultValue={editing?.role ?? 'technician'} required className="input">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('المشرف المسؤول (للفنيين)')}>
              <select name="supervisor_id" defaultValue={editing?.supervisor_id ?? ''} className="input">
                <option value="">{t('بدون تحديد')}</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('اسم المستخدم')}>
                <input name="username" defaultValue={editing?.username} className="input" placeholder="username" />
              </Field>
              <Field label={editing ? t('كلمة مرور جديدة (اختياري)') : t('كلمة المرور')}>
                <input type="password" name="password" className="input" placeholder="••••••" />
              </Field>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('حفظ المستخدم')}
            </button>
          </form>
        </Modal>
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const priceValue = Number(form.get('price_value'));
    const payload = {
      name: form.get('name'),
      description: form.get('description') || undefined,
      category: form.get('category') || undefined,
      default_price: priceValue,
      default_duration_minutes: Number(form.get('default_duration_minutes')),
      is_active: form.get('is_active') === 'on',
      pricing_model: pricingModel === 'fixed' ? undefined : pricingModel,
      unit_price: pricingModel === 'fixed' ? undefined : priceValue,
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
// (انظر findDayOffConflicts في src/client/lib/weekdays.ts). (2) الإجازات
// السنوية — فترة محددة بتاريخين تمنع فعلياً إسناد موعد جديد خلالها (انظر
// findLeaveConflicts في src/client/lib/leaves.ts). كلاهما تحت صلاحية
// edit_days_off نفسها، ومواضع الاستخدام: NewAppointmentModal
// وAppointmentDetailModal.
// ---------------------------------------------------------------------------
function DaysOffTab() {
  const { t, tt, roleLabel } = useI18n();
  const { refreshProfiles } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null);
  const [leaveTypeInput, setLeaveTypeInput] = useState<LeaveType>('sick');
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
    const payload = {
      profile_id: profileId,
      leave_type: form.get('leave_type'),
      other_type_label: leaveTypeInput === 'other' ? form.get('other_type_label') : undefined,
      start_date: start,
      end_date: end,
      notes: form.get('notes') || undefined,
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

  const currentYear = new Date().getFullYear();

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
                <select name="profile_id" required className="input">
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
          {people.map((p) => {
            const personLeaves = leaves
              .filter((l) => l.profile_id === p.id)
              .sort((a, b) => b.start_date.localeCompare(a.start_date));
            const daysThisYear = personLeaves
              .filter((l) => l.start_date.slice(0, 4) === String(currentYear))
              .reduce((sum, l) => sum + l.days_count, 0);
            if (personLeaves.length === 0) return null;
            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {p.full_name} <span className="font-normal text-slate-400">({roleLabel(p.role)})</span>
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    {tt(`${daysThisYear} يوم إجازة هذا العام`, `${daysThisYear} leave days this year`)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {personLeaves.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-slate-600">{t(leaveTypeDisplay(l))}</span>
                      <span dir="ltr" className="text-slate-500">
                        {l.start_date} → {l.end_date} ({l.days_count} {t('يوم')})
                      </span>
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
              </div>
            );
          })}
          {leaves.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
              {t('لا توجد إجازات سنوية مسجَّلة بعد')}
            </div>
          )}
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

  function refreshSettings() {
    api.get<LandingPageSettings>('/landing-settings').then(setSettings);
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
                {ROLES.map((role) => (
                  <td key={role} className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      disabled={savingKey === key}
                      onChange={(e) => toggle(key, role, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
  const canActivityLog = can('view_activity_log');

  type SettingsTab = 'users' | 'services' | 'payment_methods' | 'expense_categories' | 'team_links' | 'days_off' | 'landing_page' | 'permissions' | 'activity_log';
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
        {canPermissions && (
          <button
            onClick={() => setTab('permissions')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'permissions' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <PermissionsIcon className="h-4 w-4" /> {t('الصلاحيات')}
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
      ) : tab === 'permissions' && canPermissions ? (
        <PermissionsTab />
      ) : canActivityLog ? (
        <ActivityLogTab />
      ) : null}
    </div>
  );
}
