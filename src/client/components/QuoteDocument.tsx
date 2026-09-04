import { X, Printer, Copy } from 'lucide-react';
import type { Quote } from '../../shared/types.js';
import { VAT_RATE } from '../../shared/types.js';
import { QUOTE_VALIDITY_DAYS } from '../../shared/documentDefaults.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import DocumentHeader from './DocumentHeader.js';

// عرض السعر المطبوع — أسعار items مخزَّنة شاملة الضريبة (نفس اصطلاح
// تسعير الخدمات في كل النظام)، تُفصَل هنا فقط للعرض إلى قبل الضريبة +
// الضريبة + الإجمالي، بنفس طريقة الفاتورة (PayAppointmentModal).
export default function QuoteDocument({
  quote,
  onClose,
  onDuplicate,
}: {
  quote: Quote;
  onClose: () => void;
  // متاح فقط لمن يملك صلاحية إنشاء عروض أسعار — يفتح NewQuoteFlow معبَّأً
  // بنفس بيانات هذا العرض (انظر Quotes.tsx)، بدل التكرار اليدوي.
  onDuplicate?: () => void;
}) {
  const { t } = useI18n();
  const subtotal = Math.round((quote.total / (1 + VAT_RATE)) * 100) / 100;
  const vatAmount = Math.round((quote.total - subtotal) * 100) / 100;
  const validUntil = new Date(quote.issue_date);
  validUntil.setDate(validUntil.getDate() + QUOTE_VALIDITY_DAYS);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('عرض السعر')}</h2>
          <div className="flex items-center gap-2">
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" /> {t('نسخ كعرض جديد')}
              </button>
            )}
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
          <DocumentHeader />

          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-400">{t('بيانات العميل')}</div>
              <div className="font-medium text-slate-700">{quote.customer_name_snapshot}</div>
              {quote.customer_phone_snapshot && <div className="text-sm text-slate-500" dir="ltr">{quote.customer_phone_snapshot}</div>}
            </div>
            <div className="text-end">
              <div className="text-sm font-bold text-brand-700">{t('عرض سعر')}</div>
              <div className="text-xs text-slate-500">{t('رقم العرض:')} {quote.quote_number}</div>
              <div className="text-xs text-slate-500">{t('التاريخ:')} {formatDateAr(quote.issue_date)}</div>
              <div className="text-xs text-slate-500">
                {quote.path_type === 'contract' ? t('نوع الطلب: عقد متعدد الزيارات') : t('نوع الطلب: زيارة واحدة')}
              </div>
            </div>
          </div>

          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
                  <th className="p-2.5 text-start font-medium">{t('الخدمة')}</th>
                  <th className="p-2.5 text-start font-medium">{t('السعر')}</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((it, i) => (
                  <tr key={`${it.service_id}-${i}`} className="border-b border-slate-50 last:border-0">
                    <td className="p-2.5 text-slate-700">{it.service_name}</td>
                    <td className="p-2.5 text-slate-700">{formatMoney(it.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-6 space-y-1.5 border-t border-dashed border-slate-200 pt-3 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>{t('الإجمالي قبل الضريبة')}</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{t('ضريبة القيمة المضافة (15٪)')}</span>
              <span>{formatMoney(vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-800">
              <span>{t('الإجمالي شامل الضريبة')}</span>
              <span>{formatMoney(quote.total)}</span>
            </div>
          </div>

          {quote.payment_note && (
            <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{quote.payment_note}</div>
          )}

          <div className="rounded-xl bg-amber-50 p-3 text-center text-xs font-medium text-amber-700">
            {t('هذا العرض صالح لمدة 15 يوماً من تاريخه')} ({formatDateAr(quote.issue_date)} → {formatDateAr(validUntil.toISOString())})
          </div>
        </div>
      </div>
    </div>
  );
}
