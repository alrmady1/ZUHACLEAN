import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CalendarClock, FileSignature, Wallet, TrendingUp, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Contract, Expense } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

type StatPeriod = 'day' | 'month' | 'year';

const PERIOD_LABELS: Record<StatPeriod, string> = { day: 'اليوم', month: 'الشهر', year: 'السنة' };

function isInPeriod(iso: string, period: StatPeriod, now: Date): boolean {
  const d = new Date(iso);
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
  const [completedPeriod, setCompletedPeriod] = useState<StatPeriod>('day');

  useEffect(() => {
    api.get<Appointment[]>('/appointments').then(setAppointments);
    api.get<Contract[]>('/contracts').then(setContracts);
    api.get<Expense[]>('/expenses').then(setExpenses);
  }, []);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return appointments.filter((a) => new Date(a.scheduled_at).toDateString() === today).length;
  }, [appointments]);

  const activeContracts = contracts.filter((c) => c.status === 'active').length;
  const monthlyExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const monthlyRevenue = appointments.reduce((s, a) => s + a.total_paid, 0);

  const completedCount = useMemo(() => {
    const now = new Date();
    return appointments.filter((a) => a.status === 'completed' && isInPeriod(a.scheduled_at, completedPeriod, now))
      .length;
  }, [appointments, completedPeriod]);

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
      <div>
        <h1 className="text-xl font-bold text-slate-800">مرحباً، {user?.full_name} 👋</h1>
        <p className="text-sm text-slate-400">نظرة سريعة على العمليات اليوم</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={CalendarClock} label="مواعيد اليوم" value={String(todayCount)} tint="bg-blue-100 text-blue-700" />
        <StatCard icon={FileSignature} label="عقود سارية" value={String(activeContracts)} tint="bg-emerald-100 text-emerald-700" />
        <StatCard icon={Wallet} label="إجمالي المصروفات" value={formatMoney(monthlyExpenses)} tint="bg-amber-100 text-amber-700" />
        <StatCard icon={TrendingUp} label="التحصيل المسجل" value={formatMoney(monthlyRevenue)} tint="bg-brand-100 text-brand-700" />

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 inline-flex rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{completedCount}</div>
          <div className="mb-3 text-sm text-slate-400">الطلبات المنجزة</div>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {(Object.keys(PERIOD_LABELS) as StatPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setCompletedPeriod(p)}
                className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium ${
                  completedPeriod === p ? 'bg-brand-50 text-brand-700' : 'text-slate-400'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
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
