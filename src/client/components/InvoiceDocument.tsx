import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Printer } from 'lucide-react';
import type { Invoice, Customer, Appointment, PaymentMethodOption } from '../../shared/types.js';
import { COMPANY_LEGAL_NAME, COMPANY_VAT_NUMBER } from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { buildZatcaQrPayload } from '../lib/zatca.js';
import { useI18n } from '../lib/i18n.js';

// A printable/exportable VAT invoice for one Invoice record, shown right
// after a payment is collected (see PayAppointmentModal) or re-opened later
// from the Sales & Invoices list. "Export" here means the browser's own
// print dialog ("Save as PDF") — the printable area is isolated with the
// .invoice-print-area rule in src/client/index.css, everything else is
// hidden while printing.
export default function InvoiceDocument({
  invoice,
  customer,
  appointment,
  paymentMethods,
  onClose,
}: {
  invoice: Invoice;
  customer?: Customer;
  appointment?: Appointment;
  paymentMethods: PaymentMethodOption[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const payload = buildZatcaQrPayload({
      sellerName: COMPANY_LEGAL_NAME,
      vatNumber: COMPANY_VAT_NUMBER,
      timestamp: invoice.created_at ?? `${invoice.issue_date}T00:00:00Z`,
      totalWithVat: invoice.total,
      vatAmount: invoice.vat_amount,
    });
    QRCode.toDataURL(payload, { width: 160, margin: 1 }).then(setQrDataUrl);
  }, [invoice.created_at, invoice.issue_date, invoice.total, invoice.vat_amount]);

  const methodName = paymentMethods.find((m) => m.id === invoice.payment_method)?.name ?? invoice.payment_method ?? '—';
  const workDescription = appointment?.service_name_snapshot || invoice.notes || t('خدمات نظافة وصيانة');
  const location = [customer?.district, customer?.city].filter(Boolean).join('، ') || customer?.address || appointment?.address_snapshot || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('الفاتورة الضريبية')}</h2>
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
            <div>
              <div className="text-lg font-bold text-slate-800">{COMPANY_LEGAL_NAME}</div>
              <div className="text-xs text-slate-400">{t('لأعمال الصيانة والتنظيف')}</div>
              <div className="mt-1 text-xs text-slate-400">{t('الرقم الضريبي:')} {COMPANY_VAT_NUMBER}</div>
            </div>
            <div className="text-end">
              <div className="text-sm font-bold text-brand-700">{t('فاتورة ضريبية مبسطة')}</div>
              <div className="text-xs text-slate-500">{t('رقم الفاتورة:')} {invoice.invoice_number}</div>
              <div className="text-xs text-slate-500">{t('التاريخ:')} {formatDateAr(invoice.issue_date)}</div>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-400">{t('بيانات العميل')}</div>
              <div className="font-medium text-slate-700">{invoice.customer_name_snapshot}</div>
              {customer?.phone && <div className="text-slate-500" dir="ltr">{customer.phone}</div>}
              <div className="text-slate-500">{location}</div>
            </div>
            <div className="text-end">
              <div className="mb-1 text-xs font-semibold text-slate-400">{t('طريقة الدفع')}</div>
              <div className="font-medium text-slate-700">{methodName}</div>
              <div className="mt-2 mb-1 text-xs font-semibold text-slate-400">{t('حالة السداد')}</div>
              <div className="font-medium text-slate-700">
                {invoice.payment_status === 'paid' ? t('مسدد بالكامل') : invoice.payment_status === 'partial' ? t('مسدد جزئياً') : t('غير مسدد')}
              </div>
            </div>
          </div>

          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
                  <th className="p-2.5 text-start font-medium">{t('البيان')}</th>
                  <th className="p-2.5 text-start font-medium">{t('المبلغ')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2.5 text-slate-700">{workDescription}</td>
                  <td className="p-2.5 text-slate-700">{formatMoney(invoice.subtotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-6 space-y-1.5 border-t border-dashed border-slate-200 pt-3 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>{t('الإجمالي قبل الضريبة')}</span>
              <span>{formatMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{t('ضريبة القيمة المضافة (15٪)')}</span>
              <span>{formatMoney(invoice.vat_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-800">
              <span>{t('الإجمالي شامل الضريبة')}</span>
              <span>{formatMoney(invoice.total)}</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1.5 border-t border-dashed border-slate-200 pt-4">
            {qrDataUrl && <img src={qrDataUrl} alt={t('رمز الفاتورة الضريبية (متوافق مع هيئة الزكاة والضريبة)')} className="h-36 w-36" />}
            <div className="text-[11px] text-slate-400">{t('رمز الاستجابة السريعة متوافق مع متطلبات هيئة الزكاة والضريبة والجمارك')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
