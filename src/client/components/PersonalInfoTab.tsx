import { useEffect, useState } from 'react';
import { IdCard, UserCog, CalendarOff, HandCoins, Wallet, Percent } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, CustodyInvoice } from '../../shared/types.js';
import { ADVANCE_CATEGORY_NAME, CUSTODY_CATEGORY_NAME, ADVANCE_DEDUCTION_MODE_LABELS_AR, USER_LANGUAGE_LABELS_AR } from '../../shared/types.js';
import { WEEKDAYS } from '../../shared/weekdays.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

// نفس شكل GET /commission-report (فقط الحقول المستخدَمة هنا) — انظر
// computeCommissionReport في src/server/routes/api.ts.
interface CommissionReportLite {
  supervisors: { profile_id: string; commission_due: number; personal_revenue: number; share_percent: number }[];
}

// نفس منطق EmployeeAccounts.tsx بالضبط — العمر يُحتسَب دائماً من
// date_of_birth بدل تخزينه كرقم ثابت يصبح خاطئاً مع الوقت.
function ageFromBirthDate(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// تبويب "المعلومات الشخصية" — عرض ذاتي (لا يعدّل شيئاً) لبيانات المستخدم
// الحالي نفسه فقط، يظهر للفني الميداني (داخل TechnicianPortal.tsx)
// والمشرف الميداني (داخل Dashboard.tsx) تحديداً — انظر مكان استخدامه في
// كلا الملفين. يعرض نفس حقول "البيانات الشخصية" المُدارة من المحاسبة ←
// الموظفين (EmployeeAccounts.tsx) لكن للقراءة فقط، بالإضافة إلى تفاصيل
// السلفيات والإجازة الأسبوعية والمشرف المسؤول — ولمن هو مشرف ميداني
// تحديداً (showSupervisorExtras) تفاصيل العهدة وعمولة الشهر الحالي أيضاً.
export default function PersonalInfoTab({ showSupervisorExtras }: { showSupervisorExtras: boolean }) {
  const { user, allProfiles } = useAuth();
  const { t, tt } = useI18n();
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

  const supervisor = allProfiles.find((p) => p.id === user.supervisor_id);
  const myAdvances = expenses.filter((e) => e.category === ADVANCE_CATEGORY_NAME && e.custody_holder_id === user.id);
  const custodyGiven = expenses
    .filter((e) => e.category === CUSTODY_CATEGORY_NAME && e.custody_holder_id === user.id)
    .reduce((s, e) => s + e.amount, 0);
  const custodySpent = custodyInvoices.filter((i) => i.custody_holder_id === user.id).reduce((s, i) => s + i.amount, 0);
  const custodyRemaining = custodyGiven - custodySpent;
  const commissionRow = commissionReport?.supervisors.find((s) => s.profile_id === user.id);

  return (
    <div className="space-y-5">
      {/* البيانات الشخصية — نفس حقول المحاسبة ← الموظفين ← البيانات
          الشخصية، للقراءة فقط. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <IdCard className="h-4 w-4 text-brand-600" /> {t('البيانات الشخصية')}
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-slate-400">{t('الاسم الكامل (حسب الهوية)')}</div>
            <div className="font-medium text-slate-700">{user.legal_full_name || user.full_name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('المسمى الوظيفي')}</div>
            <div className="font-medium text-slate-700">{user.job_title || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('الجنسية')}</div>
            <div className="font-medium text-slate-700">{user.nationality || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('العمر')}</div>
            <div className="font-medium text-slate-700">
              {user.date_of_birth ? tt(`${ageFromBirthDate(user.date_of_birth)} سنة`, `${ageFromBirthDate(user.date_of_birth)} yrs`) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('رقم الهوية / الإقامة')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.national_id || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('تاريخ انتهاء الهوية')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.national_id_expiry || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('تاريخ التعيين')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.hire_date || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('رقم الجوال')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.phone || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('لغة الواجهة الافتراضية')}</div>
            <div className="font-medium text-slate-700">{user.default_lang ? t(USER_LANGUAGE_LABELS_AR[user.default_lang]) : t('عربي (افتراضي)')}</div>
          </div>
        </div>
        {user.id_photo_url && (
          <a
            href={user.id_photo_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-brand-600"
          >
            <img src={user.id_photo_url} alt={t('صورة الهوية')} className="h-10 w-10 rounded object-cover" />
            {t('عرض صورة الهوية')}
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* المشرف المسؤول */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <UserCog className="h-4 w-4 text-brand-600" /> {t('المشرف المسؤول')}
          </h2>
          <p className="text-sm font-medium text-slate-700">{supervisor ? supervisor.full_name : t('بدون مشرف محدَّد')}</p>
        </div>

        {/* الإجازة الأسبوعية */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <CalendarOff className="h-4 w-4 text-brand-600" /> {t('الإجازة الأسبوعية')}
          </h2>
          {user.weekly_days_off && user.weekly_days_off.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {user.weekly_days_off.map((key) => {
                const w = WEEKDAYS.find((x) => x.key === key);
                return (
                  <span key={key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {w ? t(w.label) : key}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t('لا توجد إجازة أسبوعية محدَّدة')}</p>
          )}
        </div>
      </div>

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

          {/* عمولة هذا الشهر */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Percent className="h-4 w-4 text-brand-600" /> {t('عمولة هذا الشهر')}
            </h2>
            {commissionRow ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="text-[11px] text-slate-400">{t('إيرادك الشخصي')}</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(commissionRow.personal_revenue)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="text-[11px] text-slate-400">{t('حصتك من الإيراد')}</div>
                  <div className="text-sm font-semibold text-slate-700">{commissionRow.share_percent.toFixed(1)}%</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-2.5">
                  <div className="text-[11px] text-emerald-600">{t('العمولة المستحقة')}</div>
                  <div className="text-sm font-semibold text-emerald-700">{formatMoney(commissionRow.commission_due)}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">{t('لست مستحقاً لعمولة هذا الشهر')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
