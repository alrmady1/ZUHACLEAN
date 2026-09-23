import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Pencil, Trash2, Paperclip, X, Car, User } from 'lucide-react';
import { api } from '../lib/api.js';
import type { ExpiryRow } from '../../shared/expiryRegister.js';
import { expiryDaysRemaining, expiryStatus } from '../../shared/expiryRegister.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import { compressImageToDataUrl } from '../lib/image.js';

// تبويب "تواريخ الانتهاء" (المحاسبة) — نفس فكرة الجدول المُضاف سابقاً في
// تطبيقَي المقاولات (نهوض نجد وزهى الأعمال للمقاولات): سجل واحد مرتَّب
// حسب الأقرب انتهاءً لكل ما له تاريخ صلاحية في الشركة. الفرق هنا: بنود
// أوراق المركبات وهويات/عقود الموظفين "للعرض فقط" — مشتقّة مباشرة من
// صفحاتها الأصلية (الإعدادات ← المركبات، صفحة الموظف) بدل إعادة إدخالها،
// فتعديلها يكون من هناك. البند القابل للإضافة/التعديل هنا مباشرة هو
// "مستند شركة" حر (سجل تجاري، تأمينات، عقود إيجار مكتب...). انظر
// src/shared/expiryRegister.ts لمنطق التجميع، وGET /expiry-documents
// في api.ts الذي يبنيه من Vehicle وProfile ومستندات الشركة معاً.
const CATEGORY_PRESETS = ['سجلات المنشأة', 'تأمينات', 'عقود إيجار', 'تراخيص بلدية'];

const STATUS_STYLE: Record<string, string> = {
  expired: 'bg-red-100 text-red-700',
  near: 'bg-amber-100 text-amber-700',
  ok: 'bg-emerald-100 text-emerald-700',
  unknown: 'bg-slate-100 text-slate-500',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warning' | 'success' }) {
  const color = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

export function ExpiryDocumentsTab() {
  const { t, tt } = useI18n();
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<ExpiryRow | 'new' | null>(null);

  function refresh() {
    setLoading(true);
    api
      .get<ExpiryRow[]>('/expiry-documents')
      .then(setRows)
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  const categories = useMemo(
    () => Array.from(new Set([...CATEGORY_PRESETS, ...rows.filter((r) => r.source === 'company').map((r) => r.category)])),
    [rows],
  );

  const counts = useMemo(() => {
    const c = { expired: 0, near: 0, ok: 0 };
    for (const r of rows) {
      const key = expiryStatus(expiryDaysRemaining(r.expiry_date)).key;
      if (key === 'expired' || key === 'near' || key === 'ok') c[key] += 1;
    }
    return c;
  }, [rows]);

  async function deleteDoc(row: ExpiryRow) {
    const id = row.row_key.split(':')[1];
    if (!window.confirm(tt(`حذف "${row.name}" من سجل تواريخ الانتهاء؟`, `Delete "${row.name}" from the expiry register?`))) return;
    await api.del(`/expiry-documents/${id}`);
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-800">{t('تواريخ انتهاء الأوراق الرسمية')}</h3>
        <p className="mt-1 text-xs text-slate-400">
          {t('سجلات المنشأة، تراخيص وتأمينات، وأوراق المركبات وهويات/عقود الموظفين (مقروءة تلقائياً من صفحاتها الأصلية) — مرتَّبة حسب الأقرب انتهاءً')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label={t('إجمالي البنود')} value={String(rows.length)} />
        <MiniStat label={t('منتهية')} value={String(counts.expired)} tone="danger" />
        <MiniStat label={t('تقترب من الانتهاء (خلال شهرين)')} value={String(counts.near)} tone="warning" />
        <MiniStat label={t('سارية')} value={String(counts.ok)} tone="success" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-700">{t('السجل')}</h3>
          <button
            onClick={() => setEditingRow('new')}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> {t('إضافة مستند')}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('جارِ التحميل…')}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('لا توجد بنود مسجَّلة بعد — أضف أول مستند من الزر أعلاه')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="p-3 text-start font-medium">{t('التصنيف')}</th>
                  <th className="p-3 text-start font-medium">{t('البند')}</th>
                  <th className="p-3 text-start font-medium">{t('تاريخ الانتهاء')}</th>
                  <th className="p-3 text-start font-medium">{t('المتبقي')}</th>
                  <th className="p-3 text-start font-medium">{t('التكلفة')}</th>
                  <th className="p-3 text-start font-medium">{t('الحالة')}</th>
                  <th className="p-3 text-start font-medium">{t('المرفق')}</th>
                  <th className="p-3 text-start font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const days = expiryDaysRemaining(row.expiry_date);
                  const status = expiryStatus(days);
                  return (
                    <tr key={row.row_key} className="border-b border-slate-50 last:border-0">
                      <td className="p-3 text-slate-600">{t(row.category)}</td>
                      <td className="p-3 text-slate-700">
                        <div className="flex items-center gap-1.5 font-medium">
                          {row.source === 'vehicle' && <Car className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                          {row.source === 'employee' && <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                          {row.name}
                        </div>
                        {!row.editable && (
                          <div className="text-[11px] text-slate-400">
                            {row.source === 'vehicle' ? t('من الإعدادات ← المركبات') : t('من صفحة الموظف')}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-600" dir="ltr">
                        {row.expiry_date ? formatDateAr(row.expiry_date) : '—'}
                      </td>
                      <td className="p-3 text-slate-600">
                        {days === null ? '—' : tt(`${days} يوم`, `${days} d`)}
                      </td>
                      <td className="p-3 text-slate-600">{row.cost ? formatMoney(row.cost) : '—'}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status.key]}`}>{t(status.label)}</span>
                      </td>
                      <td className="p-3">
                        {row.attachment_url ? (
                          <a
                            href={row.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                          >
                            <Paperclip className="h-3.5 w-3.5" /> {t('عرض')}
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {row.editable && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingRow(row)}
                              title={t('تعديل')}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteDoc(row)}
                              title={t('حذف')}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingRow && (
        <DocumentModal
          row={editingRow === 'new' ? null : editingRow}
          categories={categories}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DocumentModal({
  row,
  categories,
  onClose,
  onSaved,
}: {
  row: ExpiryRow | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isEdit = !!row;
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        category: form.get('category'),
        name: form.get('name'),
        expiry_date: form.get('expiry_date'),
        cost: form.get('cost') || undefined,
        notes: form.get('notes') || undefined,
      };
      if (attachmentFile) {
        payload.attachment_data_url = await compressImageToDataUrl(attachmentFile);
        payload.attachment_name = attachmentFile.name;
      } else if (removeAttachment) {
        payload.remove_attachment = true;
      }
      if (isEdit) {
        const id = row!.row_key.split(':')[1];
        await api.patch(`/expiry-documents/${id}`, payload);
      } else {
        await api.post('/expiry-documents', payload);
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-800">{isEdit ? t('تعديل مستند') : t('إضافة مستند')}</h2>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label={t('التصنيف')}>
            <input name="category" list="expiry-doc-categories" defaultValue={row?.category ?? categories[0]} className="input" required />
            <datalist id="expiry-doc-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={t('البند')}>
            <input
              name="name"
              defaultValue={row?.name}
              placeholder={t('مثال: السجل التجاري، تأمين المبنى، عقد إيجار المكتب')}
              className="input"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('تاريخ الانتهاء')}>
              <input type="date" name="expiry_date" defaultValue={row?.expiry_date} className="input" required />
            </Field>
            <Field label={t('التكلفة (اختياري، ر.س)')}>
              <input type="number" name="cost" min={0} step="0.01" defaultValue={row?.cost} className="input" />
            </Field>
          </div>
          <Field label={t('ملاحظات (اختياري)')}>
            <textarea name="notes" defaultValue={row?.notes} rows={2} className="input resize-none" />
          </Field>
          <Field label={t('صورة أو ملف المستند (اختياري)')}>
            {row?.attachment_url && !removeAttachment && !attachmentFile && (
              <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                <a href={row.attachment_url} target="_blank" rel="noreferrer" className="truncate text-brand-600 hover:underline">
                  {t('ملف مرفق حالياً')}
                </a>
                <button type="button" onClick={() => setRemoveAttachment(true)} className="shrink-0 font-medium text-red-600 hover:underline">
                  {t('إزالة')}
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                setAttachmentFile(e.target.files?.[0] ?? null);
                setRemoveAttachment(false);
              }}
              className="block w-full text-sm text-slate-600"
            />
          </Field>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ الحفظ…') : t('حفظ')}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500">
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </div>
  );
}
