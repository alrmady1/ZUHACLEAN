import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Invoice } from '../../shared/types.js';
import { VAT_RATE } from '../../shared/types.js';
import { PaymentStatusBadge } from '../components/Badge.js';
import { formatMoney } from '../lib/date.js';

export default function Sales() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewSubtotal, setPreviewSubtotal] = useState(0);

  function refresh() {
    api.get<Invoice[]>('/invoices').then(setInvoices);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
  }, []);

  const revenue = invoices.reduce((s, i) => s + i.total, 0);
  const vatCollected = invoices.reduce((s, i) => s + i.vat_amount, 0);
  const avgInvoice = invoices.length ? revenue / invoices.length : 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/invoices', {
        customer_id: form.get('customer_id'),
        subtotal: Number(form.get('subtotal')),
        payment_status: form.get('payment_status'),
      });
      setShowForm(false);
      setPreviewSubtotal(0);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const vatPreview = Math.round(previewSubtotal * VAT_RATE * 100) / 100;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">المبيعات والفواتير الضريبية</h1>
          <p className="text-sm text-slate-400">تحتسب ضريبة القيمة المضافة (15٪) تلقائياً</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> فاتورة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="إجمالي الإيرادات" value={formatMoney(revenue)} />
        <MiniStat label="ضريبة القيمة المضافة المحصّلة" value={formatMoney(vatCollected)} />
        <MiniStat label="متوسط قيمة الفاتورة" value={formatMoney(avgInvoice)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">رقم الفاتورة</th>
              <th className="p-3 text-start font-medium">العميل</th>
              <th className="p-3 text-start font-medium">قبل الضريبة</th>
              <th className="p-3 text-start font-medium">الضريبة (15٪)</th>
              <th className="p-3 text-start font-medium">الإجمالي</th>
              <th className="p-3 text-start font-medium">الحالة</th>
              <th className="p-3 text-start font-medium">التاريخ</th>
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
                  <td className="p-3">
                    <PaymentStatusBadge status={i.payment_status} />
                  </td>
                  <td className="p-3 text-slate-500">{i.issue_date}</td>
                </tr>
              ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  لا توجد فواتير بعد
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
              <h2 className="text-lg font-bold text-slate-800">فاتورة جديدة</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
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
                <span className="mb-1 block font-medium text-slate-600">المبلغ قبل الضريبة (ر.س)</span>
                <input
                  type="number"
                  name="subtotal"
                  min={0}
                  step="0.01"
                  required
                  className="input"
                  onChange={(e) => setPreviewSubtotal(Number(e.target.value) || 0)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">حالة السداد</span>
                <select name="payment_status" required className="input">
                  <option value="unpaid">غير مسدد</option>
                  <option value="partial">مسدد جزئياً</option>
                  <option value="paid">مسدد بالكامل</option>
                </select>
              </label>

              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>الضريبة (15٪)</span>
                  <span>{formatMoney(vatPreview)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>الإجمالي</span>
                  <span>{formatMoney(previewSubtotal + vatPreview)}</span>
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : 'إصدار الفاتورة'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
