import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  X,
  ListFilter,
  Clock,
  CheckCircle2,
  CalendarClock,
  Banknote,
  Receipt,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Service, Profile, Invoice } from '../../shared/types.js';
import { AppointmentStatusBadge } from '../components/Badge.js';
import { formatMoney, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

function isSameDay(iso: string, ref: Date): boolean {
  return new Date(iso).toDateString() === ref.toDateString();
}
function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

const BAR_TINTS = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500'];

function StatCard({
  icon: Icon,
  iconTint,
  label,
  value,
  valueTint,
  sub,
  subTint,
}: {
  icon: typeof CalendarClock;
  iconTint: string;
  label: string;
  value: string;
  valueTint: string;
  sub: string;
  subTint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <span className={`rounded-lg p-1.5 ${iconTint}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`text-3xl font-bold ${valueTint}`}>{value}</div>
      <div className={`mt-1 text-xs ${subTint}`}>{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { allProfiles } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function refreshAppointments() {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(() => {
    refreshAppointments();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
    api.get<Invoice[]>('/invoices').then(setInvoices);
  }, []);

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const lastMonth = new Date(now);
  lastMonth.setMonth(now.getMonth() - 1);

  const todayAppts = useMemo(() => appointments.filter((a) => isSameDay(a.scheduled_at, now)), [appointments]);
  const yesterdayCount = useMemo(() => appointments.filter((a) => isSameDay(a.scheduled_at, yesterday)).length, [appointments]);

  const inProgressToday = todayAppts.filter((a) => a.status === 'in_progress');
  const activeTeams = new Set(inProgressToday.flatMap((a) => a.assignments.map((x) => x.technician_id))).size;

  const completedToday = todayAppts.filter((a) => a.status === 'completed');
  const completionRate = todayAppts.length > 0 ? Math.round((completedToday.length / todayAppts.length) * 100) : 0;

  const apptDelta = todayAppts.length - yesterdayCount;

  const collectedToday = useMemo(() => {
    let total = 0;
    for (const a of appointments) for (const p of a.payments) if (isSameDay(p.recorded_at, now)) total += p.amount;
    return total;
  }, [appointments]);
  const invoicedToday = useMemo(() => invoices.filter((i) => i.issue_date === now.toISOString().slice(0, 10)), [invoices]);
  const invoicedTodayTotal = invoicedToday.reduce((s, i) => s + i.total, 0);

  const salesTodayTotal = invoicedTodayTotal;

  const salesThisMonth = useMemo(
    () => invoices.filter((i) => isSameMonth(i.issue_date, now)).reduce((s, i) => s + i.total, 0),
    [invoices],
  );
  const salesLastMonth = useMemo(
    () => invoices.filter((i) => isSameMonth(i.issue_date, lastMonth)).reduce((s, i) => s + i.total, 0),
    [invoices],
  );
  const growthAmount = salesThisMonth - salesLastMonth;
  const growthPercent = salesLastMonth > 0 ? (growthAmount / salesLastMonth) * 100 : salesThisMonth > 0 ? 100 : 0;

  const serviceDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of appointments) counts.set(a.service_name_snapshot, (counts.get(a.service_name_snapshot) ?? 0) + 1);
    const total = appointments.length;
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [appointments]);

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicians = allProfiles.filter((p) => p.role === 'technician');

  async function handleCreateAppointment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const customerId = String(form.get('customer_id'));
    const serviceId = String(form.get('service_id'));
    const customer = customers.find((c) => c.id === customerId);
    const service = services.find((s) => s.id === serviceId);
    const technicianId = form.get('technician_id');
    try {
      await api.post('/appointments', {
        customer_id: customerId,
        service_id: serviceId,
        service_name_snapshot: service?.name,
        scheduled_at: form.get('scheduled_at'),
        expected_duration_minutes: service?.default_duration_minutes ?? 120,
        amount: Number(form.get('amount')),
        supervisor_id: form.get('supervisor_id') || undefined,
        address_snapshot: customer?.address ?? '',
        location_url: customer?.location_url,
        assignments: technicianId
          ? [{ id: crypto.randomUUID(), technician_id: technicianId, technician_name: technicians.find((t) => t.id === technicianId)?.full_name }]
          : [],
      });
      setShowNewAppt(false);
      refreshAppointments();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Clock}
          iconTint="bg-amber-100 text-amber-600"
          label="قيد التنفيذ"
          value={String(inProgressToday.length)}
          valueTint="text-amber-500"
          sub={`${activeTeams} فرق تعمل حالياً`}
          subTint="text-amber-500"
        />
        <StatCard
          icon={CheckCircle2}
          iconTint="bg-emerald-100 text-emerald-600"
          label="مكتملة اليوم"
          value={String(completedToday.length)}
          valueTint="text-emerald-600"
          sub={`${completionRate}% نسبة الإنجاز`}
          subTint="text-emerald-600"
        />
        <StatCard
          icon={CalendarClock}
          iconTint="bg-slate-100 text-slate-600"
          label="مواعيد اليوم"
          value={String(todayAppts.length)}
          valueTint="text-slate-800"
          sub={`${apptDelta >= 0 ? '+' : ''}${apptDelta} عن أمس`}
          subTint="text-slate-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={Banknote}
          iconTint="bg-emerald-100 text-emerald-600"
          label="المحصّل الفعلي"
          value={formatMoney(collectedToday)}
          valueTint="text-emerald-600"
          sub={
            invoicedTodayTotal === 0
              ? 'لا توجد فواتير اليوم'
              : collectedToday >= invoicedTodayTotal
                ? 'تم تحصيل كافة الفواتير'
                : `متبقٍ ${formatMoney(invoicedTodayTotal - collectedToday)}`
          }
          subTint={invoicedTodayTotal > 0 && collectedToday >= invoicedTodayTotal ? 'text-emerald-600' : 'text-amber-500'}
        />
        <StatCard
          icon={Receipt}
          iconTint="bg-slate-100 text-slate-600"
          label="مبيعات اليوم"
          value={formatMoney(salesTodayTotal)}
          valueTint="text-slate-800"
          sub="إجمالي الفواتير"
          subTint="text-slate-400"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowNewAppt(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> موعد جديد
        </button>
        <button
          onClick={() => navigate('/appointments')}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <ListFilter className="h-4 w-4" /> تصفية وعرض الكل
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">جدول مواعيد اليوم</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-medium">العميل</th>
                  <th className="py-2 text-start font-medium">الخدمة</th>
                  <th className="py-2 text-start font-medium">الوقت</th>
                  <th className="py-2 text-start font-medium">الفني/المشرف</th>
                  <th className="py-2 text-start font-medium">السعر</th>
                  <th className="py-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {todayAppts
                  .slice()
                  .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                  .map((a) => {
                    const customer = customers.find((c) => c.id === a.customer_id);
                    const assignee =
                      a.assignments[0]?.technician_name ??
                      allProfiles.find((p) => p.id === a.supervisor_id)?.full_name ??
                      '—';
                    return (
                      <tr key={a.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5">
                          <div className="font-medium text-slate-700">{a.customer_name_snapshot}</div>
                          {customer?.phone && <div className="text-xs text-slate-400">{customer.phone}</div>}
                        </td>
                        <td className="py-2.5 text-slate-600">{a.service_name_snapshot}</td>
                        <td className="py-2.5 text-slate-600">{formatTimeAr(a.scheduled_at)}</td>
                        <td className="py-2.5 text-slate-600">{assignee}</td>
                        <td className="py-2.5 text-slate-600">{formatMoney(a.amount)}</td>
                        <td className="py-2.5">
                          <AppointmentStatusBadge status={a.status} />
                        </td>
                      </tr>
                    );
                  })}
                {todayAppts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      لا توجد مواعيد اليوم
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">توزيع الخدمات</h2>
          <div className="space-y-4">
            {serviceDistribution.map((s, i) => (
              <div key={s.name}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{s.pct}%</span>
                  <span>{s.name}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${BAR_TINTS[i % BAR_TINTS.length]}`} style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
            {serviceDistribution.length === 0 && <div className="text-center text-sm text-slate-400">لا توجد بيانات بعد</div>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-900 p-6 text-white">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-slate-300">إجمالي مبيعات الشهر</div>
            <div className="mt-1 text-3xl font-bold">{formatMoney(salesThisMonth)}</div>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${
              growthAmount >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}
          >
            {growthAmount >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span>النمو مقارنة بالشهر السابق:</span>
            <span>
              {growthAmount >= 0 ? '+' : ''}
              {formatMoney(growthAmount)} ({growthPercent >= 0 ? '+' : ''}
              {growthPercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {showNewAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreateAppointment}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">موعد جديد</h2>
              <button type="button" onClick={() => setShowNewAppt(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">العميل</span>
                <select name="customer_id" required className="input">
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">الخدمة</span>
                <select
                  name="service_id"
                  required
                  className="input"
                  onChange={(e) => {
                    const form = e.currentTarget.form;
                    const svc = services.find((s) => s.id === e.currentTarget.value);
                    if (form && svc) (form.elements.namedItem('amount') as HTMLInputElement).value = String(svc.default_price);
                  }}
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">التاريخ والوقت</span>
                  <input type="datetime-local" name="scheduled_at" required className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المبلغ (ر.س)</span>
                  <input
                    type="number"
                    name="amount"
                    min={0}
                    step="0.01"
                    defaultValue={services[0]?.default_price}
                    required
                    className="input"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المشرف المسؤول</span>
                  <select name="supervisor_id" className="input">
                    <option value="">بدون تحديد</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">الفني المسند (اختياري)</span>
                  <select name="technician_id" className="input">
                    <option value="">بدون تحديد</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : 'حفظ الموعد'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
