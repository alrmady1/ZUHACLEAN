import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CalendarClock, FileSignature, Wallet, TrendingUp, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Contract, Expense } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

type Period = 'day' | 'month' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  day: 'اليوم',
  month: 'هذا الشهر',
  year: 'هذه السنة',
};

function inPeriod(iso: string, period: Period): boolean {
  const d = new Date(iso);
  const now = new Date();
  if (period === 'day') return d.toDateString() === now.toDateString();
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  return d.getFullYear() === now.getFullYear();
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [period, setPeriod] = useState<Period>('day');

  useEffect(() => {
    api.get<Appointment[]>('/appointments').then(setAppointments);
    api.get<Contract[]>('/contracts').then(setContracts);
    api.get<Expense[]>('/expenses').then(setExpenses);
  }, []);

  const appointmentsInPeriod = useMemo(
    () => appointments.filter((a) => inPeriod(a.scheduled_at, period)),
    [appointments, period],
  );

  const completedInPeriod = useMemo(
    () => appointmentsInPeriod.filter((a) => a.status === 'completed').length,
    [appointmentsInPeriod],
  );

  const activeContracts = contracts.filter((c) => c.status === 'active').length;

  const expensesInPeriod = useMemo(
    () => expenses.filter((e) => inPeriod(e.date, period)).reduce((s, e) => s + e.amount, 0),
    [expenses, period],
  );

  const revenueInPeriod = useMemo(() => {
    let total = 0;
    for (const a of appointments) {
      for (const p of a.payments) {
        if (inPeriod(p.recorded_at, period)) total += p.amount;
      }
    }
    return total;
  }, [appointments, period]);

  const chartData = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const a of appointments) {
      const key = new Date(a.scheduled_at).toLocaleDateString('ar-SA', { month: 'short' });
      byMonth.set(key, (byMonth.get(key) ?? 0) + a.amount);
    }
    return Array.from(byMonth.entries()).map(([name, value]) => ({ name, value }));
  }, [appointments]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">مرحباً، {user?.full_name} 👋</h1>
          <p className="text-sm text-slate-400">نظرة سريعة على العمليات</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${period === p ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={CalendarClock}
          label={`مواعيد ${PERIOD_LABELS[period]}`}
          value={String(appointmentsInPeriod.length)}
          tint="bg-blue-100 text-blue-700"
        />
        <StatCard
          icon={CheckCircle2}
          label={`طلبات منجزة (${PERIOD_LABELS[period]})`}
          value={String(completedInPeriod)}
          tint="bg-violet-100 text-violet-700"
        />
        <StatCard icon={FileSignature} label="عقود سارية" value={String(activeContracts)} tint="bg-emerald-100 text-emerald-700" />
        <StatCard
          icon={Wallet}
          label={`مصروفات ${PERIOD_LABELS[period]}`}
          value={formatMoney(expensesInPeriod)}
          tint="bg-amber-100 text-amber-700"
        />
        <StatCard
          icon={TrendingUp}
          label={`تحصيل ${PERIOD_LABELS[period]}`}
          value={formatMoney(revenueInPeriod)}
          tint="bg-brand-100 text-brand-700"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">قيمة المواعيد حسب الشهر</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Bar dataKey="value" fill="#0d9488" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
