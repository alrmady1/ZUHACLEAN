import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X, Plus, Map as MapIcon, User, Sparkles, Clock, Users as TeamIcon, ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Service, Profile, Appointment, LeaveRecord } from '../../shared/types.js';
import { formatDuration, formatTimeAr, formatMoney } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import { useAuth } from '../lib/auth.js';
import { findDayOffConflicts } from '../lib/weekdays.js';
import { findLeaveConflicts } from '../lib/leaves.js';

function Section({ icon, title, extra, children }: { icon: ReactNode; title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          {title}
          {icon}
        </span>
        {extra}
      </div>
      {children}
    </div>
  );
}

export default function NewAppointmentModal({
  customers,
  services,
  supervisors,
  technicians,
  onClose,
  onCreated,
  onCustomerCreated,
}: {
  customers: Customer[];
  services: Service[];
  supervisors: Profile[];
  technicians: Profile[];
  onClose: () => void;
  onCreated: () => void;
  onCustomerCreated?: (customer: Customer) => void;
}) {
  const { t, tt } = useI18n();
  const { can } = useAuth();
  const canAssignTechnician = can('assign_appointment_technician');
  const today = new Date().toISOString().slice(0, 10);

  const [allCustomers, setAllCustomers] = useState<Customer[]>(customers);
  const [customerId, setCustomerId] = useState<string>('');
  const [address, setAddress] = useState('');
  const [locationUrl, setLocationUrl] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(allCustomers.length === 0);
  const [addingCustomer, setAddingCustomer] = useState(false);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const serviceBoxRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState<number | ''>(0);
  const [duration, setDuration] = useState<number | ''>(120);

  const [date, setDate] = useState(today);
  const [time, setTime] = useState('10:00');
  const [supervisorId, setSupervisorId] = useState('');
  const [technicianId, setTechnicianId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [existingAppointments, setExistingAppointments] = useState<Appointment[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);

  useEffect(() => {
    api.get<Appointment[]>('/appointments').then(setExistingAppointments);
    api.get<LeaveRecord[]>('/leaves').then(setLeaves);
  }, []);

  function applyCustomer(customer: Customer | undefined) {
    setAddress(customer?.address ?? '');
    setLocationUrl(customer?.location_url ?? '');
  }

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));

  // Selecting/deselecting a service recomputes the totals as the sum of the
  // selected services' defaults — still editable afterwards if the agreed
  // price differs.
  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const chosen = services.filter((s) => next.includes(s.id));
      setAmount(chosen.reduce((sum, s) => sum + s.default_price, 0));
      setDuration(chosen.reduce((sum, s) => sum + s.default_duration_minutes, 0));
      return next;
    });
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (serviceBoxRef.current && !serviceBoxRef.current.contains(e.target as Node)) setShowServiceDropdown(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const previewEnd = (() => {
    if (!date || !time || !duration) return null;
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + Number(duration) * 60000);
    return { time: formatTimeAr(end.toISOString()), duration: formatDuration(Number(duration)) };
  })();

  // The same supervisor's other bookings that day — used both for the
  // mini availability schedule and to block an overlapping new one.
  const supervisorDayBookings = useMemo(() => {
    if (!supervisorId || !date) return [];
    return existingAppointments
      .filter((a) => a.supervisor_id === supervisorId && a.status !== 'cancelled' && a.scheduled_at.slice(0, 10) === date)
      .map((a) => {
        const start = new Date(a.scheduled_at);
        const end = new Date(start.getTime() + a.expected_duration_minutes * 60000);
        return { id: a.id, start, end, customerName: a.customer_name_snapshot ?? t('عميل') };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [existingAppointments, supervisorId, date]);

  const conflict = (() => {
    if (!supervisorId || !date || !time || !duration) return null;
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + Number(duration) * 60000);
    return supervisorDayBookings.find((b) => start < b.end && end > b.start) ?? null;
  })();

  // منع فعلي (وليس مجرد تنبيه) — إن كان المشرف أو الفني المختار في إجازة
  // سنوية سارية يوم هذا الموعد (Settings ← الإجازات)، لا يمكن الحجز إطلاقاً.
  const leaveConflicts = findLeaveConflicts(
    date,
    [
      { profile: supervisors.find((s) => s.id === supervisorId), roleLabel: t('المشرف') },
      { profile: technicians.find((tech) => tech.id === technicianId), roleLabel: t('الفني') },
    ],
    leaves,
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (conflict || leaveConflicts.length > 0) return; // guarded again below the fields, but never submit over a clash

    // تنبيه (وليس منعاً) إن كان المشرف أو الفني المختار في إجازته
    // الأسبوعية الثابتة يوم هذا الموعد (Settings ← أيام الإجازة الأسبوعية).
    const dayOffConflicts = findDayOffConflicts(date, [
      { profile: supervisors.find((s) => s.id === supervisorId), roleLabel: t('المشرف') },
      { profile: technicians.find((tech) => tech.id === technicianId), roleLabel: t('الفني') },
    ]);
    if (dayOffConflicts.length > 0) {
      const names = dayOffConflicts.map((c) => `${c.roleLabel} ${c.name}`).join('، ');
      const proceed = window.confirm(tt(
        `${names} لديه إجازة أسبوعية في هذا اليوم. هل ترغب باستكمال إجراءات تسجيل الموعد؟`,
        `${names} has a weekly day off on this day. Do you want to continue booking the appointment?`,
      ));
      if (!proceed) return;
    }

    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    try {
      await api.post('/appointments', {
        customer_id: customerId,
        service_id: selectedServiceIds[0],
        service_name_snapshot: selectedServices.map((s) => s.name).join('، '),
        scheduled_at: scheduledAt,
        expected_duration_minutes: Number(duration) || 120,
        amount: Number(amount) || 0,
        supervisor_id: supervisorId || undefined,
        address_snapshot: address,
        location_url: locationUrl || undefined,
        notes: form.get('notes') || undefined,
        assignments: technicianId
          ? [{ id: crypto.randomUUID(), technician_id: technicianId, technician_name: technicians.find((tech) => tech.id === technicianId)?.full_name }]
          : [],
      });
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{t('إضافة حجز موعد جديد')}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{t('تحديد العميل، الخدمة، الفريق الميداني ووقت التنفيذ')}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Section
            icon={<User className="h-3.5 w-3.5 text-brand-500" />}
            title={t('العميل *')}
            extra={
              <button
                type="button"
                onClick={() => setShowAddCustomer((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> {t('إنشاء عميل جديد')}
              </button>
            }
          >
            {!showAddCustomer && (
              <>
                <select
                  name="customer_id"
                  required
                  className="input"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    applyCustomer(allCustomers.find((c) => c.id === e.target.value));
                  }}
                >
                  <option value="">{t('-- اختر العميل من القائمة --')}</option>
                  {allCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-600">{t('عنوان موقع التنفيذ')}</span>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={t('مثال: الرياض، حي الملقا، شارع...')}
                      className="input"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-600">{t('رابط الخريطة (Google Maps)')}</span>
                    <div className="flex gap-2">
                      <input
                        value={locationUrl}
                        onChange={(e) => setLocationUrl(e.target.value)}
                        placeholder="https://maps.google.com/..."
                        className="input"
                      />
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
                  </label>
                </div>
              </>
            )}

            {showAddCustomer && (
              <div className="space-y-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input name="new_customer_name" placeholder={t('الاسم')} required={showAddCustomer} className="input" />
                  <input name="new_customer_phone" placeholder={t('الجوال')} required={showAddCustomer} className="input" />
                </div>
                <input name="new_customer_address" placeholder={t('العنوان')} required={showAddCustomer} className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <input name="new_customer_district" placeholder={t('الحي (اختياري)')} className="input" />
                  <input name="new_customer_city" placeholder={t('المدينة (اختياري)')} className="input" />
                </div>
                <div className="flex gap-2">
                  <input
                    name="new_customer_location_url"
                    placeholder={t('رابط الموقع (خرائط جوجل) — اختياري')}
                    className="input"
                  />
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={addingCustomer}
                    onClick={async (e) => {
                      const container = e.currentTarget.closest('div.space-y-2') as HTMLElement;
                      const get = (n: string) => (container.querySelector(`[name="${n}"]`) as HTMLInputElement)?.value;
                      const name = get('new_customer_name');
                      const phone = get('new_customer_phone');
                      const custAddress = get('new_customer_address');
                      if (!name || !phone || !custAddress) return;
                      setAddingCustomer(true);
                      try {
                        const created = await api.post<Customer>('/customers', {
                          name,
                          phone,
                          address: custAddress,
                          district: get('new_customer_district') || undefined,
                          city: get('new_customer_city') || undefined,
                          location_url: get('new_customer_location_url') || undefined,
                        });
                        setAllCustomers((prev) => [...prev, created]);
                        setCustomerId(created.id);
                        applyCustomer(created);
                        setShowAddCustomer(false);
                        onCustomerCreated?.(created);
                      } finally {
                        setAddingCustomer(false);
                      }
                    }}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {addingCustomer ? t('جارِ الحفظ…') : t('حفظ العميل')}
                  </button>
                  {allCustomers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAddCustomer(false)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500"
                    >
                      {t('إلغاء')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Section>

          <Section icon={<Sparkles className="h-3.5 w-3.5 text-brand-500" />} title={t('نوع الخدمة المطلوبة *')}>
            <div ref={serviceBoxRef} className="relative">
              <button
                type="button"
                onClick={() => setShowServiceDropdown((v) => !v)}
                className="input flex items-center justify-between gap-2 text-start"
              >
                <span className={`truncate ${selectedServices.length ? 'text-slate-700' : 'text-slate-400'}`}>
                  {selectedServices.length > 0
                    ? selectedServices.map((s) => s.name).join('، ')
                    : t('-- اختر نوعاً أو أكثر من الخدمة --')}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              {showServiceDropdown && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {services.map((s) => {
                    const checked = selectedServiceIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <input type="checkbox" checked={checked} onChange={() => toggleService(s.id)} className="hidden" />
                        <span className="flex-1 text-slate-700">{s.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">{formatMoney(s.default_price)}</span>
                      </label>
                    );
                  })}
                  {services.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">{t('لا توجد خدمات بعد')}</div>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('سعر الخدمة المتفق عليه (SAR، شامل الضريبة) *')}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('المدة المتوقعة (بالدقائق) *')}</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={duration}
                  onChange={(e) => setDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input"
                />
              </label>
            </div>
          </Section>

          <Section icon={<Clock className="h-3.5 w-3.5 text-brand-500" />} title={t('موعد وتوقيت الزيارة *')}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('تاريخ الزيارة')}</span>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('وقت البدء')}</span>
                <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="input" />
              </label>
            </div>
            {previewEnd && (
              <div className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
                {t('الوقت المتوقع لإنهاء العمل:')} {previewEnd.time} ({previewEnd.duration})
              </div>
            )}
          </Section>

          <Section icon={<TeamIcon className="h-3.5 w-3.5 text-brand-500" />} title={t('إسناد المهمة (المشرف والفريق الفني)')}>
            <div className={canAssignTechnician ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('المشرف المسؤول')}</span>
                <select
                  name="supervisor_id"
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                  className="input"
                >
                  <option value="">{t('-- اختياري: حدد المشرف --')}</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </label>
              {canAssignTechnician && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الفني الرئيسي / الفريق')}</span>
                  <select
                    value={technicianId}
                    onChange={(e) => setTechnicianId(e.target.value)}
                    className="input"
                  >
                    <option value="">{t('-- اختياري: حدد الفني --')}</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {leaveConflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {leaveConflicts.map((c) => `${c.roleLabel} ${c.name}`).join('، ')}{' '}
                  {t('في إجازة سنوية خلال هذا التاريخ، لا يمكن إسناد موعد له. اختر شخصاً آخر أو تاريخاً خارج فترة الإجازة.')}
                </span>
              </div>
            )}

            {conflict && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t('هناك مهمة مجدولة لهذا المشرف في هذا الوقت (عميل')} {conflict.customerName}{t('، من')}{' '}
                  {formatTimeAr(conflict.start.toISOString())}{' '}
                  {t('إلى')} {formatTimeAr(conflict.end.toISOString())}
                  {t(')، فيرجى اختيار وقت آخر.')}
                </span>
              </div>
            )}

            {supervisorId && supervisorDayBookings.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-500">
                  {t('جدول')} {supervisors.find((s) => s.id === supervisorId)?.full_name} {t('المصغّر لهذا اليوم:')}
                </div>
                <div className="space-y-1">
                  {supervisorDayBookings.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600"
                    >
                      <span>{b.customerName}</span>
                      <span dir="ltr" className="text-slate-400">
                        {formatTimeAr(b.start.toISOString())} - {formatTimeAr(b.end.toISOString())}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('ملاحظات وتعليمات خاصة بالموعد')}</span>
            <textarea
              name="notes"
              rows={3}
              placeholder={t('مثال: يرجى التركيز على تعقيم المطبخ والحمام الرئيسي وتجهيز مواد خاصة...')}
              className="input resize-none"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !customerId || selectedServiceIds.length === 0 || !!conflict || leaveConflicts.length > 0}
            className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : t('تأكيد وحجز الموعد')}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium text-slate-400 hover:text-slate-600">
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </div>
  );
}
