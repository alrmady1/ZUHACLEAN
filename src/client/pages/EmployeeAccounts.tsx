import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  X,
  Plus,
  Trash2,
  Wallet,
  PiggyBank,
  HandCoins,
  Receipt,
  MinusCircle,
  ShieldAlert,
  Banknote,
  Pencil,
  Check,
  CalendarClock,
  IdCard,
  Percent,
  UserX,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type {
  Expense,
  CustodyInvoice,
  Invoice,
  EmployeeDeduction,
  EmployeeDeductionCategory,
  EmployeeViolation,
  Profile,
  CommissionEligibility,
  TerminationReason,
  AdvanceDeductionMode,
} from '../../shared/types.js';
import {
  CUSTODY_CATEGORY_NAME,
  ADVANCE_CATEGORY_NAME,
  SALARY_CATEGORY_NAME,
  CAN_DELETE_CUSTODY_ROLES,
  DEDUCTION_CATEGORY_LABELS_AR,
  TERMINATION_REASON_LABELS_AR,
  ADVANCE_DEDUCTION_MODE_LABELS_AR,
} from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { PaymentStatusBadge } from '../components/Badge.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { compressImageToDataUrl } from '../lib/image.js';

// العمر بالسنوات الكاملة من تاريخ الميلاد — يُحتسَب دائماً ديناميكياً
// (لا يُخزَّن كرقم ثابت يصبح خاطئاً مع مرور الوقت).
function ageFromBirthDate(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// معاينة حيّة لمكافأة نهاية الخدمة قبل تأكيد الإنهاء فعلياً — نفس منطق
// computeEndOfServiceGratuity على الخادم بالضبط (server/routes/api.ts)،
// المصدر الفعلي المُعتمَد للمبلغ المسجَّل. انظر التعليق هناك لتفصيل
// المادتين ٨٤ و٨٥ من نظام العمل السعودي والتحفظات على هذا التقدير.
function previewGratuity(
  hireDate: string,
  terminationDate: string,
  lastMonthlySalary: number,
  reason: TerminationReason,
): { years: number; fullGratuity: number; fraction: number; gratuity: number } {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = Math.max(0, (new Date(terminationDate).getTime() - new Date(hireDate).getTime()) / msPerYear);
  const first5 = Math.min(years, 5);
  const beyond5 = Math.max(years - 5, 0);
  const fullGratuity = Math.round((first5 * 0.5 + beyond5 * 1) * lastMonthlySalary * 100) / 100;
  let fraction = 1;
  if (reason === 'resignation') {
    if (years < 2) fraction = 0;
    else if (years < 5) fraction = 1 / 3;
    else if (years < 10) fraction = 2 / 3;
    else fraction = 1;
  }
  return { years: Math.round(years * 100) / 100, fullGratuity, fraction, gratuity: Math.round(fullGratuity * fraction * 100) / 100 };
}

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

function monthsBetweenInclusive(startMonth: string, endMonth: string): number {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

// قسط هذا الشهر من سلفية واحدة — نفس منطق computeAdvanceInstallment على
// الخادم بالضبط (server/routes/api.ts)، لعرض معاينة حيّة فقط.
function advanceMonthlyInstallment(advance: Expense, currentMonth: string): number {
  const mode = advance.advance_deduction_mode ?? 'none';
  if (mode === 'none') return 0;
  const remaining = advance.amount - (advance.advance_settled_amount ?? 0);
  if (remaining <= 0.005) return 0;
  if (mode === 'full_next') return Math.round(remaining * 100) / 100;
  if (mode === 'installments') {
    const months = Math.max(1, advance.advance_installment_months ?? 1);
    return Math.round(Math.min(advance.amount / months, remaining) * 100) / 100;
  }
  if (mode === 'period') {
    if (!advance.advance_period_start || !advance.advance_period_end) return 0;
    if (currentMonth < advance.advance_period_start || currentMonth > advance.advance_period_end) return 0;
    const months = monthsBetweenInclusive(advance.advance_period_start, advance.advance_period_end);
    return Math.round(Math.min(advance.amount / months, remaining) * 100) / 100;
  }
  return 0;
}

// أقرب تاريخ استحقاق قادم من يوم ثابت في الشهر — إن مرّ هذا اليوم في
// الشهر الحالي بالفعل، ينتقل تلقائياً لنفس اليوم من الشهر القادم.
function nextDueDate(day: number): Date {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), day);
  if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// نفس الشكل الذي يُرجعه GET /commission-report (انظر computeCommissionReport
// في server/routes/api.ts) — فقط الحقول المستخدَمة هنا (مطابقة عمولة كل
// موظف براتبه الشهري، انظر POST /employees/:id/pay-salary الذي يحتسبها
// بنفس الطريقة على الخادم فعلياً؛ هذا فقط لمعاينة حيّة قبل التسجيل).
interface CommissionReportLite {
  marketers: { profile_id: string; commission_due: number }[];
  supervisors: { profile_id: string; commission_due: number }[];
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
  // سلفيات مجدولة للاستقطاع (advance_deduction_mode !== 'none') ولها
  // رصيد متبقٍ — تدخل في قسط الراتب القادم أيضاً (انظر
  // advanceMonthlyInstallment). سلفية بلا جدولة (الافتراضي) لا تظهر هنا
  // ولا تُخصَم تلقائياً إطلاقاً.
  scheduledAdvances: Expense[];
  thisMonthDeductionTotal: number;
  thisMonthAdvanceTotal: number;
  violationsTotal: number;
  violations: EmployeeViolation[];
  // عمولة هذا الشهر المستحقة له (مسوّق أو مشرف) — من تقرير العمولات، صفر
  // إن لم يكن مستحقاً لأي عمولة إطلاقاً.
  commissionDue: number;
  // صافي الراتب المتوقَّع = الراتب الثابت زائد عمولة هذا الشهر ناقص قسط
  // هذا الشهر من الخصميات النشطة وقسط السلفيات المجدولة — null إن لم
  // يُحدَّد راتب ثابت لهذا الموظف بعد.
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
  const [commissionReport, setCommissionReport] = useState<CommissionReportLite | null>(null);
  const [eligibility, setEligibility] = useState<CommissionEligibility[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  function refresh() {
    api.get<Expense[]>('/expenses').then(setExpenses);
    api.get<CustodyInvoice[]>('/custody-invoices').then(setCustodyInvoices);
    api.get<Invoice[]>('/invoices').then(setInvoices);
    api.get<EmployeeDeduction[]>('/employee-deductions').then(setDeductions);
    api.get<EmployeeViolation[]>('/employee-violations').then(setViolations);
    api.get<CommissionReportLite>(`/commission-report?month=${currentMonth()}`).then(setCommissionReport);
    api.get<CommissionEligibility[]>('/commission-eligibility').then(setEligibility);
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
        const scheduledAdvances = advanceEntries.filter(
          (a) => (a.advance_deduction_mode ?? 'none') !== 'none' && a.amount - (a.advance_settled_amount ?? 0) > 0.005,
        );
        const thisMonthAdvanceTotal = scheduledAdvances.reduce((sum, a) => sum + advanceMonthlyInstallment(a, currentMonth()), 0);
        const commissionDue =
          commissionReport?.marketers.find((m) => m.profile_id === p.id)?.commission_due ??
          commissionReport?.supervisors.find((s) => s.profile_id === p.id)?.commission_due ??
          0;
        const netSalary = p.monthly_salary
          ? Math.max(p.monthly_salary + commissionDue - thisMonthDeductionTotal - thisMonthAdvanceTotal, 0)
          : null;
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
          scheduledAdvances,
          thisMonthDeductionTotal,
          thisMonthAdvanceTotal,
          violations: empViolations,
          violationsTotal: empViolations.reduce((sum, v) => sum + (v.amount ?? 0), 0),
          commissionDue,
          netSalary,
        };
      })
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name, 'ar'));
  }, [allProfiles, expenses, custodyInvoices, invoices, deductions, violations, commissionReport]);

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
              className={`rounded-2xl border bg-white p-4 text-start transition hover:border-brand-300 hover:shadow-sm ${
                s.profile.termination_date ? 'border-slate-200 opacity-60' : 'border-slate-200'
              }`}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                    s.profile.termination_date ? 'bg-slate-400' : 'bg-brand-600'
                  }`}
                >
                  {s.profile.full_name.trim().charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="truncate text-sm font-semibold text-slate-800">{s.profile.full_name}</div>
                    {s.profile.termination_date && (
                      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {t('منتهي الخدمة')}
                      </span>
                    )}
                  </div>
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
                {s.commissionDue > 0 && (
                  <div className="rounded-xl bg-emerald-50 px-2 py-2">
                    <div className="text-[11px] text-slate-400">{t('عمولة هذا الشهر')}</div>
                    <div className="text-sm font-semibold text-emerald-700">+{formatMoney(s.commissionDue)}</div>
                  </div>
                )}
                <div
                  className={`${s.commissionDue > 0 ? '' : 'col-span-2'} rounded-xl px-2 py-2 ${
                    s.thisMonthDeductionTotal + s.thisMonthAdvanceTotal > 0 ? 'bg-red-50' : 'bg-slate-50'
                  }`}
                >
                  <div className="text-[11px] text-slate-400">{t('خصميات وسلفيات هذا الشهر')}</div>
                  <div
                    className={`text-sm font-semibold ${
                      s.thisMonthDeductionTotal + s.thisMonthAdvanceTotal > 0 ? 'text-red-600' : 'text-slate-700'
                    }`}
                  >
                    {formatMoney(s.thisMonthDeductionTotal + s.thisMonthAdvanceTotal)}
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
          eligibility={eligibility.filter((e) => e.profile_id === openSummary.profile.id)}
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
  eligibility,
  canEdit,
  canDelete,
  recordedById,
  recordedByName,
  onClose,
  onChanged,
}: {
  summary: EmployeeSummary;
  eligibility: CommissionEligibility[];
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
  const [payResult, setPayResult] = useState<{ net: number; withheld: number; commission: number } | null>(null);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [legalNameInput, setLegalNameInput] = useState(summary.profile.legal_full_name ?? '');
  const [jobTitleInput, setJobTitleInput] = useState(summary.profile.job_title ?? '');
  const [dobInput, setDobInput] = useState(summary.profile.date_of_birth ?? '');
  const [nationalIdInput, setNationalIdInput] = useState(summary.profile.national_id ?? '');
  const [nationalIdExpiryInput, setNationalIdExpiryInput] = useState(summary.profile.national_id_expiry ?? '');
  const [hireDateInput, setHireDateInput] = useState(summary.profile.hire_date ?? '');
  const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingEligibility, setSavingEligibility] = useState(false);
  const [showTerminateForm, setShowTerminateForm] = useState(false);
  const [terminationDateInput, setTerminationDateInput] = useState(new Date().toISOString().slice(0, 10));
  const [terminationReasonInput, setTerminationReasonInput] = useState<TerminationReason>('employer_termination');
  const [terminating, setTerminating] = useState(false);
  const [editingSalaryEntry, setEditingSalaryEntry] = useState<Expense | null>(null);

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

  async function handleDeleteSalaryEntry(id: string) {
    if (!window.confirm(t('حذف سجل الراتب هذا نهائياً؟'))) return;
    await api.del(`/expenses/${id}`);
    onChanged();
  }

  function startEditingPersonal() {
    setLegalNameInput(summary.profile.legal_full_name ?? '');
    setJobTitleInput(summary.profile.job_title ?? '');
    setDobInput(summary.profile.date_of_birth ?? '');
    setNationalIdInput(summary.profile.national_id ?? '');
    setNationalIdExpiryInput(summary.profile.national_id_expiry ?? '');
    setHireDateInput(summary.profile.hire_date ?? '');
    setIdPhotoFile(null);
    setEditingPersonal(true);
  }

  async function savePersonal() {
    setSavingPersonal(true);
    try {
      const id_photo_data_url = idPhotoFile ? await compressImageToDataUrl(idPhotoFile) : undefined;
      await api.patch(`/profiles/${summary.profile.id}`, {
        legal_full_name: legalNameInput || null,
        job_title: jobTitleInput || null,
        date_of_birth: dobInput || null,
        national_id: nationalIdInput || null,
        national_id_expiry: nationalIdExpiryInput || null,
        hire_date: hireDateInput || null,
        id_photo_data_url,
      });
      setIdPhotoFile(null);
      setEditingPersonal(false);
      onChanged();
    } finally {
      setSavingPersonal(false);
    }
  }

  // تفعيل/إيقاف استحقاق العمولة كمسوّق أو مشرف — يُنشئ سجلاً جديداً إن لم
  // يكن هذا الموظف مضافاً بهذا الدور بعد، أو يُبدِّل active إن كان مضافاً
  // مسبقاً (نفس منطق toggleEligibilityActive في Settings.tsx بالضبط).
  async function toggleCommissionRole(role: 'marketer' | 'supervisor') {
    setSavingEligibility(true);
    try {
      const existing = eligibility.find((e) => e.role === role);
      if (existing) {
        await api.patch(`/commission-eligibility/${existing.id}`, { active: !existing.active });
      } else {
        await api.post('/commission-eligibility', { profile_id: summary.profile.id, role, active: true });
      }
      onChanged();
    } finally {
      setSavingEligibility(false);
    }
  }

  async function terminateEmployee() {
    if (
      !window.confirm(
        tt(
          `إنهاء عقد ${summary.profile.full_name} نهائياً؟ سيُعطَّل حسابه وتُسجَّل مكافأة نهاية الخدمة كمصروف تلقائياً. لا يمكن التراجع عن هذا الإجراء.`,
          `Permanently terminate ${summary.profile.full_name}'s contract? Their account will be disabled and the end-of-service gratuity recorded as an expense automatically. This cannot be undone.`,
        ),
      )
    )
      return;
    setTerminating(true);
    try {
      await api.post(`/employees/${summary.profile.id}/terminate`, {
        termination_date: terminationDateInput,
        reason: terminationReasonInput,
        recorded_by: recordedById,
        recorded_by_name: recordedByName,
      });
      setShowTerminateForm(false);
      onChanged();
      onClose();
    } finally {
      setTerminating(false);
    }
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
      const result = await api.post<{ net: number; withheld: number; commission: number }>(`/employees/${summary.profile.id}/pay-salary`, {
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

        {/* البيانات الشخصية — الاسم (في رأس النافذة أعلاه)، العمر (محتسَب من
            تاريخ الميلاد)، رقم الهوية/الإقامة وتاريخ انتهائها، وتاريخ التعيين
            (أساس احتساب مدة الخدمة عند إنهاء العقد لاحقاً). */}
        <Section
          icon={<IdCard className="h-4 w-4 text-brand-600" />}
          title={t('البيانات الشخصية')}
          action={
            canEdit &&
            !editingPersonal && (
              <button
                onClick={startEditingPersonal}
                className="flex items-center gap-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                title={t('تعديل البيانات الشخصية')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )
          }
        >
          {editingPersonal ? (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الاسم الكامل (حسب الهوية)')}</span>
                  <input value={legalNameInput} onChange={(e) => setLegalNameInput(e.target.value)} className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('المسمى الوظيفي')}</span>
                  <input value={jobTitleInput} onChange={(e) => setJobTitleInput(e.target.value)} className="input" placeholder={t('مثال: فني تكييف أول')} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('تاريخ الميلاد')}</span>
                  <input type="date" value={dobInput} onChange={(e) => setDobInput(e.target.value)} className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('تاريخ التعيين')}</span>
                  <input type="date" value={hireDateInput} onChange={(e) => setHireDateInput(e.target.value)} className="input" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('رقم الهوية / الإقامة')}</span>
                  <input value={nationalIdInput} onChange={(e) => setNationalIdInput(e.target.value)} className="input" dir="ltr" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('تاريخ انتهاء الهوية')}</span>
                  <input
                    type="date"
                    value={nationalIdExpiryInput}
                    onChange={(e) => setNationalIdExpiryInput(e.target.value)}
                    className="input"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('صورة الهوية / الإقامة')}</span>
                {summary.profile.id_photo_url && !idPhotoFile && (
                  <a
                    href={summary.profile.id_photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-brand-600"
                  >
                    <img src={summary.profile.id_photo_url} alt={t('صورة الهوية')} className="h-10 w-10 rounded object-cover" />
                    {t('عرض الصورة الحالية')}
                  </a>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setIdPhotoFile(e.target.files?.[0] ?? null)}
                  className="input file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-600"
                />
                {idPhotoFile && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Camera className="h-3 w-3" /> {idPhotoFile.name}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={savePersonal}
                  disabled={savingPersonal}
                  className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> {savingPersonal ? t('جارِ الحفظ…') : t('حفظ')}
                </button>
                <button onClick={() => setEditingPersonal(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  {t('إلغاء')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-400">{t('الاسم الكامل (حسب الهوية)')}</div>
                  <div className="font-medium text-slate-700">{summary.profile.legal_full_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">{t('المسمى الوظيفي')}</div>
                  <div className="font-medium text-slate-700">{summary.profile.job_title || '—'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-400">{t('العمر')}</div>
                  <div className="font-medium text-slate-700">
                    {summary.profile.date_of_birth ? tt(`${ageFromBirthDate(summary.profile.date_of_birth)} سنة`, `${ageFromBirthDate(summary.profile.date_of_birth)} yrs`) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">{t('رقم الهوية / الإقامة')}</div>
                  <div className="font-medium text-slate-700" dir="ltr">{summary.profile.national_id || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">{t('تاريخ انتهاء الهوية')}</div>
                  <div
                    className={`font-medium ${
                      summary.profile.national_id_expiry && new Date(summary.profile.national_id_expiry) < new Date()
                        ? 'text-red-600'
                        : 'text-slate-700'
                    }`}
                    dir="ltr"
                  >
                    {summary.profile.national_id_expiry || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">{t('تاريخ التعيين')}</div>
                  <div className="font-medium text-slate-700" dir="ltr">{summary.profile.hire_date || '—'}</div>
                </div>
              </div>
              {summary.profile.id_photo_url && (
                <a
                  href={summary.profile.id_photo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-brand-600"
                >
                  <img src={summary.profile.id_photo_url} alt={t('صورة الهوية')} className="h-10 w-10 rounded object-cover" />
                  {t('عرض صورة الهوية')}
                </a>
              )}
            </div>
          )}
        </Section>

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
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="text-[11px] text-slate-400">{t('الراتب الأساسي')}</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(summary.profile.monthly_salary)}</div>
                </div>
                <div className={`rounded-xl p-2.5 ${summary.commissionDue > 0 ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                  <div className="text-[11px] text-slate-400">{t('عمولة هذا الشهر')}</div>
                  <div className={`text-sm font-semibold ${summary.commissionDue > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {summary.commissionDue > 0 ? `+${formatMoney(summary.commissionDue)}` : formatMoney(0)}
                  </div>
                </div>
                <div className={`rounded-xl p-2.5 ${summary.thisMonthDeductionTotal + summary.thisMonthAdvanceTotal > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <div className="text-[11px] text-slate-400">{t('خصميات وسلفيات هذا الشهر')}</div>
                  <div
                    className={`text-sm font-semibold ${summary.thisMonthDeductionTotal + summary.thisMonthAdvanceTotal > 0 ? 'text-red-600' : 'text-slate-700'}`}
                  >
                    {summary.thisMonthDeductionTotal + summary.thisMonthAdvanceTotal > 0
                      ? `-${formatMoney(summary.thisMonthDeductionTotal + summary.thisMonthAdvanceTotal)}`
                      : formatMoney(0)}
                  </div>
                </div>
                <div className="rounded-xl bg-brand-50 p-2.5">
                  <div className="text-[11px] text-slate-400">{t('صافي الراتب المتوقع')}</div>
                  <div className="text-sm font-semibold text-brand-700">{formatMoney(summary.netSalary ?? 0)}</div>
                </div>
              </div>

              {(summary.activeDeductions.length > 0 || summary.scheduledAdvances.length > 0) && (
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
                    {summary.scheduledAdvances.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">
                          {a.title}
                          <span className="text-slate-400"> — {t(ADVANCE_DEDUCTION_MODE_LABELS_AR[a.advance_deduction_mode ?? 'none'])}</span>
                        </span>
                        <span className="font-medium text-red-600">
                          {formatMoney(advanceMonthlyInstallment(a, currentMonth()))}
                          <span className="ms-1 text-slate-400">
                            ({tt(`متبقٍ ${formatMoney(a.amount - (a.advance_settled_amount ?? 0))}`, `${formatMoney(a.amount - (a.advance_settled_amount ?? 0))} remaining`)})
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
                        `تم تسجيل صافي ${formatMoney(payResult.net)}${payResult.commission > 0 ? ` (منها عمولة ${formatMoney(payResult.commission)})` : ''}${payResult.withheld > 0 ? ` (خُصم ${formatMoney(payResult.withheld)})` : ''}.`,
                        `Net ${formatMoney(payResult.net)} recorded${payResult.commission > 0 ? ` (incl. ${formatMoney(payResult.commission)} commission)` : ''}${payResult.withheld > 0 ? ` (${formatMoney(payResult.withheld)} withheld)` : ''}.`,
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* استحقاق العمولات — تفعيل/إيقاف هذا الموظف كمسوّق و/أو مشرف مستحق
            للعمولة الشهرية (يشترك في نفس مجمّع العمولة النسبي المُدار من
            الإعدادات ← العمولات — لا توجد "نسبة" ثابتة لكل موظف، فالتوزيع
            تناسبي حسب حصة كل مستحق من الإيراد المحصَّل، انظر Commissions.tsx). */}
        <Section icon={<Percent className="h-4 w-4 text-brand-600" />} title={t('استحقاق العمولات')}>
          <div className="grid grid-cols-2 gap-3">
            {(['marketer', 'supervisor'] as const).map((role) => {
              const entry = eligibility.find((e) => e.role === role);
              const active = entry?.active ?? false;
              return (
                <label
                  key={role}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${
                    active ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                  } ${!canEdit || savingEligibility ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <span className={`font-medium ${active ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {role === 'marketer' ? t('مستحق كمسوّق') : t('مستحق كمشرف')}
                  </span>
                  <input type="checkbox" checked={active} onChange={() => toggleCommissionRole(role)} className="h-4 w-4" />
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t('التوزيع تناسبي حسب حصة كل مستحق من الإيراد المحصَّل — النِسَب والشرائح العامة تُضبَط من الإعدادات ← العمولات')}
          </p>
        </Section>

        {/* سجل الرواتب المدفوعة */}
        <Section icon={<Wallet className="h-4 w-4 text-brand-600" />} title={t('سجل الرواتب المدفوعة')} total={formatMoney(summary.salaryTotal)}>
          <SimpleTable
            emptyLabel={t('لا توجد رواتب مسجَّلة لهذا الموظف')}
            headers={[t('التاريخ'), t('البيان'), t('المبلغ'), '']}
            rows={summary.salaryEntries.map((e) => [
              formatDateAr(e.date),
              e.title,
              formatMoney(e.amount),
              <span key={`${e.id}-actions`} className="flex items-center gap-1">
                {canEdit && (
                  <button
                    onClick={() => setEditingSalaryEntry(e)}
                    title={t('تعديل')}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDeleteSalaryEntry(e.id)}
                    title={t('حذف')}
                    className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>,
            ])}
          />
        </Section>

        {/* السلفيات — الجدولة (استقطاعها من الراتب) تُضبَط عند تسجيل السلفية
            نفسها من صفحة المصروفات العامة (أو تعديلها لاحقاً من هناك)، هنا
            عرض فقط لحالة كل سلفية. */}
        <Section icon={<HandCoins className="h-4 w-4 text-brand-600" />} title={t('السلفيات')} total={formatMoney(summary.advanceTotal)}>
          <SimpleTable
            emptyLabel={t('لا توجد سلفيات مسجَّلة لهذا الموظف')}
            headers={[t('التاريخ'), t('البيان'), t('المبلغ'), t('الاستقطاع')]}
            rows={summary.advanceEntries.map((e) => {
              const mode = e.advance_deduction_mode ?? 'none';
              const remaining = e.amount - (e.advance_settled_amount ?? 0);
              return [
                formatDateAr(e.date),
                e.title,
                formatMoney(e.amount),
                mode === 'none' ? (
                  <span key={`${e.id}-mode`} className="text-slate-400">{t(ADVANCE_DEDUCTION_MODE_LABELS_AR.none)}</span>
                ) : remaining <= 0.005 ? (
                  <span key={`${e.id}-mode`} className="font-medium text-emerald-600">{t('مسدَّد')}</span>
                ) : (
                  <span key={`${e.id}-mode`} className="text-slate-600">
                    {t(ADVANCE_DEDUCTION_MODE_LABELS_AR[mode])}
                    <span className="ms-1 text-slate-400">({tt(`متبقٍ ${formatMoney(remaining)}`, `${formatMoney(remaining)} remaining`)})</span>
                  </span>
                ),
              ];
            })}
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

        {/* إنهاء الخدمة — يحتسب مكافأة نهاية الخدمة تلقائياً وفق المادتين
            ٨٤ و٨٥ من نظام العمل السعودي (انظر computeEndOfServiceGratuity في
            server/routes/api.ts للتفاصيل والتحفظات)، ويسجّلها كمصروف منفصل
            عن الراتب الشهري، ثم يعطّل حساب الموظف. إجراء نهائي لا رجعة فيه. */}
        <Section icon={<UserX className="h-4 w-4 text-red-500" />} title={t('إنهاء الخدمة')} last>
          {summary.profile.termination_date ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <div>
                {t('تاريخ الإنهاء')}: <span className="font-medium text-slate-800" dir="ltr">{summary.profile.termination_date}</span>
              </div>
              <div>
                {t('السبب')}:{' '}
                <span className="font-medium text-slate-800">
                  {summary.profile.termination_reason ? t(TERMINATION_REASON_LABELS_AR[summary.profile.termination_reason]) : '—'}
                </span>
              </div>
              <div>
                {t('مكافأة نهاية الخدمة المحتسَبة')}:{' '}
                <span className="font-semibold text-slate-800">{formatMoney(summary.profile.end_of_service_amount ?? 0)}</span>
              </div>
            </div>
          ) : !canEdit ? (
            <p className="text-sm text-slate-400">{t('لا تملك صلاحية إنهاء عقد موظف')}</p>
          ) : !showTerminateForm ? (
            <button
              onClick={() => setShowTerminateForm(true)}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <UserX className="h-4 w-4" /> {t('إنهاء عقد الموظف')}
            </button>
          ) : (
            <div className="space-y-3 rounded-xl bg-red-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('تاريخ الإنهاء')}</span>
                  <input
                    type="date"
                    value={terminationDateInput}
                    onChange={(e) => setTerminationDateInput(e.target.value)}
                    className="input"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('سبب الإنهاء')}</span>
                  <select
                    value={terminationReasonInput}
                    onChange={(e) => setTerminationReasonInput(e.target.value as TerminationReason)}
                    className="input"
                  >
                    <option value="employer_termination">{t(TERMINATION_REASON_LABELS_AR.employer_termination)}</option>
                    <option value="contract_expiry">{t(TERMINATION_REASON_LABELS_AR.contract_expiry)}</option>
                    <option value="resignation">{t(TERMINATION_REASON_LABELS_AR.resignation)}</option>
                  </select>
                </label>
              </div>

              {!summary.profile.hire_date || !summary.profile.monthly_salary ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t('يلزم ضبط تاريخ التعيين والراتب الشهري أولاً (قسم البيانات الشخصية والراتب الشهري أعلاه) لاحتساب المكافأة')}
                </p>
              ) : (
                (() => {
                  const preview = previewGratuity(
                    summary.profile.hire_date,
                    terminationDateInput,
                    summary.profile.monthly_salary,
                    terminationReasonInput,
                  );
                  return (
                    <div className="rounded-lg bg-white p-2.5 text-xs text-slate-600">
                      <div>
                        {tt(`مدة الخدمة: ${preview.years} سنة`, `Service: ${preview.years} years`)}
                      </div>
                      <div>
                        {tt(`المكافأة كاملة قبل أي خصم: ${formatMoney(preview.fullGratuity)}`, `Full gratuity before any reduction: ${formatMoney(preview.fullGratuity)}`)}
                      </div>
                      {preview.fraction < 1 && (
                        <div>{tt(`نسبة الاستحقاق (استقالة): ${Math.round(preview.fraction * 100)}%`, `Entitlement share (resignation): ${Math.round(preview.fraction * 100)}%`)}</div>
                      )}
                      <div className="mt-1 font-semibold text-slate-800">
                        {tt(`المبلغ المُقدَّر: ${formatMoney(preview.gratuity)}`, `Estimated amount: ${formatMoney(preview.gratuity)}`)}
                      </div>
                    </div>
                  );
                })()
              )}

              <p className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {t('تقدير آلي مبسَّط وفق المادتين ٨٤ و٨٥ من نظام العمل السعودي — لا يغطي حالات الفصل التأديبي أو رصيد الإجازات أو بدل الإشعار. يُنصح بمراجعة مختص قبل الصرف النهائي.')}
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={terminateEmployee}
                  disabled={terminating || !summary.profile.hire_date || !summary.profile.monthly_salary}
                  className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {terminating ? t('جارِ الإنهاء…') : t('تأكيد إنهاء العقد')}
                </button>
                <button onClick={() => setShowTerminateForm(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  {t('إلغاء')}
                </button>
              </div>
            </div>
          )}
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

      {editingSalaryEntry && (
        <EntryForm
          zIndexTop
          title={t('تعديل سجل الراتب')}
          amountRequired
          amountLabel={t('المبلغ (ر.س)')}
          initial={{ title: editingSalaryEntry.title, amount: editingSalaryEntry.amount, date: editingSalaryEntry.date, notes: editingSalaryEntry.notes }}
          onClose={() => setEditingSalaryEntry(null)}
          onSubmit={async (values) => {
            await api.patch(`/expenses/${editingSalaryEntry.id}`, {
              title: values.title,
              amount: Number(values.amount),
              date: values.date,
              notes: values.notes || undefined,
            });
            setEditingSalaryEntry(null);
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
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  amountLabel: string;
  amountRequired: boolean;
  zIndexTop?: boolean;
  // قيم مبدئية — عند تحريرها (تعديل سجل قائم) بدل إدخال جديد فارغ.
  initial?: { title?: string; amount?: number; date?: string; notes?: string };
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
            <input name="title" defaultValue={initial?.title} required className="input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{amountLabel}</span>
              <input type="number" name="amount" min={0} step="0.01" defaultValue={initial?.amount} required={amountRequired} className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('التاريخ')}</span>
              <input type="date" name="date" defaultValue={initial?.date ?? new Date().toISOString().slice(0, 10)} required className="input" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('ملاحظات (اختياري)')}</span>
            <textarea name="notes" rows={2} defaultValue={initial?.notes} className="input resize-none" />
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
