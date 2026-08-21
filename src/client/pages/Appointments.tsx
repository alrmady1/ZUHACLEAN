import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Table2, MapPin, ChevronRight, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, AppointmentStatus } from '../../shared/types.js';
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
type CalendarMode = 'month' | 'week';

const WEEKDAY_FULL_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAY_SHORT_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: 'bg-slate-400',
  on_the_way: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-500',
};

export default function Appointments() {
  const { user, allProfiles } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scope, setScope] = useState<ScopeFilter>('mine');
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [calMode, setCalMode] = useState<CalendarMode>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  useEffect(() => {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }, []);

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');

  const filtered = useMemo(() => {
    if (scope === 'all') return appointments;
    if (scope === 'mine') return appointments.filter((a) => a.supervisor_id === user?.id);
    return appointments.filter((a) => a.supervisor_id === scope);
  }, [appointments, scope, user]);

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
    setCursor((c) => (calMode === 'month' ? new Date(c.getFullYear(), c.getMonth() - 1, 1) : addDays(c, -7)));
  }
  function goNext() {
    setCursor((c) => (calMode === 'month' ? new Date(c.getFullYear(), c.getMonth() + 1, 1) : addDays(c, 7)));
  }
  function goToday() {
    const today = new Date();
    setCursor(today);
    setSelectedDate(today);
  }

  const selectedDayAppts = apptsByDay.get(selectedDate.toDateString()) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">جدول المواعيد</h1>
          <p className="text-sm text-slate-400">{filtered.length} موعد</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'table' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <Table2 className="h-4 w-4" /> جدول
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'calendar' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <CalendarDays className="h-4 w-4" /> تقويم
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setScope('mine')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${scope === 'mine' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          جدولي
        </button>
        <button
          onClick={() => setScope('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${scope === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          الجدول العام
        </button>
        {supervisors
          .filter((s) => s.id !== user?.id)
          .map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${scope === s.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              جدول {s.full_name}
            </button>
          ))}
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
                    : `${formatDateAr(weekCells[0].toISOString())} – ${formatDateAr(weekCells[6].toISOString())}`}
                </span>
                <button
                  onClick={goNext}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                  aria-label="التالي"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={goToday}
                  className="ms-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  اليوم
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
                <button
                  onClick={() => setCalMode('month')}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${calMode === 'month' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                >
                  شهري
                </button>
                <button
                  onClick={() => setCalMode('week')}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${calMode === 'week' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                >
                  أسبوعي
                </button>
              </div>
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
                        className={`flex min-h-[5.5rem] flex-col items-start gap-1 rounded-xl border p-1.5 text-start transition ${
                          isSelected
                            ? 'border-brand-400 bg-brand-50'
                            : isToday
                              ? 'border-brand-200 bg-white'
                              : 'border-slate-100 bg-white hover:bg-slate-50'
                        } ${inMonth ? '' : 'opacity-40'}`}
                      >
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
            ) : (
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
            )}
          </div>

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
        </div>
      )}
    </div>
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
