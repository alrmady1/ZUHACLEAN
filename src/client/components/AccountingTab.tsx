import { useEffect, useState } from 'react';
import { HandCoins, Wallet, Percent } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, CustodyInvoice } from '../../shared/types.js';
import { ADVANCE_CATEGORY_NAME, CUSTODY_CATEGORY_NAME, ADVANCE_DEDUCTION_MODE_LABELS_AR } from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

// نفس شكل GET /commission-report (فقط الحقول المستخدَمة هنا) — انظر
// computeCommissionReport في src/server/routes/api.ts. company_revenue
// وconfig.base_target يحدّدان معاً هل تحقَّق مستهدف الشركة هذا الشهر —
// المستهدف هنا مستهدف الشركة ككل وليس مستهدفاً شخصياً للمشرف.
interface CommissionReportLite {
  company_revenue: number;
  config: { base_target: number };
  supervisors: { profile_id: string; commission_due: number; personal_revenue: number; share_percent: number }[];
}

// تبويب "المحاسبة" — عرض ذاتي (لا يعدّل شيئاً) لسلفيات المستخدم الحالي،
// يظهر للفني الميداني (داخل TechnicianPortal.tsx) والمشرف الميداني (داخل
// Dashboard.tsx) — بجوار تبويب "المعلومات الشخصية". لمن هو مشرف ميداني
// تحديداً (showSupervisorExtras) تُعرَض أيضاً تفاصيل العهدة وعمولة الشهر
// الحالي: إن تحقَّق مستهدف الشركة تُعرَض العمولة المستحقة كمبلغ فقط (بلا
// نسبة)، وإلا يُعرَض المتبقي من المبيعات للوصول إلى المستهدف بدلاً منها.
export default function AccountingTab({ showSupervisorExtras }: { showSupervisorExtras: boolean }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [custodyInvoices, setCustodyInvoices] = useState<CustodyInvoice[]>([]);
  const [commissionReport, setCommissionReport] = useState<CommissionReportLite | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<Expense[]>('/expenses').then(setExpenses);
    if (showSupervisorExtras) {
      api.get<CustodyInvoice[]>('/custody-invoices').then(setCustodyInvoices);
      const month = new Date().toISOString().slice(0, 7);
      api.get<CommissionReportLite>(`/commission-report?month=${month}`).then(setCommissionReport);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, showSupervisorExtras]);

  if (!user) return null;

  const myAdvances = expenses.filter((e) => e.category === ADVANCE_CATEGORY_NAME && e.custody_holder_id === user.id);
  const custodyGiven = expenses
    .filter((e) => e.category === CUSTODY_CATEGORY_NAME && e.custody_holder_id === user.id)
    .reduce((s, e) => s + e.amount, 0);
  const custodySpent = custodyInvoices.filter((i) => i.custody_holder_id === user.id).reduce((s, i) => s + i.amount, 0);
  const custodyRemaining = custodyGiven - custodySpent;
  const commissionRow = commissionReport?.supervisors.find((s) => s.profile_id === user.id);
  // المستهدف هنا مستهدف الشركة ككل (config.base_target) وليس مستهدفاً
  // شخصياً للمشرف — نفس الشرط الذي يفتح مجمّع العمولات أصلاً في
  // computeCommissionReport (excess = company_revenue - base_target).
  const targetAchieved = commissionReport ? commissionReport.company_revenue >= commissionReport.config.base_target : false;
  const remainingToTarget = commissionReport ? Math.max(0, commissionReport.config.base_target - commissionReport.company_revenue) : 0;

  return (
    <div className="space-y-5">
      {/* السلفيات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <HandCoins className="h-4 w-4 text-brand-600" /> {t('السلفيات')}
        </h2>
        {myAdvances.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {myAdvances.map((a) => {
              const remaining = Math.max(a.amount - (a.advance_settled_amount ?? 0), 0);
              const scheduled = a.advance_deduction_mode && a.advance_deduction_mode !== 'none';
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <div className="font-medium text-slate-700">{formatMoney(a.amount)}</div>
                    <div className="text-xs text-slate-400">
                      {formatDateAr(a.date)}
                      {scheduled && ` — ${t(ADVANCE_DEDUCTION_MODE_LABELS_AR[a.advance_deduction_mode!])}`}
                    </div>
                  </div>
                  {scheduled ? (
                    <span className={`text-xs font-semibold ${remaining > 0.005 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {remaining > 0.005 ? `${t('متبقٍ')} ${formatMoney(remaining)}` : t('مسدَّدة بالكامل')}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">{t('بلا استقطاع مجدوَل')}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t('لا توجد سلفيات مسجَّلة')}</p>
        )}
      </div>

      {showSupervisorExtras && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* العهدة */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Wallet className="h-4 w-4 text-brand-600" /> {t('العهدة')}
            </h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[11px] text-slate-400">{t('إجمالي العهدة')}</div>
                <div className="text-sm font-semibold text-slate-700">{formatMoney(custodyGiven)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[11px] text-slate-400">{t('المصروف منها')}</div>
                <div className="text-sm font-semibold text-slate-700">{formatMoney(custodySpent)}</div>
              </div>
              <div className={`rounded-xl p-2.5 ${custodyRemaining >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="text-[11px] text-slate-400">{t('الرصيد المتبقي')}</div>
                <div className={`text-sm font-semibold ${custodyRemaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(custodyRemaining)}</div>
              </div>
            </div>
          </div>

          {/* عمولة هذا الشهر — تحقَّق المستهدف: المبلغ المستحق فقط (بلا
              نسبة). لم يتحقَّق: المتبقي من المبيعات للوصول إليه بدلاً منها. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Percent className="h-4 w-4 text-brand-600" /> {t('عمولة هذا الشهر')}
            </h2>
            {commissionRow ? (
              targetAchieved ? (
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <div className="text-[11px] text-emerald-600">{t('العمولة المستحقة')}</div>
                  <div className="mt-0.5 text-xl font-bold text-emerald-700">{formatMoney(commissionRow.commission_due)}</div>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <div className="text-[11px] text-amber-600">{t('متبقي المبيعات للوصول إلى المستهدف')}</div>
                  <div className="mt-0.5 text-xl font-bold text-amber-700">{formatMoney(remainingToTarget)}</div>
                </div>
              )
            ) : (
              <p className="text-sm text-slate-400">{t('لست مستحقاً لعمولة هذا الشهر')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
