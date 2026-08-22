import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDays, Table2, MapPin, ChevronRight, ChevronLeft, Plus, X, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, AppointmentStatus, PaymentStatus, Customer, Service } from '../../shared/types.js';
import { ROLE_LABELS_AR } from '../../shared/types.js';
import { AppointmentStatusBadge, PaymentStatusBadge } from '../components/Badge.js';
import {
  formatDateAr,
  formatTimeAr,
  formatMoney,
  monthLabelAr,
  isSameLocalDay,
  startOfWeekSunday,
  startOfMonth,
  addDays,
} from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

type ScopeFilter = 'mine' | 'all' | string; // string = a specific supervisor id
type CalendarMode = 'month' | 'week' | 'day';
type StatusFilter = 'all' | AppointmentStatus;
type PaymentFilter = 'all' | PaymentStatus;
type PeriodFilter = 'all' | 'today' | 'week' | 'month';

const WEEKDAY_FULL_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAY_SHORT_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: 'bg-slate-400',
  on_the_way: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-500',
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'مجدولة',
  on_the_way: 'في الطريق',
  in_progress: 'جارية',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  paid: 'مسدد بالكامل',
  partial: 'مسدد جزئياً',
  unpaid: 'غير مسدد',
};

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'كل الفترات الزمنية',
  today: 'اليوم',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
};

function matchesPeriod(iso: string, period: PeriodFilter, now: Date): boolean {
  if (period === 'all') return true;
  const d = new Date(iso);
  if (period === 'today') return d.toDateString() === now.toDateString();
  if (period === 'week') {
    const start = startOfWeekSunday(now);
    const end = addDays(start, 7);
    return d >= start && d < end;
  }
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function Appointments() {
  const { user, allProfiles } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [scope, setScope] = useState<ScopeFilter>('mine');
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [calMode, setCalMode] = useState<CalendarMode>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [search, setSearch] = useState('');

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingServiceId, setBookingServiceId] = useState('');
  const [bookingSupervisorId, setBookingSupervisorId] = useState(user?.role === 'supervisor' ? user.id : '');

  function refresh() {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
  }, []);

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicians = allProfiles.filter(
    (p) => p.role === 'technician' && (!bookingSupervisorId || p.supervisor_id === bookingSupervisorId),
  );
  const customerPhoneById = useMemo(() => new Map(customers.map((c) => [c.id, c.phone])), [customers]);

  // جداول المشرفين الآخرين والجدول العام مقصورة على الإدارة (مدير عام / مدير نظام /
  // مشرف إداري) — المشرف الميداني والفني الميداني ما يشوفون إلا جدولهم الخاص.
  const canSeeOtherSchedules =
    user?.role === 'general_manager' || user?.role === 'admin' || user?.role === 'admin_supervisor';

  const scoped = useMemo(() => {
    const effectiveScope = canSeeOtherSchedules ? scope : 'mine';
    if (effectiveScope === 'all') return appointments;
    if (effectiveScope === 'mine') return appointments.filter((a) => a.supervisor_id === user?.id);
    return appointments.filter((a) => a.supervisor_id === effectiveScope);
  }, [appointments, scope, user, canSeeOtherSchedules]);

  const filtered = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return scoped.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && a.payment_status !== paymentFilter) return false;
      if (!matchesPeriod(a.scheduled_at, periodFilter, now)) return false;
      if (q) {
        const haystack = `${a.customer_name_snapshot ?? ''} ${a.service_name_snapshot} ${a.address_snapshot}`.toLowerCase();
        const phone = customerPhoneById.get(a.customer_id) ?? '';
        const phoneMatch = qDigits.length > 0 && phone.replace(/\D/g, '').includes(qDigits);
        if (!haystack.includes(q) && !phoneMatch) return false;
      }
      return true;
    });
  }, [scoped, statusFilter, paymentFilter, periodFilter, search, customerPhoneById]);

  const grouped = useMemo(() => {
    const byDate = new Map<string, Appointment[]>();
    for (const a of filtered) {
      const key = new Date(a.scheduled_at).toDateString();
      byDate.set(key, [...(byDate.get(key) ?? []), a]);
    }
    return Array.from(byDate.entries()).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [filtered]);

  const apptsByDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of filtered) {
      const key = new Date(a.scheduled_at).toDateString();
      const arr = m.get(key);
      if (arr) arr.push(a);
      else m.set(key, [a]);
    }
    for (const arr of m.values()) {
      arr.sort((x, y) => new Date(x.scheduled_at).getTime() - new Date(y.scheduled_at).getTime());
    }
    return m;
  }, [filtered]);

  const monthCells = useMemo(() => {
    const gridStart = startOfWeekSunday(startOfMonth(cursor));
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const weekCells = useMemo(() => {
    const start = startOfWeekSunday(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  function goPrev() {
    setCursor((c) => {
      if (calMode === 'month') return new Date(c.getFullYear(), c.getMonth() - 1, 1);
      if (calMode === 'week') return addDays(c, -7);
      return addDays(c, -1);
    });
  }
  function goNext() {
    setCursor((c) => {
      if (calMode === 'month') return new Date(c.getFullYear(), c.getMonth() + 1, 1);
      if (calMode === 'week') return addDays(c, 7);
      return addDays(c, 1);
    });
  }
  function goToday() {
    const today = new Date();
    setCursor(today);
    setSelectedDate(today);
  }

  function closeBookingForm() {
    setShowBookingForm(false);
    setBookingServiceId('');
    setBookingSupervisorId(user?.role === 'supervisor' ? user.id : '');
  }

  async function handleBookingSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const date = form.get('date') as string;
    const time = form.get('time') as string;
    const technicianIds = form.getAll('technician_ids') as string[];
    try {
      await api.post('/appointments', {
        customer_id: form.get('customer_id'),
        service_id: form.get('service_id'),
        scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
        expected_duration_minutes: form.get('duration') ? Number(form.get('duration')) : undefined,
        amount: form.get('amount') ? Number(form.get('amount')) : undefined,
        supervisor_id: form.get('supervisor_id') || undefined,
        notes: form.get('notes') || undefined,
        assignments: technicianIds.map((id) => ({
          id: crypto.randomUUID(),
          technician_id: id,
          technician_name: allProfiles.find((p) => p.id === id)?.full_name,
        })),
      });
      closeBookingForm();
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const selectedDayAppts = apptsByDay.get(selectedDate.toDateString()) ?? [];
  const dayModeAppts = apptsByDay.get(cursor.toDateString()) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">جدول المواعيد</h1>
          <p className="text-sm text-slate-400">
            إدارة ومتابعة المواعيد مع فصل جداول المشرفين وإمكانية الاطلاع المتبادل — {filtered.length} موعد
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBookingForm(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> حجز موعد جديد
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'table' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <Table2 className="h-4 w-4" /> الجدول
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'calendar' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <CalendarDays className="h-4 w-4" /> التقويم
            </button>
          </div>
        </div>
      </div>

      {canSeeOtherSchedules ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">عرض جدولي الخاص</span>
            <select
              className="input"
              value={scope === 'mine' || scope === 'all' ? scope : 'all'}
              onChange={(e) => setScope(e.target.value as ScopeFilter)}
            >
              <option value="mine">جدولي الخاص</option>
              <option value="all">كافة المشرفين والفرق ({supervisors.length})</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">الاطلاع على مشرف آخر</span>
            <select
              className="input"
              value={scope !== 'mine' && scope !== 'all' ? scope : ''}
              onChange={(e) => setScope(e.target.value || 'all')}
            >
              <option value="">— بدون تحديد —</option>
              {supervisors
                .filter((s) => s.id !== user?.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    جدول: {s.full_name} ({ROLE_LABELS_AR[s.role]})
                  </option>
                ))}
            </select>
          </label>
        </div>
      ) : (
        <div>
          <span className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white">جدولي</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">كل حالات المواعيد</option>
          {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم، الجوال، الخدمة، العنوان..."
            className="input pe-9"
          />
        </div>
        <select
          className="input"
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
        >
          {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
        >
          <option value="all">كل حالات الدفع</option>
          {(Object.keys(PAYMENT_LABELS) as PaymentStatus[]).map((p) => (
            <option key={p} value={p}>
              {PAYMENT_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {view === 'table' ? (
        <div className="space-y-5">
          {grouped.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              لا توجد مواعيد ضمن هذا العرض
            </div>
          )}
          {grouped.map(([dateKey, items]) => (
            <div key={dateKey} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {WEEKDAY_FULL_AR[new Date(items[0].scheduled_at).getDay()]}
                </span>
                <span className="text-sm font-medium text-slate-700">{formatDateAr(items[0].scheduled_at)}</span>
              </div>
              <ApptTable items={items} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={goPrev}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                    aria-label="السابق"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <span className="min-w-[9rem] text-center text-sm font-bold text-slate-800">
                    {calMode === 'month'
                      ? monthLabelAr(cursor)
                      : calMode === 'week'
                        ? `${formatDateAr(weekCells[0].toISOString())} – ${formatDateAr(weekCells[6].toISOString())}`
                        : formatDateAr(cursor.toISOString())}
                  </span>
                  <button
                    onClick={goNext}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                    aria-label="التالي"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
                  <button
                    onClick={() => setCalMode('month')}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${calMode === 'month' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                  >
                    شهر
                  </button>
                  <button
                    onClick={() => setCalMode('week')}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${calMode === 'week' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                  >
                    أسبوع
                  </button>
                  <button
                    onClick={() => setCalMode('day')}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${calMode === 'day' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                  >
                    يوم
                  </button>
                </div>
              </div>
              <button
                onClick={goToday}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                اليوم
              </button>
            </div>

            {calMode === 'month' ? (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
                  {WEEKDAY_SHORT_AR.map((w) => (
                    <div key={w} className="py-1">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthCells.map((d) => {
                    const inMonth = d.getMonth() === cursor.getMonth();
                    const key = d.toDateString();
                    const dayAppts = apptsByDay.get(key) ?? [];
                    const isToday = isSameLocalDay(d, new Date());
                    const isSelected = isSameLocalDay(d, selectedDate);
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDate(d)}
                        className={`relative flex min-h-[5.5rem] flex-col items-start gap-1 rounded-xl border p-1.5 text-start transition ${
                          isSelected
                            ? 'border-brand-400 bg-brand-50'
                            : isToday
                              ? 'border-brand-200 bg-white'
                              : 'border-slate-100 bg-white hover:bg-slate-50'
                        } ${inMonth ? '' : 'opacity-40'}`}
                      >
                        {dayAppts.length > 0 && (
                          <span className="absolute end-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                            {dayAppts.length}
                          </span>
                        )}
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            isToday ? 'bg-brand-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          {d.getDate()}
                        </span>
                        <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                          {dayAppts.slice(0, 2).map((a) => (
                            <span key={a.id} className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} />
                              <span className="truncate">
                                {formatTimeAr(a.scheduled_at)} {a.customer_name_snapshot ?? ''}
                              </span>
                            </span>
                          ))}
                          {dayAppts.length > 2 && (
                            <span className="text-[10px] font-medium text-brand-600">+{dayAppts.length - 2} أخرى</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : calMode === 'week' ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
                {weekCells.map((d) => {
                  const key = d.toDateString();
                  const dayAppts = apptsByDay.get(key) ?? [];
                  const isToday = isSameLocalDay(d, new Date());
                  const isSelected = isSameLocalDay(d, selectedDate);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDate(d)}
                      className={`flex flex-col gap-2 rounded-xl border p-2 text-start ${
                        isSelected
                          ? 'border-brand-400 bg-brand-50'
                          : isToday
                            ? 'border-brand-200 bg-white'
                            : 'border-slate-100 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">{WEEKDAY_FULL_AR[d.getDay()]}</span>
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            isToday ? 'bg-brand-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                        {dayAppts.length === 0 && <span className="text-[11px] text-slate-300">لا مواعيد</span>}
                        {dayAppts.map((a) => (
                          <div key={a.id} className="rounded-lg bg-slate-50 px-2 py-1 text-[11px]">
                            <div className="flex items-center gap-1 font-medium text-slate-700">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} />
                              {formatTimeAr(a.scheduled_at)}
                            </div>
                            <div className="truncate text-slate-500">{a.customer_name_snapshot}</div>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {WEEKDAY_FULL_AR[cursor.getDay()]}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{formatDateAr(cursor.toISOString())}</span>
                  <span className="text-xs text-slate-400">({dayModeAppts.length} موعد)</span>
                </div>
                {dayModeAppts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                    لا توجد مواعيد في هذا اليوم
                  </div>
                ) : (
                  <ApptTable items={dayModeAppts} />
                )}
              </div>
            )}
          </div>

          {calMode !== 'day' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {WEEKDAY_FULL_AR[selectedDate.getDay()]}
                </span>
                <span className="text-sm font-medium text-slate-700">{formatDateAr(selectedDate.toISOString())}</span>
                <span className="text-xs text-slate-400">({selectedDayAppts.length} موعد)</span>
              </div>
              {selectedDayAppts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                  لا توجد مواعيد في هذا اليوم
                </div>
              ) : (
                <ApptTable items={selectedDayAppts} />
              )}
            </div>
          )}
        </div>
      )}

      {showBookingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleBookingSubmit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">حجز موعد جديد</h2>
              <button type="button" onClick={closeBookingForm} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="العميل">
                <select name="customer_id" required defaultValue="" className="input">
                  <option value="" disabled>
                    اختر عميلاً…
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.phone}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="الخدمة">
                <select
                  name="service_id"
                  required
                  className="input"
                  value={bookingServiceId}
                  onChange={(e) => setBookingServiceId(e.target.value)}
                >
                  <option value="" disabled>
                    اختر خدمة…
                  </option>
                  {services
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="التاريخ">
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="input"
                  />
                </Field>
                <Field label="الوقت">
                  <input type="time" name="time" required defaultValue="09:00" className="input" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="المدة المتوقعة (دقيقة)">
                  <input
                    key={`dur-${bookingServiceId}`}
                    type="number"
                    name="duration"
                    min={15}
                    step={15}
                    defaultValue={services.find((s) => s.id === bookingServiceId)?.default_duration_minutes ?? 120}
                    className="input"
                  />
                </Field>
                <Field label="المبلغ (ر.س)">
                  <input
                    key={`amt-${bookingServiceId}`}
                    type="number"
                    name="amount"
                    min={0}
                    step="0.01"
                    defaultValue={services.find((s) => s.id === bookingServiceId)?.default_price ?? ''}
                    className="input"
                  />
                </Field>
              </div>

              <Field label="المشرف المسؤول">
                <select
                  name="supervisor_id"
                  className="input"
                  value={bookingSupervisorId}
                  onChange={(e) => setBookingSupervisorId(e.target.value)}
                >
                  <option value="">بدون تحديد</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="الفنيون المكلّفون (Ctrl/Cmd للاختيار المتعدد)">
                <select name="technician_ids" multiple className="input h-24">
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="ملاحظات">
                <textarea name="notes" rows={2} className="input" />
              </Field>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحجز…' : 'حجز الموعد'}
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

function ApptTable({ items }: { items: Appointment[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-400">
            <th className="py-2 text-start font-medium">الوقت</th>
            <th className="py-2 text-start font-medium">العميل</th>
            <th className="py-2 text-start font-medium">الخدمة</th>
            <th className="py-2 text-start font-medium">الفني</th>
            <th className="py-2 text-start font-medium">المبلغ</th>
            <th className="py-2 text-start font-medium">الحالة</th>
            <th className="py-2 text-start font-medium">السداد</th>
            <th className="py-2 text-start font-medium">الموقع</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-b border-slate-50 last:border-0">
              <td className="py-2.5">{formatTimeAr(a.scheduled_at)}</td>
              <td className="py-2.5 font-medium text-slate-700">{a.customer_name_snapshot ?? '—'}</td>
              <td className="py-2.5 text-slate-600">{a.service_name_snapshot}</td>
              <td className="py-2.5 text-slate-600">
                {a.assignments.map((x) => x.technician_name).filter(Boolean).join('، ') || '—'}
              </td>
              <td className="py-2.5 text-slate-600">{formatMoney(a.amount)}</td>
              <td className="py-2.5">
                <AppointmentStatusBadge status={a.status} />
              </td>
              <td className="py-2.5">
                <PaymentStatusBadge status={a.payment_status} />
              </td>
              <td className="py-2.5">
                {a.location_url ? (
                  <a
                    href={a.location_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" /> خرائط
                  </a>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
