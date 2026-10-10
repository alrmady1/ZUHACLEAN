import { useEffect, useMemo, useState } from 'react';
import { Store, Paperclip, Pencil, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Invoice } from '../../shared/types.js';
import { sarvCommissionAmount } from '../../shared/sarv.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import SarvPaymentModal from '../components/SarvPaymentModal.js';

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  const color = tone === 'success' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

// الإعدادات ← منصة سيرف: متابعة سداد عمولة المنصة فاتورةً فاتورة. أعلى
// الصفحة الفواتير المسدَّدة للمنصة (بتاريخ التحويل وإيصاله)، وتحتها غير
// المسدَّدة بعد مع زر تسجيل السداد. تسجيل السداد/الإيصال نفسه في
// SarvPaymentModal (POST /invoices/:id/platform-payment).
export default function SarvSettingsTab() {
  const { t, tt } = useI18n();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Invoice | null>(null);

  function refresh() {
    setLoading(true);
    api
      .get<Invoice[]>('/invoices')
      .then((list) => setInvoices(list.filter((i) => i.sales_channel === 'sarv')))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  const { paid, unpaid, paidTotal, unpaidTotal } = useMemo(() => {
    const byDate = (a: Invoice, b: Invoice) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime();
    const paidList = invoices.filter((i) => i.platform_commission_paid_at).sort((a, b) => (b.platform_commission_paid_at ?? '').localeCompare(a.platform_commission_paid_at ?? ''));
    const unpaidList = invoices.filter((i) => !i.platform_commission_paid_at).sort(byDate);
    const sum = (list: Invoice[]) => list.reduce((s, i) => s + sarvCommissionAmount(i), 0);
    return { paid: paidList, unpaid: unpaidList, paidTotal: sum(paidList), unpaidTotal: sum(unpaidList) };
  }, [invoices]);

  function handleSaved(updated: Invoice) {
    setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setEditing(null);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Store className="h-4 w-4 text-brand-600" /> {t('منصة سيرف')}
        </h3>
        <p className="mt-1 text-xs text-slate-400">{t('متابعة سداد عمولة المنصة لكل فاتورة، مع إمكانية إرفاق إيصال التحويل')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MiniStat label={t('إجمالي عمولة المنصة')} value={formatMoney(paidTotal + unpaidTotal)} />
        <MiniStat label={t('المسدَّد للمنصة')} value={formatMoney(paidTotal)} tone="success" />
        <MiniStat label={t('المتبقي سداده للمنصة')} value={formatMoney(unpaidTotal)} tone="warning" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">{t('جارِ التحميل…')}</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-700">
                {t('الفواتير المسدَّدة للمنصة')} ({paid.length})
              </h3>
            </div>
            {paid.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">{t('لا توجد فواتير مسدَّدة للمنصة بعد')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                      <th className="p-3 text-start font-medium">{t('رقم الفاتورة')}</th>
                      <th className="p-3 text-start font-medium">{t('العميل')}</th>
                      <th className="p-3 text-start font-medium">{t('قيمة العمولة')}</th>
                      <th className="p-3 text-start font-medium">{t('تاريخ السداد للمنصة')}</th>
                      <th className="p-3 text-start font-medium">{t('إيصال التحويل')}</th>
                      <th className="p-3 text-start font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paid.map((i) => (
                      <tr key={i.id} className="border-b border-slate-50 last:border-0">
                        <td className="p-3 font-medium text-slate-700">{i.invoice_number}</td>
                        <td className="p-3 text-slate-600">{i.customer_name_snapshot}</td>
                        <td className="p-3 font-semibold text-slate-700">{formatMoney(sarvCommissionAmount(i))}</td>
                        <td className="p-3 text-slate-600" dir="ltr">
                          {formatDateAr(i.platform_commission_paid_at!)}
                        </td>
                        <td className="p-3">
                          {i.platform_payment_receipt_url ? (
                            <a href={i.platform_payment_receipt_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                              <Paperclip className="h-3.5 w-3.5" /> {t('عرض الإيصال')}
                            </a>
                          ) : (
                            <button onClick={() => setEditing(i)} className="text-xs font-medium text-amber-600 hover:underline">
                              {t('+ إضافة إيصال')}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <button onClick={() => setEditing(i)} title={t('تعديل')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-700">
                {t('فواتير لم تُسدَّد للمنصة بعد')} ({unpaid.length})
              </h3>
            </div>
            {unpaid.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">{t('كل فواتير سيرف مسدَّدة للمنصة')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                      <th className="p-3 text-start font-medium">{t('رقم الفاتورة')}</th>
                      <th className="p-3 text-start font-medium">{t('العميل')}</th>
                      <th className="p-3 text-start font-medium">{t('التاريخ')}</th>
                      <th className="p-3 text-start font-medium">{t('قيمة العمولة')}</th>
                      <th className="p-3 text-start font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaid.map((i) => (
                      <tr key={i.id} className="border-b border-slate-50 last:border-0">
                        <td className="p-3 font-medium text-slate-700">{i.invoice_number}</td>
                        <td className="p-3 text-slate-600">{i.customer_name_snapshot}</td>
                        <td className="p-3 text-slate-500" dir="ltr">
                          {formatDateAr(i.issue_date)}
                        </td>
                        <td className="p-3 font-semibold text-slate-700">{formatMoney(sarvCommissionAmount(i))}</td>
                        <td className="p-3">
                          <button
                            onClick={() => setEditing(i)}
                            className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                          >
                            {tt('تسجيل السداد للمنصة', 'Record payment to platform')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {editing && <SarvPaymentModal invoice={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
    </div>
  );
}
