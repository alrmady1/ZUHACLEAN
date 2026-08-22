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
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Service, AppointmentStatus, PaymentStatus } from '../../shared/types.js';
import { ROLE_LABELS_AR } from '../../shared/types.js';
import { AppointmentStatusBadge, PaymentStatusBadge } from '../components/Badge.js';
import NewAppointmentModal from '../components/NewAppointmentModal.js';
import { weekdayAr, formatDateAr, formatTimeAr, formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

type ScopeFilter = 'mine' | 'all' | string; // string = a specific supervisor id
type PeriodFilter = 'all' | 'today' | 'week' | 'month';

// Field supervisors and technicians only ever see their own schedule — the
// "كافة المشرفين والفرق" toggle and the "الاطلاع على مشرف آخر" picker are
// restricted to admin_supervisor / admin / general_manager.
const CAN_SEE_ALL_SCHEDULES_ROLES = ['general_manager', 'admin', 'admin_supervisor'];

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: 'scheduled', label: 'مجدولة' },
  { value: 'on_the_way', label: 'في الطريق' },
  { value: 'in_progress', label: 'جارية' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' },
];
const PAYMENT_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'غير مسدد' },
  { value: 'partial', label: 'مسدد جزئياً' },
  { value: 'paid', label: 'مسدد بالكامل' },
];
// Quick "move it forward" action for the last table column.
const NEXT_STATUS: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  scheduled: 'on_the_way',
  on_the_way: 'in_progress',
  in_progress: 'completed',
};

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

export default function Appointments() {
  const { user, allProfiles } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [scope, setScope] = useState<ScopeFilter>('mine');
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'all'>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [search, setSearch] = useState('');
  const [showNewAppt, setShowNewAppt] = useState(false);

  function refresh() {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
  }, []);

  const canSeeAllSchedules = user ? CAN_SEE_ALL_SCHEDULES_ROLES.includes(user.role) : false;
  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicians = allProfiles.filter((p) => p.role === 'technician');

  const scoped = useMemo(() => {
    if (!canSeeAllSchedules) {
      if (user?.role === 'technician') {
        return appointments.filter((a) => a.assignments.some((x) => x.technician_id === user.id));
      }
      return appointments.filter((a) => a.supervisor_id === user?.id);
    }
    if (scope === 'all') return appointments;
    if (scope === 'mine') return appointments.filter((a) => a.supervisor_id === user?.id);
    return appointments.filter((a) => a.supervisor_id === scope);
  }, [appointments, scope, user, canSeeAllSchedules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped
      .filter((a) => {
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

  const grouped = useMemo(() => {
    const byDate = new Map<string, Appointment[]>();
    for (const a of filtered) {
      const key = new Date(a.scheduled_at).toDateString();
      byDate.set(key, [...(byDate.get(key) ?? []), a]);
    }
    return Array.from(byDate.entries());
  }, [filtered]);

  async function advanceStatus(a: Appointment) {
    const next = NEXT_STATUS[a.status];
    if (!next) return;
    await api.patch(`/appointments/${a.id}`, { status: next });
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">جدول المواعيد والمهام</h1>
          <p className="text-sm text-slate-400">إدارة ومتابعة المواعيد، مع فصل جداول المشرفين وإمكانية الاطلاع المتبادل</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowNewAppt(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> حجز موعد جديد
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'calendar' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <CalendarDays className="h-4 w-4" /> التقويم
            </button>
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'table' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <Table2 className="h-4 w-4" /> الجدول
            </button>
          </div>
        </div>
      </div>

      {canSeeAllSchedules && user && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-600">عرض جدول المشرف:</span>
            <button
              onClick={() => setScope('mine')}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium ${
                scope === 'mine' ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              <UserRound className="h-4 w-4" />
              جدولي الخاص ({user.full_name} — {ROLE_LABELS_AR[user.role]})
            </button>
          </div>
          <button
            onClick={() => setScope('all')}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              scope === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <UsersIcon className="h-4 w-4" /> كافة المشرفين والفرق ({supervisors.length})
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-slate-600">الاطلاع على مشرف آخر:</span>
            <select
              value={supervisors.some((s) => s.id === scope) ? scope : ''}
              onChange={(e) => e.target.value && setScope(e.target.value)}
              className="input"
            >
              <option value="">-- اختر المشرف للاطلاع --</option>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')} className="input">
          <option value="all">كل حالات المواعيد</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم، الجوال، الخدمة، العقد، العنوان..."
            className="input ps-9"
          />
        </div>
        <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)} className="input">
          <option value="all">كل الفترات الزمنية</option>
          <option value="today">اليوم</option>
          <option value="week">هذا الأسبوع</option>
          <option value="month">هذا الشهر</option>
        </select>
        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | 'all')} className="input">
          <option value="all">كل حالات الدفع</option>
          {PAYMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {view === 'table' ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="p-3 text-start font-medium">اليوم والتاريخ والموعد</th>
                <th className="p-3 text-start font-medium">العميل والجوال</th>
                <th className="p-3 text-start font-medium">نوع الخدمة / العقد</th>
                <th className="p-3 text-start font-medium">المشرف / الفريق</th>
                <th className="p-3 text-start font-medium">السعر والدفع</th>
                <th className="p-3 text-start font-medium">حالة المهمة</th>
                <th className="p-3 text-start font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const customer = customers.find((c) => c.id === a.customer_id);
                const supervisor = allProfiles.find((p) => p.id === a.supervisor_id);
                const next = NEXT_STATUS[a.status];
                return (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 align-top">
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
                      {a.contract_number && <div className="mt-1 text-xs text-slate-400">عقد {a.contract_number}</div>}
                      {a.address_snapshot && (
                        <div className="mt-1 flex max-w-[220px] items-start gap-1 text-xs text-slate-400">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">{a.address_snapshot}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-slate-700">
                        {supervisor ? `${supervisor.full_name} (${ROLE_LABELS_AR[supervisor.role]})` : '—'}
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
                      {next ? (
                        <button
                          onClick={() => advanceStatus(a)}
                          title="الانتقال للحالة التالية"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    لا توجد مواعيد ضمن هذا العرض
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([dateKey, items]) => (
            <div key={dateKey} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {weekdayAr(items[0].scheduled_at)}
                </span>
                <span className="text-sm font-medium text-slate-700">{formatDateAr(items[0].scheduled_at)}</span>
              </div>
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
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              لا توجد مواعيد ضمن هذا العرض
            </div>
          )}
        </div>
      )}

      {showNewAppt && (
        <NewAppointmentModal
          customers={customers}
          services={services}
          supervisors={supervisors}
          technicians={technicians}
          onClose={() => setShowNewAppt(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
