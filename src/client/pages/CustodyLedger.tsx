import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Plus, X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { CustodyTransaction, CustodyTransactionType } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

export default function CustodyLedger() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { user, allProfiles } = useAuth();
  const [transactions, setTransactions] = useState<CustodyTransaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<CustodyTransactionType>('receipt');
  const [submitting, setSubmitting] = useState(false);

  const employee = allProfiles.find((p) => p.id === employeeId);

  function refresh() {
    if (!employeeId) return;
    api
      .get<CustodyTransaction[]>(`/custody-transactions?employee_id=${encodeURIComponent(employeeId)}`)
      .then(setTransactions);
  }

  useEffect(refresh, [employeeId]);

  const rows = useMemo(() => {
    const sorted = transactions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    let balance = 0;
    return sorted.map((t) => {
      balance += t.type === 'receipt' ? t.amount : -t.amount;
      return { ...t, balance };
    });
  }, [transactions]);

  const totals = useMemo(() => {
    let received = 0,
      spent = 0;
    for (const t of transactions) {
      if (t.type === 'receipt') received += t.amount;
      else spent += t.amount;
    }
    return { received, spent, remaining: received - spent };
  }, [transactions]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!employeeId || !employee) return;
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/custody-transactions', {
        employee_id: employeeId,
        employee_name: employee.full_name,
        type: form.get('type'),
        amount: Number(form.get('amount')),
        date: form.get('date'),
        invoice_number: form.get('invoice_number') || undefined,
        notes: form.get('notes') || undefined,
        recorded_by: user?.id,
        recorded_by_name: user?.full_name,
      });
      setShowForm(false);
      setType('receipt');
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <Link to="/custody" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
          <ChevronRight className="h-4 w-4" /> عودة لعُهد الموظفين
        </Link>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          الموظف غير موجود
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/custody" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <ChevronRight className="h-4 w-4" /> عودة لعُهد الموظفين
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">كشف عُهدة {employee.full_name}</h1>
          <p className="text-sm text-slate-400">جميع المبالغ المستلمة والمصروفة بموجب فواتير</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> حركة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="إجمالي المستلم (مدين)" value={formatMoney(totals.received)} />
        <MiniStat label="إجمالي المصروف (دائن)" value={formatMoney(totals.spent)} />
        <MiniStat
          label="المتبقي من العهدة"
          value={formatMoney(totals.remaining)}
          tint={totals.remaining > 0 ? 'text-amber-600' : totals.remaining < 0 ? 'text-red-600' : 'text-slate-800'}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">التاريخ</th>
              <th className="p-3 text-start font-medium">البيان</th>
              <th className="p-3 text-start font-medium">رقم الفاتورة</th>
              <th className="p-3 text-start font-medium">مدين (مستلم)</th>
              <th className="p-3 text-start font-medium">دائن (مصروف)</th>
              <th className="p-3 text-start font-medium">الرصيد المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 text-slate-600">{t.date}</td>
                <td className="p-3 text-slate-600">
                  {t.type === 'receipt' ? 'استلام عهدة' : 'مصروف بموجب فاتورة'}
                  {t.notes ? ` — ${t.notes}` : ''}
                </td>
                <td className="p-3 text-slate-500">{t.invoice_number ?? '—'}</td>
                <td className="p-3 font-medium text-emerald-700">{t.type === 'receipt' ? formatMoney(t.amount) : '—'}</td>
                <td className="p-3 font-medium text-red-700">{t.type === 'expense' ? formatMoney(t.amount) : '—'}</td>
                <td className="p-3 font-semibold text-slate-700">{formatMoney(t.balance)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  لا توجد حركات مسجلة على هذه العُهدة
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
              <h2 className="text-lg font-bold text-slate-800">حركة عُهدة جديدة — {employee.full_name}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">نوع الحركة</span>
                <select
                  name="type"
                  required
                  className="input"
                  value={type}
                  onChange={(e) => setType(e.target.value as CustodyTransactionType)}
                >
                  <option value="receipt">مبلغ عهدة مستلم (مدين)</option>
                  <option value="expense">مصروف بموجب فاتورة (دائن)</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المبلغ (ر.س)</span>
                  <input type="number" name="amount" min={0} step="0.01" required className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">التاريخ</span>
                  <input
                    type="date"
                    name="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                    className="input"
                  />
                </label>
              </div>
              {type === 'expense' && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">رقم الفاتورة</span>
                  <input name="invoice_number" required className="input" placeholder="مثال: INV-2026-014" />
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">ملاحظات</span>
                <textarea name="notes" rows={2} className="input" />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : 'حفظ الحركة'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`text-xl font-bold ${tint ?? 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
