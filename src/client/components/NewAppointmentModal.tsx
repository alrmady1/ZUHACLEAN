import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X, Plus, Map as MapIcon, User, Sparkles, Clock, Users as TeamIcon, ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Service, Profile, Appointment, LeaveRecord, RiyadhZone, NeighborhoodZoneAssignment } from '../../shared/types.js';
import { SERVICE_PRICING_UNIT_LABELS_AR } from '../../shared/types.js';
import { formatDuration, formatTimeAr, formatMoney } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import { useAuth } from '../lib/auth.js';
import { findDayOffConflicts, WEEKDAYS } from '../../shared/weekdays.js';
import { findLeaveConflicts } from '../../shared/leaves.js';
import { phoneMatchesQuery } from '../../shared/phone.js';
import { findZoneForNeighborhood } from '../../shared/riyadhZones.js';

// السعر/المدة الفعليان للوحدة الواحدة لخدمة مسعَّرة بالوحدة: إن كان لديها
// مستويات تسعير (pricing_tiers)، تُستخدَم قيم المستوى المختار (أو المستوى
// الأول افتراضياً قبل أي اختيار صريح)، وإلا فقيم unit_price/unit_duration_seconds
// العامَّين للخدمة نفسها.
function resolveUnitPricing(s: Service, tierKey: string | undefined): { unitPrice: number; unitDurationSeconds: number | undefined } {
  if (s.pricing_tiers && s.pricing_tiers.length > 0) {
    const tier = s.pricing_tiers.find((t) => t.key === tierKey) ?? s.pricing_tiers[0];
    return { unitPrice: tier.unit_price, unitDurationSeconds: tier.unit_duration_seconds };
  }
  return { unitPrice: s.unit_price ?? 0, unitDurationSeconds: s.unit_duration_seconds };
}

// السعر الكامل لمجموعة خدمات مختارة: سعر ثابت (default_price) للخدمات
// العادية، أو (الكمية × سعر الوحدة) للخدمات المسعَّرة بالمتر المربع أو
// بالمقعد — الكمية الافتراضية 1 حتى تُعدَّل يدوياً من مربع الإدخال. سعر
// الوحدة نفسه يُؤخَذ من المستوى المختار عند وجود مستويات تسعير.
function computeServicesAmount(chosen: Service[], quantities: Record<string, number>, tierKeys: Record<string, string>): number {
  return chosen.reduce((sum, s) => {
    if (s.pricing_model && s.pricing_model !== 'fixed') {
      const { unitPrice } = resolveUnitPricing(s, tierKeys[s.id]);
      return sum + (quantities[s.id] ?? 1) * unitPrice;
    }
    return sum + s.default_price;
  }, 0);
}

// مدة مجموعة خدمات مختارة، بنفس منطق computeServicesAmount: خدمة محدَّد
// لها unit_duration_seconds (مدة الوحدة الواحدة، من المستوى المختار عند
// وجود مستويات تسعير) تُحتسب كـ(الكمية × هذه القيمة)، بقية الخدمات (بما
// فيها per_sqm/per_seat بلا مدة وحدة محدَّدة) تبقى على مدتها التقريبية
// الثابتة default_duration_minutes كالمعتاد. تُجمَع الثواني على حدة ثم
// تُحوَّل لدقائق مرة واحدة في النهاية لتفادي تراكم خطأ التقريب عبر عدة خدمات.
function computeServicesDuration(chosen: Service[], quantities: Record<string, number>, tierKeys: Record<string, string>): number {
  let totalMinutes = 0;
  let totalSeconds = 0;
  for (const s of chosen) {
    const { unitDurationSeconds } = s.pricing_model && s.pricing_model !== 'fixed' ? resolveUnitPricing(s, tierKeys[s.id]) : { unitDurationSeconds: undefined };
    if (unitDurationSeconds) {
      totalSeconds += (quantities[s.id] ?? 1) * unitDurationSeconds;
    } else {
      totalMinutes += s.default_duration_minutes;
    }
  }
  return totalMinutes + Math.round(totalSeconds / 60);
}

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

// بيانات أولية اختيارية لتعبئة النموذج مسبقاً عند فتحه من صفحة "طلبات
// جديدة" (تحويل طلب وارد إلى موعد فعلي، انظر Leads.tsx) — بلا أي تأثير
// على الاستخدام المعتاد من صفحة المواعيد (لا يُمرَّر هذا الخيار هناك).
export interface NewAppointmentInitialLead {
  name: string;
  phone: string;
  area?: string;
  serviceName?: string;
  message?: string;
}

export default function NewAppointmentModal({
  customers,
  services,
  supervisors,
  technicians,
  initialLead,
  mode = 'service',
  onClose,
  onCreated,
  onCustomerCreated,
}: {
  customers: Customer[];
  services: Service[];
  supervisors: Profile[];
  technicians: Profile[];
  initialLead?: NewAppointmentInitialLead;
  // 'visit' = زيارة معاينة عميل (لا خدمة أو سعر محدد بعد، انظر
  // AppointmentKind في shared/types.ts) — تُخفي قسم اختيار الخدمة
  // والسعر، وتحفظ الموعد بـ kind: 'visit'. باقي النموذج (العميل، المشرف،
  // الوقت، فحص التعارض والتوفر) يعمل بلا أي فرق عن موعد الخدمة العادي.
  mode?: 'service' | 'visit';
  onClose: () => void;
  onCreated: (appointment?: Appointment) => void;
  onCustomerCreated?: (customer: Customer) => void;
}) {
  const { t, tt } = useI18n();
  const { can, user } = useAuth();
  const canAssignTechnician = can('assign_appointment_technician');
  const isVisit = mode === 'visit';
  const today = new Date().toISOString().slice(0, 10);

  // عميل حالي يطابق جوال الطلب الوارد (إن وُجد) — يُختار تلقائياً بدل فتح
  // نموذج "عميل جديد" فارغ، حتى لا نُنشئ عملاء مكررين لعميل موجود أصلاً.
  const matchedLeadCustomer = initialLead
    ? customers.find((c) => c.phone.replace(/\D/g, '') === initialLead.phone.replace(/\D/g, ''))
    : undefined;
  const matchedLeadService = initialLead?.serviceName ? services.find((s) => s.name === initialLead.serviceName) : undefined;

  const [allCustomers, setAllCustomers] = useState<Customer[]>(customers);
  // تقسيم مناطق الرياض — لاقتراح أفضل أيام الأسبوع لحيّ العميل المختار
  // (انظر بانر الاقتراح أسفل حقل التاريخ، وshared/riyadhZones.ts).
  const [riyadhZones, setRiyadhZones] = useState<RiyadhZone[]>([]);
  const [neighborhoodZones, setNeighborhoodZones] = useState<NeighborhoodZoneAssignment[]>([]);
  useEffect(() => {
    api.get<RiyadhZone[]>('/riyadh-zones').then(setRiyadhZones).catch(() => {});
    api.get<NeighborhoodZoneAssignment[]>('/neighborhood-zones').then(setNeighborhoodZones).catch(() => {});
  }, []);
  const [customerId, setCustomerId] = useState<string>(matchedLeadCustomer?.id ?? '');
  const [customerSearch, setCustomerSearch] = useState(matchedLeadCustomer?.name ?? initialLead?.name ?? '');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const customerBoxRef = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState(matchedLeadCustomer?.address ?? initialLead?.area ?? '');
  const [locationUrl, setLocationUrl] = useState(matchedLeadCustomer?.location_url ?? '');
  const [showAddCustomer, setShowAddCustomer] = useState(allCustomers.length === 0 || (!!initialLead && !matchedLeadCustomer));
  const [addingCustomer, setAddingCustomer] = useState(false);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(matchedLeadService ? [matchedLeadService.id] : []);
  // الكمية المُدخَلة لكل خدمة مسعَّرة بالوحدة (عدد الأمتار أو المقاعد) —
  // خدمات السعر الثابت لا تظهر هنا إطلاقاً. تبدأ بـ1 لأي خدمة كهذه محدَّدة
  // مسبقاً (من طلب وارد محوَّل)، وتُضاف/تُحذف تلقائياً مع toggleService.
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, number>>(
    matchedLeadService && matchedLeadService.pricing_model && matchedLeadService.pricing_model !== 'fixed'
      ? { [matchedLeadService.id]: 1 }
      : {},
  );
  // المستوى المختار لكل خدمة لها مستويات تسعير (pricing_tiers) — مفتاح
  // (key) المستوى، وليس فهرسه، حتى يبقى الاختيار صحيحاً بصرف النظر عن
  // ترتيب المستويات. خدمة بلا مستويات لا تظهر هنا إطلاقاً.
  const [serviceTierKeys, setServiceTierKeys] = useState<Record<string, string>>(
    matchedLeadService?.pricing_tiers && matchedLeadService.pricing_tiers.length > 0
      ? { [matchedLeadService.id]: matchedLeadService.pricing_tiers[0].key }
      : {},
  );
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const serviceBoxRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState<number | ''>(
    matchedLeadService ? computeServicesAmount([matchedLeadService], { [matchedLeadService.id]: 1 }, serviceTierKeys) : 0,
  );
  // مدة زيارة المعاينة افتراضياً أقصر بكثير من موعد خدمة فعلي (30 دقيقة
  // بدل 120) — قابلة للتعديل بالطبع لو احتاج المشرف وقتاً أطول.
  const [duration, setDuration] = useState<number | ''>(matchedLeadService?.default_duration_minutes ?? (isVisit ? 30 : 120));

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

  // محرك بحث فوق القائمة المنسدلة — لا يستبدلها، فقط يضيّق خياراتها أثناء
  // الكتابة (الاسم، الجوال، الحي، المدينة). العميل المختار حالياً يبقى
  // ضمن الخيارات دائماً حتى لو لم يعد يطابق نص البحث، حتى لا يُفرَّغ
  // الاختيار الحالي بشكل غير متوقع.
  const filteredCustomers = (() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter(
      (c) =>
        c.id === customerId ||
        c.name.toLowerCase().includes(q) ||
        phoneMatchesQuery(c.phone, q) ||
        (c.district ?? '').toLowerCase().includes(q) ||
        (c.city ?? '').toLowerCase().includes(q),
    );
  })();

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));

  // Selecting/deselecting a service recomputes the totals as the sum of the
  // selected services' defaults — still editable afterwards if the agreed
  // price differs. A service priced per m²/seat contributes quantity×unit_price
  // instead of default_price (quantity defaults to 1 when first selected).
  function toggleService(id: string) {
    const next = selectedServiceIds.includes(id) ? selectedServiceIds.filter((x) => x !== id) : [...selectedServiceIds, id];
    const chosen = services.filter((s) => next.includes(s.id));
    const nextQ = { ...serviceQuantities };
    const nextT = { ...serviceTierKeys };
    if (!next.includes(id)) {
      delete nextQ[id];
      delete nextT[id];
    } else if (nextQ[id] === undefined) {
      const svc = services.find((s) => s.id === id);
      if (svc?.pricing_model && svc.pricing_model !== 'fixed') {
        nextQ[id] = 1;
        if (svc.pricing_tiers && svc.pricing_tiers.length > 0) nextT[id] = svc.pricing_tiers[0].key;
      }
    }
    setServiceQuantities(nextQ);
    setServiceTierKeys(nextT);
    setAmount(computeServicesAmount(chosen, nextQ, nextT));
    setDuration(computeServicesDuration(chosen, nextQ, nextT));
    setSelectedServiceIds(next);
  }

  // تعديل الكمية (عدد الأمتار/المقاعد) لخدمة مسعَّرة بالوحدة، مع إعادة
  // احتساب السعر والمدة الإجماليين فوراً — يبقيان قابلين للتعديل اليدوي
  // بعدها كأي سعر أو مدة أخرى.
  function updateServiceQuantity(id: string, qty: number) {
    const nextQ = { ...serviceQuantities, [id]: qty };
    setServiceQuantities(nextQ);
    setAmount(computeServicesAmount(selectedServices, nextQ, serviceTierKeys));
    setDuration(computeServicesDuration(selectedServices, nextQ, serviceTierKeys));
  }

  // تغيير مستوى التسعير المختار لخدمة (مثال: تنظيف سطحي ↔ عميق)، مع إعادة
  // احتساب السعر والمدة الإجماليين فوراً من سعر/مدة المستوى الجديد.
  function updateServiceTier(id: string, tierKey: string) {
    const nextT = { ...serviceTierKeys, [id]: tierKey };
    setServiceTierKeys(nextT);
    setAmount(computeServicesAmount(selectedServices, serviceQuantities, nextT));
    setDuration(computeServicesDuration(selectedServices, serviceQuantities, nextT));
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (serviceBoxRef.current && !serviceBoxRef.current.contains(e.target as Node)) setShowServiceDropdown(false);
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) setShowCustomerSuggestions(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  function pickCustomer(c: Customer) {
    setCustomerId(c.id);
    applyCustomer(c);
    setCustomerSearch(c.name);
    setShowCustomerSuggestions(false);
  }

  const previewEnd = (() => {
    if (!date || !time || !duration) return null;
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + Number(duration) * 60000);
    return { time: formatTimeAr(end.toISOString()), duration: formatDuration(Number(duration)) };
  })();

  // منطقة الرياض المقترحة لحيّ العميل المختار (إن كان حيّه مربوطاً بمنطقة
  // من الإعدادات ← مناطق الرياض) — تُعرض كبانر تحت حقل التاريخ يقترح أفضل
  // أيام الأسبوع لتجميع عملاء نفس المنطقة، مع اقتراح أقرب تاريخ فعلي لكل
  // يوم مفضَّل ليختاره الموظف مباشرة قبل التنسيق مع العميل.
  const selectedCustomer = allCustomers.find((c) => c.id === customerId);
  const suggestedZone = findZoneForNeighborhood(selectedCustomer?.district, riyadhZones, neighborhoodZones);
  const suggestedDatesByWeekday = useMemo(() => {
    if (!suggestedZone) return [];
    const jsDayByKey = WEEKDAYS.map((w) => w.key);
    return suggestedZone.preferred_weekdays.map((key) => {
      const targetDay = jsDayByKey.indexOf(key);
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      let delta = (targetDay - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // أقرب حدوث قادم لنفس اليوم، وليس اليوم نفسه.
      d.setDate(d.getDate() + delta);
      return { key, label: WEEKDAYS.find((w) => w.key === key)?.label ?? key, iso: d.toISOString().slice(0, 10) };
    });
  }, [suggestedZone]);

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
      const created = await api.post<Appointment>('/appointments', {
        customer_id: customerId,
        service_id: isVisit ? '' : selectedServiceIds[0],
        service_name_snapshot: isVisit ? tt('زيارة معاينة', 'Site visit') : selectedServices.map((s) => s.name).join('، '),
        scheduled_at: scheduledAt,
        expected_duration_minutes: Number(duration) || (isVisit ? 30 : 120),
        amount: isVisit ? 0 : Number(amount) || 0,
        supervisor_id: supervisorId || undefined,
        address_snapshot: address,
        location_url: locationUrl || undefined,
        notes: form.get('notes') || undefined,
        created_by: user?.id,
        kind: isVisit ? 'visit' : undefined,
        assignments: technicianId
          ? [{ id: crypto.randomUUID(), technician_id: technicianId, technician_name: technicians.find((tech) => tech.id === technicianId)?.full_name }]
          : [],
      });
      onCreated(created);
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
            <h2 className="text-lg font-bold text-slate-800">
              {initialLead
                ? tt(`تحديد موعد لطلب ${initialLead.name}`, `Book appointment for ${initialLead.name}'s request`)
                : isVisit
                  ? t('إضافة زيارة عميل جديدة')
                  : t('إضافة حجز موعد جديد')}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {isVisit ? t('تحديد العميل والمشرف ووقت زيارة المعاينة') : t('تحديد العميل، الخدمة، الفريق الميداني ووقت التنفيذ')}
            </p>
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
                <div ref={customerBoxRef} className="relative">
                  <input
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerSuggestions(true);
                    }}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    placeholder={t('ابحث بالاسم، الجوال، الحي، أو المدينة...')}
                    className="input"
                  />
                  {showCustomerSuggestions && (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickCustomer(c)}
                          className={`flex w-full flex-col gap-0.5 px-3 py-2 text-start text-sm hover:bg-slate-50 ${c.id === customerId ? 'bg-brand-50' : ''}`}
                        >
                          <span className="font-medium text-slate-700">{c.name}</span>
                          <span dir="ltr" className="text-end text-xs text-slate-400">
                            {c.phone} {(c.district || c.city) && `— ${[c.district, c.city].filter(Boolean).join('، ')}`}
                          </span>
                        </button>
                      ))}
                      {filteredCustomers.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400">{t('لا يوجد عميل مطابق لبحثك')}</div>
                      )}
                    </div>
                  )}
                </div>
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
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
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
                  <input name="new_customer_name" defaultValue={initialLead?.name} placeholder={t('الاسم')} required={showAddCustomer} className="input" />
                  <input name="new_customer_phone" defaultValue={initialLead?.phone} placeholder={t('الجوال')} required={showAddCustomer} className="input" />
                </div>
                <input name="new_customer_address" defaultValue={initialLead?.area} placeholder={t('العنوان')} required={showAddCustomer} className="input" />
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

          {isVisit ? (
            <Section icon={<Clock className="h-3.5 w-3.5 text-brand-500" />} title={t('مدة المعاينة المتوقعة *')}>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('بالدقائق')}</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={duration}
                  onChange={(e) => setDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input"
                />
              </label>
              <p className="text-xs text-slate-400">
                {t('لا حاجة لتحديد الخدمة أو السعر الآن — يحدّدهما المشرف بعد المعاينة الميدانية.')}
              </p>
            </Section>
          ) : (
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
                          <span className="shrink-0 text-xs text-slate-400">
                            {s.pricing_model && s.pricing_model !== 'fixed'
                              ? s.pricing_tiers && s.pricing_tiers.length > 0
                                ? tt('حسب المستوى', 'by tier')
                                : `${formatMoney(s.unit_price ?? 0)} / ${tt(SERVICE_PRICING_UNIT_LABELS_AR[s.pricing_model], s.pricing_model === 'per_sqm' ? 'm²' : 'seat')}`
                              : formatMoney(s.default_price)}
                          </span>
                        </label>
                      );
                    })}
                    {services.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">{t('لا توجد خدمات بعد')}</div>}
                  </div>
                )}
              </div>

              {selectedServices.some((s) => s.pricing_model && s.pricing_model !== 'fixed') && (
                <div className="space-y-2">
                  {selectedServices
                    .filter((s): s is Service & { pricing_model: 'per_sqm' | 'per_seat' } => !!s.pricing_model && s.pricing_model !== 'fixed')
                    .map((s) => {
                      const { unitPrice } = resolveUnitPricing(s, serviceTierKeys[s.id]);
                      return (
                        <div key={s.id} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
                          {s.pricing_tiers && s.pricing_tiers.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-1.5">
                              <span className="text-xs font-medium text-slate-600">{s.name}</span>
                              <div className="flex flex-1 flex-wrap justify-end gap-1.5">
                                {s.pricing_tiers.map((tier) => {
                                  const active = (serviceTierKeys[s.id] ?? s.pricing_tiers![0].key) === tier.key;
                                  return (
                                    <button
                                      key={tier.key}
                                      type="button"
                                      onClick={() => updateServiceTier(s.id, tier.key)}
                                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                                        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                      }`}
                                    >
                                      {tier.label} · {formatMoney(tier.unit_price)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {!(s.pricing_tiers && s.pricing_tiers.length > 0) && (
                              <span className="flex-1 truncate text-xs font-medium text-slate-600">{s.name}</span>
                            )}
                            <span className="shrink-0 text-xs text-slate-400">{t(SERVICE_PRICING_UNIT_LABELS_AR[s.pricing_model])}</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={serviceQuantities[s.id] ?? 1}
                              onChange={(e) => updateServiceQuantity(s.id, e.target.value === '' ? 0 : Number(e.target.value))}
                              className="input w-20 shrink-0 py-1 text-center"
                            />
                            <span className="shrink-0 text-xs text-slate-400">× {formatMoney(unitPrice)}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

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
          )}

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
            {suggestedZone && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-700">
                <div className="font-semibold">
                  {tt(`حي "${selectedCustomer?.district}" ضمن ${suggestedZone.name}`, `"${selectedCustomer?.district}" is in ${suggestedZone.name}`)}
                </div>
                {suggestedDatesByWeekday.length > 0 ? (
                  <>
                    <div className="mt-1">
                      {t('الأيام المفضَّلة لهذه المنطقة — نسِّق مع العميل قبل التأكيد:')}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {suggestedDatesByWeekday.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setDate(d.iso)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            date === d.iso ? 'bg-violet-600 text-white' : 'bg-white text-violet-700 ring-1 ring-violet-300 hover:bg-violet-100'
                          }`}
                        >
                          {t(d.label)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="mt-1">{t('لا توجد أيام مفضَّلة مضبوطة لهذه المنطقة بعد (الإعدادات ← مناطق الرياض).')}</div>
                )}
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
              defaultValue={initialLead?.message}
              placeholder={t('مثال: يرجى التركيز على تعقيم المطبخ والحمام الرئيسي وتجهيز مواد خاصة...')}
              className="input resize-none"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !customerId || (!isVisit && selectedServiceIds.length === 0) || !!conflict || leaveConflicts.length > 0}
            className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : isVisit ? t('تأكيد الزيارة') : t('تأكيد وحجز الموعد')}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium text-slate-400 hover:text-slate-600">
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </div>
  );
}
