import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, X, Eye, Trash2, Pencil, Check, Printer, Wallet, User } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Contract, Customer, Service, PaymentMethodOption, NeighborhoodZoneAssignment, ContractScheduleItem } from '../../shared/types.js';
import { ContractStatusBadge, PaymentStatusBadge, AppointmentStatusBadge } from '../components/Badge.js';
import { formatMoney, formatDateAr, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { WEEKDAYS } from '../../shared/weekdays.js';
import { phoneMatchesQuery } from '../../shared/phone.js';
import ContractDocument from '../components/ContractDocument.js';

// allowCreate=false (تبويب "العقود" داخل المحاسبة) يُخفي زر/نموذج "عقد
// جديد" بصرف النظر عن صلاحية create_contracts — تلك الصفحة مخصَّصة لمتابعة
// الأمور المالية للعقود (الدفعات، المتبقي، عرض بيانات العقد) وليس لإنشاء
// عقود جديدة، وهو ما يبقى حصراً في صفحة "العقود" المستقلة (/contracts).
export default function Contracts({ allowCreate = true }: { allowCreate?: boolean } = {}) {
  const { user, allProfiles, can } = useAuth();
  const { t, tt } = useI18n();
  const canSeeValue = can('view_contract_value');
  const canDeleteContract = can('delete_contracts');
  const canCreateContract = allowCreate && can('create_contracts');
  const canEditContract = can('edit_contracts');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formFrequency, setFormFrequency] = useState<'weekly' | 'bi_weekly' | 'monthly'>('weekly');
  const [formDays, setFormDays] = useState<string[]>([]);
  const [formDaySupervisors, setFormDaySupervisors] = useState<Record<string, string>>({});
  // وقت مختلف لكل يوم زيارة (اختياري) — يوم بلا قيمة هنا يستخدم حقل "وقت
  // الزيارة" العام كافتراضي. نفس فكرة formDaySupervisors بالضبط.
  const [formDayTimes, setFormDayTimes] = useState<Record<string, string>>({});
  // مُتحكَّم به (لا defaultValue) لأن جدول الدفعات أدناه يحتاج قيمته الحيّة
  // لحساب مبلغ كل بند من نسبته المئوية فور إدخالها.
  const [formTotalAmount, setFormTotalAmount] = useState('');
  const [viewingContract, setViewingContract] = useState<Contract | null>(null);
  const [printingContract, setPrintingContract] = useState<Contract | null>(null);

  // العميل — بحث/اختيار من المسجَّلين، أو إنشاء عميل جديد مباشرة من هنا
  // (نفس نمط NewQuoteFlow.tsx/NewAppointmentModal.tsx بالضبط).
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const customerBoxRef = useRef<HTMLDivElement>(null);
  const newCustomerBoxRef = useRef<HTMLDivElement>(null);
  const [neighborhoodZones, setNeighborhoodZones] = useState<NeighborhoodZoneAssignment[]>([]);

  // جدول دفعات العقد — بنود بنسبة/مبلغ وتاريخ استحقاق، تُبنى هنا كنص خام
  // (تُحوَّل لأرقام عند الإرسال) لتبسيط التحكّم بالحقول أثناء الكتابة.
  const [scheduleRows, setScheduleRows] = useState<{ percent: string; amount: string; due_date: string }[]>([]);

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const methodName = (id: string | undefined) => (id ? paymentMethods.find((m) => m.id === id)?.name ?? id : undefined);

  function refresh() {
    api.get<Contract[]>('/contracts').then(setContracts);
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
    api.get<PaymentMethodOption[]>('/payment-methods').then(setPaymentMethods);
    api.get<NeighborhoodZoneAssignment[]>('/neighborhood-zones').then(setNeighborhoodZones).catch(() => {});
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const customerSearchQuery = customerSearch.trim().toLowerCase();
  const filteredCustomers = !customerSearchQuery
    ? customers
    : customers.filter(
        (c) =>
          c.id === customerId ||
          c.name.toLowerCase().includes(customerSearchQuery) ||
          phoneMatchesQuery(c.phone, customerSearchQuery) ||
          (c.district ?? '').toLowerCase().includes(customerSearchQuery) ||
          (c.city ?? '').toLowerCase().includes(customerSearchQuery),
      );

  async function createNewCustomer() {
    const container = newCustomerBoxRef.current;
    if (!container) return;
    const get = (n: string) => (container.querySelector(`[name="${n}"]`) as HTMLInputElement)?.value;
    const name = get('new_customer_name');
    const phone = get('new_customer_phone');
    const address = get('new_customer_address');
    if (!name || !phone || !address) return;
    setAddingCustomer(true);
    try {
      const created = await api.post<Customer>('/customers', {
        name,
        phone,
        address,
        district: get('new_customer_district') || undefined,
        city: get('new_customer_city') || undefined,
      });
      setCustomers((prev) => [...prev, created]);
      setCustomerId(created.id);
      setCustomerSearch(created.name);
      setShowAddCustomer(false);
    } finally {
      setAddingCustomer(false);
    }
  }

  // بناء صفوف جدول الدفعات
  function addScheduleRow() {
    setScheduleRows((prev) => [...prev, { percent: '', amount: '', due_date: '' }]);
  }
  function removeScheduleRow(idx: number) {
    setScheduleRows((prev) => prev.filter((_, i) => i !== idx));
  }
  // تغيير النسبة يُعيد حساب المبلغ تلقائياً من القيمة الإجمالية الحالية —
  // يبقى المبلغ قابلاً للتعديل اليدوي مباشرةً بعدها (لا حساب عكسي من
  // المبلغ إلى النسبة، تفادياً لحلقة تحديث متبادلة).
  function updateScheduleRow(idx: number, field: 'percent' | 'amount' | 'due_date', value: string, totalAmount: number) {
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
  const scheduleTotalPercent = scheduleRows.reduce((s, r) => s + (Number(r.percent) || 0), 0);

  // مخفية عن المشرف الميداني — حتى لو دخل الرابط مباشرة (بعد كل الـ hooks
  // أعلاه، حسب قواعد React — لا يجوز إرجاع مبكر قبلها).
  if (user && !can('view_contracts_page')) return <Navigate to="/" replace />;

  function toggleFormDay(key: string) {
    setFormDays((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('visit_frequency') === 'weekly' && formDays.length === 0) {
      window.alert(t('اختر يوماً واحداً على الأقل لأيام الزيارة الأسبوعية'));
      return;
    }
    if (!customerId) {
      window.alert(t('اختر عميلاً أو أنشئ عميلاً جديداً أولاً'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/contracts', {
        customer_id: customerId,
        service_id: form.get('service_id'),
        contract_type: form.get('contract_type'),
        visit_frequency: form.get('visit_frequency'),
        visit_days_of_week: formDays,
        visit_time: form.get('visit_time'),
        visit_day_times:
          form.get('visit_frequency') === 'weekly'
            ? Object.fromEntries(Object.entries(formDayTimes).filter(([k, v]) => formDays.includes(k) && v))
            : undefined,
        start_date: form.get('start_date'),
        end_date: form.get('end_date'),
        total_amount: Number(form.get('total_amount')),
        payment_method: form.get('payment_method') || undefined,
        due_date: form.get('due_date') || undefined,
        payment_schedule: scheduleRows
          .filter((r) => r.amount && r.due_date)
          .map((r) => ({ percent: r.percent ? Number(r.percent) : undefined, amount: Number(r.amount), due_date: r.due_date })),
        supervisor_id: form.get('supervisor_id') || undefined,
        day_supervisors:
          form.get('visit_frequency') === 'weekly'
            ? Object.fromEntries(Object.entries(formDaySupervisors).filter(([k, v]) => formDays.includes(k) && v))
            : undefined,
      });
      setShowForm(false);
      setFormDays([]);
      setFormDaySupervisors({});
      setFormDayTimes({});
      setScheduleRows([]);
      setFormTotalAmount('');
      setCustomerId('');
      setCustomerSearch('');
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('العقود الدورية')}</h1>
          <p className="text-sm text-slate-400">
            {allowCreate
              ? t('تُولَّد الزيارات تلقائياً في جدول المواعيد عند إنشاء العقد')
              : t('متابعة الدفعات والمبالغ المتبقية وبيانات العقود — إنشاء عقد جديد من صفحة "العقود" في القائمة الجانبية')}
          </p>
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
              <th className="p-3 text-start font-medium">{t('طريقة الدفع')}</th>
              <th className="p-3 text-start font-medium">{t('الاستحقاق')}</th>
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
                <td className="p-3 text-slate-600">{methodName(c.payment_method) ?? '—'}</td>
                <td className="p-3 text-slate-600" dir="ltr">{c.due_date || '—'}</td>
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrintingContract(c);
                      }}
                      title={t('عرض العقد الرسمي وطباعته')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                    >
                      <Printer className="h-4 w-4" />
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
                <td colSpan={canSeeValue ? 11 : 10} className="p-8 text-center text-slate-400">
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
              {/* العميل — بحث/اختيار، أو إنشاء عميل جديد مباشرة إن لم يظهر
                  ضمن المسجَّلين (نفس نمط NewQuoteFlow.tsx/NewAppointmentModal.tsx). */}
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    {t('العميل *')} <User className="h-3.5 w-3.5 text-brand-500" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomer((v) => !v)}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t('إنشاء عميل جديد')}
                  </button>
                </div>

                {!showAddCustomer && (
                  <div ref={customerBoxRef} className="relative">
                    <input
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      placeholder={t('ابحث بالاسم، الجوال، الحي، أو المدينة...')}
                      className="input"
                    />
                    {showSuggestions && (
                      <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                        {filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCustomerId(c.id);
                              setCustomerSearch(c.name);
                              setShowSuggestions(false);
                            }}
                            className={`flex w-full flex-col gap-0.5 px-3 py-2 text-start text-sm hover:bg-slate-50 ${c.id === customerId ? 'bg-brand-50' : ''}`}
                          >
                            <span className="font-medium text-slate-700">{c.name}</span>
                            <span dir="ltr" className="text-end text-xs text-slate-400">{c.phone}</span>
                          </button>
                        ))}
                        {filteredCustomers.length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-400">{t('لا يوجد عميل مطابق لبحثك')}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {showAddCustomer && (
                  <div ref={newCustomerBoxRef} className="space-y-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input name="new_customer_name" placeholder={t('الاسم')} className="input" />
                      <input name="new_customer_phone" placeholder="05xxxxxxxx" className="input" />
                    </div>
                    <input name="new_customer_address" placeholder={t('العنوان')} className="input" />
                    <datalist id="riyadh-districts-list">
                      {Array.from(new Set(neighborhoodZones.map((n) => n.neighborhood)))
                        .sort((a, b) => a.localeCompare(b, 'ar'))
                        .map((name) => (
                          <option key={name} value={name} />
                        ))}
                    </datalist>
                    <div className="grid grid-cols-2 gap-2">
                      <input name="new_customer_district" list="riyadh-districts-list" placeholder={t('الحي (اختياري)')} className="input" />
                      <input name="new_customer_city" defaultValue="الرياض" placeholder={t('المدينة (اختياري)')} className="input" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={addingCustomer}
                        onClick={createNewCustomer}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {addingCustomer ? t('جارِ الحفظ…') : t('حفظ العميل')}
                      </button>
                      {customers.length > 0 && (
                        <button type="button" onClick={() => setShowAddCustomer(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500">
                          {t('إلغاء')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {customerId && !showAddCustomer && (
                  <p className="text-xs text-emerald-600">
                    {t('العميل المختار')}: {customers.find((c) => c.id === customerId)?.name}
                  </p>
                )}
              </div>

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
                        <input
                          type="checkbox"
                          checked={formDays.includes(d.key)}
                          onChange={() => toggleFormDay(d.key)}
                          className="h-3.5 w-3.5"
                        />
                        {t(d.label)}
                      </label>
                    ))}
                  </div>
                </Field>
              )}

              {formFrequency === 'weekly' && formDays.length > 0 && (
                <Field label={t('مشرف كل يوم زيارة (اختياري — إن تُرك بدون تحديد يُستخدم المشرف الافتراضي أدناه)')}>
                  <div className="space-y-2">
                    {formDays.map((dayKey) => (
                      <div key={dayKey} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs text-slate-500">
                          {t(WEEKDAYS.find((w) => w.key === dayKey)?.label ?? dayKey)}
                        </span>
                        <select
                          value={formDaySupervisors[dayKey] ?? ''}
                          onChange={(e) => setFormDaySupervisors((prev) => ({ ...prev, [dayKey]: e.target.value }))}
                          className="input"
                        >
                          <option value="">{t('نفس المشرف الافتراضي')}</option>
                          {supervisors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </Field>
              )}

              {formFrequency === 'weekly' && formDays.length > 0 && (
                <Field label={t('وقت كل يوم زيارة (اختياري — إن تُرك بدون تحديد يُستخدم "وقت الزيارة" العام أدناه)')}>
                  <div className="space-y-2">
                    {formDays.map((dayKey) => (
                      <div key={dayKey} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs text-slate-500">
                          {t(WEEKDAYS.find((w) => w.key === dayKey)?.label ?? dayKey)}
                        </span>
                        <input
                          type="time"
                          value={formDayTimes[dayKey] ?? ''}
                          onChange={(e) => setFormDayTimes((prev) => ({ ...prev, [dayKey]: e.target.value }))}
                          className="input"
                        />
                      </div>
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
                  <input
                    type="number"
                    name="total_amount"
                    min={0}
                    step="0.01"
                    required
                    value={formTotalAmount}
                    onChange={(e) => setFormTotalAmount(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('طريقة تحصيل العقد')}>
                  <select name="payment_method" defaultValue="" className="input">
                    <option value="">{t('بدون تحديد')}</option>
                    {paymentMethods
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t('تاريخ استحقاق الدفعة القادمة (اختياري)')}>
                  <input type="date" name="due_date" className="input" />
                </Field>
              </div>

              {/* جدول دفعات اختياري — يقسّم القيمة الإجمالية على بنود بنسبة
                  ومبلغ وتاريخ استحقاق مستقل لكل بند، بدل تاريخ استحقاق واحد
                  فقط أعلاه. اختياري تماماً — عقد بلا أي بند هنا يبقى يعمل
                  بنفس آلية due_date/تسجيل دفعة العامة كما كانت. */}
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">{t('جدول الدفعات (اختياري)')}</span>
                  <button
                    type="button"
                    onClick={addScheduleRow}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t('إضافة دفعة')}
                  </button>
                </div>
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
                            onChange={(e) => updateScheduleRow(idx, 'percent', e.target.value, Number(formTotalAmount) || 0)}
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
                            onChange={(e) => updateScheduleRow(idx, 'amount', e.target.value, Number(formTotalAmount) || 0)}
                            className="input"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="mb-1 block text-slate-500">{t('تاريخ الاستحقاق')}</span>
                          <input
                            type="date"
                            value={row.due_date}
                            onChange={(e) => updateScheduleRow(idx, 'due_date', e.target.value, Number(formTotalAmount) || 0)}
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
                        `إجمالي بنود الجدول: ${formatMoney(scheduleTotalAmount)} (${scheduleTotalPercent.toFixed(1)}%)${formTotalAmount ? ` من ${formatMoney(Number(formTotalAmount))}` : ''}`,
                        `Schedule total: ${formatMoney(scheduleTotalAmount)} (${scheduleTotalPercent.toFixed(1)}%)${formTotalAmount ? ` of ${formatMoney(Number(formTotalAmount))}` : ''}`,
                      )}
                    </div>
                  </div>
                )}
                {scheduleRows.length === 0 && <p className="text-xs text-slate-400">{t('بلا جدول دفعات — العقد يستخدم تاريخ استحقاق واحد فقط')}</p>}
              </div>

              <Field label={formFrequency === 'weekly' ? t('المشرف الافتراضي') : t('المشرف المسؤول')}>
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
          services={services}
          supervisors={supervisors}
          paymentMethods={paymentMethods}
          canSeeValue={canSeeValue}
          canDelete={canDeleteContract}
          canEdit={canEditContract}
          onClose={() => setViewingContract(null)}
          onDelete={() => {
            deleteContract(viewingContract);
            setViewingContract(null);
          }}
          onSaved={(updated) => {
            setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setViewingContract(updated);
          }}
        />
      )}

      {printingContract && (
        <ContractDocument
          contract={printingContract}
          customer={customers.find((x) => x.id === printingContract.customer_id)}
          canEdit={canEditContract}
          onClose={() => setPrintingContract(null)}
          onSaved={(updated) => {
            setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setPrintingContract(updated);
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
  services,
  supervisors,
  paymentMethods,
  canSeeValue,
  canDelete,
  canEdit,
  onClose,
  onDelete,
  onSaved,
}: {
  contract: Contract;
  customerName: string | undefined;
  appointments: Appointment[];
  services: Service[];
  supervisors: { id: string; full_name: string }[];
  paymentMethods: PaymentMethodOption[];
  canSeeValue: boolean;
  canDelete: boolean;
  canEdit: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSaved: (updated: Contract) => void;
}) {
  const { t, tt } = useI18n();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serviceId, setServiceId] = useState(contract.service_id);
  const [contractType, setContractType] = useState(contract.contract_type);
  const [visitFrequency, setVisitFrequency] = useState(contract.visit_frequency);
  const [visitDays, setVisitDays] = useState<string[]>(contract.visit_days_of_week ?? []);
  const [daySupervisors, setDaySupervisors] = useState<Record<string, string>>(contract.day_supervisors ?? {});
  const [visitTime, setVisitTime] = useState(contract.visit_time ?? '09:00');
  const [startDate, setStartDate] = useState(contract.start_date);
  const [endDate, setEndDate] = useState(contract.end_date);
  const [totalAmount, setTotalAmount] = useState(String(contract.total_amount));
  const [supervisorId, setSupervisorId] = useState(contract.supervisor_id ?? '');
  const [status, setStatus] = useState(contract.status);
  const [paymentMethod, setPaymentMethod] = useState(contract.payment_method ?? '');
  const [dueDate, setDueDate] = useState(contract.due_date ?? '');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodForNew, setPaymentMethodForNew] = useState(paymentMethods[0]?.id ?? '');
  const [recordingPayment, setRecordingPayment] = useState(false);
  // بند جدول الدفعات الذي تُسجَّل هذه الدفعة مقابله (إن كان للعقد جدول
  // دفعات أصلاً) — اختياري، لا يمنع تسجيل دفعة عامة بلا ربط ببند بعينه.
  const [scheduleItemForPayment, setScheduleItemForPayment] = useState('');

  const sortedAppts = [...appointments].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const selectedDays = contract.visit_days_of_week ?? [];
  const supervisorName = (id: string | undefined) => (id ? supervisors.find((s) => s.id === id)?.full_name : undefined);
  const defaultSupervisorName = supervisorName(contract.supervisor_id) ?? t('بدون تحديد');
  const methodName = (id: string | undefined) => (id ? paymentMethods.find((m) => m.id === id)?.name ?? id : undefined);
  // المتبقي من مدة العقد بالأيام — فرق تاريخ اليوم عن end_date، سالب/صفر
  // لعقد منتهٍ بالفعل (لا يُعرض كرقم سالب مربك، بل "منتهي").
  const daysRemaining = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86400000);
  const sortedPayments = [...contract.payments].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

  async function recordPayment() {
    if (!paymentAmount || Number(paymentAmount) <= 0 || !paymentMethodForNew) return;
    setRecordingPayment(true);
    try {
      const updated = await api.post<Contract>(`/contracts/${contract.id}/payments`, {
        amount: Number(paymentAmount),
        method: paymentMethodForNew,
        schedule_item_id: scheduleItemForPayment || undefined,
      });
      onSaved(updated);
      setShowPaymentForm(false);
      setPaymentAmount('');
      setScheduleItemForPayment('');
    } finally {
      setRecordingPayment(false);
    }
  }

  function startEditing() {
    setServiceId(contract.service_id);
    setContractType(contract.contract_type);
    setVisitFrequency(contract.visit_frequency);
    setVisitDays(contract.visit_days_of_week ?? []);
    setDaySupervisors(contract.day_supervisors ?? {});
    setVisitTime(contract.visit_time ?? '09:00');
    setStartDate(contract.start_date);
    setEndDate(contract.end_date);
    setPaymentMethod(contract.payment_method ?? '');
    setDueDate(contract.due_date ?? '');
    setTotalAmount(String(contract.total_amount));
    setSupervisorId(contract.supervisor_id ?? '');
    setStatus(contract.status);
    setEditing(true);
  }

  function toggleDay(key: string) {
    setVisitDays((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]));
  }

  async function save() {
    if (visitFrequency === 'weekly' && visitDays.length === 0) {
      window.alert(t('اختر يوماً واحداً على الأقل لأيام الزيارة الأسبوعية'));
      return;
    }
    setSubmitting(true);
    try {
      const service = services.find((s) => s.id === serviceId);
      const updated = await api.patch<Contract>(`/contracts/${contract.id}`, {
        service_id: serviceId,
        service_name_snapshot: service?.name ?? contract.service_name_snapshot,
        contract_type: contractType,
        visit_frequency: visitFrequency,
        visit_days_of_week: visitFrequency === 'weekly' ? visitDays : [],
        visit_time: visitTime,
        start_date: startDate,
        end_date: endDate,
        total_amount: Number(totalAmount),
        supervisor_id: supervisorId || null,
        day_supervisors:
          visitFrequency === 'weekly'
            ? Object.fromEntries(Object.entries(daySupervisors).filter(([k, v]) => visitDays.includes(k) && v))
            : null,
        status,
        payment_method: paymentMethod || null,
        due_date: dueDate || null,
      });
      onSaved(updated);
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{contract.contract_number}</h2>
            <p className="text-xs text-slate-400">{customerName ?? '—'}</p>
          </div>
          <div className="flex items-center gap-1">
            {!editing && canEdit && (
              <button
                onClick={startEditing}
                title={t('تعديل بيانات العقد')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
            {!editing && canDelete && (
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
          {!editing ? (
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
                  <div className="text-xs text-slate-400">{t('أيام الزيارة الأسبوعية والمشرف المسؤول عن كل يوم')}</div>
                  <div className="mt-1 space-y-1">
                    {selectedDays.map((d) => (
                      <div key={d} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">{t(WEEKDAYS.find((w) => w.key === d)?.label ?? d)}</span>
                        <span className="text-slate-500">
                          {supervisorName(contract.day_supervisors?.[d]) ?? tt(`${defaultSupervisorName} (افتراضي)`, `${defaultSupervisorName} (default)`)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedDays.length === 0 && (
                <div>
                  <div className="text-xs text-slate-400">{t('المشرف المسؤول')}</div>
                  <div className="font-medium text-slate-700">{defaultSupervisorName}</div>
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
                <div className="text-xs text-slate-400">{t('الزيارات (مكتملة / إجمالي)')}</div>
                <div className="font-medium text-slate-700" dir="ltr">{contract.completed_visits} / {contract.total_visits}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">{t('المتبقي من مدة العقد')}</div>
                <div className={`font-medium ${daysRemaining < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {daysRemaining < 0 ? t('منتهي') : tt(`${daysRemaining} يوم`, `${daysRemaining} days`)}
                </div>
              </div>
              {canSeeValue && (
                <>
                  <div>
                    <div className="text-xs text-slate-400">{t('القيمة الإجمالية')}</div>
                    <div className="font-medium text-slate-700">{formatMoney(contract.total_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">{t('المبلغ المتبقي')}</div>
                    <div className="font-medium text-slate-700">{formatMoney(contract.remaining_amount)}</div>
                  </div>
                </>
              )}
              <div>
                <div className="text-xs text-slate-400">{t('طريقة التحصيل')}</div>
                <div className="font-medium text-slate-700">{methodName(contract.payment_method) ?? t('بدون تحديد')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">{t('تاريخ استحقاق الدفعة القادمة')}</div>
                <div className="font-medium text-slate-700" dir="ltr">{contract.due_date || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">{t('السداد')}</div>
                <PaymentStatusBadge status={contract.payment_status} />
              </div>
              <div>
                <div className="text-xs text-slate-400">{t('الحالة')}</div>
                <ContractStatusBadge status={contract.status} />
              </div>

              {canSeeValue && contract.payment_schedule && contract.payment_schedule.length > 0 && (
                <div className="col-span-2">
                  <div className="mb-2 text-xs font-medium text-slate-500">{t('جدول الدفعات — المستحقة والمستلمة')}</div>
                  <div className="space-y-1.5">
                    {contract.payment_schedule.map((item) => {
                      const itemRemaining = Math.max(item.amount - item.paid_amount, 0);
                      return (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                          <span className="text-slate-500" dir="ltr">{formatDateAr(item.due_date)}</span>
                          <span className="font-medium text-slate-700">
                            {formatMoney(item.amount)}
                            {item.percent != null && ` (${item.percent}%)`}
                          </span>
                          {item.status === 'paid' ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{t('مستلمة بالكامل')}</span>
                          ) : item.status === 'partial' ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                              {tt(`جزئية — متبقٍ ${formatMoney(itemRemaining)}`, `Partial — ${formatMoney(itemRemaining)} remaining`)}
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">{t('مستحقة')}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {canSeeValue && (
                <div className="col-span-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-medium text-slate-500">{t('الدفعات المسجَّلة')}</div>
                    {canEdit && (
                      <button
                        onClick={() => setShowPaymentForm((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                      >
                        <Wallet className="h-3.5 w-3.5" /> {t('تسجيل دفعة')}
                      </button>
                    )}
                  </div>
                  {showPaymentForm && (
                    <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                      {contract.payment_schedule && contract.payment_schedule.length > 0 && (
                        <label className="text-xs">
                          <span className="mb-1 block text-slate-500">{t('مقابل أي دفعة من الجدول؟')}</span>
                          <select
                            value={scheduleItemForPayment}
                            onChange={(e) => {
                              const itemId = e.target.value;
                              setScheduleItemForPayment(itemId);
                              const item = contract.payment_schedule?.find((s) => s.id === itemId);
                              if (item) setPaymentAmount(String(Math.max(item.amount - item.paid_amount, 0)));
                            }}
                            className="input"
                          >
                            <option value="">{t('بدون ربط ببند محدَّد')}</option>
                            {contract.payment_schedule
                              .filter((s) => s.status !== 'paid')
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {formatDateAr(s.due_date)} — {formatMoney(Math.max(s.amount - s.paid_amount, 0))}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      <label className="text-xs">
                        <span className="mb-1 block text-slate-500">{t('المبلغ (ر.س)')}</span>
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className="input w-28"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="mb-1 block text-slate-500">{t('طريقة الدفع')}</span>
                        <select value={paymentMethodForNew} onChange={(e) => setPaymentMethodForNew(e.target.value)} className="input">
                          {paymentMethods
                            .filter((m) => m.is_active)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        onClick={recordPayment}
                        disabled={recordingPayment || !paymentAmount}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {recordingPayment ? t('جارِ الحفظ…') : t('حفظ الدفعة')}
                      </button>
                    </div>
                  )}
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {sortedPayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        <span className="font-medium text-slate-700">{formatMoney(p.amount)}</span>
                        <span className="text-slate-500">{methodName(p.method) ?? p.method}</span>
                        <span className="text-slate-400" dir="ltr">{formatDateAr(p.recorded_at)}</span>
                      </div>
                    ))}
                    {sortedPayments.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                        {t('لا توجد دفعات مسجَّلة بعد')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white">
              <Field label={t('الخدمة')}>
                <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="input">
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('نوع العقد')}>
                  <select value={contractType} onChange={(e) => setContractType(e.target.value as Contract['contract_type'])} className="input">
                    <option value="monthly">{t('شهري')}</option>
                    <option value="quarterly">{t('ربع سنوي')}</option>
                    <option value="semi_annual">{t('نصف سنوي')}</option>
                    <option value="annual">{t('سنوي')}</option>
                  </select>
                </Field>
                <Field label={t('تكرار الزيارات')}>
                  <select
                    value={visitFrequency}
                    onChange={(e) => setVisitFrequency(e.target.value as Contract['visit_frequency'])}
                    className="input"
                  >
                    <option value="weekly">{t('أسبوعي')}</option>
                    <option value="bi_weekly">{t('نصف شهري')}</option>
                    <option value="monthly">{t('شهري')}</option>
                  </select>
                </Field>
              </div>

              {visitFrequency === 'weekly' && (
                <Field label={t('أيام الزيارة الأسبوعية (يمكن اختيار أكثر من يوم)')}>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {WEEKDAYS.map((d) => (
                      <label
                        key={d.key}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                      >
                        <input
                          type="checkbox"
                          checked={visitDays.includes(d.key)}
                          onChange={() => toggleDay(d.key)}
                          className="h-3.5 w-3.5"
                        />
                        {t(d.label)}
                      </label>
                    ))}
                  </div>
                </Field>
              )}

              {visitFrequency === 'weekly' && visitDays.length > 0 && (
                <Field label={t('مشرف كل يوم زيارة (اختياري — إن تُرك بدون تحديد يُستخدم المشرف الافتراضي أدناه)')}>
                  <div className="space-y-2">
                    {visitDays.map((dayKey) => (
                      <div key={dayKey} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs text-slate-500">
                          {t(WEEKDAYS.find((w) => w.key === dayKey)?.label ?? dayKey)}
                        </span>
                        <select
                          value={daySupervisors[dayKey] ?? ''}
                          onChange={(e) => setDaySupervisors((prev) => ({ ...prev, [dayKey]: e.target.value }))}
                          className="input"
                        >
                          <option value="">{t('نفس المشرف الافتراضي')}</option>
                          {supervisors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('تاريخ البدء')}>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
                </Field>
                <Field label={t('تاريخ الانتهاء')}>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('وقت الزيارة')}>
                  <input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="input" />
                </Field>
                {canSeeValue && (
                  <Field label={t('القيمة الإجمالية (ر.س)')}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      className="input"
                    />
                  </Field>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('طريقة تحصيل العقد')}>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input">
                    <option value="">{t('بدون تحديد')}</option>
                    {paymentMethods
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t('تاريخ استحقاق الدفعة القادمة')}>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
                </Field>
              </div>

              <Field label={visitFrequency === 'weekly' ? t('المشرف الافتراضي') : t('المشرف المسؤول')}>
                <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="input">
                  <option value="">{t('بدون تحديد')}</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('الحالة')}>
                <select value={status} onChange={(e) => setStatus(e.target.value as Contract['status'])} className="input">
                  <option value="active">{t('ساري')}</option>
                  <option value="completed">{t('مكتمل')}</option>
                  <option value="cancelled">{t('ملغى')}</option>
                  <option value="expired">{t('منتهي')}</option>
                </select>
              </Field>

              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {t('تعديل التكرار أو أيام الزيارة أو المشرفين لا يعيد توليد المواعيد تلقائياً — المواعيد المولَّدة سابقاً تبقى كما هي.')}
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  disabled={submitting}
                  onClick={save}
                  className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> {submitting ? t('جارِ الحفظ…') : t('حفظ')}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  {t('إلغاء')}
                </button>
              </div>
            </div>
          )}

          {!editing && (
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
          )}
        </div>
      </div>
    </div>
  );
}
