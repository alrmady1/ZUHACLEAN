import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { X, Plus, Trash2, Wallet, PiggyBank, HandCoins, Receipt, MinusCircle, ShieldAlert, Banknote, Pencil, Check, CalendarClock } from 'lucide-react';
import { api } from '../lib/api.js';
import type {
  Expense,
  CustodyInvoice,
  Invoice,
  EmployeeDeduction,
  EmployeeDeductionCategory,
  EmployeeViolation,
  Profile,
} from '../../shared/types.js';
import {
  CUSTODY_CATEGORY_NAME,
  ADVANCE_CATEGORY_NAME,
  SALARY_CATEGORY_NAME,
  CAN_DELETE_CUSTODY_ROLES,
  DEDUCTION_CATEGORY_LABELS_AR,
} from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { PaymentStatusBadge } from '../components/Badge.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

// قسط هذا الشهر لخصم واحد — أقل من (amount / installment_months) أو
// (amount - settled_amount المتبقي فعلياً)، نفس منطق POST
// /employees/:id/pay-salary على الخادم بالضبط (يُستخدَم هنا فقط لعرض
// معاينة حيّة قبل تسجيل الراتب فعلياً).
function monthlyInstallment(d: EmployeeDeduction): number {
  const remaining = d.amount - (d.settled_amount ?? 0);
  if (remaining <= 0) return 0;
  const perMonth = d.amount / Math.max(1, d.installment_months ?? 1);
  return Math.round(Math.min(perMonth, remaining) * 100) / 100;
}

// أقرب تاريخ استحقاق قادم من يوم ثابت في الشهر — إن مرّ هذا اليوم في
// الشهر الحالي بالفعل، ينتقل تلقائياً لنفس اليوم من الشهر القادم.
function nextDueDate(day: number): Date {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), day);
  if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

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
  // خصميات ما زال لها رصيد متبقٍ (amount > settled_amount) — هذه فقط
  // تُحتسَب ضمن قسط الراتب القادم، وليس كل الخصميات المسجَّلة تاريخياً.
  activeDeductions: EmployeeDeduction[];
  thisMonthDeductionTotal: number;
  violationsTotal: number;
  violations: EmployeeViolation[];
  // صافي الراتب المتوقَّع = الراتب الثابت ناقص قسط هذا الشهر من الخصميات
  // النشطة — null إن لم يُحدَّد راتب ثابت لهذا الموظف بعد.
  netSalary: number | null;
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
        const activeDeductions = empDeductions.filter((d) => d.amount - (d.settled_amount ?? 0) > 0.005);
        const thisMonthDeductionTotal = activeDeductions.reduce((sum, d) => sum + monthlyInstallment(d), 0);
        const netSalary = p.monthly_salary ? Math.max(p.monthly_salary - thisMonthDeductionTotal, 0) : null;
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
          activeDeductions,
          thisMonthDeductionTotal,
          violations: empViolations,
          violationsTotal: empViolations.reduce((sum, v) => sum + (v.amount ?? 0), 0),
          netSalary,
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
        <h2 className="text-lg font-bold text-slate-800">{t('الموظفين')}</h2>
        <p className="text-sm text-slate-400">
          {t('الراتب الشهري وصافيه بعد الخصميات، والسلفيات والعهدة والفواتير المحصَّلة لكل موظف — اضغط على أي موظف للاطلاع على التفاصيل')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => {
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
                  <div className="text-[11px] text-slate-400">{t('الراتب الشهري')}</div>
                  <div className="text-sm font-semibold text-slate-700">
                    {s.profile.monthly_salary ? formatMoney(s.profile.monthly_salary) : t('غير محدَّد')}
                  </div>
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
                <div className={`col-span-2 rounded-xl px-2 py-2 ${s.thisMonthDeductionTotal > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <div className="text-[11px] text-slate-400">{t('خصميات هذا الشهر')}</div>
                  <div className={`text-sm font-semibold ${s.thisMonthDeductionTotal > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {formatMoney(s.thisMonthDeductionTotal)}
                  </div>
                </div>
              </div>
              {s.netSalary !== null && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2">
                  <span className="text-[11px] font-medium text-brand-700">{t('صافي الراتب المتوقع')}</span>
                  <span className="text-sm font-bold text-brand-700">{formatMoney(s.netSalary)}</span>
                </div>
              )}
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
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState(String(summary.profile.monthly_salary ?? ''));
  const [dueDayInput, setDueDayInput] = useState(String(summary.profile.salary_due_day ?? ''));
  const [savingSalary, setSavingSalary] = useState(false);
  const [payingSalary, setPayingSalary] = useState(false);
  const [payResult, setPayResult] = useState<{ net: number; withheld: number } | null>(null);

  async function handleDeleteDeduction(id: string) {
    if (!window.confirm(t('حذف هذا الخصم؟'))) return;
    await api.del(`/employee-deductions/${id}`);
    onChanged();
  }

  async function handleSettleDeduction(id: string) {
    if (!window.confirm(t('تسوية هذا الخصم بالكامل الآن؟ لن يُخصَم أي قسط منه لاحقاً.'))) return;
    await api.patch(`/employee-deductions/${id}/settle`);
    onChanged();
  }

  async function handleDeleteViolation(id: string) {
    if (!window.confirm(t('حذف هذه المخالفة؟'))) return;
    await api.del(`/employee-violations/${id}`);
    onChanged();
  }

  function startEditingSalary() {
    setSalaryInput(String(summary.profile.monthly_salary ?? ''));
    setDueDayInput(String(summary.profile.salary_due_day ?? ''));
    setEditingSalary(true);
  }

  async function saveSalary() {
    setSavingSalary(true);
    try {
      await api.patch(`/profiles/${summary.profile.id}`, {
        monthly_salary: salaryInput ? Number(salaryInput) : null,
        salary_due_day: dueDayInput ? Number(dueDayInput) : null,
      });
      setEditingSalary(false);
      onChanged();
    } finally {
      setSavingSalary(false);
    }
  }

  async function paySalary() {
    if (!window.confirm(tt(`تسجيل راتب ${summary.profile.full_name} لهذا الشهر؟`, `Record ${summary.profile.full_name}'s salary for this month?`))) return;
    setPayingSalary(true);
    try {
      const result = await api.post<{ net: number; withheld: number }>(`/employees/${summary.profile.id}/pay-salary`, {
        recorded_by: recordedById,
        recorded_by_name: recordedByName,
      });
      setPayResult(result);
      onChanged();
    } finally {
      setPayingSalary(false);
    }
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

        {/* الراتب الشهري — الراتب الثابت، الخصميات النشطة وقسط هذا الشهر
            منها، صافي الراتب المتوقع، تاريخ الاستحقاق، وتسجيل راتب الشهر. */}
        <Section
          icon={<Banknote className="h-4 w-4 text-brand-600" />}
          title={t('الراتب الشهري')}
          action={
            canEdit &&
            !editingSalary && (
              <button
                onClick={startEditingSalary}
                className="flex items-center gap-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                title={t('تعديل الراتب الثابت وتاريخ الاستحقاق')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )
          }
        >
          {editingSalary ? (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الراتب الشهري الثابت (ر.س)')}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={salaryInput}
                    onChange={(e) => setSalaryInput(e.target.value)}
                    className="input"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('يوم الاستحقاق من كل شهر (١-٢٨)')}</span>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={dueDayInput}
                    onChange={(e) => setDueDayInput(e.target.value)}
                    className="input"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveSalary}
                  disabled={savingSalary}
                  className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> {savingSalary ? t('جارِ الحفظ…') : t('حفظ')}
                </button>
                <button onClick={() => setEditingSalary(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  {t('إلغاء')}
                </button>
              </div>
            </div>
          ) : !summary.profile.monthly_salary ? (
            <p className="rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-400">
              {t('لم يُحدَّد راتب ثابت لهذا الموظف بعد')}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="text-[11px] text-slate-400">{t('الراتب الأساسي')}</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(summary.profile.monthly_salary)}</div>
                </div>
                <div className={`rounded-xl p-2.5 ${summary.thisMonthDeductionTotal > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <div className="text-[11px] text-slate-400">{t('خصميات هذا الشهر')}</div>
                  <div className={`text-sm font-semibold ${summary.thisMonthDeductionTotal > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {formatMoney(summary.thisMonthDeductionTotal)}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-2.5">
                  <div className="text-[11px] text-slate-400">{t('صافي الراتب المتوقع')}</div>
                  <div className="text-sm font-semibold text-emerald-700">{formatMoney(summary.netSalary ?? 0)}</div>
                </div>
              </div>

              {summary.activeDeductions.length > 0 && (
                <div className="rounded-xl border border-slate-100 p-2.5">
                  <div className="mb-1.5 text-xs font-medium text-slate-500">{t('تفاصيل قسط هذا الشهر')}</div>
                  <div className="space-y-1">
                    {summary.activeDeductions.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">
                          {d.title}
                          {d.category && <span className="text-slate-400"> — {t(DEDUCTION_CATEGORY_LABELS_AR[d.category])}</span>}
                        </span>
                        <span className="font-medium text-red-600">
                          {formatMoney(monthlyInstallment(d))}
                          <span className="ms-1 text-slate-400">
                            ({tt(`متبقٍ ${formatMoney(d.amount - (d.settled_amount ?? 0))}`, `${formatMoney(d.amount - (d.settled_amount ?? 0))} remaining`)})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.profile.salary_due_day && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {tt(
                    `تاريخ الاستحقاق القادم: ${formatDateAr(nextDueDate(summary.profile.salary_due_day).toISOString())}`,
                    `Next due date: ${formatDateAr(nextDueDate(summary.profile.salary_due_day).toISOString())}`,
                  )}
                </div>
              )}

              {canEdit && (
                <div>
                  <button
                    onClick={paySalary}
                    disabled={payingSalary}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Wallet className="h-4 w-4" /> {payingSalary ? t('جارِ التسجيل…') : t('تسجيل الراتب الشهري')}
                  </button>
                  {payResult && (
                    <p className="mt-2 text-xs text-emerald-700">
                      {tt(
                        `تم تسجيل صافي ${formatMoney(payResult.net)} (خُصم ${formatMoney(payResult.withheld)}).`,
                        `Net ${formatMoney(payResult.net)} recorded (${formatMoney(payResult.withheld)} withheld).`,
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* سجل الرواتب المدفوعة */}
        <Section icon={<Wallet className="h-4 w-4 text-brand-600" />} title={t('سجل الرواتب المدفوعة')} total={formatMoney(summary.salaryTotal)}>
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
            headers={[t('التاريخ'), t('البيان'), t('المبلغ'), t('المتبقي'), '']}
            rows={summary.deductions.map((d) => {
              const remaining = d.amount - (d.settled_amount ?? 0);
              return [
                formatDateAr(d.date),
                <span key={`${d.id}-title`}>
                  {d.title}
                  {d.category && <div className="text-[11px] text-slate-400">{t(DEDUCTION_CATEGORY_LABELS_AR[d.category])}</div>}
                </span>,
                formatMoney(d.amount),
                remaining > 0.005 ? (
                  <span key={`${d.id}-remaining`} className="font-medium text-red-600">{formatMoney(remaining)}</span>
                ) : (
                  <span key={`${d.id}-remaining`} className="font-medium text-emerald-600">{t('مسدَّد')}</span>
                ),
                <span key={`${d.id}-actions`} className="flex items-center gap-1">
                  {canEdit && remaining > 0.005 && (
                    <button
                      onClick={() => handleSettleDeduction(d.id)}
                      title={t('تسوية الآن')}
                      className="rounded-lg p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => handleDeleteDeduction(d.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>,
              ];
            })}
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
        <DeductionForm
          onClose={() => setShowDeductionForm(false)}
          onSubmit={async (values) => {
            await api.post('/employee-deductions', {
              employee_id: summary.profile.id,
              title: values.title,
              category: values.category,
              amount: Number(values.amount),
              installment_months: Number(values.installmentMonths) || 1,
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

// نموذج خصم جديد — مستقل عن EntryForm العام لأنه الوحيد الذي يحتاج تصنيفاً
// (مخالفة/تأخير/تلفية/أخرى) وتقسيطاً على عدد أشهر (انظر installment_months
// في EmployeeDeduction، وPOST /employees/:id/pay-salary الذي يطبّقه فعلياً
// شهرياً عند تسجيل الراتب).
function DeductionForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    category: EmployeeDeductionCategory;
    amount: string;
    installmentMonths: string;
    date: string;
    notes: string;
  }) => Promise<void>;
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
        category: (form.get('category') as EmployeeDeductionCategory) || 'other',
        amount: String(form.get('amount') ?? ''),
        installmentMonths: String(form.get('installment_months') ?? '1'),
        date: String(form.get('date') ?? ''),
        notes: String(form.get('notes') ?? ''),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t('خصم جديد')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('البيان')}</span>
            <input name="title" required className="input" placeholder={t('مثال: تأخير عن الدوام 3 مرات')} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('نوع الخصم')}</span>
            <select name="category" defaultValue="other" className="input">
              <option value="violation">{t(DEDUCTION_CATEGORY_LABELS_AR.violation)}</option>
              <option value="lateness">{t(DEDUCTION_CATEGORY_LABELS_AR.lateness)}</option>
              <option value="damage">{t(DEDUCTION_CATEGORY_LABELS_AR.damage)}</option>
              <option value="other">{t(DEDUCTION_CATEGORY_LABELS_AR.other)}</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('مبلغ الخصم (ر.س)')}</span>
              <input type="number" name="amount" min={0} step="0.01" required className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('التاريخ')}</span>
              <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('عدد الأشهر للتقسيط')}</span>
            <input type="number" name="installment_months" min={1} step="1" defaultValue={1} className="input" />
            <span className="mt-1 block text-xs text-slate-400">{t('١ = تُخصَم بالكامل من راتب هذا الشهر')}</span>
          </label>
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
