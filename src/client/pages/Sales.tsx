import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { Plus, X, CheckCircle2, TrendingUp, Sparkles, AlertCircle, Printer } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Invoice, PaymentMethodOption, Appointment } from '../../shared/types.js';
import { VAT_RATE } from '../../shared/types.js';
import { PaymentStatusBadge } from '../components/Badge.js';
import { formatMoney } from '../lib/date.js';
import InvoiceDocument from '../components/InvoiceDocument.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

type ReportPeriod = 'week' | 'month' | 'year';

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  week: 'آخر 7 أيام',
  month: 'آخر 30 يوم',
  year: 'هذا العام',
};

function inReportPeriod(iso: string, period: ReportPeriod): boolean {
  const d = new Date(iso);
  const now = new Date();
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  const days = period === 'week' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff && d <= now;
}

const PIE_TINTS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e'];

function ReportStat({
  icon: Icon,
  iconTint,
  label,
  value,
  sub,
}: {
  icon: typeof TrendingUp;
  iconTint: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`shrink-0 rounded-xl p-2.5 ${iconTint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 text-end flex-1">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-bold text-slate-800">{value}</div>
        <div className="text-[11px] text-slate-400">{sub}</div>
      </div>
    </div>
  );
}

export default function Sales() {
  const { t, tt, lang } = useI18n();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  function refresh() {
    api.get<Invoice[]>('/invoices').then(setInvoices);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Appointment[]>('/appointments').then(setAppointments);
    api.get<PaymentMethodOption[]>('/payment-methods').then(setPaymentMethods);
  }, []);

  const methodName = (id?: string) => (id ? paymentMethods.find((m) => m.id === id)?.name ?? id : '—');

  // --- Financial report section (scoped to the selected period) ---------
  const periodAppts = useMemo(() => appointments.filter((a) => inReportPeriod(a.scheduled_at, period)), [appointments, period]);
  const completedPeriodAppts = useMemo(() => periodAppts.filter((a) => a.status === 'completed'), [periodAppts]);
  const totalSales = completedPeriodAppts.reduce((s, a) => s + a.amount, 0);
  const servicesCompletedCount = completedPeriodAppts.length;
  const remainingUnderCollection = periodAppts.reduce((s, a) => s + a.remaining_amount, 0);

  const collectedActual = useMemo(() => {
    let total = 0;
    for (const a of appointments) for (const p of a.payments) if (inReportPeriod(p.recorded_at, period)) total += p.amount;
    return total;
  }, [appointments, period]);

  const collectionRate = totalSales > 0 ? Math.round((collectedActual / totalSales) * 100) : 0;

  const dailyMovement = useMemo(() => {
    const sorted = periodAppts.slice().sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    const map = new Map<string, number>();
    for (const a of sorted) {
      // كانت مثبَّتة على 'ar-SA' دائماً بغضّ النظر عن اللغة الحالية — نفس
      // العلة المصحَّحة في TechnicianPortal.tsx/Appointments.tsx.
      const chartLocale = lang === 'ar' ? 'ar-SA' : lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-US';
      const key = new Date(a.scheduled_at).toLocaleDateString(chartLocale, { day: 'numeric', month: 'short' });
      map.set(key, (map.get(key) ?? 0) + a.amount);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [periodAppts, lang]);

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) {
      for (const p of a.payments) {
        if (!inReportPeriod(p.recorded_at, period)) continue;
        const name = methodName(p.method);
        map.set(name, (map.get(name) ?? 0) + p.amount);
      }
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [appointments, paymentMethods, period]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    // The field collects the VAT-inclusive amount — back out the pre-tax
    // subtotal before sending, since that's still what /invoices expects
    // (it derives vat_amount/total from subtotal itself).
    const totalAmount = Number(form.get('total_amount'));
    const subtotal = Math.round((totalAmount / (1 + VAT_RATE)) * 100) / 100;
    try {
      await api.post('/invoices', {
        customer_id: form.get('customer_id'),
        subtotal,
        payment_status: form.get('payment_status'),
        payment_method: form.get('payment_method') || undefined,
        recorded_by: user?.id,
        recorded_by_name: user?.full_name,
      });
      setShowForm(false);
      setPreviewTotal(0);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const subtotalPreview = Math.round((previewTotal / (1 + VAT_RATE)) * 100) / 100;
  const vatPreview = Math.round((previewTotal - subtotalPreview) * 100) / 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('المبيعات والتقارير المالية')}</h1>
          <p className="text-sm text-slate-400">{t('تحليل الإيرادات، التحصيلات النقدية والشبكة، وحجم المبيعات حسب نوع الخدمة')}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {(Object.keys(PERIOD_LABELS) as ReportPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${period === p ? 'bg-brand-600 text-white' : 'text-slate-500'}`}
            >
              {t(PERIOD_LABELS[p])}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReportStat
          icon={CheckCircle2}
          iconTint="bg-emerald-100 text-emerald-600"
          label={t('المحصّل الفعلي (SAR)')}
          value={formatMoney(collectedActual)}
          sub={tt(`نسبة التحصيل: ${collectionRate}%`, `Collection Rate: ${collectionRate}%`)}
        />
        <ReportStat
          icon={TrendingUp}
          iconTint="bg-blue-100 text-blue-600"
          label={t('إجمالي المبيعات (SAR)')}
          value={formatMoney(totalSales)}
          sub={t('مجموع قيمة الخدمات المكتملة')}
        />
        <ReportStat
          icon={Sparkles}
          iconTint="bg-violet-100 text-violet-600"
          label={t('الخدمات المنجزة')}
          value={String(servicesCompletedCount)}
          sub={t('عملية صيانة وتنظيف ناجحة')}
        />
        <ReportStat
          icon={AlertCircle}
          iconTint="bg-red-100 text-red-600"
          label={t('المتبقي تحت التحصيل')}
          value={formatMoney(remainingUnderCollection)}
          sub={t('مستحقات معلقة على العملاء')}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('حركة المبيعات اليومية')}</h2>
        <p className="mb-4 text-xs text-slate-400">{t('تطور حجم المبيعات بالريال السعودي على مدار الفترة')}</p>
        {dailyMovement.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyMovement}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            {t('لا توجد بيانات حركة مبيعات للفترة المحددة')}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('طرق الدفع والتحصيل')}</h2>
        <p className="mb-4 text-xs text-slate-400">{t('توزيع المبالغ المحصّلة حسب قناة الدفع')}</p>
        {paymentBreakdown.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentBreakdown} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                  {paymentBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_TINTS[i % PIE_TINTS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">{t('لا توجد دفعات مسجلة')}</div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('سجل الفواتير الضريبية')}</h2>
          <p className="text-sm text-slate-400">{t('تحتسب ضريبة القيمة المضافة (15٪) تلقائياً')}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('فاتورة جديدة')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('رقم الفاتورة')}</th>
              <th className="p-3 text-start font-medium">{t('العميل')}</th>
              <th className="p-3 text-start font-medium">{t('قبل الضريبة')}</th>
              <th className="p-3 text-start font-medium">{t('الضريبة (15٪)')}</th>
              <th className="p-3 text-start font-medium">{t('الإجمالي')}</th>
              <th className="p-3 text-start font-medium">{t('طريقة الدفع')}</th>
              <th className="p-3 text-start font-medium">{t('الحالة')}</th>
              <th className="p-3 text-start font-medium">{t('التاريخ')}</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices
              .slice()
              .reverse()
              .map((i) => (
                <tr key={i.id} className="border-b border-slate-50 last:border-0">
                  <td className="p-3 font-medium text-slate-700">{i.invoice_number}</td>
                  <td className="p-3 text-slate-600">{i.customer_name_snapshot}</td>
                  <td className="p-3 text-slate-600">{formatMoney(i.subtotal)}</td>
                  <td className="p-3 text-slate-600">{formatMoney(i.vat_amount)}</td>
                  <td className="p-3 font-semibold text-slate-700">{formatMoney(i.total)}</td>
                  <td className="p-3 text-slate-600">{methodName(i.payment_method)}</td>
                  <td className="p-3">
                    <PaymentStatusBadge status={i.payment_status} />
                  </td>
                  <td className="p-3 text-slate-500">{i.issue_date}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setViewingInvoice(i)}
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <Printer className="h-3.5 w-3.5" /> {t('عرض / طباعة')}
                    </button>
                  </td>
                </tr>
              ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  {t('لا توجد فواتير بعد')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{t('فاتورة جديدة')}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('العميل')}</span>
                <select name="customer_id" required className="input">
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('المبلغ شامل الضريبة (ر.س)')}</span>
                <input
                  type="number"
                  name="total_amount"
                  min={0}
                  step="0.01"
                  required
                  className="input"
                  onChange={(e) => setPreviewTotal(Number(e.target.value) || 0)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('حالة السداد')}</span>
                  <select name="payment_status" required className="input">
                    <option value="unpaid">{t('غير مسدد')}</option>
                    <option value="partial">{t('مسدد جزئياً')}</option>
                    <option value="paid">{t('مسدد بالكامل')}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('طريقة الدفع')}</span>
                  <select name="payment_method" className="input">
                    <option value="">{t('بدون تحديد')}</option>
                    {paymentMethods
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>{t('المبلغ قبل الضريبة')}</span>
                  <span>{formatMoney(subtotalPreview)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>{t('الضريبة (15٪)')}</span>
                  <span>{formatMoney(vatPreview)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
                  <span>{t('الإجمالي شامل الضريبة')}</span>
                  <span>{formatMoney(previewTotal)}</span>
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : t('إصدار الفاتورة')}
            </button>
          </form>
        </div>
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
    </div>
  );
}
