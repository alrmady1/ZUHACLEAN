import { useState } from 'react';
import { X, Printer, Pencil, Check, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Contract, Customer, ContractClause } from '../../shared/types.js';
import { COMPANY_NAME } from '../../shared/types.js';
import { DEFAULT_CONTRACT_CLAUSES } from '../../shared/documentDefaults.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import DocumentHeader from './DocumentHeader.js';

// العقد الرسمي القابل للطباعة (الطرف الأول: الشركة، الطرف الثاني:
// العميل) مع بنود وشروط قابلة للتحرير — تُنسَخ من DEFAULT_CONTRACT_
// CLAUSES في أول مرة يُفتح فيها هذا المستند لعقد لم يُخصَّص له بنود
// بعد، وتصبح بعدها بنود هذا العقد بالذات المستقلة (تُحفَظ على السجل
// نفسه عبر PATCH /contracts/:id، نفس مسار تعديل بيانات العقد الأخرى).
export default function ContractDocument({
  contract,
  customer,
  canEdit,
  onClose,
  onSaved,
}: {
  contract: Contract;
  customer?: Customer;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (updated: Contract) => void;
}) {
  const { t, tt } = useI18n();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clauses, setClauses] = useState<ContractClause[]>(
    contract.clauses ?? DEFAULT_CONTRACT_CLAUSES.map((c) => ({ id: crypto.randomUUID(), ...c })),
  );

  const displayedClauses = contract.clauses ?? DEFAULT_CONTRACT_CLAUSES.map((c, i) => ({ id: `default-${i}`, ...c }));

  function startEditing() {
    setClauses(contract.clauses ?? DEFAULT_CONTRACT_CLAUSES.map((c) => ({ id: crypto.randomUUID(), ...c })));
    setEditing(true);
  }

  function updateClause(id: string, patch: Partial<ContractClause>) {
    setClauses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeClause(id: string) {
    setClauses((prev) => prev.filter((c) => c.id !== id));
  }

  function addClause() {
    setClauses((prev) => [...prev, { id: crypto.randomUUID(), title: '', body: '' }]);
  }

  async function save() {
    setSubmitting(true);
    try {
      const updated = await api.patch<Contract>(`/contracts/${contract.id}`, { clauses });
      onSaved(updated);
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  const visitFreqLabel =
    contract.visit_frequency === 'weekly' ? t('أسبوعي') : contract.visit_frequency === 'bi_weekly' ? t('نصف شهري') : t('شهري');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('العقد الرسمي')}</h2>
          <div className="flex items-center gap-2">
            {!editing && canEdit && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" /> {t('تحرير البنود')}
              </button>
            )}
            {!editing && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Printer className="h-3.5 w-3.5" /> {t('طباعة / تصدير PDF')}
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3 overflow-y-auto p-6">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {t('هذه البنود خاصة بهذا العقد فقط — إضافة أو حذف أو تعديل بند هنا لا يؤثر على أي عقد آخر.')}
            </p>
            {clauses.map((c, i) => (
              <div key={c.id} className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold text-slate-400">{i + 1}.</span>
                  <input
                    value={c.title}
                    onChange={(e) => updateClause(c.id, { title: e.target.value })}
                    placeholder={t('عنوان البند')}
                    className="input flex-1 text-sm font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => removeClause(c.id)}
                    title={t('حذف البند')}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  value={c.body}
                  onChange={(e) => updateClause(c.id, { body: e.target.value })}
                  placeholder={t('نص البند')}
                  rows={3}
                  className="input resize-none text-sm"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addClause}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600"
            >
              <Plus className="h-4 w-4" /> {t('إضافة بند جديد')}
            </button>
            <div className="flex items-center gap-2 pt-1">
              <button
                disabled={submitting}
                onClick={save}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {submitting ? t('جارِ الحفظ…') : t('حفظ البنود')}
              </button>
              <button onClick={() => setEditing(false)} className="text-sm font-medium text-slate-400 hover:text-slate-600">
                {t('إلغاء')}
              </button>
            </div>
          </div>
        ) : (
          <div className="invoice-print-area overflow-y-auto p-6">
            <DocumentHeader />

            <div className="mb-5 text-center">
              <div className="text-base font-bold text-slate-800">{t('عقد تقديم خدمات نظافة وصيانة')}</div>
              <div className="mt-1 text-xs text-slate-500">
                {t('رقم العقد:')} {contract.contract_number} — {t('تاريخ التحرير:')} {formatDateAr(contract.created_at)}
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 text-xs font-semibold text-brand-600">{t('الطرف الأول (مقدّم الخدمة)')}</div>
                <div className="font-medium text-slate-700">{COMPANY_NAME}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 text-xs font-semibold text-brand-600">{t('الطرف الثاني (العميل)')}</div>
                <div className="font-medium text-slate-700">{contract.customer_id ? customer?.name ?? '—' : '—'}</div>
                {customer?.phone && <div className="text-slate-500" dir="ltr">{customer.phone}</div>}
                {customer?.address && <div className="text-slate-500">{customer.address}</div>}
              </div>
            </div>

            <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-start text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="w-1/3 bg-slate-50 p-2.5 text-xs font-semibold text-slate-500">{t('الخدمة')}</td>
                    <td className="p-2.5 text-slate-700">{contract.service_name_snapshot}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="bg-slate-50 p-2.5 text-xs font-semibold text-slate-500">{t('تكرار الزيارات')}</td>
                    <td className="p-2.5 text-slate-700">{visitFreqLabel}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="bg-slate-50 p-2.5 text-xs font-semibold text-slate-500">{t('فترة العقد')}</td>
                    <td className="p-2.5 text-slate-700" dir="ltr">{contract.start_date} → {contract.end_date}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 p-2.5 text-xs font-semibold text-slate-500">{t('القيمة الإجمالية')}</td>
                    <td className="p-2.5 font-bold text-slate-800">{formatMoney(contract.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mb-6 space-y-4">
              <div className="text-sm font-bold text-slate-800">{t('البنود والشروط')}</div>
              {displayedClauses.map((c, i) => (
                <div key={c.id} className="text-sm">
                  <div className="font-semibold text-slate-700">{c.title}</div>
                  <div className="mt-0.5 leading-relaxed text-slate-600">{c.body}</div>
                </div>
              ))}
              {displayedClauses.length === 0 && (
                <div className="text-xs text-slate-400">{t('لا توجد بنود مضافة لهذا العقد بعد.')}</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-8 border-t border-dashed border-slate-200 pt-6 text-sm">
              <div className="text-center">
                <div className="mb-8 font-medium text-slate-600">{tt('توقيع الطرف الأول', 'First Party Signature')}</div>
                <div className="border-t border-slate-300 pt-1 text-xs text-slate-400">{COMPANY_NAME}</div>
              </div>
              <div className="text-center">
                <div className="mb-8 font-medium text-slate-600">{tt('توقيع الطرف الثاني', 'Second Party Signature')}</div>
                <div className="border-t border-slate-300 pt-1 text-xs text-slate-400">{customer?.name ?? '—'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
