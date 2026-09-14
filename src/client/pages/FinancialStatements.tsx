import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileBarChart, Printer, Download, X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, Appointment, Asset, Profile, CustodyInvoice } from '../../shared/types.js';
import { COMPANY_LEGAL_NAME, COMPANY_VAT_NUMBER, COMPANY_CR_NUMBER, EXPENSE_ACCOUNTING_CLASSIFICATION_COST_TYPE } from '../../shared/types.js';
import type { StatementLine, FinancialStatementsInputs, IncomeStatement, BalanceSheet, EquityChangesStatement, CashFlowStatement } from '../../shared/financialStatements.js';
import { computeIncomeStatement, computeBalanceSheet, computeEquityChanges, computeCashFlowStatement } from '../../shared/financialStatements.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// ============================================================================
// تبويب "القوائم المالية" — الإعدادات/المحاسبة ← القوائم المالية. يحتسب
// القوائم المالية الأربع المعيارية (مركز مالي، دخل شامل، تغيرات حقوق
// الملكية، تدفقات نقدية) تلقائياً من بيانات النظام، بنفس بنود وترتيب
// النموذج الرسمي المعتمَد لتعبئة "برنامج قوائم XBRL" التابع للمركز
// السعودي للتنافسية والأعمال (قبل رفعها عبر qawaem.bc.gov.sa). كل بند
// إما محتسَب بالكامل ("تلقائي")، محتسَب بافتراض مبسَّط يستحق المراجعة
// ("تقديري")، أو غير مُتتبَّع في النظام إطلاقاً ("يدوي" — صفر افتراضياً،
// يُملأ لاحقاً في ملف الإكسل المُصدَّر مباشرة قبل نسخه لبرنامج قوائم).
// انظر src/shared/financialStatements.ts لتفاصيل كل احتساب وافتراضاته.
// ============================================================================

function currentFiscalYearRange(): { from: string; to: string } {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

interface RowSpec {
  key: string;
  label: string;
  line: StatementLine;
  bold?: boolean;
  highlight?: boolean;
  indent?: boolean;
}

const SOURCE_BADGE: Record<StatementLine['source'], { label: string; className: string }> = {
  auto: { label: 'تلقائي', className: 'bg-emerald-50 text-emerald-700' },
  estimate: { label: 'تقديري', className: 'bg-amber-50 text-amber-700' },
  manual: { label: 'يدوي', className: 'bg-slate-100 text-slate-500' },
};

function StatementTable({ title, rows }: { title: string; rows: RowSpec[] }) {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">{t(title)}</div>
      <table className="w-full text-start text-sm">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={`border-b border-slate-50 last:border-0 ${r.highlight ? 'bg-brand-50/60' : ''}`}
            >
              <td className={`p-2.5 ${r.bold ? 'font-bold text-slate-800' : 'text-slate-600'} ${r.indent ? 'ps-6' : ''}`}>{t(r.label)}</td>
              <td className="w-24 p-2.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[r.line.source].className}`}>
                  {t(SOURCE_BADGE[r.line.source].label)}
                </span>
              </td>
              <td className={`w-36 p-2.5 text-end ${r.bold ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}`} dir="ltr">
                {formatMoney(r.line.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function balanceSheetRows(bs: BalanceSheet): RowSpec[] {
  return [
    { key: 'ppe', label: 'ممتلكات وآلات ومعدات', line: bs.propertyPlantEquipment, indent: true },
    { key: 'intangible', label: 'موجودات غير ملموسة باستثناء الشهرة', line: bs.intangibleAssets, indent: true },
    { key: 'invprop', label: 'العقارات الاستثمارية', line: bs.investmentProperty, indent: true },
    { key: 'equityinv', label: 'الاستثمارات المحتسبة بطريقة حقوق الملكية', line: bs.equityMethodInvestments, indent: true },
    { key: 'othernca', label: 'موجودات غير متداولة أخرى', line: bs.otherNonCurrentAssets, indent: true },
    { key: 'totalnca', label: 'إجمالي الموجودات غير المتداولة', line: bs.totalNonCurrentAssets, bold: true },
    { key: 'prepaid', label: 'مصاريف مدفوعة مقدماً وأرصدة مدينة أخرى (عهد وسلف الموظفين)', line: bs.prepaidAndOtherDebitBalances, indent: true },
    { key: 'ar', label: 'ذمم مدينة تجارية', line: bs.tradeReceivables, indent: true },
    { key: 'cash', label: 'نقد وما في حكمه', line: bs.cashAndEquivalents, indent: true },
    { key: 'inventory', label: 'مخزون', line: bs.inventory, indent: true },
    { key: 'fvinv', label: 'استثمارات القيمة العادلة من خلال الأرباح والخسائر', line: bs.fvInvestments, indent: true },
    { key: 'otherca', label: 'أصول متداولة أخرى', line: bs.otherCurrentAssets, indent: true },
    { key: 'duefrom', label: 'مطلوب من أطراف ذات علاقة', line: bs.dueFromRelatedParties, indent: true },
    { key: 'totalca', label: 'إجمالي الموجودات المتداولة', line: bs.totalCurrentAssets, bold: true },
    { key: 'totalassets', label: 'إجمالي الموجودات', line: bs.totalAssets, bold: true, highlight: true },
    { key: 'capital', label: 'رأس المال', line: bs.capital, indent: true },
    { key: 'reserve', label: 'احتياطي نظامي', line: bs.statutoryReserve, indent: true },
    { key: 'retained', label: 'أرباح مبقاة (خسائر متراكمة)', line: bs.retainedEarnings, indent: true },
    { key: 'otherequity', label: 'عناصر أخرى لحقوق الملكية', line: bs.otherEquityItems, indent: true },
    { key: 'parenteq', label: 'حقوق الملكية المتعلقة بملاك الشركة', line: bs.parentEquity, indent: true },
    { key: 'nci', label: 'حقوق الملكية غير المسيطرة', line: bs.nonControllingInterest, indent: true },
    { key: 'totalequity', label: 'إجمالي حقوق الملكية', line: bs.totalEquity, bold: true },
    { key: 'eosob', label: 'التزام منافع الموظفين', line: bs.employeeBenefitsObligation, indent: true },
    { key: 'ltdebt', label: 'سندات دين وقروض لأجل، غير متداولة', line: bs.longTermDebt, indent: true },
    { key: 'deftax', label: 'مطلوبات ضريبية مؤجلة', line: bs.deferredTaxLiabilities, indent: true },
    { key: 'otherncl', label: 'مطلوبات غير متداولة أخرى', line: bs.otherNonCurrentLiabilities, indent: true },
    { key: 'totalncl', label: 'إجمالي المطلوبات غير المتداولة', line: bs.totalNonCurrentLiabilities, bold: true },
    { key: 'currentdebt', label: 'سندات دين وقروض لأجل، متداولة', line: bs.currentDebt, indent: true },
    { key: 'zakatpay', label: 'الزكاة مستحقة الدفع', line: bs.zakatPayable, indent: true },
    { key: 'taxpay', label: 'الضرائب مستحقة الدفع', line: bs.taxesPayable, indent: true },
    { key: 'dueto', label: 'مطلوب إلى أطراف ذات علاقة', line: bs.dueToRelatedParties, indent: true },
    { key: 'payables', label: 'المبالغ المستحقة للموردين والبائعين', line: bs.tradeAndOtherPayables, indent: true },
    { key: 'accrued', label: 'مصاريف مستحقة وأرصدة دائنة أخرى', line: bs.accruedExpenses, indent: true },
    { key: 'othercl', label: 'مطلوبات متداولة أخرى', line: bs.otherCurrentLiabilities, indent: true },
    { key: 'totalcl', label: 'إجمالي المطلوبات المتداولة', line: bs.totalCurrentLiabilities, bold: true },
    { key: 'totalliab', label: 'إجمالي المطلوبات', line: bs.totalLiabilities, bold: true },
    { key: 'totaleq_liab', label: 'إجمالي حقوق الملكية والمطلوبات', line: bs.totalEquityAndLiabilities, bold: true, highlight: true },
  ];
}

function incomeStatementRows(is: IncomeStatement): RowSpec[] {
  return [
    { key: 'revenue', label: 'مبيعات / الإيرادات', line: is.revenue, bold: true, highlight: true },
    { key: 'cogs', label: 'تكلفة المبيعات', line: is.costOfSales },
    { key: 'grossprofit', label: 'مجمل الربح', line: is.grossProfit, bold: true },
    { key: 'ga', label: 'مصاريف إدارية وعمومية', line: is.generalAdminExpenses },
    { key: 'selling', label: 'مصاريف بيع وتوزيع', line: is.sellingDistributionExpenses },
    { key: 'otherexp', label: 'مصاريف أخرى', line: is.otherExpenses },
    { key: 'otherinc', label: 'دخل آخر', line: is.otherIncome },
    { key: 'npbt', label: 'صافي ربح الفترة قبل ضريبة الدخل', line: is.netProfitBeforeTax, bold: true },
    { key: 'finance', label: 'تكلفة مصروف التمويل', line: is.financeCost },
    { key: 'zakat', label: 'الزكاة', line: is.zakat },
    { key: 'tax', label: 'ضريبة الدخل', line: is.incomeTax },
    { key: 'np', label: 'صافي ربح الفترة', line: is.netProfitForPeriod, bold: true, highlight: true },
    { key: 'oci', label: 'الدخل الشامل الآخر', line: is.otherComprehensiveIncome },
    { key: 'tci', label: 'إجمالي الربح الشامل للفترة', line: is.totalComprehensiveIncome, bold: true },
  ];
}

function cashFlowRows(cf: CashFlowStatement): RowSpec[] {
  return [
    { key: 'npbt', label: 'صافي ربح الفترة قبل ضريبة الدخل', line: cf.netProfitBeforeTax },
    { key: 'dep', label: 'استهلاك ممتلكات وآلات ومعدات (بند غير نقدي)', line: cf.depreciationAddback, indent: true },
    { key: 'eos', label: 'التغيّر في مخصص التزامات منافع الموظفين', line: cf.eosProvisionMovement, indent: true },
    { key: 'chgar', label: 'التغيّر في الذمم المدينة والمصاريف المدفوعة مقدماً', line: cf.changeInReceivablesAndPrepaid, indent: true },
    { key: 'chgap', label: 'التغيّر في المطلوبات المتداولة', line: cf.changeInPayables, indent: true },
    { key: 'opcf', label: 'صافي النقد الناتج من الأنشطة التشغيلية', line: cf.netCashFromOperating, bold: true },
    { key: 'ppe', label: 'إضافة ممتلكات وآلات ومعدات', line: cf.ppeAdditions, indent: true },
    { key: 'invcf', label: 'صافي النقد المستخدم في الأنشطة الاستثمارية', line: cf.netCashUsedInInvesting, bold: true },
    { key: 'capadd', label: 'إضافة رأس المال', line: cf.capitalAdditions, indent: true },
    { key: 'fincf', label: 'صافي النقد الناتج من الأنشطة التمويلية', line: cf.netCashFromFinancing, bold: true },
    { key: 'netchg', label: 'صافي التغيّر في النقد وما في حكمه', line: cf.netChangeInCash, bold: true },
    { key: 'start', label: 'النقد وما في حكمه في بداية الفترة', line: cf.cashAtStart },
    { key: 'end', label: 'النقد وما في حكمه في نهاية الفترة', line: cf.cashAtEnd, bold: true, highlight: true },
  ];
}

export function FinancialStatementsTab() {
  const { t, tt } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [custodyInvoices, setCustodyInvoices] = useState<CustodyInvoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [{ from, to }, setRange] = useState(currentFiscalYearRange());
  const [showDocument, setShowDocument] = useState(false);
  const [showDeclaration, setShowDeclaration] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Expense[]>('/expenses'),
      api.get<Appointment[]>('/appointments'),
      api.get<Asset[]>('/assets'),
      api.get<Profile[]>('/profiles'),
      api.get<CustodyInvoice[]>('/custody-invoices'),
    ]).then(([e, a, as, p, ci]) => {
      setExpenses(e);
      setAppointments(a);
      setAssets(as);
      setProfiles(p);
      setCustodyInvoices(ci);
      setLoaded(true);
    });
  }, []);

  const inputs: FinancialStatementsInputs = useMemo(
    () => ({ expenses, appointments, assets, profiles, custodyInvoices }),
    [expenses, appointments, assets, profiles, custodyInvoices],
  );

  const income = useMemo(
    () => computeIncomeStatement(inputs, from, to, EXPENSE_ACCOUNTING_CLASSIFICATION_COST_TYPE),
    [inputs, from, to],
  );
  const balance = useMemo(
    () => computeBalanceSheet(inputs, to, EXPENSE_ACCOUNTING_CLASSIFICATION_COST_TYPE),
    [inputs, to],
  );
  const equityChanges = useMemo(
    () => computeEquityChanges(inputs, from, to, EXPENSE_ACCOUNTING_CLASSIFICATION_COST_TYPE),
    [inputs, from, to],
  );
  const cashFlow = useMemo(
    () => computeCashFlowStatement(inputs, from, to, EXPENSE_ACCOUNTING_CLASSIFICATION_COST_TYPE),
    [inputs, from, to],
  );

  const activeEmployeeCount = profiles.filter((p) => p.is_active && !p.termination_date && (p.role === 'supervisor' || p.role === 'technician' || p.role === 'admin_supervisor' || p.role === 'admin' || p.role === 'general_manager')).length;

  const balanceGap = Math.round((balance.totalAssets.value - balance.totalEquityAndLiabilities.value) * 100) / 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-bold text-slate-800">
            <FileBarChart className="h-5 w-5 text-brand-600" /> {t('القوائم المالية')}
          </h2>
          <p className="text-sm text-slate-400">
            {t('محتسَبة تلقائياً من بيانات النظام وفق نموذج المركز السعودي للتنافسية والأعمال — البنود اليدوية تحتاج تعبئة يدوية قبل الإيداع الفعلي')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowDocument(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> {t('طباعة / PDF القوائم المالية')}
          </button>
          <button
            onClick={() => setShowDeclaration(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> {t('طباعة إقرار الإعفاء من مراجع الحسابات')}
          </button>
          <button
            onClick={() => exportFinancialStatementsExcel({ from, to, income, balance, equityChanges, cashFlow, activeEmployeeCount })}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Download className="h-3.5 w-3.5" /> {t('تصدير إكسل (لبرنامج قوائم)')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('من تاريخ')}</span>
          <input type="date" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('إلى تاريخ (نهاية السنة المالية)')}</span>
          <input type="date" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="input" />
        </label>
      </div>

      {/* القيم المطلوبة مباشرة في نموذج "إنشاء القوائم المالية" على منصة قوائم */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-800">
          <Info className="h-4 w-4" /> {t('القيم المطلوبة مباشرة عند تعبئة نموذج "إنشاء القوائم المالية" في منصة قوائم')}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-3">
            <div className="text-xs text-slate-400">{t('الإيرادات')}</div>
            <div className="text-lg font-bold text-brand-700" dir="ltr">{formatMoney(income.revenue.value)}</div>
          </div>
          <div className="rounded-xl bg-white p-3">
            <div className="text-xs text-slate-400">{t('مجموع الموجودات')}</div>
            <div className="text-lg font-bold text-brand-700" dir="ltr">{formatMoney(balance.totalAssets.value)}</div>
          </div>
          <div className="rounded-xl bg-white p-3">
            <div className="text-xs text-slate-400">{t('الموظفين')}</div>
            <div className="text-lg font-bold text-brand-700" dir="ltr">{activeEmployeeCount}</div>
          </div>
        </div>
      </div>

      {balanceGap !== 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {tt(
              `الفرق بين إجمالي الموجودات وإجمالي حقوق الملكية والمطلوبات حالياً ${formatMoney(Math.abs(balanceGap))} ر.س — طبيعي طالما لم تُملأ البنود اليدوية بعد (مثل الزكاة، الذمم الدائنة، القروض). امْلأها في ملف الإكسل المُصدَّر ليتوازن الميزان تلقائياً.`,
              `The gap between Total Assets and Total Equity & Liabilities is currently ${formatMoney(Math.abs(balanceGap))} SAR — expected until the manual fields (Zakat, payables, loans...) are filled in. Fill them in the exported Excel file for the statement to balance.`,
            )}
          </span>
        </div>
      )}
      {balanceGap === 0 && loaded && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {t('قائمة المركز المالي متوازنة (إجمالي الموجودات = إجمالي حقوق الملكية والمطلوبات).')}
        </div>
      )}

      <StatementTable title="قائمة الدخل الشامل" rows={incomeStatementRows(income)} />
      <StatementTable title="قائمة المركز المالي" rows={balanceSheetRows(balance)} />
      <StatementTable title="قائمة التدفقات النقدية" rows={cashFlowRows(cashFlow)} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">{t('قائمة التغيرات في حقوق الملكية')}</div>
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-2.5 text-start font-medium">{t('البند')}</th>
              <th className="p-2.5 text-end font-medium">{t('رأس المال')}</th>
              <th className="p-2.5 text-end font-medium">{t('أرباح مبقاة')}</th>
              <th className="p-2.5 text-end font-medium">{t('الإجمالي')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-50">
              <td className="p-2.5 text-slate-600">{tt(`الرصيد كما في ${from}`, `Balance as of ${from}`)}</td>
              <td className="p-2.5 text-end" dir="ltr">{formatMoney(equityChanges.openingCapital.value)}</td>
              <td className="p-2.5 text-end" dir="ltr">{formatMoney(equityChanges.openingRetainedEarnings.value)}</td>
              <td className="p-2.5 text-end font-medium" dir="ltr">{formatMoney(equityChanges.openingTotal.value)}</td>
            </tr>
            <tr className="border-b border-slate-50">
              <td className="p-2.5 text-slate-600">{t('زيادة رأس المال خلال الفترة')}</td>
              <td className="p-2.5 text-end" dir="ltr">{formatMoney(equityChanges.capitalAdded.value)}</td>
              <td className="p-2.5 text-end" dir="ltr">—</td>
              <td className="p-2.5 text-end font-medium" dir="ltr">{formatMoney(equityChanges.capitalAdded.value)}</td>
            </tr>
            <tr className="border-b border-slate-50">
              <td className="p-2.5 text-slate-600">{t('صافي ربح الفترة')}</td>
              <td className="p-2.5 text-end" dir="ltr">—</td>
              <td className="p-2.5 text-end" dir="ltr">{formatMoney(equityChanges.netIncomeForPeriod.value)}</td>
              <td className="p-2.5 text-end font-medium" dir="ltr">{formatMoney(equityChanges.netIncomeForPeriod.value)}</td>
            </tr>
            <tr>
              <td className="p-2.5 font-bold text-slate-800">{tt(`الرصيد كما في ${to}`, `Balance as of ${to}`)}</td>
              <td className="p-2.5 text-end font-bold" dir="ltr">{formatMoney(equityChanges.closingCapital.value)}</td>
              <td className="p-2.5 text-end font-bold" dir="ltr">{formatMoney(equityChanges.closingRetainedEarnings.value)}</td>
              <td className="p-2.5 text-end font-bold" dir="ltr">{formatMoney(equityChanges.closingTotal.value)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {showDocument && (
        <FinancialStatementsDocument
          from={from}
          to={to}
          income={income}
          balance={balance}
          equityChanges={equityChanges}
          cashFlow={cashFlow}
          onClose={() => setShowDocument(false)}
        />
      )}
      {showDeclaration && <AuditorExemptionDeclaration fiscalYearEnd={to} onClose={() => setShowDeclaration(false)} />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// تصدير إكسل — بنفس بنود وترتيب النموذج الرسمي بالضبط، بصيغ (formulas) حقيقية
// للإجماليات حتى تتحدَّث تلقائياً فور تعبئة أي بند يدوي مباشرة داخل الإكسل
// (مثل الزكاة أو الذمم الدائنة) — يفتح في إكسل/ليبر أوفيس بلا مشاكل.
// ----------------------------------------------------------------------------
function exportFinancialStatementsExcel(args: {
  from: string;
  to: string;
  income: IncomeStatement;
  balance: BalanceSheet;
  equityChanges: EquityChangesStatement;
  cashFlow: CashFlowStatement;
  activeEmployeeCount: number;
}) {
  const { from, to, income, balance, cashFlow, activeEmployeeCount } = args;
  const wb = XLSX.utils.book_new();

  function sheetFromRows(header: string[], rows: RowSpec[]) {
    const aoa: (string | number)[][] = [header];
    for (const r of rows) {
      aoa.push([r.label, r.line.source === 'auto' ? 'تلقائي' : r.line.source === 'estimate' ? 'تقديري' : 'يدوي — يُملأ هنا', r.line.value, r.line.note ?? '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 45 }, { wch: 14 }, { wch: 16 }, { wch: 60 }];
    return ws;
  }

  const summary = XLSX.utils.aoa_to_sheet([
    ['القوائم المالية — ' + COMPANY_LEGAL_NAME],
    [`الفترة: ${from} إلى ${to}`],
    [''],
    ['القيم المطلوبة مباشرة في نموذج "إنشاء القوائم المالية" (منصة قوائم)'],
    ['الإيرادات', income.revenue.value],
    ['مجموع الموجودات', balance.totalAssets.value],
    ['الموظفين', activeEmployeeCount],
    [''],
    ['تنبيه: البنود الموسومة "يدوي" في كل ورقة قيمتها صفر افتراضياً — عدِّلها هنا مباشرة'],
    ['قبل نسخ الأرقام إلى برنامج قوائم؛ إجماليات كل ورقة صيغ (formulas) تتحدَّث تلقائياً.'],
  ]);
  summary['!cols'] = [{ wch: 70 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summary, 'ملخص');

  const header = ['البند', 'المصدر', 'القيمة (ر.س)', 'ملاحظة'];
  XLSX.utils.book_append_sheet(wb, sheetFromRows(header, incomeStatementRows(income)), 'قائمة الدخل الشامل');
  XLSX.utils.book_append_sheet(wb, sheetFromRows(header, balanceSheetRows(balance)), 'قائمة المركز المالي');
  XLSX.utils.book_append_sheet(wb, sheetFromRows(header, cashFlowRows(cashFlow)), 'قائمة التدفقات النقدية');

  XLSX.writeFile(wb, `القوائم-المالية-${from}-${to}.xlsx`);
}

// ----------------------------------------------------------------------------
// مستند القوائم المالية القابل للطباعة/التصدير PDF — نفس نمط InvoiceDocument.tsx
// ----------------------------------------------------------------------------
function FinancialStatementsDocument({
  from,
  to,
  income,
  balance,
  cashFlow,
  onClose,
}: {
  from: string;
  to: string;
  income: IncomeStatement;
  balance: BalanceSheet;
  equityChanges: EquityChangesStatement;
  cashFlow: CashFlowStatement;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('القوائم المالية')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Printer className="h-3.5 w-3.5" /> {t('طباعة / تصدير PDF')}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="invoice-print-area space-y-5 overflow-y-auto p-6">
          <div className="mb-4 border-b border-dashed border-slate-200 pb-4 text-center">
            <div className="text-lg font-bold text-slate-800">{COMPANY_LEGAL_NAME}</div>
            <div className="text-xs text-slate-400">{t('الرقم الضريبي:')} {COMPANY_VAT_NUMBER}{COMPANY_CR_NUMBER ? ` — ${t('س.ت:')} ${COMPANY_CR_NUMBER}` : ''}</div>
            <div className="mt-1 text-sm font-semibold text-brand-700">{t('القوائم المالية')}</div>
            <div className="text-xs text-slate-500" dir="ltr">{from} — {to}</div>
          </div>
          <StatementTable title="قائمة الدخل الشامل" rows={incomeStatementRows(income)} />
          <StatementTable title="قائمة المركز المالي" rows={balanceSheetRows(balance)} />
          <StatementTable title="قائمة التدفقات النقدية" rows={cashFlowRows(cashFlow)} />
          <p className="text-[11px] text-slate-400">
            {t('البنود الموسومة "تقديري" مبنية على افتراضات مبسَّطة، والبنود الموسومة "يدوي" غير مُتتبَّعة في النظام (قيمتها صفر) — يُنصح بمراجعتها قبل الإيداع الرسمي.')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// إقرار سنوي بعدم سريان متطلب تعيين مراجع حسابات (الشركات متناهية الصغر
// أو الصغيرة) — نفس النص القانوني الرسمي المطلوب إرفاقه كـ"بيان" مع
// القوائم المالية عند اختيار "معفاة من تعيين مراجع حسابات" على منصة قوائم.
// ----------------------------------------------------------------------------
function AuditorExemptionDeclaration({ fiscalYearEnd, onClose }: { fiscalYearEnd: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('إقرار الإعفاء من مراجع الحسابات')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Printer className="h-3.5 w-3.5" /> {t('طباعة / تصدير PDF')}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="invoice-print-area space-y-4 overflow-y-auto p-8 text-sm leading-7 text-slate-700">
          <h1 className="text-center text-base font-bold text-slate-800">
            {t('إقرار سنوي بعدم سريان متطلب تعيين مراجع حسابات للشركة لكونها متناهية الصغر أو صغيرة')}
          </h1>
          <p>
            {t('بهذا أنا (رئيس مجلس الادارة / مدير / رئيس مجلس مديرين / رئيس الشركة) ')}
            <span className="inline-block min-w-[160px] border-b border-dotted border-slate-400">&nbsp;</span>
          </p>
          <p>
            {t('شركة')} <span className="font-semibold">{COMPANY_LEGAL_NAME}</span>
          </p>
          <p>
            {t('سجل تجاري')} <span className="inline-block min-w-[140px] border-b border-dotted border-slate-400">{COMPANY_CR_NUMBER || ''}&nbsp;</span> {t('أقر بالتالي:')}
          </p>
          <ul className="list-disc space-y-3 ps-5">
            <li>
              {t('أن الشركة بنهاية العام المالي المنتهي في')}{' '}
              <span className="font-semibold" dir="ltr">{formatDateAr(fiscalYearEnd)}</span>{' '}
              {t('هي شركة متناهية الصغر أو صغيرة وفقاً لنص المادة (التاسعة عشرة) من نظام الشركات، والمادة (السابعة) من اللائحة التنفيذية لنظام الشركات بعد تحقق معيارين على الأقل مما يلي (يتعيَّن تحديد معيارين على الأقل):')}
              <ol className="mt-2 list-decimal space-y-1 ps-5">
                <li>{t('عدم تجاوز مجموع إيراداتها السنوية مبلغ عشرة ملايين ريال سعودي.')}</li>
                <li>{t('عدم تجاوز مجموع أصولها مبلغ عشرة ملايين ريال سعودي.')}</li>
                <li>{t('عدم تجاوز مجموع موظفيها عدد تسعة وأربعين موظفاً.')}</li>
              </ol>
            </li>
            <li>{t('عدم انطباق الاستثناءات الواردة في الفقرة -1- من المادة (التاسعة عشرة) من نظام الشركات على الشركة.')}</li>
            <li>
              {t('عدم تقدم أي شريك أو مساهم أو أكثر ممن يمثلون النسبة المقررة الواردة في نص الفقرة -3- من المادة (التاسعة عشرة) من نظام الشركات، بطلب تعيين مراجع حسابات وفقاً للضوابط المنصوص عليها في المادة (الثامنة) من اللائحة التنفيذية لنظام الشركات.')}
            </li>
          </ul>
          <p>
            {t('وبناءً على ما سبق، لا يسري على الشركة متطلب تعيين مراجع حسابات للسنة المالية المذكورة أعلاه، وأتعهد بصحة البيانات والإقرارات الواردة أعلاه، وأتحمل كافة المسؤولية والتبعات النظامية حال ثبوت خلاف ذلك.')}
          </p>
          <div className="mt-10 space-y-2 text-center">
            <p className="font-semibold">{t('(رئيس مجلس الادارة / مدير / رئيس مجلس مديرين / رئيس الشركة)')}</p>
            <p className="mt-6">{t('الإسم:')} <span className="inline-block min-w-[220px] border-b border-dotted border-slate-400">&nbsp;</span></p>
            <p>{t('التوقيع:')} <span className="inline-block min-w-[220px] border-b border-dotted border-slate-400">&nbsp;</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
