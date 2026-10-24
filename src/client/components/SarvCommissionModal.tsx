import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Invoice } from '../../shared/types.js';
import { sarvCommissionAmount, sarvDefaultCommission, sarvIsManualCommission } from '../../shared/sarv.js';
import { formatMoney } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// تعديل قيمة عمولة سيرف يدوياً لفاتورة واحدة. الأصل دائماً الحساب الافتراضي
// (النسبة × إجمالي الفاتورة)؛ التعديل اليدوي يتفوّق عليه حتى "إعادة للافتراضي".
export default function SarvCommissionModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (updated: Invoice) => void;
}) {
  const { t, tt } = useI18n();
  const defaultAmount = sarvDefaultCommission(invoice);
  const isManual = sarvIsManualCommission(invoice);
  const [value, setValue] = useState(String(sarvCommissionAmount(invoice)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function save(manual: number | null) {
    setSubmitting(true);
    setError('');
    try {
      onSaved(await api.patch<Invoice>(`/invoices/${invoice.id}`, { platform_commission_manual_amount: manual }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('تعذّر الحفظ'));
    } finally {
      setSubmitting(false);
    }
  }

  const num = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(num) && num >= 0 && num <= invoice.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">{t('تعديل عمولة سيرف')}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {invoice.invoice_number} — {tt('إجمالي الفاتورة', 'Invoice total')} {formatMoney(invoice.total)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {tt('القيمة الافتراضية', 'Default value')} ({invoice.platform_commission_rate ?? 20}٪): <b className="text-slate-700">{formatMoney(defaultAmount)}</b>
            {isManual && <span className="ms-2 font-medium text-amber-600">{t('معدَّلة يدوياً حالياً')}</span>}
          </div>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">{t('قيمة العمولة (ر.س)')}</span>
            <input type="number" min={0} max={invoice.total} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="input" />
          </label>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!valid || submitting}
            onClick={() => save(num)}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : t('حفظ')}
          </button>
          {isManual && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => save(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('إعادة للافتراضي')}
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
