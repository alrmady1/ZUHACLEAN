import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { X, Plus, Trash2, Wallet, PiggyBank, HandCoins, Receipt, MinusCircle, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, CustodyInvoice, Invoice, EmployeeDeduction, EmployeeViolation, Profile } from '../../shared/types.js';
import { CUSTODY_CATEGORY_NAME, ADVANCE_CATEGORY_NAME, SALARY_CATEGORY_NAME, CAN_DELETE_CUSTODY_ROLES } from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { PaymentStatusBadge } from '../components/Badge.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

interface EmployeeSummary {
  profile: Profile;
  salaryTotal: number;
  salaryEntries: Expense[];
  advanceTotal: number;
  advanceEntries: Expense[];
  custodyGiven: number;
  custodySpent: number;
  custodyRemaining: number;
  invoicesTotal: number;
  invoicesList: Invoice[];
  deductionsTotal: number;
  deductions: EmployeeDeduction[];
  violationsTotal: number;
  violations: EmployeeViolation[];
}

// تبويب "كشف حساب الموظفين" داخل صفحة المحاسبة — يجمع لكل موظف: رواتبه
// وسلفياته (Expense بفئة SALARY_CATEGORY_NAME/ADVANCE_CATEGORY_NAME)،
// رصيد عهدته (نفس منطق CustodyTab في Custody.tsx)، الفواتير التي
// أصدرها/حصَّلها هو (Invoice.recorded_by)، وخصمياته ومخالفاته (كيانان
// جديدان مستقلان — انظر شرحهما في shared/types.ts). لا يعدّل أياً من
// مصادر البيانات هذه إلا الخصميات والمخالفات أنفسهما؛ الرواتب والسلفيات
// والعهدة والفواتير تُعرَض هنا للقراءة فقط وتُدار من أماكنها المعتادة
// (نموذج مصروف عام، تبويب العهد، وتحصيل المواعيد/المبيعات على الترتيب).
// السلفية بلا رصيد أو تسوية منفصلة (كالعهدة) — مجرد سجل مبالغ صُرفت
// (انظر تعليق ADVANCE_CATEGORY_NAME في shared/types.ts).
export function EmployeeAccountsTab() {
  const { user, allProfiles, can } = useAuth();
  const { t } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [custodyInvoices, setCustodyInvoices] = useState<CustodyInvoice[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deductions, setDeductions] = useState<EmployeeDeduction[]>([]);
  const [violations, setViolations] = useState<EmployeeViolation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  function refresh() {
    api.get<Expense[]>('/expenses').then(setExpenses);
    api.get<CustodyInvoice[]>('/custody-invoices').then(setCustodyInvoices);
    api.get<Invoice[]>('/invoices').then(setInvoices);
    api.get<EmployeeDeduction[]>('/employee-deductions').then(setDeductions);
    api.get<EmployeeViolation[]>('/employee-violations').then(setViolations);
  }

  useEffect(refresh, []);

  const summaries = useMemo<EmployeeSummary[]>(() => {
    return allProfiles
      .map((p) => {
        // الأحدث أولاً — نفس ترتيب كل عرض آخر لمصروفات في هذا التطبيق
        // (جدول المصروفات العامة، الجدول الزمني للعهد في Custody.tsx).
        const byDateDesc = (a: Expense, b: Expense) => new Date(b.date).getTime() - new Date(a.date).getTime();
        const salaryEntries = expenses
          .filter((e) => e.category === SALARY_CATEGORY_NAME && e.custody_holder_id === p.id)
          .sort(byDateDesc);
        const advanceEntries = expenses
          .filter((e) => e.category === ADVANCE_CATEGORY_NAME && e.custody_holder_id === p.id)
          .sort(byDateDesc);
        const custodyGiven = expenses
          .filter((e) => e.category === CUSTODY_CATEGORY_NAME && e.custody_holder_id === p.id)
          .reduce((sum, e) => sum + e.amount, 0);
        const custodySpent = custodyInvoices.filter((i) => i.custody_holder_id === p.id).reduce((sum, i) => sum + i.amount, 0);
        const invoicesList = invoices.filter((i) => i.recorded_by === p.id);
        const empDeductions = deductions.filter((d) => d.employee_id === p.id);
        const empViolations = violations.filter((v) => v.employee_id === p.id);
        return {
          profile: p,
          salaryEntries,
          salaryTotal: salaryEntries.reduce((sum, e) => sum + e.amount, 0),
          advanceEntries,
          advanceTotal: advanceEntries.reduce((sum, e) => sum + e.amount, 0),
          custodyGiven,
          custodySpent,
          custodyRemaining: custodyGiven - custodySpent,
          invoicesList,
          invoicesTotal: invoicesList.reduce((sum, i) => sum + i.total, 0),
          deductions: empDeductions,
          deductionsTotal: empDeductions.reduce((sum, d) => sum + d.amount, 0),
          violations: empViolations,
          violationsTotal: empViolations.reduce((sum, v) => sum + (v.amount ?? 0), 0),
        };
      })
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name, 'ar'));
  }, [allProfiles, expenses, custodyInvoices, invoices, deductions, violations]);

  const openSummary = summaries.find((s) => s.profile.id === openId) ?? null;
  const canEdit = can('edit_custody_expenses');
  const canDelete = user ? CAN_DELETE_CUSTODY_ROLES.includes(user.role) : false;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{t('كشف حساب الموظفين')}</h2>
        <p className="text-sm text-slate-400">
          {t('الراتب والسلفيات والعهدة والفواتير المحصَّلة والخصميات والمخالفات لكل موظف — اضغط على أي موظف للاطلاع على التفاصيل')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => {
          const deductedTotal = s.deductionsTotal + s.violationsTotal;
          return (
            <button
              key={s.profile.id}
              onClick={() => setOpenId(s.profile.id)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-start transition hover:border-brand-300 hover:shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {s.profile.full_name.trim().charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{s.profile.full_name}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                  <div className="text-[11px] text-slate-400">{t('الرواتب')}</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(s.salaryTotal)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                  <div className="text-[11px] text-slate-400">{t('السلفيات')}</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(s.advanceTotal)}</div>
                </div>
                <div className={`rounded-xl px-2 py-2 ${s.custodyRemaining >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="text-[11px] text-slate-400">{t('رصيد العهدة')}</div>
                  <div className={`text-sm font-semibold ${s.custodyRemaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatMoney(s.custodyRemaining)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                  <div className="text-[11px] text-slate-400">{t('فواتير محصَّلة')}</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(s.invoicesTotal)}</div>
                </div>
                <div className={`col-span-2 rounded-xl px-2 py-2 ${deductedTotal > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <div className="text-[11px] text-slate-400">{t('خصميات ومخالفات')}</div>
                  <div className={`text-sm font-semibold ${deductedTotal > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {formatMoney(deductedTotal)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {summaries.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            {t('لا يوجد موظفون بعد')}
          </div>
        )}
      </div>

      {openSummary && (
        <EmployeeDetail
          summary={openSummary}
          canEdit={canEdit}
          canDelete={canDelete}
          recordedById={user?.id}
          recordedByName={user?.full_name}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function EmployeeDetail({
  summary,
  canEdit,
  canDelete,
  recordedById,
  recordedByName,
  onClose,
  onChanged,
}: {
  summary: EmployeeSummary;
  canEdit: boolean;
  canDelete: boolean;
  recordedById?: string;
  recordedByName?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, tt } = useI18n();
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [showViolationForm, setShowViolationForm] = useState(false);

  async function handleDeleteDeduction(id: string) {
    if (!window.confirm(t('حذف هذا الخصم؟'))) return;
    await api.del(`/employee-deductions/${id}`);
    onChanged();
  }

  async function handleDeleteViolation(id: string) {
    if (!window.confirm(t('حذف هذه المخالفة؟'))) return;
    await api.del(`/employee-violations/${id}`);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {summary.profile.full_name.trim().charAt(0)}
            </div>
            <h2 className="text-lg font-bold text-slate-800">{summary.profile.full_name}</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* الرواتب */}
        <Section icon={<Wallet className="h-4 w-4 text-brand-600" />} title={t('الرواتب')} total={formatMoney(summary.salaryTotal)}>
          <SimpleTable
            emptyLabel={t('لا توجد رواتب مسجَّلة لهذا الموظف')}
            headers={[t('التاريخ'), t('البيان'), t('المبلغ')]}
            rows={summary.salaryEntries.map((e) => [formatDateAr(e.date), e.title, formatMoney(e.amount)])}
          />
        </Section>

        {/* السلفيات */}
        <Section icon={<HandCoins className="h-4 w-4 text-brand-600" />} title={t('السلفيات')} total={formatMoney(summary.advanceTotal)}>
          <SimpleTable
            emptyLabel={t('لا توجد سلفيات مسجَّلة لهذا الموظف')}
            headers={[t('التاريخ'), t('البيان'), t('المبلغ')]}
            rows={summary.advanceEntries.map((e) => [formatDateAr(e.date), e.title, formatMoney(e.amount)])}
          />
        </Section>

        {/* العهدة */}
        <Section icon={<PiggyBank className="h-4 w-4 text-brand-600" />} title={t('العهدة')}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-400">{t('مدين')}</div>
              <div className="text-sm font-semibold text-slate-700">{formatMoney(summary.custodyGiven)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-400">{t('دائن')}</div>
              <div className="text-sm font-semibold text-slate-700">{formatMoney(summary.custodySpent)}</div>
            </div>
            <div className={`rounded-xl p-2.5 ${summary.custodyRemaining >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="text-[11px] text-slate-400">{t('المتبقي')}</div>
              <div className={`text-sm font-semibold ${summary.custodyRemaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatMoney(summary.custodyRemaining)}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {tt('تفاصيل الحركات وإضافة عهدة أو فاتورة جديدة من تبويب "العهد"', 'Full movements, and adding new custody or invoices, from the "Custody" tab')}
          </p>
        </Section>

        {/* الفواتير المدفوعة عن طريقه */}
        <Section
          icon={<Receipt className="h-4 w-4 text-brand-600" />}
          title={t('الفواتير المدفوعة عن طريقه')}
          total={formatMoney(summary.invoicesTotal)}
        >
          <SimpleTable
            emptyLabel={t('لا توجد فواتير مسجَّلة عن طريق هذا الموظف')}
            headers={[t('رقم الفاتورة'), t('التاريخ'), t('العميل'), t('المبلغ'), t('الحالة')]}
            rows={summary.invoicesList.map((i) => [
              i.invoice_number,
              formatDateAr(i.issue_date),
              i.customer_name_snapshot,
              formatMoney(i.total),
              <PaymentStatusBadge key={i.id} status={i.payment_status} />,
            ])}
          />
        </Section>

        {/* الخصميات */}
        <Section
          icon={<MinusCircle className="h-4 w-4 text-red-500" />}
          title={t('الخصميات')}
          total={formatMoney(summary.deductionsTotal)}
          action={
            canEdit && (
              <button
                onClick={() => setShowDeductionForm(true)}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" /> {t('خصم جديد')}
              </button>
            )
          }
        >
          <SimpleTable
            emptyLabel={t('لا توجد خصميات مسجَّلة')}
            headers={[t('التاريخ'), t('البيان'), t('المبلغ'), '']}
            rows={summary.deductions.map((d) => [
              formatDateAr(d.date),
              d.title,
              formatMoney(d.amount),
              canDelete ? (
                <button key={d.id} onClick={() => handleDeleteDeduction(d.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                ''
              ),
            ])}
          />
        </Section>

        {/* المخالفات */}
        <Section
          icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
          title={t('المخالفات')}
          total={formatMoney(summary.violationsTotal)}
          action={
            canEdit && (
              <button
                onClick={() => setShowViolationForm(true)}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" /> {t('مخالفة جديدة')}
              </button>
            )
          }
          last
        >
          <SimpleTable
            emptyLabel={t('لا توجد مخالفات مسجَّلة')}
            headers={[t('التاريخ'), t('البيان'), t('الغرامة'), '']}
            rows={summary.violations.map((v) => [
              formatDateAr(v.date),
              v.title,
              v.amount ? formatMoney(v.amount) : t('بلا غرامة'),
              canDelete ? (
                <button key={v.id} onClick={() => handleDeleteViolation(v.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                ''
              ),
            ])}
          />
        </Section>
      </div>

      {showDeductionForm && (
        <EntryForm
          zIndexTop
          title={t('خصم جديد')}
          amountRequired
          amountLabel={t('مبلغ الخصم (ر.س)')}
          onClose={() => setShowDeductionForm(false)}
          onSubmit={async (values) => {
            await api.post('/employee-deductions', {
              employee_id: summary.profile.id,
              title: values.title,
              amount: Number(values.amount),
              date: values.date,
              notes: values.notes || undefined,
              recorded_by: recordedById,
              recorded_by_name: recordedByName,
            });
            setShowDeductionForm(false);
            onChanged();
          }}
        />
      )}

      {showViolationForm && (
        <EntryForm
          zIndexTop
          title={t('مخالفة جديدة')}
          amountRequired={false}
          amountLabel={t('الغرامة (ر.س، اختياري)')}
          onClose={() => setShowViolationForm(false)}
          onSubmit={async (values) => {
            await api.post('/employee-violations', {
              employee_id: summary.profile.id,
              title: values.title,
              amount: values.amount ? Number(values.amount) : undefined,
              date: values.date,
              notes: values.notes || undefined,
              recorded_by: recordedById,
              recorded_by_name: recordedByName,
            });
            setShowViolationForm(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  total,
  action,
  last,
  children,
}: {
  icon: ReactNode;
  title: string;
  total?: string;
  action?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`py-4 ${last ? '' : 'border-b border-slate-100'}`}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          {icon} {title}
          {total !== undefined && <span className="font-bold text-slate-800">— {total}</span>}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function SimpleTable({ headers, rows, emptyLabel }: { headers: string[]; rows: ReactNode[][]; emptyLabel: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-start text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-slate-400">
            {headers.map((h, i) => (
              <th key={i} className="p-2.5 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="p-2.5 text-slate-600">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="p-5 text-center text-slate-400">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EntryForm({
  title,
  amountLabel,
  amountRequired,
  zIndexTop,
  onClose,
  onSubmit,
}: {
  title: string;
  amountLabel: string;
  amountRequired: boolean;
  zIndexTop?: boolean;
  onClose: () => void;
  onSubmit: (values: { title: string; amount: string; date: string; notes: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await onSubmit({
        title: String(form.get('title') ?? ''),
        amount: String(form.get('amount') ?? ''),
        date: String(form.get('date') ?? ''),
        notes: String(form.get('notes') ?? ''),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4 ${zIndexTop ? 'z-[60]' : 'z-50'}`}>
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('البيان')}</span>
            <input name="title" required className="input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{amountLabel}</span>
              <input type="number" name="amount" min={0} step="0.01" required={amountRequired} className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('التاريخ')}</span>
              <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('ملاحظات (اختياري)')}</span>
            <textarea name="notes" rows={2} className="input resize-none" />
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ الحفظ…') : t('حفظ')}
        </button>
      </form>
    </div>
  );
}
