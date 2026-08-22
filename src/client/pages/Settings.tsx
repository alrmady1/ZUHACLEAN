import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Profile, Service, UserRole, PaymentMethodOption, ServiceCategory, ExpenseCategoryItem } from '../../shared/types.js';
import { ROLE_LABELS_AR, SETTINGS_ACCESS_ROLES } from '../../shared/types.js';
import { formatMoney, formatDuration } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

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
  const { user: currentUser, loginAs } = useAuth();
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
      supervisor_id: form.get('supervisor_id') || undefined,
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
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(p: Profile) {
    if (!window.confirm(`حذف حساب "${p.full_name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
      await api.del(`/profiles/${p.id}`);
      refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'تعذّر حذف الحساب');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">إدارة فريق العمل والهيكل التنظيمي</h2>
          <p className="text-sm text-slate-400">توزيع أدوار المشرفين الميدانيين والإداريين، وربط الفنيين بالمشرف المسؤول</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> إضافة عضو جديد
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('grid')}
              title="مربعات"
              className={`rounded-lg p-1.5 ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title="صفوف"
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
          الكل ({profiles.length})
        </button>
        {ROLES.filter((r) => profiles.some((p) => p.role === r)).map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${roleFilter === r ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {ROLE_PLURAL_LABELS_AR[r]} ({profiles.filter((p) => p.role === r).length})
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف..."
          className="input ps-9"
        />
      </div>

      {view === 'list' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="min-w-[960px] divide-y divide-slate-100">
            {filtered.map((p) => {
              const isSelf = p.id === currentUser?.id;
              const isLastManager = p.role === 'general_manager' && profiles.filter((x) => x.role === 'general_manager').length <= 1;
              const team = profiles.filter((t) => t.role === 'technician' && t.supervisor_id === p.id);
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
                      <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">أنت</span>
                    )}
                  </div>
                  <span className={`w-28 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${ROLE_BADGE_STYLES[p.role]}`}>
                    {ROLE_LABELS_AR[p.role]}
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
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{team.length} فني تابع له</span>
                    )}
                    {p.role === 'technician' &&
                      (supervisor ? (
                        <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          مشرفه: {supervisor.full_name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">بدون مشرف</span>
                      ))}
                  </div>
                  <span
                    className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                  >
                    {p.is_active ? 'نشط' : 'موقوف'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleDeleteUser(p)}
                      disabled={isSelf || isLastManager}
                      title={isSelf ? 'لا يمكن حذف حسابك الحالي' : isLastManager ? 'لا يمكن حذف آخر مدير عام' : 'حذف'}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(p);
                        setShowForm(true);
                      }}
                      title="تعديل"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="shrink-0">
                    {isSelf ? (
                      <span className="text-xs font-medium text-slate-300">الحساب الفعلي</span>
                    ) : (
                      <button
                        onClick={() => switchToAccount(p)}
                        className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                      >
                        دخول <LogIn className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="p-10 text-center text-slate-400">لا يوجد أعضاء مطابقون</div>}
          </div>
        </div>
      )}

      {view === 'grid' && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {filtered.map((p) => {
          const isSelf = p.id === currentUser?.id;
          const isLastManager = p.role === 'general_manager' && profiles.filter((x) => x.role === 'general_manager').length <= 1;
          const team = profiles.filter((t) => t.role === 'technician' && t.supervisor_id === p.id);
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
                        {p.is_active ? 'نشط' : 'موقوف'}
                      </span>
                      {isSelf && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">أنت</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{p.full_name}</div>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_STYLES[p.role]}`}>
                      {ROLE_LABELS_AR[p.role]}
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
                    <span className="text-slate-500">الفنيين التابعين للمشرف:</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-600">{team.length} فني</span>
                  </div>
                  {team.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {team.map((t) => (
                        <span key={t.id} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
                          {t.full_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">لا يوجد فنيين مرتبطين بعد</div>
                  )}
                </div>
              )}

              {p.role === 'technician' && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="mb-1.5 text-xs text-slate-500">المشرف الميداني المسؤول:</div>
                  {supervisor ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
                      {supervisor.full_name} ({ROLE_LABELS_AR[supervisor.role]})
                    </span>
                  ) : (
                    <div className="text-[11px] text-slate-400">بدون مشرف محدد</div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDeleteUser(p)}
                    disabled={isSelf || isLastManager}
                    title={isSelf ? 'لا يمكن حذف حسابك الحالي' : isLastManager ? 'لا يمكن حذف آخر مدير عام' : 'حذف'}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(p);
                      setShowForm(true);
                    }}
                    title="تعديل"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {isSelf ? (
                  <span className="rounded-lg px-2 py-1 text-xs font-medium text-slate-300">الحساب الفعلي</span>
                ) : (
                  <button
                    onClick={() => switchToAccount(p)}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    الدخول بهذا الحساب <LogIn className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            لا يوجد أعضاء مطابقون
          </div>
        )}
      </div>
      )}

      {showForm && (
        <Modal
          title={editing ? `تعديل ${editing.full_name}` : 'مستخدم جديد'}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="الاسم الكامل">
              <input name="full_name" defaultValue={editing?.full_name} required className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="البريد الإلكتروني">
                <input type="email" name="email" defaultValue={editing?.email} className="input" />
              </Field>
              <Field label="الجوال">
                <input name="phone" defaultValue={editing?.phone} className="input" placeholder="9665xxxxxxxx" />
              </Field>
            </div>
            <Field label="الوظيفة">
              <select name="role" defaultValue={editing?.role ?? 'technician'} required className="input">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS_AR[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="المشرف المسؤول (للفنيين)">
              <select name="supervisor_id" defaultValue={editing?.supervisor_id ?? ''} className="input">
                <option value="">بدون تحديد</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="اسم المستخدم">
                <input name="username" defaultValue={editing?.username} className="input" placeholder="username" />
              </Field>
              <Field label={editing ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}>
                <input type="password" name="password" className="input" placeholder="••••••" />
              </Field>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ المستخدم'}
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
    if (!window.confirm(`حذف خدمة "${s.name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
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
          <h2 className="text-lg font-bold text-slate-800">دليل الخدمات وقائمة الأسعار</h2>
          <p className="text-sm text-slate-400">إدارة خدمات النظافة والصيانة والمدد التقديرية والتسعيرات الافتراضية</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategories(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Tags className="h-4 w-4" /> تعديل التصنيف
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> إضافة خدمة جديدة
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('grid')}
              title="مربعات"
              className={`rounded-lg p-1.5 ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title="صفوف"
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
          جميع الخدمات
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
                  {s.is_active ? 'نشطة' : 'موقوفة'}
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
                    <Clock className="h-3 w-3" /> المدة المقدرة
                  </div>
                  <div className="text-sm font-semibold text-slate-700">{formatDuration(s.default_duration_minutes)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="mb-0.5 text-[11px] text-slate-400">السعر الافتراضي</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(s.default_price)}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3">
                <button
                  onClick={() => handleDelete(s)}
                  title="حذف"
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
                  <Pencil className="h-3.5 w-3.5" /> تعديل
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              لا توجد خدمات بعد
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
                  {s.is_active ? 'نشطة' : 'موقوفة'}
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
                    title="حذف"
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
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="p-10 text-center text-slate-400">لا توجد خدمات بعد</div>}
          </div>
        </div>
      )}

      {showForm && (
        <Modal
          title={editing ? `تعديل ${editing.name}` : 'إضافة خدمة جديدة'}
          subtitle="تحديد تفاصيل وباقة الخدمة والأسعار الافتراضية بالريال السعودي"
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="اسم الخدمة *" icon={<Sparkles className="h-3.5 w-3.5 text-brand-500" />}>
              <input
                name="name"
                defaultValue={editing?.name}
                required
                placeholder="مثال: تنظيف وتلميع واجهات الزجاج"
                className="input"
              />
            </Field>

            <Field label="تصنيف وقسم الخدمة" icon={<Tag className="h-3.5 w-3.5 text-brand-500" />}>
              <div className="relative">
                <select
                  name="category"
                  defaultValue={editing?.category ?? ''}
                  className="input appearance-none pe-9"
                >
                  <option value="">بدون تصنيف</option>
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
              <Field label="المدة التقريبية (دقيقة) *" icon={<Clock className="h-3.5 w-3.5 text-brand-500" />}>
                <input
                  type="number"
                  name="default_duration_minutes"
                  min={1}
                  defaultValue={editing?.default_duration_minutes ?? 60}
                  required
                  className="input"
                />
              </Field>
              <Field label="السعر الافتراضي (SAR) *" icon={<DollarSign className="h-3.5 w-3.5 text-brand-500" />}>
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

            <Field label="وصف الخدمة والمميزات المشمولة" icon={<FileText className="h-3.5 w-3.5 text-brand-500" />}>
              <textarea
                name="description"
                defaultValue={editing?.description}
                rows={3}
                placeholder="مثال: يشمل غسيل الأرضيات، تلميع الأسطح، غسيل الشبابيك واستخدام مواد معتمدة..."
                className="input resize-none"
              />
            </Field>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span>
                <span className="block text-sm font-medium text-slate-700">حالة تفعيل الخدمة</span>
                <span className="block text-xs text-slate-400">الخدمة متاحة للحجز في قائمة المواعيد</span>
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
                {submitting ? 'جارِ الحفظ…' : editing ? 'حفظ التعديلات' : 'إضافة الخدمة'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="text-sm font-medium text-slate-400 hover:text-slate-600"
              >
                إلغاء
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
    if (!window.confirm(`حذف قسم "${c.name}"؟ ستفقد الخدمات المرتبطة به تصنيفها (بدون حذف الخدمات نفسها).`)) return;
    setBusy(true);
    try {
      await api.del(`/service-categories/${c.id}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="تعديل أقسام الخدمات" onClose={onClose}>
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
                  حفظ
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500"
                >
                  إلغاء
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
                  title="تعديل"
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  disabled={busy}
                  onClick={() => removeCategory(c)}
                  title="حذف"
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && <div className="text-center text-sm text-slate-400">لا توجد أقسام بعد</div>}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم قسم جديد"
          className="input flex-1"
        />
        <button
          disabled={busy}
          onClick={addCategory}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> إضافة
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Payment methods tab
// ---------------------------------------------------------------------------
function PaymentMethodsTab() {
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
        <p className="text-sm text-slate-400">طرق الدفع المتاحة عند تسجيل المصروفات وتحصيل الدفعات</p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> طريقة دفع جديدة
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">طريقة الدفع</th>
              <th className="p-3 text-start font-medium">الحالة</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium text-slate-700">{m.name}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${m.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {m.is_active ? 'مفعّلة' : 'موقوفة'}
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
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </button>
                </td>
              </tr>
            ))}
            {methods.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-400">
                  لا توجد طرق دفع بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editing ? `تعديل ${editing.name}` : 'طريقة دفع جديدة'}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="اسم طريقة الدفع">
              <input name="name" defaultValue={editing?.name} required className="input" placeholder="مثال: آجل / شيك" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
              مفعّلة (تظهر عند تسجيل مصروف أو تحصيل دفعة)
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ طريقة الدفع'}
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
        ? `حذف "${item.name}" سيحذف أيضاً ${childCount} بنداً فرعياً تحته. هل أنت متأكد؟`
        : `حذف "${item.name}"؟`;
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
          <h2 className="text-lg font-bold text-slate-800">العهد والمصروفات</h2>
          <p className="text-sm text-slate-400">إدارة بنود المصروفات الرئيسية (مثل مركبات، رواتب) والبنود الفرعية تحت كل بند</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormParentId(undefined);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> إضافة بند رئيسي
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
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {subs.length} بند فرعي
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
                    <Plus className="h-3.5 w-3.5" /> إضافة بند فرعي
                  </button>
                  <button
                    onClick={() => {
                      setEditing(main);
                      setShowForm(true);
                    }}
                    title="تعديل"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(main)}
                    title="حذف"
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
                          title="تعديل"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-brand-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(sub)}
                          title="حذف"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {subs.length === 0 && <div className="px-4 py-3 ps-10 text-xs text-slate-400">لا توجد بنود فرعية بعد</div>}
                </div>
              )}
            </div>
          );
        })}
        {mainCategories.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            لا توجد بنود بعد
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          title={editing ? `تعديل ${editing.name}` : formParentId ? 'بند فرعي جديد' : 'بند رئيسي جديد'}
          subtitle={
            editing?.parent_id
              ? `بند فرعي تحت "${parentNameOf(editing.parent_id) ?? ''}"`
              : formParentId
                ? `تحت "${parentNameOf(formParentId) ?? ''}"`
                : undefined
          }
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            setFormParentId(undefined);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="الاسم">
              <input name="name" defaultValue={editing?.name} required className="input" placeholder="مثال: بنزين" />
            </Field>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'users' | 'services' | 'payment_methods' | 'expense_categories'>('users');

  // Settings (including adding/editing users) is restricted to the general
  // manager and system admin — redirect anyone else away, in case they
  // reach the URL directly instead of via the (already role-filtered) nav.
  if (user && !SETTINGS_ACCESS_ROLES.includes(user.role)) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">الإعدادات</h1>
        <p className="text-sm text-slate-400">إدارة المستخدمين والوظائف، وإدارة خدمات النظافة وأسعارها</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'users' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
        >
          <UsersIcon className="h-4 w-4" /> المستخدمون
        </button>
        <button
          onClick={() => setTab('services')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'services' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
        >
          <ServicesIcon className="h-4 w-4" /> الخدمات
        </button>
        <button
          onClick={() => setTab('payment_methods')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'payment_methods' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
        >
          <PaymentIcon className="h-4 w-4" /> طرق الدفع
        </button>
        <button
          onClick={() => setTab('expense_categories')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'expense_categories' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
        >
          <ExpensesIcon className="h-4 w-4" /> العهد والمصروفات
        </button>
      </div>

      {tab === 'users' ? (
        <UsersTab />
      ) : tab === 'services' ? (
        <ServicesTab />
      ) : tab === 'payment_methods' ? (
        <PaymentMethodsTab />
      ) : (
        <ExpenseCategoriesTab />
      )}
    </div>
  );
}
