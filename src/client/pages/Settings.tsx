import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Plus,
  X,
  Pencil,
  Trash2,
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
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Profile, Service, UserRole, PaymentMethodOption, ServiceCategory, ExpenseCategoryItem } from '../../shared/types.js';
import { SETTINGS_ACCESS_ROLES, PERMISSIONS_ACCESS_ROLES } from '../../shared/types.js';
import { formatMoney, formatDuration } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { WEEKDAYS } from '../lib/weekdays.js';

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
                <input name="phone" defaultValue={editing?.phone} className="input" placeholder="9665xxxxxxxx" />
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
  const [submitting, setSubmitting] = useState(false);
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name'),
      description: form.get('description') || undefined,
      category: form.get('category') || undefined,
      default_price: Number(form.get('default_price')),
      default_duration_minutes: Number(form.get('default_duration_minutes')),
      is_active: form.get('is_active') === 'on',
    };
    try {
      if (editing) {
        await api.patch(`/services/${editing.id}`, payload);
      } else {
        await api.post('/services', payload);
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
              <div className="mb-1 text-sm font-semibold text-slate-800">{s.name}</div>
              {s.description && <p className="mb-3 text-xs leading-relaxed text-slate-500">{s.description}</p>}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="mb-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" /> {t('المدة المقدرة')}
                  </div>
                  <div className="text-sm font-semibold text-slate-700">{formatDuration(s.default_duration_minutes)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="mb-0.5 text-[11px] text-slate-400">{t('السعر الافتراضي (شامل الضريبة)')}</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(s.default_price)}</div>
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
                  <div className="truncate text-sm font-semibold text-slate-800">{s.name}</div>
                  {s.description && <div className="truncate text-xs text-slate-400">{s.description}</div>}
                </div>
                <span className="w-32 shrink-0 truncate text-xs font-medium text-slate-500">{s.category || '—'}</span>
                <span className="flex w-32 shrink-0 items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> {formatDuration(s.default_duration_minutes)}
                </span>
                <span className="w-28 shrink-0 text-sm font-semibold text-slate-700">{formatMoney(s.default_price)}</span>
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
        <Modal
          title={editing ? tt(`تعديل ${editing.name}`, `Edit ${editing.name}`) : t('إضافة خدمة جديدة')}
          subtitle={t('تحديد تفاصيل وباقة الخدمة والأسعار الافتراضية بالريال السعودي')}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
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
                <select
                  name="category"
                  defaultValue={editing?.category ?? ''}
                  className="input appearance-none pe-9"
                >
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
              <Field label={t('السعر الافتراضي (SAR، شامل الضريبة) *')} icon={<DollarSign className="h-3.5 w-3.5 text-brand-500" />}>
                <input
                  type="number"
                  name="default_price"
                  min={0}
                  step="0.01"
                  defaultValue={editing?.default_price}
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
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editing?.is_active ?? true}
                  className="peer sr-only"
                />
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
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="text-sm font-medium text-slate-400 hover:text-slate-600"
              >
                {t('إلغاء')}
              </button>
            </div>
          </form>
        </Modal>
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
// Days-off tab — أيام الإجازة الأسبوعية الثابتة لكل مشرف ميداني وفني.
// لا تمنع حجز موعد في ذلك اليوم — فقط تُستخدم لاحقاً كتنبيه تأكيدي عند
// محاولة إسناد موعد لشخص في يوم إجازته (انظر findDayOffConflicts في
// src/client/lib/weekdays.ts، ومواضع استخدامها في NewAppointmentModal
// وAppointmentDetailModal).
// ---------------------------------------------------------------------------
function DaysOffTab() {
  const { t, roleLabel } = useI18n();
  const { refreshProfiles } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  function refresh() {
    api.get<Profile[]>('/profiles').then(setProfiles);
  }
  useEffect(refresh, []);

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
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
  const canPermissions = user ? PERMISSIONS_ACCESS_ROLES.includes(user.role) : false;

  type SettingsTab = 'users' | 'services' | 'payment_methods' | 'expense_categories' | 'team_links' | 'days_off' | 'permissions';
  const [tab, setTab] = useState<SettingsTab>(() => {
    // أول تبويب فعلياً متاح لهذا المستخدم — بترتيب أولوية ثابت، بدل
    // افتراض "المستخدمون" دائماً (لم يعد كل من يفتح الصفحة يملكه).
    if (canUsers) return 'users';
    if (canTeamLinks) return 'team_links';
    if (canServices) return 'services';
    if (canPaymentMethods) return 'payment_methods';
    if (canExpenseCategories) return 'expense_categories';
    if (canDaysOff) return 'days_off';
    return 'permissions';
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
            <DaysOffIcon className="h-4 w-4" /> {t('أيام الإجازة الأسبوعية')}
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
      ) : canPermissions ? (
        <PermissionsTab />
      ) : null}
    </div>
  );
}
