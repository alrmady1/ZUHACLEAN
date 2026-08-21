import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Table2, MapPin } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Profile } from '../../shared/types.js';
import { AppointmentStatusBadge, PaymentStatusBadge } from '../components/Badge.js';
import { weekdayAr, formatDateAr, formatTimeAr, formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

type ScopeFilter = 'mine' | 'all' | string; // string = a specific supervisor id

export default function Appointments() {
  const { user, allProfiles } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scope, setScope] = useState<ScopeFilter>('mine');
  const [view, setView] = useState<'table' | 'calendar'>('table');

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

      {grouped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          لا توجد مواعيد ضمن هذا العرض
        </div>
      )}

      <div className="space-y-5">
        {grouped.map(([dateKey, items]) => (
          <div key={dateKey} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {weekdayAr(items[0].scheduled_at)}
              </span>
              <span className="text-sm font-medium text-slate-700">{formatDateAr(items[0].scheduled_at)}</span>
            </div>

            {view === 'table' ? (
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
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((a) => (
                  <div key={a.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">{formatTimeAr(a.scheduled_at)}</span>
                      <AppointmentStatusBadge status={a.status} />
                    </div>
                    <div className="text-sm text-slate-600">{a.customer_name_snapshot}</div>
                    <div className="text-xs text-slate-400">{a.service_name_snapshot}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
