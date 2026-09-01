import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, X, Wallet as GeneralIcon, PiggyBank as CustodyIcon, LayoutGrid as OverviewIcon, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, ExpenseCategoryItem, PaymentMethodOption, CustodyInvoice } from '../../shared/types.js';
import { CUSTODY_CATEGORY_NAME, ADVANCE_CATEGORY_NAME, CAN_SEE_CUSTODY_ROLES } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { CustodyTab } from './Custody.js';

export default function Expenses() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const canSeeCustody = user ? CAN_SEE_CUSTODY_ROLES.includes(user.role) : false;
  const [tab, setTab] = useState<'overview' | 'custody' | 'general'>(canSeeCustody ? 'overview' : 'general');

  // مخفية عن المشرف الميداني — حتى لو دخل الرابط مباشرة بدون المرور بالقائمة
  // الجانبية (التي أصلاً لا تعرض هذا الرابط له).
  if (user && !can('view_expenses_page')) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{canSeeCustody ? t('المصروفات والعُهد') : t('المصروفات')}</h1>
        <p className="text-sm text-slate-400">
          {canSeeCustody ? t('قسم العهد الخاصة بكل موظف، وقسم المصروفات العامة للتشغيل') : t('تتبع المصروفات التشغيلية اليومية والشهرية')}
        </p>
      </div>

      {canSeeCustody && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          <button
            onClick={() => setTab('overview')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'overview' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <OverviewIcon className="h-4 w-4" /> {t('نظرة عامة')}
          </button>
          <button
            onClick={() => setTab('custody')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'custody' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <CustodyIcon className="h-4 w-4" /> {t('العهد (عرض موسّع)')}
          </button>
          <button
            onClick={() => setTab('general')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'general' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <GeneralIcon className="h-4 w-4" /> {t('المصروفات (عرض موسّع)')}
          </button>
        </div>
      )}

      {tab === 'overview' && canSeeCustody ? (
        <ExpensesOverview onOpenCustody={() => setTab('custody')} onOpenGeneral={() => setTab('general')} />
      ) : tab === 'custody' && canSeeCustody ? (
        <CustodyTab />
      ) : (
        <GeneralExpensesTab />
      )}
    </div>
  );
}

function ExpensesOverview({ onOpenCustody, onOpenGeneral }: { onOpenCustody: () => void; onOpenGeneral: () => void }) {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invoices, setInvoices] = useState<CustodyInvoice[]>([]);

  useEffect(() => {
    api.get<Expense[]>('/expenses').then(setExpenses);
    api.get<CustodyInvoice[]>('/custody-invoices').then(setInvoices);
  }, []);

  const custody = useMemo(() => {
    const holderIds = new Set<string>();
    let given = 0;
    for (const e of expenses) {
      if (e.category === CUSTODY_CATEGORY_NAME && e.custody_holder_id) {
        holderIds.add(e.custody_holder_id);
        given += e.amount;
      }
    }
    const spent = invoices.reduce((sum, i) => sum + i.amount, 0);
    return { holders: holderIds.size, given, spent, remaining: given - spent };
  }, [expenses, invoices]);

  const generalTotals = useMemo(() => {
    const today = new Date().toDateString();
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    let daily = 0,
      monthly = 0,
      annual = 0;
    for (const e of expenses) {
      if (e.category === CUSTODY_CATEGORY_NAME) continue; // custody has its own summary card
      const d = new Date(e.date);
      if (d.toDateString() === today) daily += e.amount;
      if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) monthly += e.amount;
      if (d.getFullYear() === thisYear) annual += e.amount;
    }
    return { daily, monthly, annual };
  }, [expenses]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <button
        onClick={onOpenCustody}
        className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition hover:border-brand-300 hover:shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CustodyIcon className="h-4 w-4 text-brand-600" /> {t('ملخص العهد')}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
            {t('عرض موسّع')} <ChevronLeft className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <OverviewStat label={t('عدد الموظفين')} value={String(custody.holders)} />
          <OverviewStat label={t('مدين')} value={formatMoney(custody.given)} />
          <OverviewStat label={t('دائن')} value={formatMoney(custody.spent)} />
          <OverviewStat
            label={t('الرصيد المتبقي')}
            value={formatMoney(custody.remaining)}
            tone={custody.remaining >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </button>

      <button
        onClick={onOpenGeneral}
        className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition hover:border-brand-300 hover:shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <GeneralIcon className="h-4 w-4 text-brand-600" /> {t('ملخص المصروفات العامة')}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
            {t('عرض موسّع')} <ChevronLeft className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <OverviewStat label={t('اليوم')} value={formatMoney(generalTotals.daily)} />
          <OverviewStat label={t('هذا الشهر')} value={formatMoney(generalTotals.monthly)} />
          <OverviewStat label={t('هذه السنة')} value={formatMoney(generalTotals.annual)} />
        </div>
      </button>
    </div>
  );
}

function OverviewStat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  const toneClass = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-600' : 'text-slate-800';
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <div className="mb-0.5 text-[11px] text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function GeneralExpensesTab() {
  const { user, can, allProfiles } = useAuth();
  const { t, roleLabel } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>([]);
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [advanceEmployeeId, setAdvanceEmployeeId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isAdvance = category === ADVANCE_CATEGORY_NAME;

  // Custody grants are recorded and listed from the العهد tab now, not
  // here — keep the general form and table focused on non-custody spending.
  const generalExpenses = expenses.filter((e) => e.category !== CUSTODY_CATEGORY_NAME);
  const mainCategories = categories.filter((c) => !c.parent_id && c.is_active && c.name !== CUSTODY_CATEGORY_NAME);
  const subCategories = categories.filter((c) => c.parent_id === mainCategories.find((m) => m.name === category)?.id);

  function refresh() {
    api.get<Expense[]>('/expenses').then(setExpenses);
  }

  useEffect(() => {
    refresh();
    api.get<PaymentMethodOption[]>('/payment-methods').then(setPaymentMethods);
    api.get<ExpenseCategoryItem[]>('/expense-categories').then((list) => {
      setCategories(list);
      const firstMain = list.find((c) => !c.parent_id && c.is_active && c.name !== CUSTODY_CATEGORY_NAME);
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
    for (const e of generalExpenses) {
      const d = new Date(e.date);
      if (d.toDateString() === today) daily += e.amount;
      if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) monthly += e.amount;
      if (d.getFullYear() === thisYear) annual += e.amount;
    }
    return { daily, monthly, annual };
  }, [generalExpenses]);

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
        recorded_by: user?.id,
        recorded_by_name: user?.full_name,
        notes: form.get('notes') || undefined,
        custody_holder_id: isAdvance ? advanceEmployeeId || undefined : undefined,
      });
      setShowForm(false);
      setSubCategory('');
      setAdvanceEmployeeId('');
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('المصروفات العامة')}</h2>
          <p className="text-sm text-slate-400">
            {t('رواتب، مصاريف سيارات، مواد تشغيل ونظافة، إقامات، إيجار، كهرباء وغاز، ومشتريات متفرقة')}
          </p>
        </div>
        {can('edit_custody_expenses') && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('مصروف جديد')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label={t('اليوم')} value={formatMoney(totals.daily)} />
        <MiniStat label={t('هذا الشهر')} value={formatMoney(totals.monthly)} />
        <MiniStat label={t('هذه السنة')} value={formatMoney(totals.annual)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('التاريخ')}</th>
              <th className="p-3 text-start font-medium">{t('البند')}</th>
              <th className="p-3 text-start font-medium">{t('التصنيف')}</th>
              <th className="p-3 text-start font-medium">{t('المبلغ')}</th>
              <th className="p-3 text-start font-medium">{t('طريقة الدفع')}</th>
              <th className="p-3 text-start font-medium">{t('سجّله')}</th>
            </tr>
          </thead>
          <tbody>
            {generalExpenses
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
                    {e.custody_holder_name && <div className="mt-1 text-xs text-slate-400">{e.custody_holder_name}</div>}
                  </td>
                  <td className="p-3 text-slate-600">{formatMoney(e.amount)}</td>
                  <td className="p-3 text-slate-600">{methodName(e.payment_method)}</td>
                  <td className="p-3 text-slate-600">{e.recorded_by_name ?? '—'}</td>
                </tr>
              ))}
            {generalExpenses.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  {t('لا توجد مصروفات مسجلة')}
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
              <h2 className="text-lg font-bold text-slate-800">{t('مصروف جديد')}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('البند')}</span>
                <input name="title" required className="input" placeholder={t('مثال: تعبئة وقود سيارة رقم 3')} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('التصنيف')}</span>
                <select
                  name="category"
                  required
                  className="input"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSubCategory('');
                    setAdvanceEmployeeId('');
                  }}
                >
                  {mainCategories.length === 0 && <option value="">{t('لا توجد تصنيفات بعد')}</option>}
                  {mainCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {subCategories.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('البند الفرعي (اختياري)')}</span>
                  <select name="sub_category" className="input" value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
                    <option value="">{t('بدون تحديد')}</option>
                    {subCategories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {isAdvance && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الموظف')}</span>
                  <select
                    required
                    className="input"
                    value={advanceEmployeeId}
                    onChange={(e) => setAdvanceEmployeeId(e.target.value)}
                  >
                    <option value="">{t('اختر موظف')}</option>
                    {allProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} — {roleLabel(p.role)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('المبلغ (ر.س)')}</span>
                  <input type="number" name="amount" min={0} step="0.01" required className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('التاريخ')}</span>
                  <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('طريقة الدفع')}</span>
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
                <span className="mb-1 block font-medium text-slate-600">{t('رقم الفاتورة (اختياري)')}</span>
                <input name="invoice_number" className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('ملاحظات')}</span>
                <textarea name="notes" rows={2} className="input" />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : t('حفظ المصروف')}
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
