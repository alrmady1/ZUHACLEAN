import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, X, Eye, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Contract, Customer, Service } from '../../shared/types.js';
import { ContractStatusBadge, PaymentStatusBadge, AppointmentStatusBadge } from '../components/Badge.js';
import { formatMoney, formatDateAr, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

// أيام الأسبوع القابلة للاختيار (أكثر من يوم معاً) لعقود الزيارة
// الأسبوعية — المفاتيح تُرسَل للخادم كما هي وتُطابق getDay() JS (انظر
// generateAppointmentsForContract في src/server/routes/api.ts).
const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الاثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' },
  { key: 'saturday', label: 'السبت' },
];

export default function Contracts() {
  const { user, allProfiles, can } = useAuth();
  const { t, tt } = useI18n();
  const canSeeValue = can('view_contract_value');
  const canDeleteContract = can('delete_contracts');
  const canCreateContract = can('create_contracts');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formFrequency, setFormFrequency] = useState<'weekly' | 'bi_weekly' | 'monthly'>('weekly');
  const [viewingContract, setViewingContract] = useState<Contract | null>(null);

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');

  function refresh() {
    api.get<Contract[]>('/contracts').then(setContracts);
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
  }, []);

  // مخفية عن المشرف الميداني — حتى لو دخل الرابط مباشرة (بعد كل الـ hooks
  // أعلاه، حسب قواعد React — لا يجوز إرجاع مبكر قبلها).
  if (user && !can('view_contracts_page')) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const visitDays = form.getAll('visit_days_of_week') as string[];
    if (form.get('visit_frequency') === 'weekly' && visitDays.length === 0) {
      window.alert(t('اختر يوماً واحداً على الأقل لأيام الزيارة الأسبوعية'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/contracts', {
        customer_id: form.get('customer_id'),
        service_id: form.get('service_id'),
        contract_type: form.get('contract_type'),
        visit_frequency: form.get('visit_frequency'),
        visit_days_of_week: visitDays,
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

  async function deleteContract(c: Contract) {
    if (!window.confirm(tt(
      `حذف العقد ${c.contract_number} نهائياً؟ المواعيد المولَّدة منه سابقاً تبقى في جدول المواعيد ولا تُحذف. لا يمكن التراجع عن هذا الإجراء.`,
      `Delete contract ${c.contract_number} permanently? Appointments already generated from it remain in the schedule and are not deleted. This action cannot be undone.`,
    ))) return;
    await api.del(`/contracts/${c.id}`);
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('العقود الدورية')}</h1>
          <p className="text-sm text-slate-400">{t('تُولَّد الزيارات تلقائياً في جدول المواعيد عند إنشاء العقد')}</p>
        </div>
        {canCreateContract && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('عقد جديد')}
          </button>
        )}
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
              <th className="p-3 text-start font-medium">{t('إجراء')}</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr
                key={c.id}
                onClick={() => setViewingContract(c)}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
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
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingContract(c);
                      }}
                      title={t('عرض التفاصيل')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {canDeleteContract && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteContract(c);
                        }}
                        title={t('حذف العقد نهائياً')}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={canSeeValue ? 9 : 8} className="p-8 text-center text-slate-400">
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
                  <select
                    name="visit_frequency"
                    required
                    className="input"
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value as typeof formFrequency)}
                  >
                    <option value="weekly">{t('أسبوعي')}</option>
                    <option value="bi_weekly">{t('نصف شهري')}</option>
                    <option value="monthly">{t('شهري')}</option>
                  </select>
                </Field>
              </div>

              {formFrequency === 'weekly' && (
                <Field label={t('أيام الزيارة الأسبوعية (يمكن اختيار أكثر من يوم)')}>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {WEEKDAYS.map((d) => (
                      <label
                        key={d.key}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                      >
                        <input type="checkbox" name="visit_days_of_week" value={d.key} className="h-3.5 w-3.5" />
                        {t(d.label)}
                      </label>
                    ))}
                  </div>
                </Field>
              )}

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

      {viewingContract && (
        <ContractDetailModal
          contract={viewingContract}
          customerName={customers.find((x) => x.id === viewingContract.customer_id)?.name}
          appointments={appointments.filter((a) => a.contract_id === viewingContract.id)}
          canSeeValue={canSeeValue}
          canDelete={canDeleteContract}
          onClose={() => setViewingContract(null)}
          onDelete={() => {
            deleteContract(viewingContract);
            setViewingContract(null);
          }}
        />
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

function ContractDetailModal({
  contract,
  customerName,
  appointments,
  canSeeValue,
  canDelete,
  onClose,
  onDelete,
}: {
  contract: Contract;
  customerName: string | undefined;
  appointments: Appointment[];
  canSeeValue: boolean;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const sortedAppts = [...appointments].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const selectedDays = contract.visit_days_of_week ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{contract.contract_number}</h2>
            <p className="text-xs text-slate-400">{customerName ?? '—'}</p>
          </div>
          <div className="flex items-center gap-1">
            {canDelete && (
              <button
                onClick={onDelete}
                title={t('حذف العقد نهائياً')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-400">{t('الخدمة')}</div>
              <div className="font-medium text-slate-700">{contract.service_name_snapshot}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('التكرار')}</div>
              <div className="font-medium text-slate-700">
                {contract.visit_frequency === 'weekly' ? t('أسبوعي') : contract.visit_frequency === 'bi_weekly' ? t('نصف شهري') : t('شهري')}
              </div>
            </div>
            {selectedDays.length > 0 && (
              <div className="col-span-2">
                <div className="text-xs text-slate-400">{t('أيام الزيارة الأسبوعية')}</div>
                <div className="font-medium text-slate-700">
                  {selectedDays.map((d) => t(WEEKDAYS.find((w) => w.key === d)?.label ?? d)).join('، ')}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-400">{t('تاريخ البدء')}</div>
              <div className="font-medium text-slate-700" dir="ltr">{contract.start_date}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('تاريخ الانتهاء')}</div>
              <div className="font-medium text-slate-700" dir="ltr">{contract.end_date}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('الزيارات')}</div>
              <div className="font-medium text-slate-700" dir="ltr">{contract.completed_visits} / {contract.total_visits}</div>
            </div>
            {canSeeValue && (
              <div>
                <div className="text-xs text-slate-400">{t('القيمة')}</div>
                <div className="font-medium text-slate-700">{formatMoney(contract.total_amount)}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-400">{t('السداد')}</div>
              <PaymentStatusBadge status={contract.payment_status} />
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('الحالة')}</div>
              <ContractStatusBadge status={contract.status} />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">
              {t('المواعيد المولَّدة من هذا العقد')} ({sortedAppts.length})
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {sortedAppts.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                  <span className="text-slate-600">
                    {formatDateAr(a.scheduled_at)} · {formatTimeAr(a.scheduled_at)}
                  </span>
                  <AppointmentStatusBadge status={a.status} />
                </div>
              ))}
              {sortedAppts.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  {t('لا توجد مواعيد مولَّدة من هذا العقد')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
