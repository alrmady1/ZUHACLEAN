import { useEffect, useMemo, useState } from 'react';
import { Store, Printer } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Invoice, PaymentMethodOption, PlatformSettlementParty } from '../../shared/types.js';
import { PLATFORM_SETTLEMENT_PARTY_LABELS_AR } from '../../shared/types.js';
import { PaymentStatusBadge } from '../components/Badge.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import { sarvCommissionAmount } from '../../shared/sarv.js';
import SarvInvoiceDocument from '../components/SarvInvoiceDocument.js';
import SarvPaymentModal from '../components/SarvPaymentModal.js';
import { useAuth } from '../lib/auth.js';

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

// تبويب "مبيعات منصة سيرف" (المحاسبة) — يسرد فقط الفواتير التي اختير لها
// عند السداد (PayAppointmentModal) أو فاتورة المبيعات اليدوية (Sales.tsx)
// أنها عبر منصة سيرف، مع عمولتها ومَن استلم المبلغ من العميل. التعديل
// المسموح هنا هو حصراً "مَن استلم المبلغ" عبر PATCH /invoices/:id — كل
// حقل آخر في الفاتورة يبقى كما أُدخل أصلاً.
export function SarvSalesTab() {
  const { t, tt } = useI18n();
  const { can } = useAuth();
  const canManagePayments = can('manage_sarv_settings');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Invoice | null>(null);

  function refresh() {
    setLoading(true);
    Promise.all([api.get<Invoice[]>('/invoices'), api.get<PaymentMethodOption[]>('/payment-methods')])
      .then(([inv, methods]) => {
        setInvoices(inv);
        setPaymentMethods(methods);
      })
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  const methodName = (id?: string) => (id ? paymentMethods.find((m) => m.id === id)?.name ?? id : '—');

  const sarvInvoices = useMemo(
    () => invoices.filter((i) => i.sales_channel === 'sarv').sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()),
    [invoices],
  );

  const totals = useMemo(() => {
    let totalSales = 0;
    let totalCommission = 0;
    for (const i of sarvInvoices) {
      totalSales += i.total;
      totalCommission += sarvCommissionAmount(i);
    }
    return { totalSales, totalCommission, netDue: totalSales - totalCommission };
  }, [sarvInvoices]);

  async function updateSettledBy(invoice: Invoice, party: PlatformSettlementParty) {
    setSavingId(invoice.id);
    try {
      const updated = await api.patch<Invoice>(`/invoices/${invoice.id}`, { platform_settled_by: party });
      setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Store className="h-4 w-4 text-brand-600" /> {t('مبيعات منصة سيرف')}
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          {t('الطلبات المستلمة عبر منصة سيرف، مع طريقة الدفع وعمولة المنصة ومَن استلم المبلغ من العميل')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MiniStat label={t('عدد طلبات سيرف')} value={String(sarvInvoices.length)} />
        <MiniStat label={t('إجمالي المبيعات عبر سيرف')} value={formatMoney(totals.totalSales)} />
        <MiniStat label={t('إجمالي عمولة المنصة')} value={formatMoney(totals.totalCommission)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-700">{t('السجل')}</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('جارِ التحميل…')}</div>
        ) : sarvInvoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('لا توجد طلبات عبر منصة سيرف بعد')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="p-3 text-start font-medium">{t('رقم الفاتورة')}</th>
                  <th className="p-3 text-start font-medium">{t('التاريخ')}</th>
                  <th className="p-3 text-start font-medium">{t('الإجمالي')}</th>
                  <th className="p-3 text-start font-medium">{t('طريقة الدفع')}</th>
                  <th className="p-3 text-start font-medium">{t('حالة السداد')}</th>
                  <th className="p-3 text-start font-medium">{t('نسبة العمولة')}</th>
                  <th className="p-3 text-start font-medium">{t('قيمة العمولة')}</th>
                  <th className="p-3 text-start font-medium">{t('مَن استلم المبلغ؟')}</th>
                  <th className="p-3 text-start font-medium">{t('سداد المنصة')}</th>
                  <th className="p-3 text-start font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sarvInvoices.map((i) => (
                  <tr key={i.id} className="border-b border-slate-50 last:border-0">
                    <td className="p-3 font-medium text-slate-700">{i.invoice_number}</td>
                    <td className="p-3 text-slate-500" dir="ltr">
                      {formatDateAr(i.issue_date)}
                    </td>
                    <td className="p-3 font-semibold text-slate-700">{formatMoney(i.total)}</td>
                    <td className="p-3 text-slate-600">{methodName(i.payment_method)}</td>
                    <td className="p-3">
                      <PaymentStatusBadge status={i.payment_status} />
                    </td>
                    <td className="p-3 text-slate-600">
                      {i.platform_commission_rate != null ? tt(`${i.platform_commission_rate}%`, `${i.platform_commission_rate}%`) : '—'}
                    </td>
                    <td className="p-3 text-slate-600">{formatMoney(sarvCommissionAmount(i))}</td>
                    <td className="p-3">
                      <select
                        value={i.platform_settled_by ?? 'company'}
                        disabled={savingId === i.id}
                        onChange={(e) => updateSettledBy(i, e.target.value as PlatformSettlementParty)}
                        className="input w-auto py-1 text-xs"
                      >
                        {(Object.keys(PLATFORM_SETTLEMENT_PARTY_LABELS_AR) as PlatformSettlementParty[]).map((p) => (
                          <option key={p} value={p}>
                            {t(PLATFORM_SETTLEMENT_PARTY_LABELS_AR[p])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col items-start gap-1">
                        {i.platform_commission_paid_at ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{t('مسدَّدة للمنصة')}</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{t('لم تُسدَّد للمنصة')}</span>
                        )}
                        {i.platform_commission_paid_at && (
                          <span className="text-[11px] text-slate-400" dir="ltr">
                            {formatDateAr(i.platform_commission_paid_at)}
                          </span>
                        )}
                        {i.platform_payment_receipt_url && (
                          <a href={i.platform_payment_receipt_url} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-brand-600 hover:underline">
                            {t('عرض الإيصال')}
                          </a>
                        )}
                        {canManagePayments && (
                          <button onClick={() => setPayingInvoice(i)} className="text-[11px] font-medium text-brand-600 hover:underline">
                            {i.platform_commission_paid_at ? t('تعديل') : t('تسجيل السداد للمنصة')}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {can('print_sarv_invoice') && (
                        <button
                          onClick={() => setPrinting(i)}
                          title={t('طباعة فاتورة سيرف')}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payingInvoice && (
        <SarvPaymentModal
          invoice={payingInvoice}
          onClose={() => setPayingInvoice(null)}
          onSaved={(updated) => {
            setInvoices((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setPayingInvoice(null);
          }}
        />
      )}

      {printing && <SarvInvoiceDocument invoice={printing} paymentMethods={paymentMethods} onClose={() => setPrinting(null)} />}
    </div>
  );
}
