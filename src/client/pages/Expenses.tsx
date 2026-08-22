import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, ExpenseCategoryItem, PaymentMethodOption, Profile } from '../../shared/types.js';
import { CUSTODY_CATEGORY_NAME, ROLE_LABELS_AR } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

export default function Expenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>([]);
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mainCategories = categories.filter((c) => !c.parent_id && c.is_active);
  const subCategories = categories.filter((c) => c.parent_id === mainCategories.find((m) => m.name === category)?.id);

  function refresh() {
    api.get<Expense[]>('/expenses').then(setExpenses);
  }

  useEffect(() => {
    refresh();
    api.get<PaymentMethodOption[]>('/payment-methods').then(setPaymentMethods);
    api.get<Profile[]>('/profiles').then(setProfiles);
    api.get<ExpenseCategoryItem[]>('/expense-categories').then((list) => {
      setCategories(list);
      const firstMain = list.find((c) => !c.parent_id && c.is_active);
      if (firstMain) setCategory(firstMain.name);
    });
  }, []);

  const methodName = (id: string) => paymentMethods.find((m) => m.id === id)?.name ?? id;

  const totals = useMemo(() => {
    const today = new Date().toDateString();
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    let daily = 0,
      monthly = 0,
      annual = 0;
    for (const e of expenses) {
      const d = new Date(e.date);
      if (d.toDateString() === today) daily += e.amount;
      if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) monthly += e.amount;
      if (d.getFullYear() === thisYear) annual += e.amount;
    }
    return { daily, monthly, annual };
  }, [expenses]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/expenses', {
        title: form.get('title'),
        category,
        sub_category: subCategory || undefined,
        amount: Number(form.get('amount')),
        date: form.get('date'),
        invoice_number: form.get('invoice_number') || undefined,
        payment_method: form.get('payment_method'),
        custody_holder_id: form.get('custody_holder_id') || undefined,
        recorded_by: user?.id,
        recorded_by_name: user?.full_name,
        notes: form.get('notes') || undefined,
      });
      setShowForm(false);
      setSubCategory('');
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">المصروفات والعُهد</h1>
          <p className="text-sm text-slate-400">تتبع المصروفات التشغيلية اليومية والشهرية</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> مصروف جديد
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="اليوم" value={formatMoney(totals.daily)} />
        <MiniStat label="هذا الشهر" value={formatMoney(totals.monthly)} />
        <MiniStat label="هذه السنة" value={formatMoney(totals.annual)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">التاريخ</th>
              <th className="p-3 text-start font-medium">البند</th>
              <th className="p-3 text-start font-medium">التصنيف</th>
              <th className="p-3 text-start font-medium">المبلغ</th>
              <th className="p-3 text-start font-medium">طريقة الدفع</th>
              <th className="p-3 text-start font-medium">العُهدة لـ</th>
              <th className="p-3 text-start font-medium">سجّله</th>
            </tr>
          </thead>
          <tbody>
            {expenses
              .slice()
              .reverse()
              .map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0">
                  <td className="p-3 text-slate-600">{e.date}</td>
                  <td className="p-3 font-medium text-slate-700">{e.title}</td>
                  <td className="p-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {e.category}
                      {e.sub_category ? ` — ${e.sub_category}` : ''}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600">{formatMoney(e.amount)}</td>
                  <td className="p-3 text-slate-600">{methodName(e.payment_method)}</td>
                  <td className="p-3 text-slate-600">{e.custody_holder_name ?? '—'}</td>
                  <td className="p-3 text-slate-600">{e.recorded_by_name ?? '—'}</td>
                </tr>
              ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  لا توجد مصروفات مسجلة
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
              <h2 className="text-lg font-bold text-slate-800">مصروف جديد</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">البند</span>
                <input name="title" required className="input" placeholder="مثال: تعبئة وقود سيارة رقم 3" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">التصنيف</span>
                <select
                  name="category"
                  required
                  className="input"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSubCategory('');
                  }}
                >
                  {mainCategories.length === 0 && <option value="">لا توجد تصنيفات بعد</option>}
                  {mainCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {subCategories.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">البند الفرعي (اختياري)</span>
                  <select name="sub_category" className="input" value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
                    <option value="">بدون تحديد</option>
                    {subCategories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {category === CUSTODY_CATEGORY_NAME && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">الموظف المستلم للعُهدة</span>
                  <select name="custody_holder_id" required className="input">
                    <option value="">اختر موظف</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} — {ROLE_LABELS_AR[p.role]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المبلغ (ر.س)</span>
                  <input type="number" name="amount" min={0} step="0.01" required className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">التاريخ</span>
                  <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">طريقة الدفع</span>
                <select name="payment_method" required className="input">
                  {paymentMethods
                    .filter((m) => m.is_active)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">رقم الفاتورة (اختياري)</span>
                <input name="invoice_number" className="input" />
              </label>
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
              {submitting ? 'جارِ الحفظ…' : 'حفظ المصروف'}
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
