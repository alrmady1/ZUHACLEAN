import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, X, Pencil, Users as UsersIcon, Wrench as ServicesIcon } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Profile, Service, UserRole } from '../../shared/types.js';
import { ROLE_LABELS_AR } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';

const ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'supervisor', 'technician'];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.get<Profile[]>('/profiles').then(setProfiles);
  }
  useEffect(refresh, []);

  const supervisors = profiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">إدارة حسابات المستخدمين: الاسم، الوظيفة، واسم المستخدم/كلمة المرور</p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> مستخدم جديد
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">الاسم</th>
              <th className="p-3 text-start font-medium">البريد / الجوال</th>
              <th className="p-3 text-start font-medium">الوظيفة</th>
              <th className="p-3 text-start font-medium">اسم المستخدم</th>
              <th className="p-3 text-start font-medium">الحالة</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium text-slate-700">{p.full_name}</td>
                <td className="p-3 text-slate-600">{p.email || p.phone || '—'}</td>
                <td className="p-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {ROLE_LABELS_AR[p.role]}
                  </span>
                </td>
                <td className="p-3 text-slate-600">{p.username || '—'}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {p.is_active ? 'نشط' : 'موقوف'}
                  </span>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => {
                      setEditing(p);
                      setShowForm(true);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.get<Service[]>('/services').then(setServices);
  }
  useEffect(refresh, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name'),
      description: form.get('description') || undefined,
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">خدمات النظافة المتاحة: السعر والوقت المتوقع الافتراضيان لكل خدمة</p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> خدمة جديدة
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">الخدمة</th>
              <th className="p-3 text-start font-medium">السعر الافتراضي</th>
              <th className="p-3 text-start font-medium">الوقت المتوقع</th>
              <th className="p-3 text-start font-medium">الحالة</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium text-slate-700">{s.name}</td>
                <td className="p-3 text-slate-600">{formatMoney(s.default_price)}</td>
                <td className="p-3 text-slate-600">{s.default_duration_minutes} دقيقة</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {s.is_active ? 'مفعّلة' : 'موقوفة'}
                  </span>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => {
                      setEditing(s);
                      setShowForm(true);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </button>
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  لا توجد خدمات بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editing ? `تعديل ${editing.name}` : 'خدمة جديدة'}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="اسم الخدمة">
              <input name="name" defaultValue={editing?.name} required className="input" />
            </Field>
            <Field label="وصف مختصر (اختياري)">
              <input name="description" defaultValue={editing?.description} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="السعر الافتراضي (ر.س)">
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
              <Field label="الوقت المتوقع (دقيقة)">
                <input
                  type="number"
                  name="default_duration_minutes"
                  min={1}
                  defaultValue={editing?.default_duration_minutes ?? 60}
                  required
                  className="input"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
              الخدمة مفعّلة (تظهر عند إنشاء موعد أو عقد جديد)
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ الخدمة'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function Settings() {
  const [tab, setTab] = useState<'users' | 'services'>('users');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">الإعدادات</h1>
        <p className="text-sm text-slate-400">إدارة المستخدمين والوظائف، وإدارة خدمات النظافة وأسعارها</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 w-fit">
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
      </div>

      {tab === 'users' ? <UsersTab /> : <ServicesTab />}
    </div>
  );
}
