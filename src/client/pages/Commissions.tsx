import { useEffect, useState } from 'react';
import { TrendingUp, Users as MarketersIcon, ShieldCheck as SupervisorsIcon, PartyPopper, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatMoney, type Lang } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

interface CommissionPersonRow {
  profile_id: string;
  profile_name: string;
  personal_revenue: number;
  share_percent: number;
  commission_due: number;
}
interface CommissionSupervisorRow extends CommissionPersonRow {
  complaint_rate: number;
  rated_count: number;
  eligible: boolean;
}
interface CommissionReport {
  month: string;
  company_revenue: number;
  daily_breakeven: number;
  excess: number;
  progress_percent: number;
  safety_scale_applied: boolean;
  marketer_pool: number;
  supervisor_pool: number;
  total_marketer_due: number;
  total_supervisor_due: number;
  company_net_share: number;
  marketers: CommissionPersonRow[];
  supervisors: CommissionSupervisorRow[];
  config: { base_target: number; growth_target: number; stretch_target: number };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// آخر 6 أشهر (بالأحدث أولاً) لمُحدِّد الشهر أعلى اللوحة.
function recentMonths(): string[] {
  const months: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 6; i++) {
    months.push(d.toISOString().slice(0, 7));
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

function monthLabel(month: string, lang: Lang): string {
  const [y, m] = month.split('-').map(Number);
  const locale = lang === 'ar' ? 'ar-SA' : lang === 'bn' ? 'bn-BD-u-nu-latn' : lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-US';
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric', calendar: 'gregory' });
}

// تبويب "العمولات" داخل صفحة المحاسبة — تقرير محسوب شهرياً من الخادم
// (GET /commission-report؟month=)، عرض فقط، بلا أي تعديل هنا (النسب
// والمستهدفات والمستحقون تُعدَّل من الإعدادات ← العمولات).
export function CommissionsDashboardTab() {
  const { t, tt, lang } = useI18n();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<CommissionReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<CommissionReport>(`/commission-report?month=${month}`)
      .then(setReport)
      .finally(() => setLoading(false));
  }, [month]);

  const now = new Date();
  const isCurrentMonth = month === currentMonth();
  const daysLeftInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  const milestones = report
    ? [
        { key: 'base', label: t('تغطية التكاليف'), value: report.config.base_target },
        { key: 'growth', label: t('النمو'), value: report.config.growth_target },
        { key: 'stretch', label: t('التجاوز'), value: report.config.stretch_target },
      ]
    : [];
  const maxScale = report ? Math.max(report.config.stretch_target, report.company_revenue) * 1.05 : 1;
  const barPercent = report ? Math.min(100, (report.company_revenue / maxScale) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('العمولات')}</h2>
          <p className="text-sm text-slate-400">{t('نقطة التعادل، المستهدفات، ومستحقات كل مسوّق ومشرف — من الإيراد المحصَّل فعلياً هذا الشهر')}</p>
        </div>
        <div className="relative">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="input appearance-none pe-9">
            {recentMonths().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, lang)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">{t('جارِ التحميل…')}</div>}

      {!loading && report && (
        <>
          {/* تنبيهات */}
          {report.company_revenue >= report.config.base_target && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              <PartyPopper className="h-4 w-4 shrink-0" />
              {tt(`وصل إيراد الشهر نقطة التعادل (${formatMoney(report.config.base_target)}) — بدأ احتساب العمولات على الفائض.`, 'This month\'s revenue reached break-even — commissions are now accruing on the surplus.')}
            </div>
          )}
          {isCurrentMonth && daysLeftInMonth <= 5 && report.progress_percent < 100 && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
              <Clock className="h-4 w-4 shrink-0" />
              {tt(`باقي ${daysLeftInMonth} أيام على نهاية الشهر ولم يُغطَّ المستهدف بعد — فرصة أخيرة للتحصيل.`, `${daysLeftInMonth} days left this month and the target isn't covered yet.`)}
            </div>
          )}
          {report.safety_scale_applied && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('تم تخفيض مجموع العمولات تناسبياً هذا الشهر لضمان أدنى حصة للشركة من الفائض (حسب حد الأمان في الإعدادات).')}
            </div>
          )}

          {/* شريط التقدم */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <TrendingUp className="h-4 w-4 text-brand-600" /> {t('التقدم نحو المستهدف')}
              </span>
              <span className="text-sm font-bold text-brand-700">{report.progress_percent.toFixed(0)}%</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${report.progress_percent >= 100 ? 'bg-emerald-500' : 'bg-brand-600'}`}
                style={{ width: `${barPercent}%` }}
              />
            </div>
            <div className="relative mt-2 h-5">
              {milestones.map((m) => (
                <div
                  key={m.key}
                  className="absolute -translate-x-1/2 text-center text-[10px] text-slate-400"
                  style={{ insetInlineStart: `${Math.min(100, (m.value / maxScale) * 100)}%` }}
                >
                  {formatMoney(m.value)}
                </div>
              ))}
            </div>
          </div>

          {/* الحاسبة الفورية */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-400">{t('الإيراد المحصَّل هذا الشهر')}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{formatMoney(report.company_revenue)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-400">{t('نقطة التعادل اليومية')}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{formatMoney(report.daily_breakeven)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-400">{t('الفائض القابل للعمولة')}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{formatMoney(report.excess)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs text-emerald-600">{t('مستحقات المسوّقين')}</div>
              <div className="mt-1 text-xl font-bold text-emerald-700">{formatMoney(report.total_marketer_due)}</div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-xs text-blue-600">{t('مستحقات المشرفين')}</div>
              <div className="mt-1 text-xl font-bold text-blue-700">{formatMoney(report.total_supervisor_due)}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs text-slate-300">{t('صافي ربح الشركة')}</div>
              <div className="mt-1 text-xl font-bold text-white">{formatMoney(report.company_net_share)}</div>
            </div>
          </div>

          {/* المسوّقون */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <MarketersIcon className="h-4 w-4 text-brand-600" /> {t('مستحقات المسوّقين')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="py-2 text-start font-medium">{t('الموظف')}</th>
                    <th className="py-2 text-start font-medium">{t('إيراده الشخصي')}</th>
                    <th className="py-2 text-start font-medium">{t('حصته من الإيراد')}</th>
                    <th className="py-2 text-start font-medium">{t('العمولة المستحقة')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.marketers.map((m) => (
                    <tr key={m.profile_id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-medium text-slate-700">{m.profile_name}</td>
                      <td className="py-2.5 text-slate-600">{formatMoney(m.personal_revenue)}</td>
                      <td className="py-2.5 text-slate-600">{m.share_percent.toFixed(1)}%</td>
                      <td className="py-2.5 font-semibold text-emerald-700">{formatMoney(m.commission_due)}</td>
                    </tr>
                  ))}
                  {report.marketers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">
                        {t('لا يوجد مسوّقون مستحقون حالياً — أضِفهم من الإعدادات ← العمولات')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* المشرفون */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <SupervisorsIcon className="h-4 w-4 text-brand-600" /> {t('مستحقات المشرفين')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="py-2 text-start font-medium">{t('الموظف')}</th>
                    <th className="py-2 text-start font-medium">{t('إيراده الشخصي')}</th>
                    <th className="py-2 text-start font-medium">{t('نسبة الشكاوى')}</th>
                    <th className="py-2 text-start font-medium">{t('الحالة')}</th>
                    <th className="py-2 text-start font-medium">{t('العمولة المستحقة')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.supervisors.map((s) => (
                    <tr key={s.profile_id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-medium text-slate-700">{s.profile_name}</td>
                      <td className="py-2.5 text-slate-600">{formatMoney(s.personal_revenue)}</td>
                      <td className="py-2.5 text-slate-600">
                        {s.complaint_rate.toFixed(1)}% <span className="text-xs text-slate-400">({tt(`${s.rated_count} تقييم`, `${s.rated_count} ratings`)})</span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.eligible ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {s.eligible ? t('مستحق') : t('غير مستحق (تجاوز حد الشكاوى)')}
                        </span>
                      </td>
                      <td className="py-2.5 font-semibold text-blue-700">{formatMoney(s.commission_due)}</td>
                    </tr>
                  ))}
                  {report.supervisors.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        {t('لا يوجد مشرفون مستحقون حالياً — أضِفهم من الإعدادات ← العمولات')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
