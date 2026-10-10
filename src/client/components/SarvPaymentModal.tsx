import { useState } from 'react';
import { X, Paperclip } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Invoice } from '../../shared/types.js';
import { sarvCommissionAmount } from '../../shared/sarv.js';
import { compressImageToDataUrl } from '../lib/image.js';
import { formatMoney } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// تسجيل سداد عمولة منصة سيرف لفاتورة واحدة: تاريخ التحويل + إيصال اختياري
// (صورة أو PDF)، أو إلغاء السداد. يُستخدَم من الإعدادات ← منصة سيرف ومن
// المحاسبة ← مبيعات منصة سيرف.
export default function SarvPaymentModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (updated: Invoice) => void;
}) {
  const { t } = useI18n();
  const isPaid = !!invoice.platform_commission_paid_at;
  const [paidAt, setPaidAt] = useState(invoice.platform_commission_paid_at ?? new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function save(paid: boolean) {
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { paid };
      if (paid) {
        payload.paid_at = paidAt;
        if (file) {
          payload.receipt_data_url = await compressImageToDataUrl(file);
          payload.receipt_name = file.name;
        } else if (removeReceipt) {
          payload.remove_receipt = true;
        }
      }
      onSaved(await api.post<Invoice>(`/invoices/${invoice.id}/platform-payment`, payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('تعذّر الحفظ'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">{t('سداد عمولة منصة سيرف')}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {invoice.invoice_number} — {formatMoney(sarvCommissionAmount(invoice))}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('تاريخ التحويل للمنصة')}</span>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="input" />
          </label>

          <div className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('إيصال التحويل (صورة أو PDF، اختياري)')}</span>
            {invoice.platform_payment_receipt_url && !removeReceipt && !file && (
              <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                <a href={invoice.platform_payment_receipt_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-brand-600 hover:underline">
                  <Paperclip className="h-3.5 w-3.5" /> {invoice.platform_payment_receipt_name || t('إيصال مرفق حالياً')}
                </a>
                <button type="button" onClick={() => setRemoveReceipt(true)} className="shrink-0 font-medium text-red-600 hover:underline">
                  {t('إزالة')}
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setRemoveReceipt(false);
              }}
              className="block w-full text-sm text-slate-600"
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting || !paidAt}
            onClick={() => save(true)}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : isPaid ? t('حفظ') : t('تسجيل السداد للمنصة')}
          </button>
          {isPaid && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => window.confirm(t('إلغاء تسجيل السداد؟ سيُحذف تاريخ السداد والإيصال.')) && save(false)}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {t('إلغاء السداد')}
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500">
            {t('إلغاء')}
          </button>
        </div>
      </div>
    </div>
  );
}
