import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  ListFilter,
  Clock,
  CheckCircle2,
  CalendarClock,
  Banknote,
  Receipt,
  TrendingUp,
  TrendingDown,
  Bell,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Service, Invoice } from '../../shared/types.js';
import { AppointmentStatusBadge } from '../components/Badge.js';
import NewAppointmentModal from '../components/NewAppointmentModal.js';
import { formatMoney, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { playBellSound } from '../lib/sound.js';

// كل هذه المدة (بالمللي ثانية) نفحص وجود مواعيد جديدة لم يرها أحد بعد —
// أبسط طريقة لتنبيه الجميع بموعد جديد بدون بنية اتصال لحظي (WebSocket) لا
// يحتاجها حجم الاستخدام الحالي.
const NEW_APPOINTMENT_POLL_MS = 20000;

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
  const { t, tt } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [newApptAlert, setNewApptAlert] = useState<Appointment | null>(null);
  // null = لم نحمّل القائمة بعد؛ أول تحميل يسجّل المعرّفات الحالية بصمت
  // (بدون تنبيه)، وأي معرّف يظهر بعدها يُعتبر موعداً جديداً فعلاً.
  const knownApptIds = useRef<Set<string> | null>(null);

  function refreshAppointments() {
    api.get<Appointment[]>('/appointments').then((list) => {
      if (knownApptIds.current) {
        const fresh = list.filter((a) => !knownApptIds.current!.has(a.id));
        if (fresh.length > 0) {
          setNewApptAlert(fresh[fresh.length - 1]);
          playBellSound();
        }
      }
      knownApptIds.current = new Set(list.map((a) => a.id));
      setAppointments(list);
    });
  }

  useEffect(() => {
    refreshAppointments();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
    api.get<Invoice[]>('/invoices').then(setInvoices);
    const interval = setInterval(refreshAppointments, NEW_APPOINTMENT_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!newApptAlert) return;
    const timer = setTimeout(() => setNewApptAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [newApptAlert]);

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

  return (
    <div className="space-y-6">
      {newApptAlert && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
          <div className="toast-slide-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600">
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t('موعد جديد!')}</div>
              <div className="truncate text-xs text-slate-300">
                {newApptAlert.customer_name_snapshot} — {newApptAlert.service_name_snapshot}
              </div>
            </div>
            <button
              onClick={() => setNewApptAlert(null)}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Clock}
          iconTint="bg-amber-100 text-amber-600"
          label={t('قيد التنفيذ')}
          value={String(inProgressToday.length)}
          valueTint="text-amber-500"
          sub={tt(`${activeTeams} فرق تعمل حالياً`, `${activeTeams} Teams currently working`)}
          subTint="text-amber-500"
        />
        <StatCard
          icon={CheckCircle2}
          iconTint="bg-emerald-100 text-emerald-600"
          label={t('مكتملة اليوم')}
          value={String(completedToday.length)}
          valueTint="text-emerald-600"
          sub={tt(`${completionRate}% نسبة الإنجاز`, `${completionRate}% Completion rate`)}
          subTint="text-emerald-600"
        />
        <StatCard
          icon={CalendarClock}
          iconTint="bg-slate-100 text-slate-600"
          label={t('مواعيد اليوم')}
          value={String(todayAppts.length)}
          valueTint="text-slate-800"
          sub={tt(`${apptDelta >= 0 ? '+' : ''}${apptDelta} عن أمس`, `${apptDelta >= 0 ? '+' : ''}${apptDelta} vs. yesterday`)}
          subTint="text-slate-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={Banknote}
          iconTint="bg-emerald-100 text-emerald-600"
          label={t('المحصّل الفعلي')}
          value={formatMoney(collectedToday)}
          valueTint="text-emerald-600"
          sub={
            invoicedTodayTotal === 0
              ? t('لا توجد فواتير اليوم')
              : collectedToday >= invoicedTodayTotal
                ? t('تم تحصيل كافة الفواتير')
                : tt(
                    `متبقٍ ${formatMoney(invoicedTodayTotal - collectedToday)}`,
                    `Remaining ${formatMoney(invoicedTodayTotal - collectedToday)}`,
                  )
          }
          subTint={invoicedTodayTotal > 0 && collectedToday >= invoicedTodayTotal ? 'text-emerald-600' : 'text-amber-500'}
        />
        <StatCard
          icon={Receipt}
          iconTint="bg-slate-100 text-slate-600"
          label={t('مبيعات اليوم')}
          value={formatMoney(salesTodayTotal)}
          valueTint="text-slate-800"
          sub={t('إجمالي الفواتير')}
          subTint="text-slate-400"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowNewAppt(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('موعد جديد')}
        </button>
        <button
          onClick={() => navigate('/appointments')}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <ListFilter className="h-4 w-4" /> {t('تصفية وعرض الكل')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">{t('جدول مواعيد اليوم')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-start font-medium">{t('العميل')}</th>
                  <th className="py-2 text-start font-medium">{t('الخدمة')}</th>
                  <th className="py-2 text-start font-medium">{t('الوقت')}</th>
                  <th className="py-2 text-start font-medium">{t('الفني/المشرف')}</th>
                  <th className="py-2 text-start font-medium">{t('السعر')}</th>
                  <th className="py-2 text-start font-medium">{t('الحالة')}</th>
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
                      {t('لا توجد مواعيد اليوم')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">{t('توزيع الخدمات')}</h2>
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
            {serviceDistribution.length === 0 && <div className="text-center text-sm text-slate-400">{t('لا توجد بيانات بعد')}</div>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-900 p-6 text-white">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-slate-300">{t('إجمالي مبيعات الشهر')}</div>
            <div className="mt-1 text-3xl font-bold">{formatMoney(salesThisMonth)}</div>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${
              growthAmount >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}
          >
            {growthAmount >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span>{t('النمو مقارنة بالشهر السابق:')}</span>
            <span>
              {growthAmount >= 0 ? '+' : ''}
              {formatMoney(growthAmount)} ({growthPercent >= 0 ? '+' : ''}
              {growthPercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {showNewAppt && (
        <NewAppointmentModal
          customers={customers}
          services={services}
          supervisors={supervisors}
          technicians={technicians}
          onClose={() => setShowNewAppt(false)}
          onCreated={refreshAppointments}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
        />
      )}
    </div>
  );
}
