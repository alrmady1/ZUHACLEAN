import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Contract, Customer, Service } from '../../shared/types.js';
import { CAN_SEE_CONTRACT_VALUE_ROLES, CAN_SEE_CONTRACTS_ROLES } from '../../shared/types.js';
import { ContractStatusBadge, PaymentStatusBadge } from '../components/Badge.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

export default function Contracts() {
  const { user, allProfiles } = useAuth();
  const { t } = useI18n();
  const canSeeValue = user ? CAN_SEE_CONTRACT_VALUE_ROLES.includes(user.role) : false;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');

  function refresh() {
    api.get<Contract[]>('/contracts').then(setContracts);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
  }, []);

  // مخفية عن المشرف الميداني — حتى لو دخل الرابط مباشرة (بعد كل الـ hooks
  // أعلاه، حسب قواعد React — لا يجوز إرجاع مبكر قبلها).
  if (user && !CAN_SEE_CONTRACTS_ROLES.includes(user.role)) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/contracts', {
        customer_id: form.get('customer_id'),
        service_id: form.get('service_id'),
        contract_type: form.get('contract_type'),
        visit_frequency: form.get('visit_frequency'),
        visit_time: form.get('visit_time'),
        start_date: form.get('start_date'),
        end_date: form.get('end_date'),
        total_amount: Number(form.get('total_amount')),
        supervisor_id: form.get('supervisor_id') || undefined,
      });
      setShowForm(false);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('العقود الدورية')}</h1>
          <p className="text-sm text-slate-400">{t('تُولَّد الزيارات تلقائياً في جدول المواعيد عند إنشاء العقد')}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('عقد جديد')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('رقم العقد')}</th>
              <th className="p-3 text-start font-medium">{t('العميل')}</th>
              <th className="p-3 text-start font-medium">{t('الخدمة')}</th>
              <th className="p-3 text-start font-medium">{t('التكرار')}</th>
              <th className="p-3 text-start font-medium">{t('الزيارات')}</th>
              {canSeeValue && <th className="p-3 text-start font-medium">{t('القيمة')}</th>}
              <th className="p-3 text-start font-medium">{t('السداد')}</th>
              <th className="p-3 text-start font-medium">{t('الحالة')}</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-medium text-slate-700">{c.contract_number}</td>
                <td className="p-3 text-slate-600">{customers.find((x) => x.id === c.customer_id)?.name ?? '—'}</td>
                <td className="p-3 text-slate-600">{c.service_name_snapshot}</td>
                <td className="p-3 text-slate-600">
                  {c.visit_frequency === 'weekly' ? t('أسبوعي') : c.visit_frequency === 'bi_weekly' ? t('نصف شهري') : t('شهري')}
                </td>
                <td className="p-3 text-slate-600" dir="ltr">
                  {c.completed_visits} / {c.total_visits}
                </td>
                {canSeeValue && <td className="p-3 text-slate-600">{formatMoney(c.total_amount)}</td>}
                <td className="p-3">
                  <PaymentStatusBadge status={c.payment_status} />
                </td>
                <td className="p-3">
                  <ContractStatusBadge status={c.status} />
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={canSeeValue ? 8 : 7} className="p-8 text-center text-slate-400">
                  {t('لا توجد عقود بعد')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{t('عقد جديد')}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label={t('العميل')}>
                <select name="customer_id" required className="input">
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('الخدمة')}>
                <select name="service_id" required className="input">
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('نوع العقد')}>
                  <select name="contract_type" required className="input">
                    <option value="monthly">{t('شهري')}</option>
                    <option value="quarterly">{t('ربع سنوي')}</option>
                    <option value="semi_annual">{t('نصف سنوي')}</option>
                    <option value="annual">{t('سنوي')}</option>
                  </select>
                </Field>
                <Field label={t('تكرار الزيارات')}>
                  <select name="visit_frequency" required className="input">
                    <option value="weekly">{t('أسبوعي')}</option>
                    <option value="bi_weekly">{t('نصف شهري')}</option>
                    <option value="monthly">{t('شهري')}</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('تاريخ البدء')}>
                  <input type="date" name="start_date" required className="input" />
                </Field>
                <Field label={t('تاريخ الانتهاء')}>
                  <input type="date" name="end_date" required className="input" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('وقت الزيارة')}>
                  <input type="time" name="visit_time" defaultValue="09:00" className="input" />
                </Field>
                <Field label={t('القيمة الإجمالية (ر.س)')}>
                  <input type="number" name="total_amount" min={0} step="0.01" required className="input" />
                </Field>
              </div>

              <Field label={t('المشرف المسؤول')}>
                <select name="supervisor_id" defaultValue={user?.role === 'supervisor' ? user.id : ''} className="input">
                  <option value="">{t('بدون تحديد')}</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ وتوليد الزيارات…') : t('حفظ وتوليد الزيارات تلقائياً')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
