import { useState } from 'react';
import { X, Star } from 'lucide-react';
import { api } from '../lib/api.js';
import type { CustomerRating } from '../../shared/types.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

// تقييم المشرف للعميل بعد اكتمال الطلب (عكس تقييم العميل للخدمة) — 5
// نجوم + ملاحظات، تُحفظ باستبدال أي تقييم سابق لنفس الموعد (upsert، انظر
// POST /customer-ratings في src/server/routes/api.ts). عنصر مشترك يُستخدَم
// من تبويب "المهام المكتملة" (Appointments.tsx) ومن داخل تفاصيل الموعد
// نفسه (AppointmentDetailModal.tsx) — نفس المنطق والشكل في الموضعين.
export default function CustomerRatingModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: { appointmentId: string; stars: number; notes?: string };
  onClose: () => void;
  onSaved: (r: CustomerRating) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [stars, setStars] = useState(existing.stars);
  const [notes, setNotes] = useState(existing.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (stars === 0) return;
    setSubmitting(true);
    try {
      const saved = await api.post<CustomerRating>('/customer-ratings', {
        appointment_id: existing.appointmentId,
        stars,
        notes: notes.trim() || undefined,
        rated_by: user?.id,
      });
      onSaved(saved);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t('تقييم العميل')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">{t('أضف تقييمك للعميل بعد اكتمال الطلب')}</p>
        <div className="mb-4 flex justify-center gap-1.5" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setStars(n)} className="p-1">
              <Star className={`h-8 w-8 transition ${n <= stars ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'}`} />
            </button>
          ))}
        </div>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('ملاحظات على العميل (اختياري)')}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} className="input resize-none" />
        </label>
        <button
          type="button"
          disabled={stars === 0 || submitting}
          onClick={save}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ الحفظ…') : t('حفظ تقييم العميل')}
        </button>
      </div>
    </div>
  );
}
