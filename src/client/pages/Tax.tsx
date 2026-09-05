import { useEffect, useMemo, useState } from 'react';
import { Receipt, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, Invoice } from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { PaymentStatusBadge } from '../components/Badge.js';
import { useI18n } from '../lib/i18n.js';

// نطاق تواريخ ربع سنة (بداية ونهاية شاملتان) من مفتاحه "YYYY-Q#".
function quarterRange(key: string): { start: Date; end: Date } {
  const [yearStr, qStr] = key.split('-Q');
  const year = Number(yearStr);
  const q = Number(qStr);
  const start = new Date(year, (q - 1) * 3, 1);
  const end = new Date(year, (q - 1) * 3 + 3, 0, 23, 59, 59, 999);
  return { start, end };
}

const QUARTER_MONTH_RANGES_AR = ['يناير - مارس', 'أبريل - يونيو', 'يوليو - سبتمبر', 'أكتوبر - ديسمبر'];
const QUARTER_MONTH_RANGES_EN = ['Jan - Mar', 'Apr - Jun', 'Jul - Sep', 'Oct - Dec'];

function quarterLabel(key: string, lang: 'ar' | 'en'): string {
  const [year, qStr] = key.split('-Q');
  const q = Number(qStr);
  const range = (lang === 'ar' ? QUARTER_MONTH_RANGES_AR : QUARTER_MONTH_RANGES_EN)[q - 1];
  return lang === 'ar' ? `الربع ${q} — ${range} ${year}` : `Q${q} ${year} (${range})`;
}

// آخر 8 أرباع (سنتان)، الأحدث أولاً.
function recentQuarters(): string[] {
  const now = new Date();
  const quarters: string[] = [];
  let year = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    quarters.push(`${year}-Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      year -= 1;
    }
  }
  return quarters;
}

// تبويب "الضريبة" داخل صفحة المحاسبة — يجمع كل فاتورة ضريبية على الجهتين:
// فواتير المبيعات (ضريبة محتسبة على العملاء، Invoice.vat_amount) وفواتير
// المصروفات المعلَّمة كضريبية (Expense.is_tax_invoice، انظر computeExpenseTax
// في server/routes/api.ts)، مقسَّمة كل ربع سنة، لحساب صافي الضريبة
// المستحقة/المستردة والفرق بين الإيرادات والمصروفات مباشرة كل فترة.
export function TaxTab() {
  const { t, lang } = useI18n();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [quarter, setQuarter] = useState(recentQuarters()[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.get<Invoice[]>('/invoices'), api.get<Expense[]>('/expenses')])
      .then(([i, e]) => {
        setInvoices(i);
        setExpenses(e);
      })
      .finally(() => setLoading(false));
  }, []);

  const { start, end } = quarterRange(quarter);

  const salesInvoices = useMemo(
    () =>
      invoices
        .filter((i) => {
          const d = new Date(i.issue_date);
          return d >= start && d <= end;
        })
        .sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()),
    [invoices, quarter],
  );

  const expenseInvoices = useMemo(
    () =>
      expenses
        .filter((e) => {
          if (!e.is_tax_invoice) return false;
          const d = new Date(e.date);
          return d >= start && d <= end;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [expenses, quarter],
  );

  const outputVat = salesInvoices.reduce((sum, i) => sum + i.vat_amount, 0);
  const outputRevenue = salesInvoices.reduce((sum, i) => sum + i.total, 0);
  const inputVat = expenseInvoices.reduce((sum, e) => sum + (e.tax_amount ?? 0), 0);
  const inputExpense = expenseInvoices.reduce((sum, e) => sum + e.amount, 0);
  const netVat = outputVat - inputVat;
  const netDifference = outputRevenue - inputExpense;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('الضريبة')}</h2>
          <p className="text-sm text-slate-400">
            {t('كل فاتورة ضريبية على المبيعات والمصروفات، مقسَّمة ربع سنوياً، لحساب صافي الضريبة المستحقة والفرق بين الإيرادات والمصروفات مباشرة')}
          </p>
        </div>
        <div className="relative">
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="input appearance-none pe-9">
            {recentQuarters().map((q) => (
              <option key={q} value={q}>
                {quarterLabel(q, lang)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">{t('جارِ التحميل…')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-400">{t('إجمالي الإيرادات (شامل الضريبة)')}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{formatMoney(outputRevenue)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-400">{t('إجمالي المصروفات الضريبية (شامل الضريبة)')}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{formatMoney(inputExpense)}</div>
            </div>
            <div className={`rounded-2xl border p-4 ${netDifference >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
              <div className={`flex items-center gap-1 text-xs ${netDifference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {netDifference >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {t('الفرق (الإيرادات - المصروفات)')}
              </div>
              <div className={`mt-1 text-xl font-bold ${netDifference >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(netDifference)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-400">{t('ضريبة المبيعات (المحتسبة على العملاء)')}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{formatMoney(outputVat)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-400">{t('ضريبة المشتريات (المدفوعة في المصروفات)')}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{formatMoney(inputVat)}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-1 text-xs text-slate-300">
                <Scale className="h-3.5 w-3.5" /> {t(netVat >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة القابلة للاسترداد')}
              </div>
              <div className="mt-1 text-xl font-bold text-white">{formatMoney(Math.abs(netVat))}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Receipt className="h-4 w-4 text-brand-600" /> {t('فواتير المبيعات الضريبية')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="py-2 text-start font-medium">{t('التاريخ')}</th>
                    <th className="py-2 text-start font-medium">{t('رقم الفاتورة')}</th>
                    <th className="py-2 text-start font-medium">{t('العميل')}</th>
                    <th className="py-2 text-start font-medium">{t('قبل الضريبة')}</th>
                    <th className="py-2 text-start font-medium">{t('الضريبة (15٪)')}</th>
                    <th className="py-2 text-start font-medium">{t('الإجمالي')}</th>
                    <th className="py-2 text-start font-medium">{t('الحالة')}</th>
                  </tr>
                </thead>
                <tbody>
                  {salesInvoices.map((i) => (
                    <tr key={i.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 text-slate-600">{formatDateAr(i.issue_date)}</td>
                      <td className="py-2.5 font-medium text-slate-700">{i.invoice_number}</td>
                      <td className="py-2.5 text-slate-600">{i.customer_name_snapshot}</td>
                      <td className="py-2.5 text-slate-600">{formatMoney(i.subtotal)}</td>
                      <td className="py-2.5 text-slate-600">{formatMoney(i.vat_amount)}</td>
                      <td className="py-2.5 font-semibold text-slate-800">{formatMoney(i.total)}</td>
                      <td className="py-2.5">
                        <PaymentStatusBadge status={i.payment_status} />
                      </td>
                    </tr>
                  ))}
                  {salesInvoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        {t('لا توجد فواتير مبيعات في هذه الفترة')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {salesInvoices.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-100 text-sm font-bold text-slate-800">
                      <td className="py-2.5" colSpan={4}>
                        {t('الإجمالي')}
                      </td>
                      <td className="py-2.5">{formatMoney(outputVat)}</td>
                      <td className="py-2.5">{formatMoney(outputRevenue)}</td>
                      <td className="py-2.5" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Receipt className="h-4 w-4 text-brand-600" /> {t('فواتير المصروفات الضريبية')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="py-2 text-start font-medium">{t('التاريخ')}</th>
                    <th className="py-2 text-start font-medium">{t('البند')}</th>
                    <th className="py-2 text-start font-medium">{t('التصنيف')}</th>
                    <th className="py-2 text-start font-medium">{t('قبل الضريبة')}</th>
                    <th className="py-2 text-start font-medium">{t('الضريبة')}</th>
                    <th className="py-2 text-start font-medium">{t('الإجمالي')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseInvoices.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 text-slate-600">{formatDateAr(e.date)}</td>
                      <td className="py-2.5 font-medium text-slate-700">{e.title}</td>
                      <td className="py-2.5 text-slate-600">{e.category}</td>
                      <td className="py-2.5 text-slate-600">{formatMoney(e.amount - (e.tax_amount ?? 0))}</td>
                      <td className="py-2.5 text-slate-600">{formatMoney(e.tax_amount ?? 0)}</td>
                      <td className="py-2.5 font-semibold text-slate-800">{formatMoney(e.amount)}</td>
                    </tr>
                  ))}
                  {expenseInvoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        {t('لا توجد مصروفات بفاتورة ضريبية في هذه الفترة')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {expenseInvoices.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-100 text-sm font-bold text-slate-800">
                      <td className="py-2.5" colSpan={3}>
                        {t('الإجمالي')}
                      </td>
                      <td className="py-2.5">{formatMoney(inputExpense - inputVat)}</td>
                      <td className="py-2.5">{formatMoney(inputVat)}</td>
                      <td className="py-2.5">{formatMoney(inputExpense)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
