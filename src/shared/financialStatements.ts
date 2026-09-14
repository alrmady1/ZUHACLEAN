// القوائم المالية الأربع المعيارية (مركز مالي، دخل شامل، تغيرات حقوق
// الملكية، تدفقات نقدية) — بنفس بنود وترتيب وتسميات النموذج الرسمي الذي
// زوَّدنا به صاحب النظام حرفياً ("القوائم المالية (نموذج مفرغ).docx"،
// المعتمَد لتعبئته ورفعه كملف PDF مرفق على منصة قوائم التابعة للمركز
// السعودي للتنافسية والأعمال — انظر docs/financial-statements.md).
//
// كل بند StatementLine يحمل مصدره صراحة:
//  - 'auto'     : محتسَب بالكامل من بيانات النظام (دقيق، لا حاجة لتدخل).
//  - 'estimate' : محتسَب من بيانات النظام لكن بافتراض مبسَّط يستحق المراجعة
//                 (مثال: النقدية المشتقة من حركة المصروفات/الإيرادات بدل
//                 كشف حساب بنكي فعلي، أو مخصص مكافأة نهاية الخدمة).
//  - 'manual'   : غير مُتتبَّع في النظام إطلاقاً (قروض، ذمم دائنة للموردين،
//                 الزكاة...) — قيمته صفر افتراضياً، يُدخلها المستخدم يدوياً
//                 في الواجهة قبل الطباعة/التصدير النهائي.
//
// الدالتان الرئيسيتان بلا أي اعتماد على المتصفح أو الخادم (عميل وخادم
// كلاهما يمكنهما استدعاؤهما) — نفس نمط src/shared/depreciation.ts تماماً.
import type { Appointment, Asset, Expense, Profile, CustodyInvoice, ExpenseAccountingClassification } from './types.js';
import { computeAssetDepreciation } from './depreciation.js';
import {
  CUSTODY_CATEGORY_NAME,
  ADVANCE_CATEGORY_NAME,
  SALARY_CATEGORY_NAME,
} from './types.js';

export type StatementLineSource = 'auto' | 'estimate' | 'manual';

export interface StatementLine {
  value: number;
  source: StatementLineSource;
  note?: string;
}

function line(value: number, source: StatementLineSource = 'auto', note?: string): StatementLine {
  return { value: Math.round(value * 100) / 100, source, note };
}

function manual(note?: string): StatementLine {
  return { value: 0, source: 'manual', note };
}

export interface FinancialStatementsInputs {
  expenses: Expense[];
  appointments: Appointment[];
  assets: Asset[];
  profiles: Profile[];
  custodyInvoices: CustodyInvoice[];
}

// --------------------------------------------------------------------------
// مساعدات عامة
// --------------------------------------------------------------------------

// الإيراد المحاسبي (أساس الاستحقاق) لفترة [from, to] — مبلغ المواعيد
// "مكتملة" المجدولة خلال الفترة، نفس تعريف "إجمالي المبيعات" تماماً
// المُستخدَم أصلاً في صفحة المبيعات (Sales.tsx: totalSales) حتى يبقى
// الرقمان متطابقين في كل مكان بالنظام.
function revenueForPeriod(appointments: Appointment[], from: string, to: string): number {
  return appointments
    .filter((a) => a.status === 'completed' && a.scheduled_at.slice(0, 10) >= from && a.scheduled_at.slice(0, 10) <= to)
    .reduce((sum, a) => sum + a.amount, 0);
}

// الإيراد المحصَّل فعلياً (أساس نقدي) حتى تاريخ معيَّن — كل الدفعات
// المسجَّلة على كل المواعيد بصرف النظر عن حالة الموعد نفسه.
function cashCollectedUpTo(appointments: Appointment[], asOfDate: string): number {
  let total = 0;
  for (const a of appointments) {
    for (const p of a.payments) {
      if (p.recorded_at.slice(0, 10) <= asOfDate) total += p.amount;
    }
  }
  return total;
}

// الذمم المدينة التجارية كما في تاريخ معيَّن — المتبقي من كل المواعيد
// المجدولة حتى ذلك التاريخ (غير الملغاة)، بصرف النظر عن حالتها الحالية.
function receivablesAsOf(appointments: Appointment[], asOfDate: string): number {
  return appointments
    .filter((a) => a.status !== 'cancelled' && a.scheduled_at.slice(0, 10) <= asOfDate)
    .reduce((sum, a) => sum + a.remaining_amount, 0);
}

// تصنيف كل Expense إلى: مصروف عهدة "أُعطيت" (لا يُحتسَب مصروفاً)، سلفية
// "أُعطيت" (كذلك)، مصروف مرتبط بعهدة أُنفِقت فعلاً (paid_via_custody —
// يُحتسَب مصروفاً حقيقياً حسب تصنيفه)، أو مصروف عادي.
function isCustodyGiven(e: Expense): boolean {
  return e.category === CUSTODY_CATEGORY_NAME && !e.paid_via_custody;
}
function isAdvanceGiven(e: Expense): boolean {
  return e.category === ADVANCE_CATEGORY_NAME;
}
function costTypeOf(
  e: Expense,
  costTypeMap: Record<ExpenseAccountingClassification, 'capex' | 'opex' | 'balance_sheet'>,
): 'capex' | 'opex' | 'balance_sheet' | undefined {
  return e.accounting_classification ? costTypeMap[e.accounting_classification] : undefined;
}

// --------------------------------------------------------------------------
// قائمة الدخل الشامل — لفترة [from, to] (YYYY-MM-DD شاملة الطرفين)
// --------------------------------------------------------------------------
export interface IncomeStatement {
  revenue: StatementLine;
  costOfSales: StatementLine; // مواد خامات ومستهلكات + أجور ومنافع الموظفين (عمالة ميدانية مباشرة)
  grossProfit: StatementLine;
  generalAdminExpenses: StatementLine; // مصاريف عمومية وإدارية + تشغيلية + منافع ومرافق
  sellingDistributionExpenses: StatementLine; // غير مُتتبَّعة بندًا مستقلاً — صفر افتراضياً
  otherExpenses: StatementLine;
  otherIncome: StatementLine; // إيرادات متنوعة مسجَّلة كـ"مرتجع" (غير المبيعات)
  netProfitBeforeTax: StatementLine;
  financeCost: StatementLine;
  zakat: StatementLine;
  incomeTax: StatementLine;
  netProfitForPeriod: StatementLine;
  otherComprehensiveIncome: StatementLine;
  totalComprehensiveIncome: StatementLine;
}

export function computeIncomeStatement(
  inputs: FinancialStatementsInputs,
  from: string,
  to: string,
  costTypeMap: Record<ExpenseAccountingClassification, 'capex' | 'opex' | 'balance_sheet'>,
): IncomeStatement {
  const periodExpenses = inputs.expenses.filter((e) => e.date >= from && e.date <= to);

  const revenue = revenueForPeriod(inputs.appointments, from, to);

  let materialsAndWages = 0;
  let adminOperatingUtilities = 0;
  let otherIncomeTotal = 0;

  for (const e of periodExpenses) {
    if (isCustodyGiven(e) || isAdvanceGiven(e)) continue; // حركة أصول، ليست مصروف فترة
    const costType = costTypeOf(e, costTypeMap);
    if (costType === 'capex' || costType === 'balance_sheet') continue; // شراء أصل، ليس مصروف فترة

    if (e.entry_type === 'income') {
      if (e.income_type !== 'additional_capital') otherIncomeTotal += e.amount; // زيادة رأس المال ليست إيراداً
      continue;
    }

    // مواد خامات + أجور الموظفين تُعامَل كـ"تكلفة مبيعات" (عمالة ميدانية
    // مباشرة لخدمة تُقدَّم للعميل مباشرة) — افتراض معقول لشركة خدمات؛ إن
    // كان لدى الشركة موظفون إداريون بأجور منفصلة يُنصَح بفصلها يدوياً لاحقاً.
    if (e.accounting_classification === 'raw_materials' || e.accounting_classification === 'employee_wages' || e.category === SALARY_CATEGORY_NAME) {
      materialsAndWages += e.amount;
    } else {
      // كل ما تبقى (عمومية وإدارية/تشغيلية/منافع ومرافق/غير مصنَّف) يُحتسَب
      // ضمن "مصاريف إدارية وعمومية".
      adminOperatingUtilities += e.amount;
    }
  }

  // إهلاك الأصول الثابتة خلال الفترة — الفرق بين الإهلاك المتراكم في نهاية
  // الفترة وبدايتها لكل أصل غير مشطوب قبل بداية الفترة.
  let depreciationForPeriod = 0;
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);
  for (const asset of inputs.assets) {
    const purchase = new Date(`${asset.purchase_date}T00:00:00`);
    if (purchase > toDate) continue;
    if (asset.scrapped_at && new Date(asset.scrapped_at) < fromDate) continue;
    const depAtEnd = computeAssetDepreciation(asset.purchase_price, asset.purchase_date, asset.useful_life_years, asset.salvage_value, toDate)
      .accumulated_depreciation;
    const depAtStart = computeAssetDepreciation(
      asset.purchase_price,
      asset.purchase_date,
      asset.useful_life_years,
      asset.salvage_value,
      new Date(fromDate.getTime() - 1),
    ).accumulated_depreciation;
    depreciationForPeriod += Math.max(depAtEnd - depAtStart, 0);
  }

  const costOfSales = materialsAndWages;
  const grossProfit = revenue - costOfSales;
  const netProfitBeforeTax = grossProfit - adminOperatingUtilities - depreciationForPeriod + otherIncomeTotal;

  return {
    revenue: line(revenue, 'auto', 'مبلغ المواعيد المكتملة ضمن الفترة (أساس الاستحقاق) — نفس رقم "إجمالي المبيعات" في صفحة المبيعات'),
    costOfSales: line(costOfSales, 'auto', 'مواد خامات ومستهلكات + أجور ومنافع الموظفين (افتراض: عمالة ميدانية مباشرة)'),
    grossProfit: line(grossProfit),
    generalAdminExpenses: line(
      adminOperatingUtilities + depreciationForPeriod,
      'auto',
      'مصاريف عمومية وإدارية + تشغيلية + منافع ومرافق + إهلاك الأصول الثابتة للفترة',
    ),
    sellingDistributionExpenses: manual('غير مُتتبَّعة كبند مستقل في النظام'),
    otherExpenses: manual(),
    otherIncome: line(otherIncomeTotal, 'auto', 'إيرادات مسجَّلة كـ"مرتجع" — غير إيراد المبيعات'),
    netProfitBeforeTax: line(netProfitBeforeTax),
    financeCost: manual('لا توجد قروض/تمويل مُتتبَّع في النظام'),
    zakat: manual('يحتاج احتساباً متخصصاً وفق أنظمة هيئة الزكاة والضريبة والجمارك (زكاتي)'),
    incomeTax: manual(),
    netProfitForPeriod: line(netProfitBeforeTax),
    otherComprehensiveIncome: line(0),
    totalComprehensiveIncome: line(netProfitBeforeTax),
  };
}

// --------------------------------------------------------------------------
// قائمة المركز المالي — كما في تاريخ معيَّن (asOfDate)
// --------------------------------------------------------------------------
export interface BalanceSheet {
  // الموجودات غير المتداولة
  propertyPlantEquipment: StatementLine;
  intangibleAssets: StatementLine;
  investmentProperty: StatementLine;
  equityMethodInvestments: StatementLine;
  otherNonCurrentAssets: StatementLine;
  totalNonCurrentAssets: StatementLine;
  // الموجودات المتداولة
  prepaidAndOtherDebitBalances: StatementLine; // سلف وعهد الموظفين
  tradeReceivables: StatementLine;
  cashAndEquivalents: StatementLine;
  inventory: StatementLine;
  fvInvestments: StatementLine;
  otherCurrentAssets: StatementLine;
  dueFromRelatedParties: StatementLine;
  totalCurrentAssets: StatementLine;
  totalAssets: StatementLine;
  // حقوق الملكية
  capital: StatementLine;
  statutoryReserve: StatementLine;
  retainedEarnings: StatementLine;
  otherEquityItems: StatementLine;
  parentEquity: StatementLine;
  nonControllingInterest: StatementLine;
  totalEquity: StatementLine;
  // المطلوبات غير المتداولة
  employeeBenefitsObligation: StatementLine;
  longTermDebt: StatementLine;
  deferredTaxLiabilities: StatementLine;
  otherNonCurrentLiabilities: StatementLine;
  totalNonCurrentLiabilities: StatementLine;
  // المطلوبات المتداولة
  currentDebt: StatementLine;
  zakatPayable: StatementLine;
  taxesPayable: StatementLine;
  dueToRelatedParties: StatementLine;
  tradeAndOtherPayables: StatementLine;
  accruedExpenses: StatementLine;
  otherCurrentLiabilities: StatementLine;
  totalCurrentLiabilities: StatementLine;
  totalLiabilities: StatementLine;
  totalEquityAndLiabilities: StatementLine;
  // للمراجعة فقط — لا يُطبَع كبند مستقل بالضرورة
  balances: boolean;
  differenceFromAssets: number;
}

// تقدير مخصص مكافأة نهاية الخدمة — نفس صيغة المادة ٨٤ من نظام العمل
// السعودي (نصف شهر عن كل سنة من أول ٥ سنوات، شهر كامل عمّا بعدها)
// المُطبَّقة فعلياً عند إنهاء عقد موظف (انظر computeEndOfServiceGratuity في
// server/routes/api.ts) — هنا "كأن الجميع أُنهيَ عقدهم اليوم" لكل موظف
// نشط لديه راتب شهري وتاريخ تعيين مضبوطَين، كمخصص محاسبي تقديري.
function estimateEndOfServiceProvision(profiles: Profile[], asOfDate: Date): number {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  let total = 0;
  for (const p of profiles) {
    if (!p.is_active || p.termination_date || !p.hire_date || !p.monthly_salary) continue;
    const years = Math.max(0, (asOfDate.getTime() - new Date(p.hire_date).getTime()) / msPerYear);
    const first5 = Math.min(years, 5);
    const beyond5 = Math.max(years - 5, 0);
    total += (first5 * 0.5 + beyond5 * 1) * p.monthly_salary;
  }
  return total;
}

export function computeBalanceSheet(
  inputs: FinancialStatementsInputs,
  asOfDate: string,
  costTypeMap: Record<ExpenseAccountingClassification, 'capex' | 'opex' | 'balance_sheet'>,
): BalanceSheet {
  const upToDate = inputs.expenses.filter((e) => e.date <= asOfDate);
  const asOf = new Date(`${asOfDate}T23:59:59`);

  let capitalInjected = 0;
  let otherIncomeAllTime = 0;
  let cashOutflows = 0; // كل المصروفات باستثناء ما دُفع من عهدة سبق خصمها من النقدية أصلاً
  let custodyGiven = 0;
  let custodySpent = 0;
  let advanceGiven = 0;
  let advanceSettled = 0;
  let capexViaExpense = 0;

  for (const e of upToDate) {
    if (e.entry_type === 'income') {
      if (e.income_type === 'additional_capital') capitalInjected += e.amount;
      else otherIncomeAllTime += e.amount;
      continue;
    }
    if (isCustodyGiven(e)) {
      custodyGiven += e.amount;
      cashOutflows += e.amount;
      continue;
    }
    if (e.paid_via_custody) {
      // أُنفقت من عهدة سبق خصم كامل مبلغها من النقدية عند صرفها — لا تُخصَم
      // مجدداً هنا، لكنها تُقيَّد ضمن "عهدة مصروفة" لتخفيض رصيد العهدة.
      custodySpent += e.amount;
      continue;
    }
    if (isAdvanceGiven(e)) {
      advanceGiven += e.amount;
      advanceSettled += e.advance_settled_amount ?? 0;
      cashOutflows += e.amount;
      continue;
    }
    const costType = costTypeOf(e, costTypeMap);
    if (costType === 'capex') capexViaExpense += e.amount;
    cashOutflows += e.amount;
  }

  let assetPurchasesFormal = 0;
  let ppeNetBookValue = 0;
  for (const asset of inputs.assets) {
    if (new Date(`${asset.purchase_date}T00:00:00`) > asOf) continue;
    assetPurchasesFormal += asset.purchase_price;
    if (asset.status !== 'scrapped') {
      ppeNetBookValue += computeAssetDepreciation(
        asset.purchase_price,
        asset.purchase_date,
        asset.useful_life_years,
        asset.salvage_value,
        asset.scrapped_at ? new Date(asset.scrapped_at) : asOf,
      ).book_value;
    }
  }

  const cashCollected = cashCollectedUpTo(inputs.appointments, asOfDate);
  const cashEstimate = capitalInjected + cashCollected + otherIncomeAllTime - cashOutflows - assetPurchasesFormal;
  const receivables = receivablesAsOf(inputs.appointments, asOfDate);
  const custodyBalance = Math.max(custodyGiven - custodySpent, 0);
  const advanceBalance = Math.max(advanceGiven - advanceSettled, 0);
  const eosProvision = estimateEndOfServiceProvision(inputs.profiles, asOf);

  const totalNonCurrentAssets = ppeNetBookValue;
  const totalCurrentAssets = custodyBalance + advanceBalance + receivables + cashEstimate + capexViaExpense;
  const totalAssets = totalNonCurrentAssets + totalCurrentAssets;

  const totalNonCurrentLiabilities = eosProvision;
  const totalCurrentLiabilities = 0;
  const totalLiabilities = totalNonCurrentLiabilities + totalCurrentLiabilities;

  const totalEquity = totalAssets - totalLiabilities;
  const retainedEarnings = totalEquity - capitalInjected;

  return {
    propertyPlantEquipment: line(ppeNetBookValue, 'auto', 'صافي القيمة الدفترية لأصول وحدة الجرد والأصول الثابتة (المحاسبة ← الجرد)'),
    intangibleAssets: manual(),
    investmentProperty: manual(),
    equityMethodInvestments: manual(),
    otherNonCurrentAssets: manual(),
    totalNonCurrentAssets: line(totalNonCurrentAssets),
    prepaidAndOtherDebitBalances: line(custodyBalance + advanceBalance, 'auto', 'رصيد العهد + سلف الموظفين غير المسدَّدة'),
    tradeReceivables: line(receivables, 'auto', 'المتبقي من مبالغ المواعيد غير المحصَّلة بالكامل'),
    cashAndEquivalents: line(
      cashEstimate,
      'estimate',
      'تقدير آلي من حركة الإيرادات المحصَّلة والمصروفات المدفوعة — يُنصح بمطابقته مع كشف الحساب البنكي والصندوق الفعليين',
    ),
    inventory: manual('لا يتتبع النظام مخزون المواد الاستهلاكية'),
    fvInvestments: manual(),
    otherCurrentAssets: line(capexViaExpense, 'auto', 'مصروفات سُجِّلت بتصنيف "تأسيسي" عبر نموذج المصروفات العام (غير مرتبطة بوحدة الجرد)'),
    dueFromRelatedParties: manual(),
    totalCurrentAssets: line(totalCurrentAssets),
    totalAssets: line(totalAssets),
    capital: line(capitalInjected, 'auto', 'إجمالي إيرادات "زيادة رأس مال" المسجَّلة في المصروفات'),
    statutoryReserve: manual('يُحتسَب عادة كنسبة من صافي الربح السنوي وفق نظام الشركات — يحتاج مراجعة محاسب'),
    retainedEarnings: line(retainedEarnings, 'estimate', 'الفرق المتبقي لموازنة القائمة (إجمالي الموجودات − إجمالي المطلوبات − رأس المال) — راجع قائمة الدخل للتفاصيل'),
    otherEquityItems: manual(),
    parentEquity: line(totalEquity),
    nonControllingInterest: line(0, 'auto', 'لا ينطبق — لا توجد شركات تابعة'),
    totalEquity: line(totalEquity),
    employeeBenefitsObligation: line(
      eosProvision,
      'estimate',
      'مخصص تقديري لمكافأة نهاية الخدمة لكل موظف نشط (كأن عقده أُنهي اليوم) وفق المادة ٨٤ من نظام العمل — تقدير مبسَّط',
    ),
    longTermDebt: manual('لا توجد قروض مُتتبَّعة في النظام'),
    deferredTaxLiabilities: manual(),
    otherNonCurrentLiabilities: manual(),
    totalNonCurrentLiabilities: line(totalNonCurrentLiabilities),
    currentDebt: manual(),
    zakatPayable: manual('يحتاج احتساباً متخصصاً وفق أنظمة هيئة الزكاة والضريبة والجمارك (زكاتي)'),
    taxesPayable: manual(),
    dueToRelatedParties: manual(),
    tradeAndOtherPayables: manual('لا يتتبع النظام مبالغ مستحقة لموردين — كل مصروف يُسجَّل كمدفوع فوراً'),
    accruedExpenses: manual(),
    otherCurrentLiabilities: manual(),
    totalCurrentLiabilities: line(totalCurrentLiabilities),
    totalLiabilities: line(totalLiabilities),
    totalEquityAndLiabilities: line(totalEquity + totalLiabilities),
    balances: true,
    differenceFromAssets: 0,
  };
}

export interface EquityChangesStatement {
  openingCapital: StatementLine;
  openingReserve: StatementLine;
  openingRetainedEarnings: StatementLine;
  openingTotal: StatementLine;
  capitalAdded: StatementLine;
  netIncomeForPeriod: StatementLine;
  closingCapital: StatementLine;
  closingReserve: StatementLine;
  closingRetainedEarnings: StatementLine;
  closingTotal: StatementLine;
}

export function computeEquityChanges(
  inputs: FinancialStatementsInputs,
  from: string,
  to: string,
  costTypeMap: Record<ExpenseAccountingClassification, 'capex' | 'opex' | 'balance_sheet'>,
): EquityChangesStatement {
  const dayBeforeFrom = new Date(`${from}T00:00:00`);
  dayBeforeFrom.setDate(dayBeforeFrom.getDate() - 1);
  const openingDate = dayBeforeFrom.toISOString().slice(0, 10);

  const opening = computeBalanceSheet(inputs, openingDate, costTypeMap);
  const closing = computeBalanceSheet(inputs, to, costTypeMap);
  const periodIncome = computeIncomeStatement(inputs, from, to, costTypeMap);

  const capitalAdded = closing.capital.value - opening.capital.value;

  return {
    openingCapital: line(opening.capital.value, opening.capital.source),
    openingReserve: manual(),
    openingRetainedEarnings: line(opening.retainedEarnings.value, 'estimate'),
    openingTotal: line(opening.totalEquity.value, 'estimate'),
    capitalAdded: line(capitalAdded, 'auto', 'زيادة رأس المال المسجَّلة خلال الفترة'),
    netIncomeForPeriod: line(periodIncome.netProfitForPeriod.value),
    closingCapital: line(closing.capital.value, closing.capital.source),
    closingReserve: manual(),
    closingRetainedEarnings: line(closing.retainedEarnings.value, 'estimate'),
    closingTotal: line(closing.totalEquity.value, 'estimate'),
  };
}

export interface CashFlowStatement {
  netProfitBeforeTax: StatementLine;
  depreciationAddback: StatementLine;
  eosProvisionMovement: StatementLine;
  changeInReceivablesAndPrepaid: StatementLine;
  changeInPayables: StatementLine;
  netCashFromOperating: StatementLine;
  ppeAdditions: StatementLine;
  netCashUsedInInvesting: StatementLine;
  capitalAdditions: StatementLine;
  netCashFromFinancing: StatementLine;
  netChangeInCash: StatementLine;
  cashAtStart: StatementLine;
  cashAtEnd: StatementLine;
}

export function computeCashFlowStatement(
  inputs: FinancialStatementsInputs,
  from: string,
  to: string,
  costTypeMap: Record<ExpenseAccountingClassification, 'capex' | 'opex' | 'balance_sheet'>,
): CashFlowStatement {
  const dayBeforeFrom = new Date(`${from}T00:00:00`);
  dayBeforeFrom.setDate(dayBeforeFrom.getDate() - 1);
  const openingDate = dayBeforeFrom.toISOString().slice(0, 10);

  const income = computeIncomeStatement(inputs, from, to, costTypeMap);
  const opening = computeBalanceSheet(inputs, openingDate, costTypeMap);
  const closing = computeBalanceSheet(inputs, to, costTypeMap);

  // إعادة احتساب إهلاك الفترة وحدها (نفس منطق computeIncomeStatement
  // الداخلي) لعرضها كبند تعديل منفصل في التدفقات التشغيلية.
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);
  let depreciationForPeriod = 0;
  for (const asset of inputs.assets) {
    const purchase = new Date(`${asset.purchase_date}T00:00:00`);
    if (purchase > toDate) continue;
    if (asset.scrapped_at && new Date(asset.scrapped_at) < fromDate) continue;
    const depAtEnd = computeAssetDepreciation(asset.purchase_price, asset.purchase_date, asset.useful_life_years, asset.salvage_value, toDate)
      .accumulated_depreciation;
    const depAtStart = computeAssetDepreciation(
      asset.purchase_price,
      asset.purchase_date,
      asset.useful_life_years,
      asset.salvage_value,
      new Date(fromDate.getTime() - 1),
    ).accumulated_depreciation;
    depreciationForPeriod += Math.max(depAtEnd - depAtStart, 0);
  }

  const eosMovement = closing.employeeBenefitsObligation.value - opening.employeeBenefitsObligation.value;
  const changeInReceivablesAndPrepaid =
    opening.tradeReceivables.value +
    opening.prepaidAndOtherDebitBalances.value -
    (closing.tradeReceivables.value + closing.prepaidAndOtherDebitBalances.value);
  const changeInPayables = 0; // لا مطلوبات متداولة مُتتبَّعة تتغيَّر

  const netCashFromOperating =
    income.netProfitBeforeTax.value + depreciationForPeriod + eosMovement + changeInReceivablesAndPrepaid + changeInPayables;

  const ppeAdditions = inputs.assets
    .filter((a) => a.purchase_date >= from && a.purchase_date <= to)
    .reduce((sum, a) => sum + a.purchase_price, 0);
  const netCashUsedInInvesting = -ppeAdditions;

  const capitalAdditions = closing.capital.value - opening.capital.value;
  const netCashFromFinancing = capitalAdditions;

  const netChangeInCash = netCashFromOperating + netCashUsedInInvesting + netCashFromFinancing;

  return {
    netProfitBeforeTax: line(income.netProfitBeforeTax.value),
    depreciationAddback: line(depreciationForPeriod, 'auto', 'بند غير نقدي — يُضاف مجدداً لصافي الربح'),
    eosProvisionMovement: line(eosMovement, 'estimate'),
    changeInReceivablesAndPrepaid: line(changeInReceivablesAndPrepaid, 'estimate'),
    changeInPayables: line(changeInPayables, 'manual', 'لا مطلوبات متداولة مُتتبَّعة في النظام'),
    netCashFromOperating: line(netCashFromOperating, 'estimate'),
    ppeAdditions: line(-ppeAdditions, 'auto', 'مشتريات أصول ثابتة جديدة خلال الفترة (وحدة الجرد)'),
    netCashUsedInInvesting: line(netCashUsedInInvesting, 'auto'),
    capitalAdditions: line(capitalAdditions, 'auto'),
    netCashFromFinancing: line(netCashFromFinancing, 'auto'),
    netChangeInCash: line(netChangeInCash, 'estimate'),
    cashAtStart: line(opening.cashAndEquivalents.value, 'estimate'),
    cashAtEnd: line(closing.cashAndEquivalents.value, 'estimate'),
  };
}
