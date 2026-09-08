import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Profile, UserRole } from '../../shared/types.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

const ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'supervisor', 'technician'];

// نموذج إضافة/تعديل موظف — منقول حرفياً من UsersTab في Settings.tsx (كان
// معرَّفاً هناك فقط) إلى عنصر مشترك، حتى تستخدمه أيضاً EmployeeAccountsTab
// (زهى ← المحاسبة ← الموظفين) دون تكرار نفس منطق الحفظ/التحقق. الحفظ
// الفعلي (POST/PATCH /profiles) وصلاحية الوصول لكل صفحة تبقيان كما هما —
// هذا العنصر نفسه لا يضيف أي قيد صلاحيات جديد.
export default function EmployeeFormModal({
  editing,
  supervisors,
  onClose,
  onSaved,
}: {
  editing: Profile | null;
  supervisors: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tt, roleLabel } = useI18n();
  const { refreshProfiles } = useAuth();
  const [submitting, setSubmitting] = useState(false);

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
      // entirely، فلو اختير "بدون تحديد" لن يصل الحقل للخادم إطلاقاً ولن
      // يُزال ربط أي مشرف سابق محفوظ فعلاً.
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
      await refreshProfiles();
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-800">{editing ? tt(`تعديل ${editing.full_name}`, `Edit ${editing.full_name}`) : t('موظف جديد')}</h2>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('الاسم الكامل')}</span>
            <input name="full_name" defaultValue={editing?.full_name} required className="input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('البريد الإلكتروني')}</span>
              <input type="email" name="email" defaultValue={editing?.email} className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('الجوال')}</span>
              <input name="phone" defaultValue={editing?.phone} className="input" placeholder="05xxxxxxxx" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('الوظيفة')}</span>
            <select name="role" defaultValue={editing?.role ?? 'technician'} required className="input">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('المشرف المسؤول (للفنيين)')}</span>
            <select name="supervisor_id" defaultValue={editing?.supervisor_id ?? ''} className="input">
              <option value="">{t('بدون تحديد')}</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('اسم المستخدم')}</span>
              <input name="username" defaultValue={editing?.username} className="input" placeholder="username" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{editing ? t('كلمة مرور جديدة (اختياري)') : t('كلمة المرور')}</span>
              <input type="password" name="password" className="input" placeholder="••••••" />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('حفظ الموظف')}
          </button>
        </form>
      </div>
    </div>
  );
}
