import { X, Printer } from 'lucide-react';
import type { Invoice, PaymentMethodOption } from '../../shared/types.js';
import { COMPANY_LEGAL_NAME, COMPANY_VAT_NUMBER, SARV_DEFAULT_COMMISSION_PERCENT, PLATFORM_SETTLEMENT_PARTY_LABELS_AR } from '../../shared/types.js';
import { sarvCommissionAmount } from '../../shared/sarv.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// فاتورة/كشف عمولة موجَّه لمنصة سيرف عن طلب واحد: الإجمالي شامل الضريبة،
// الضريبة، المبلغ قبل الضريبة، ثم نسبة سيرف ومبلغ عمولتها محسوبة من إجمالي
// المبلغ (شامل الضريبة). نفس آلية الطباعة في InvoiceDocument (.invoice-print-area).
export default function SarvInvoiceDocument({
  invoice,
  paymentMethods,
  onClose,
}: {
  invoice: Invoice;
  paymentMethods: PaymentMethodOption[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const rate = invoice.platform_commission_rate ?? SARV_DEFAULT_COMMISSION_PERCENT;
  const commission = sarvCommissionAmount(invoice);
  const netAfterCommission = Math.round((invoice.total - commission) * 100) / 100;
  const methodName = paymentMethods.find((m) => m.id === invoice.payment_method)?.name ?? invoice.payment_method ?? '—';
  const settledBy = PLATFORM_SETTLEMENT_PARTY_LABELS_AR[invoice.platform_settled_by ?? 'company'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('فاتورة منصة سيرف')}</h2>
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

        <div className="invoice-print-area overflow-y-auto p-6">
          <div className="mb-5 flex items-start justify-between border-b border-dashed border-slate-200 pb-4">
            <div className="flex items-start gap-2.5">
              <img src="/invoice-logo.png" alt={COMPANY_LEGAL_NAME} className="h-14 w-14 shrink-0 rounded-lg" />
              <div>
                <div className="text-lg font-bold text-slate-800">{COMPANY_LEGAL_NAME}</div>
                <div className="text-xs text-slate-400">{t('لأعمال الصيانة والتنظيف')}</div>
                <div className="mt-1 text-xs text-slate-400">{t('الرقم الضريبي:')} {COMPANY_VAT_NUMBER}</div>
              </div>
            </div>
            <div className="text-end">
              <div className="text-sm font-bold text-brand-700">{t('فاتورة منصة سيرف')}</div>
              <div className="text-xs text-slate-500">{t('رقم الفاتورة:')} {invoice.invoice_number}</div>
              <div className="text-xs text-slate-500">{t('التاريخ:')} {formatDateAr(invoice.issue_date)}</div>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-400">{t('إلى')}</div>
              <div className="font-medium text-slate-700">{t('منصة سيرف')}</div>
              <div className="mt-2 mb-1 text-xs font-semibold text-slate-400">{t('العميل')}</div>
              <div className="font-medium text-slate-700">{invoice.customer_name_snapshot}</div>
            </div>
            <div className="text-end">
              <div className="mb-1 text-xs font-semibold text-slate-400">{t('طريقة الدفع')}</div>
              <div className="font-medium text-slate-700">{methodName}</div>
              <div className="mt-2 mb-1 text-xs font-semibold text-slate-400">{t('مَن استلم المبلغ من العميل؟')}</div>
              <div className="font-medium text-slate-700">{t(settledBy)}</div>
            </div>
          </div>

          <div className="mb-6 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>{t('الإجمالي قبل الضريبة')}</span>
              <span>{formatMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{t('ضريبة القيمة المضافة (15٪)')}</span>
              <span>{formatMoney(invoice.vat_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-800">
              <span>{t('الإجمالي شامل الضريبة')}</span>
              <span>{formatMoney(invoice.total)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>{t('نسبة سيرف')}</span>
              <span>{rate}٪</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>{t('محسوبة من إجمالي المبلغ')}</span>
              <span>{formatMoney(invoice.total)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-brand-200 pt-2 text-base font-bold text-brand-700">
              <span>{t('مستحق لمنصة سيرف')}</span>
              <span>{formatMoney(commission)}</span>
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>{t('المتبقي للشركة بعد عمولة سيرف')}</span>
              <span>{formatMoney(netAfterCommission)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
