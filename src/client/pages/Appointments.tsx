import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  CalendarDays,
  Table2,
  MapPin,
  Phone,
  Clock,
  Users as UsersIcon,
  UserRound,
  Search,
  Eye,
  ChevronRight,
  ChevronLeft,
  Wallet,
  Trash2,
  CheckCircle2,
  Printer,
  Star,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Service, AppointmentStatus, PaymentStatus, PaymentMethodOption, Rating, CustomerRating, Invoice } from '../../shared/types.js';
import { AppointmentStatusBadge, PaymentStatusBadge, RatingStars, APPT_STATUS_STYLE } from '../components/Badge.js';
import NewAppointmentModal from '../components/NewAppointmentModal.js';
import PayAppointmentModal from '../components/PayAppointmentModal.js';
import AppointmentDetailModal from '../components/AppointmentDetailModal.js';
import InvoiceDocument from '../components/InvoiceDocument.js';
import { weekdayAr, formatDateAr, formatTimeAr, formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { WEEKDAYS_HEADER, getMonthGridDays } from '../lib/calendarGrid.js';

type ScopeFilter = 'mine' | 'all' | string; // string = a specific supervisor id
type PeriodFilter = 'all' | 'today' | 'week' | 'month';

const STATUS_OPTIONS = (Object.entries(APPT_STATUS_STYLE) as [AppointmentStatus, { label: string }][]).map(([value, { label }]) => ({
  value,
  label,
}));
// المكتملة والملغاة انتقلت بالكامل لتبويب "المهام المكتملة" — لا تظهر
// كخيار في فلتر حالة تبويب "المواعيد" (اختيارها لن يُظهر شيئاً أصلاً بعد
// أن استُبعدت من filtered أدناه).
const SCHEDULE_STATUS_OPTIONS = STATUS_OPTIONS.filter((o) => o.value !== 'completed' && o.value !== 'cancelled');
const PAYMENT_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'غير مسدد' },
  { value: 'partial', label: 'مسدد جزئياً' },
  { value: 'paid', label: 'مسدد بالكامل' },
];

function inPeriod(iso: string, period: PeriodFilter): boolean {
  if (period === 'all') return true;
  const d = new Date(iso);
  const now = new Date();
  if (period === 'today') return d.toDateString() === now.toDateString();
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  }
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function getWeekDays(ref: Date): Date[] {
  const start = new Date(ref);
  start.setDate(ref.getDate() - ref.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// تقييم المشرف للعميل بعد اكتمال الطلب (عكس تقييم العميل للخدمة) — 5
// نجوم + ملاحظات، تُحفظ باستبدال أي تقييم سابق لنفس الموعد (upsert، انظر
// POST /customer-ratings في src/server/routes/api.ts).
function CustomerRatingModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: { appointmentId: string; stars: number; notes?: string };
  onClose: () => void;
  onSaved: (r: CustomerRating) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [stars, setStars] = useState(existing.stars);
  const [notes, setNotes] = useState(existing.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (stars === 0) return;
    setSubmitting(true);
    try {
      const saved = await api.post<CustomerRating>('/customer-ratings', {
        appointment_id: existing.appointmentId,
        stars,
        notes: notes.trim() || undefined,
        rated_by: user?.id,
      });
      onSaved(saved);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t('تقييم العميل')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">{t('أضف تقييمك للعميل بعد اكتمال الطلب')}</p>
        <div className="mb-4 flex justify-center gap-1.5" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setStars(n)} className="p-1">
              <Star className={`h-8 w-8 transition ${n <= stars ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'}`} />
            </button>
          ))}
        </div>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('ملاحظات على العميل (اختياري)')}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} className="input resize-none" />
        </label>
        <button
          type="button"
          disabled={stars === 0 || submitting}
          onClick={save}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ الحفظ…') : t('حفظ تقييم العميل')}
        </button>
      </div>
    </div>
  );
}

export default function Appointments() {
  const { user, allProfiles, can } = useAuth();
  const { t, roleLabel, lang } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [customerRatings, setCustomerRatings] = useState<CustomerRating[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [mainTab, setMainTab] = useState<'schedule' | 'completed'>('schedule');
  const [completedSearch, setCompletedSearch] = useState('');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [ratingCustomerAppt, setRatingCustomerAppt] = useState<Appointment | null>(null);
  const [scope, setScope] = useState<ScopeFilter>('mine');
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'all'>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [search, setSearch] = useState('');
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [payingAppt, setPayingAppt] = useState<Appointment | null>(null);
  const [viewingAppt, setViewingAppt] = useState<Appointment | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calSubView, setCalSubView] = useState<'month' | 'week' | 'day'>('month');

  function refresh() {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
    api.get<PaymentMethodOption[]>('/payment-methods').then(setPaymentMethods);
    api.get<Rating[]>('/ratings').then(setRatings);
    api.get<CustomerRating[]>('/customer-ratings').then(setCustomerRatings);
    api.get<Invoice[]>('/invoices').then(setInvoices);
  }, []);

  const canSeeAllSchedules = can('view_all_supervisors_appointments');
  const canBook = can('create_appointments');
  const canDeleteAppointment = can('delete_appointments');
  const canViewCompletedTab = can('view_completed_tasks_page');

  // لو فقد المستخدم صلاحية الاطلاع على هذا التبويب أثناء وجوده فيه (تعديل
  // صلاحيات حي من مكان آخر) يعود تلقائياً لتبويب "المواعيد".
  useEffect(() => {
    if (!canViewCompletedTab && mainTab === 'completed') setMainTab('schedule');
  }, [canViewCompletedTab, mainTab]);

  async function deleteAppointment(a: Appointment) {
    if (!window.confirm(t('حذف هذا الموعد نهائياً؟ سيُحذف مع كل صوره ومدفوعاته المرتبطة به، ولا يمكن التراجع عن هذا الإجراء.'))) return;
    await api.del(`/appointments/${a.id}`);
    refresh();
  }
  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicians = allProfiles.filter((p) => p.role === 'technician');

  const scoped = useMemo(() => {
    if (!canSeeAllSchedules) {
      if (user?.role === 'technician') {
        // يرى الفني مواعيده المسندة له مباشرة، وأيضاً أي موعد مسنَد للمشرف
        // الذي يتبع له (الربط يُضبط من الإعدادات ← ربط الفنيين بالمشرفين).
        const mySupervisorId = allProfiles.find((p) => p.id === user.id)?.supervisor_id;
        return appointments.filter(
          (a) =>
            a.assignments.some((x) => x.technician_id === user.id) ||
            (mySupervisorId && a.supervisor_id === mySupervisorId),
        );
      }
      return appointments.filter((a) => a.supervisor_id === user?.id);
    }
    if (scope === 'all') return appointments;
    if (scope === 'mine') return appointments.filter((a) => a.supervisor_id === user?.id);
    return appointments.filter((a) => a.supervisor_id === scope);
  }, [appointments, scope, user, canSeeAllSchedules, allProfiles]);

  // كل موعد له تقييم واحد على الأكثر (يمنعه الخادم، انظر POST
  // /public/ratings) — وكل موعد له فاتورة واحدة على الأكثر عملياً (تُصدَر
  // مرة واحدة عند التحصيل). تُستخدم داخل تبويب "المهام المكتملة".
  const ratingByAppointment = useMemo(() => {
    const map = new Map<string, Rating>();
    for (const r of ratings) map.set(r.appointment_id, r);
    return map;
  }, [ratings]);

  const invoiceByAppointment = useMemo(() => {
    const map = new Map<string, Invoice>();
    for (const inv of invoices) {
      if (inv.appointment_id) map.set(inv.appointment_id, inv);
    }
    return map;
  }, [invoices]);

  const customerRatingByAppointment = useMemo(() => {
    const map = new Map<string, CustomerRating>();
    for (const r of customerRatings) map.set(r.appointment_id, r);
    return map;
  }, [customerRatings]);

  // تبويب "المهام المكتملة" — فقط المواعيد المكتملة أو الملغاة، ضمن نفس
  // نطاق المشرف المختار أعلاه (scoped)، الأحدث أولاً (عكس جدول المواعيد
  // النشطة الذي يُرتَّب تصاعدياً بحسب موعد الزيارة القادم).
  const completedList = useMemo(() => {
    const q = completedSearch.trim().toLowerCase();
    return scoped
      .filter((a) => a.status === 'completed' || a.status === 'cancelled')
      .filter((a) => {
        if (!q) return true;
        const customer = customers.find((c) => c.id === a.customer_id);
        const haystack = [a.customer_name_snapshot, customer?.phone, a.service_name_snapshot, a.contract_number, a.address_snapshot]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
  }, [scoped, completedSearch, customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped
      .filter((a) => {
        // المكتملة والملغاة انتقلت بالكامل لتبويب "المهام المكتملة" — لا
        // يبقى في تبويب "المواعيد" سوى ما لم ينتهِ بعد.
        if (a.status === 'completed' || a.status === 'cancelled') return false;
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (paymentFilter !== 'all' && a.payment_status !== paymentFilter) return false;
        if (!inPeriod(a.scheduled_at, periodFilter)) return false;
        if (q) {
          const customer = customers.find((c) => c.id === a.customer_id);
          const haystack = [a.customer_name_snapshot, customer?.phone, a.service_name_snapshot, a.contract_number, a.address_snapshot]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [scoped, statusFilter, paymentFilter, periodFilter, search, customers]);

  const apptsByDate = useMemo(() => {
    const byDate = new Map<string, Appointment[]>();
    for (const a of filtered) {
      const key = new Date(a.scheduled_at).toDateString();
      byDate.set(key, [...(byDate.get(key) ?? []), a]);
    }
    return byDate;
  }, [filtered]);

  function shiftCalendar(dir: 1 | -1) {
    const d = new Date(calendarDate);
    if (calSubView === 'month') d.setMonth(d.getMonth() + dir);
    else if (calSubView === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCalendarDate(d);
  }

  const calendarHeaderLabel =
    calSubView === 'day'
      ? calendarDate.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' })
      : calendarDate.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('جدول المواعيد والمهام')}</h1>
          <p className="text-sm text-slate-400">{t('إدارة ومتابعة المواعيد، مع فصل جداول المشرفين وإمكانية الاطلاع المتبادل')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canBook && (
            <button
              onClick={() => setShowNewAppt(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> {t('حجز موعد جديد')}
            </button>
          )}
          {mainTab === 'schedule' && (
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              <button
                onClick={() => setView('calendar')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'calendar' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
              >
                <CalendarDays className="h-4 w-4" /> {t('التقويم')}
              </button>
              <button
                onClick={() => setView('table')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'table' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
              >
                <Table2 className="h-4 w-4" /> {t('الجدول')}
              </button>
            </div>
          )}
        </div>
      </div>

      {canViewCompletedTab && (
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          <button
            onClick={() => setMainTab('schedule')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mainTab === 'schedule' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <CalendarDays className="h-4 w-4" /> {t('المواعيد')}
          </button>
          <button
            onClick={() => setMainTab('completed')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mainTab === 'completed' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <CheckCircle2 className="h-4 w-4" /> {t('المهام المكتملة')}
          </button>
        </div>
      )}

      {canSeeAllSchedules && user && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-600">{t('عرض جدول المشرف:')}</span>
            <button
              onClick={() => setScope('mine')}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium ${
                scope === 'mine' ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              <UserRound className="h-4 w-4" />
              {t('جدولي الخاص')} ({user.full_name} — {roleLabel(user.role)})
            </button>
          </div>
          <button
            onClick={() => setScope('all')}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              scope === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <UsersIcon className="h-4 w-4" /> {t('كافة المشرفين والفرق')} ({supervisors.length})
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-slate-600">{t('الاطلاع على مشرف آخر:')}</span>
            <select
              value={supervisors.some((s) => s.id === scope) ? scope : ''}
              onChange={(e) => e.target.value && setScope(e.target.value)}
              className="input"
            >
              <option value="">{t('-- اختر المشرف للاطلاع --')}</option>
              {supervisors
                .filter((s) => s.id !== user.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {mainTab === 'schedule' && (
      <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')} className="input">
          <option value="all">{t('كل حالات المواعيد')}</option>
          {SCHEDULE_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ابحث بالاسم، الجوال، الخدمة، العقد، العنوان...')}
            className="input ps-9"
          />
        </div>
        <select
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
          className="input lg:col-span-2"
        >
          <option value="all">{t('كل الفترات الزمنية')}</option>
          <option value="today">{t('اليوم')}</option>
          <option value="week">{t('هذا الأسبوع')}</option>
          <option value="month">{t('هذا الشهر')}</option>
        </select>
        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | 'all')} className="input">
          <option value="all">{t('كل حالات الدفع')}</option>
          {PAYMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </div>

      {view === 'table' ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="p-3 text-start font-medium">{t('اليوم والتاريخ والموعد')}</th>
                <th className="p-3 text-start font-medium">{t('العميل والجوال')}</th>
                <th className="p-3 text-start font-medium">{t('نوع الخدمة / العقد')}</th>
                <th className="p-3 text-start font-medium">{t('المشرف / الفريق')}</th>
                <th className="p-3 text-start font-medium">{t('السعر والدفع')}</th>
                <th className="p-3 text-start font-medium">{t('حالة المهمة')}</th>
                <th className="p-3 text-start font-medium">{t('إجراء')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const customer = customers.find((c) => c.id === a.customer_id);
                const supervisor = allProfiles.find((p) => p.id === a.supervisor_id);
                return (
                  <tr
                    key={a.id}
                    onClick={() => setViewingAppt(a)}
                    className="cursor-pointer border-b border-slate-50 align-top last:border-0 hover:bg-slate-50"
                  >
                    <td className="p-3">
                      <div className="font-medium text-slate-700">
                        {weekdayAr(a.scheduled_at)} {formatDateAr(a.scheduled_at)}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" /> {formatTimeAr(a.scheduled_at)}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-700">{a.customer_name_snapshot ?? '—'}</div>
                      {customer?.phone && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <Phone className="h-3 w-3" /> {customer.phone}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-slate-700">{a.service_name_snapshot}</div>
                      {a.contract_number && (
                        <div className="mt-1 text-xs text-slate-400">
                          {t('عقد')} {a.contract_number}
                        </div>
                      )}
                      {a.address_snapshot && (
                        <div className="mt-1 flex max-w-[220px] items-start gap-1 text-xs text-slate-400">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">{a.address_snapshot}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-slate-700">
                        {supervisor ? `${supervisor.full_name} (${roleLabel(supervisor.role)})` : '—'}
                      </div>
                      {a.assignments.length > 0 && (
                        <div className="mt-1 text-xs text-brand-600">
                          {a.assignments.map((x) => x.technician_name).filter(Boolean).join('، ')}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <div>
                          <div className="font-medium text-slate-700">{formatMoney(a.amount)}</div>
                          <div className="mt-1">
                            <PaymentStatusBadge status={a.payment_status} />
                          </div>
                        </div>
                        {a.remaining_amount > 0 && a.status === 'completed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPayingAppt(a);
                            }}
                            title={t('تحصيل الدفعة وإصدار الفاتورة')}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <Wallet className="h-4 w-4" />
                          </button>
                        )}
                        {a.remaining_amount > 0 && a.status !== 'completed' && (
                          <span title={t('أكمل المهمة أولاً لتحصيل الدفعة')} className="rounded-lg p-1.5 text-slate-200">
                            <Wallet className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <AppointmentStatusBadge status={a.status} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingAppt(a);
                          }}
                          title={t('عرض التفاصيل')}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canDeleteAppointment && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAppointment(a);
                            }}
                            title={t('حذف الموعد نهائياً')}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    {t('لا توجد مواعيد ضمن هذا العرض')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {/* هذه المجموعة (أسهم التنقّل + أزرار شهر/أسبوع/يوم) تبقى دائماً على
                سطر واحد بلا التفاف — تُمرَّر أفقياً بدلاً من أن تنكسر لسطرين
                على الشاشات الضيقة. */}
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => shiftCalendar(-1)}
                  aria-label={t('السابق')}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => shiftCalendar(1)}
                  aria-label={t('التالي')}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                {([t('شهر'), t('أسبوع'), t('يوم')] as const).map((label, i) => {
                  const v = (['month', 'week', 'day'] as const)[i];
                  return (
                    <button
                      key={v}
                      onClick={() => setCalSubView(v)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${calSubView === v ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">{calendarHeaderLabel}</span>
              <button
                onClick={() => setCalendarDate(new Date())}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t('اليوم')}
              </button>
            </div>
          </div>

          {calSubView === 'month' && (
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAYS_HEADER.map((d) => (
                <div key={d} className="pb-1 text-center text-xs font-medium text-slate-400">
                  {t(d)}
                </div>
              ))}
              {getMonthGridDays(calendarDate).map((day) => {
                const key = day.toDateString();
                const dayAppts = apptsByDate.get(key) ?? [];
                const inMonth = day.getMonth() === calendarDate.getMonth();
                const isToday = key === new Date().toDateString();
                return (
                  <div
                    key={key}
                    className={`min-h-[92px] rounded-xl border p-1.5 text-xs ${
                      isToday ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-300' : 'border-slate-100'
                    } ${!inMonth ? 'opacity-40' : ''}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      {dayAppts.length > 0 && (
                        <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white" dir={lang === 'en' ? 'ltr' : undefined}>
                          {dayAppts.length} {t('مهام')}
                        </span>
                      )}
                      <span className={`ms-auto font-medium ${isToday ? 'text-brand-700' : 'text-slate-500'}`}>{day.getDate()}</span>
                    </div>
                    <div className="space-y-1">
                      {dayAppts.slice(0, 2).map((a) => (
                        <div key={a.id} className="truncate rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                          {formatTimeAr(a.scheduled_at)} {a.customer_name_snapshot}
                        </div>
                      ))}
                      {dayAppts.length > 2 && (
                        <div className="text-[10px] text-slate-400" dir={lang === 'en' ? 'ltr' : undefined}>
                          +{dayAppts.length - 2} {t('أخرى')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calSubView === 'week' && (
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {getWeekDays(calendarDate).map((day) => {
                const key = day.toDateString();
                const dayAppts = apptsByDate.get(key) ?? [];
                const isToday = key === new Date().toDateString();
                return (
                  <div
                    key={key}
                    className={`min-h-[220px] rounded-xl border p-1.5 text-xs ${
                      isToday ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-300' : 'border-slate-100'
                    }`}
                  >
                    <div className={`mb-1 text-center font-medium ${isToday ? 'text-brand-700' : 'text-slate-500'}`}>
                      {t(WEEKDAYS_HEADER[day.getDay()])}
                      <div className="text-sm">{day.getDate()}</div>
                    </div>
                    <div className="space-y-1">
                      {dayAppts.map((a) => (
                        <div key={a.id} className="truncate rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                          {formatTimeAr(a.scheduled_at)} {a.customer_name_snapshot}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calSubView === 'day' && (
            <div className="space-y-2">
              {(apptsByDate.get(calendarDate.toDateString()) ?? [])
                .slice()
                .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                .map((a) => (
                  <div
                    key={a.id}
                    onClick={() => setViewingAppt(a)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-700">{a.customer_name_snapshot}</div>
                      <div className="text-xs text-slate-400">{a.service_name_snapshot}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{formatTimeAr(a.scheduled_at)}</span>
                      <AppointmentStatusBadge status={a.status} />
                      {canDeleteAppointment && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAppointment(a);
                          }}
                          title={t('حذف الموعد نهائياً')}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {(apptsByDate.get(calendarDate.toDateString()) ?? []).length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
                  {t('لا توجد مواعيد في هذا اليوم')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {mainTab === 'completed' && canViewCompletedTab && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={completedSearch}
              onChange={(e) => setCompletedSearch(e.target.value)}
              placeholder={t('ابحث بالاسم، الجوال، الخدمة، العقد، العنوان...')}
              className="input ps-9"
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="p-3 text-start font-medium">{t('اليوم والتاريخ والموعد')}</th>
                  <th className="p-3 text-start font-medium">{t('العميل والجوال')}</th>
                  <th className="p-3 text-start font-medium">{t('نوع الخدمة / العقد')}</th>
                  <th className="p-3 text-start font-medium">{t('المشرف / الفريق')}</th>
                  <th className="p-3 text-start font-medium">{t('السعر والدفع')}</th>
                  <th className="p-3 text-start font-medium">{t('حالة الطلب')}</th>
                  <th className="p-3 text-start font-medium">{t('تقييم الخدمة')}</th>
                  <th className="p-3 text-start font-medium">{t('تقييم العميل')}</th>
                  <th className="p-3 text-start font-medium">{t('إجراء')}</th>
                </tr>
              </thead>
              <tbody>
                {completedList.map((a) => {
                  const customer = customers.find((c) => c.id === a.customer_id);
                  const supervisor = allProfiles.find((p) => p.id === a.supervisor_id);
                  const rating = ratingByAppointment.get(a.id);
                  const invoice = invoiceByAppointment.get(a.id);
                  const customerRating = customerRatingByAppointment.get(a.id);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setViewingAppt(a)}
                      className="cursor-pointer border-b border-slate-50 align-top last:border-0 hover:bg-slate-50"
                    >
                      <td className="p-3">
                        <div className="font-medium text-slate-700">
                          {weekdayAr(a.scheduled_at)} {formatDateAr(a.scheduled_at)}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" /> {formatTimeAr(a.scheduled_at)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-700">{a.customer_name_snapshot ?? '—'}</div>
                        {customer?.phone && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            <Phone className="h-3 w-3" /> {customer.phone}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-700">{a.service_name_snapshot}</div>
                        {a.contract_number && (
                          <div className="mt-1 text-xs text-slate-400">
                            {t('عقد')} {a.contract_number}
                          </div>
                        )}
                        {a.address_snapshot && (
                          <div className="mt-1 flex max-w-[220px] items-start gap-1 text-xs text-slate-400">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="truncate">{a.address_snapshot}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-700">
                          {supervisor ? `${supervisor.full_name} (${roleLabel(supervisor.role)})` : '—'}
                        </div>
                        {a.assignments.length > 0 && (
                          <div className="mt-1 text-xs text-brand-600">
                            {a.assignments.map((x) => x.technician_name).filter(Boolean).join('، ')}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-700">{formatMoney(a.amount)}</div>
                        <div className="mt-1">
                          <PaymentStatusBadge status={a.payment_status} />
                        </div>
                      </td>
                      <td className="p-3">
                        <AppointmentStatusBadge status={a.status} />
                      </td>
                      <td className="p-3">
                        {rating ? (
                          <div className="space-y-1">
                            <RatingStars value={rating.stars} />
                            {rating.comment && <div className="max-w-[160px] truncate text-xs text-slate-400">"{rating.comment}"</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{t('لم يُقيَّم بعد')}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRatingCustomerAppt(a);
                          }}
                          className="text-start"
                        >
                          {customerRating ? (
                            <div className="space-y-1">
                              <RatingStars value={customerRating.stars} />
                              {customerRating.notes && (
                                <div className="max-w-[160px] truncate text-xs text-slate-400">"{customerRating.notes}"</div>
                              )}
                            </div>
                          ) : (
                            <span className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">
                              {t('تقييم العميل')}
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingAppt(a);
                            }}
                            title={t('عرض التفاصيل')}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {invoice && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingInvoice(invoice);
                              }}
                              title={t('عرض / طباعة الفاتورة')}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                          )}
                          {canDeleteAppointment && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteAppointment(a);
                              }}
                              title={t('حذف الموعد نهائياً')}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {completedList.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-400">
                      {t('لا توجد مهام مكتملة أو ملغاة ضمن هذا العرض')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canBook && showNewAppt && (
        <NewAppointmentModal
          customers={customers}
          services={services}
          supervisors={supervisors}
          technicians={technicians}
          onClose={() => setShowNewAppt(false)}
          onCreated={refresh}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
        />
      )}

      {payingAppt && (
        <PayAppointmentModal
          appointment={payingAppt}
          customer={customers.find((c) => c.id === payingAppt.customer_id)}
          paymentMethods={paymentMethods}
          onClose={() => setPayingAppt(null)}
          onPaid={refresh}
        />
      )}

      {viewingAppt && (
        <AppointmentDetailModal
          appointment={appointments.find((a) => a.id === viewingAppt.id) ?? viewingAppt}
          customer={customers.find((c) => c.id === viewingAppt.customer_id)}
          allProfiles={allProfiles}
          paymentMethods={paymentMethods}
          onClose={() => setViewingAppt(null)}
          onChanged={refresh}
        />
      )}

      {viewingInvoice && (
        <InvoiceDocument
          invoice={viewingInvoice}
          customer={customers.find((c) => c.id === viewingInvoice.customer_id)}
          appointment={appointments.find((a) => a.id === viewingInvoice.appointment_id)}
          paymentMethods={paymentMethods}
          onClose={() => setViewingInvoice(null)}
        />
      )}

      {ratingCustomerAppt && (
        <CustomerRatingModal
          existing={{
            appointmentId: ratingCustomerAppt.id,
            stars: customerRatingByAppointment.get(ratingCustomerAppt.id)?.stars ?? 0,
            notes: customerRatingByAppointment.get(ratingCustomerAppt.id)?.notes,
          }}
          onClose={() => setRatingCustomerAppt(null)}
          onSaved={(r) => setCustomerRatings((prev) => [...prev.filter((x) => x.appointment_id !== r.appointment_id), r])}
        />
      )}
    </div>
  );
}
