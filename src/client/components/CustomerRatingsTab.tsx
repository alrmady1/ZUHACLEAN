import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import type { Rating, Appointment } from '../../shared/types.js';
import { RatingStars } from './Badge.js';
import { formatDateAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

type SortMode = 'newest' | 'highest' | 'lowest';

// تبويب "التقييمات" داخل صفحة العملاء — كل تقييمات العملاء للخدمة (Rating،
// عكس CustomerRating وهو تقييم المشرف للعميل)، قابلة للترتيب حسب الأحدث
// أو الأعلى أو الأقل تقييماً. لا جلب بيانات مستقل — تستقبل ratings
// وappointments من Customers.tsx (مُحمَّلتان أصلاً هناك).
export default function CustomerRatingsTab({
  ratings,
  appointments,
  onOpenCustomer,
}: {
  ratings: Rating[];
  appointments: Appointment[];
  onOpenCustomer?: (customerId: string) => void;
}) {
  const { t, tt } = useI18n();
  const [sort, setSort] = useState<SortMode>('newest');

  const apptById = useMemo(() => new Map(appointments.map((a) => [a.id, a])), [appointments]);

  const sorted = useMemo(() => {
    const list = [...ratings];
    // ثابت ثانوي (الأحدث أولاً) عند تساوي النجوم في ترتيب "الأعلى"/"الأقل"
    // — يمنع قفز التقييمات المتساوية عشوائياً بين كل إعادة ترتيب.
    const byNewest = (a: Rating, b: Rating) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sort === 'newest') list.sort(byNewest);
    else if (sort === 'highest') list.sort((a, b) => b.stars - a.stars || byNewest(a, b));
    else list.sort((a, b) => a.stars - b.stars || byNewest(a, b));
    return list;
  }, [ratings, sort]);

  const avg = ratings.length > 0 ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          </span>
          <div>
            <div className="text-lg font-bold text-slate-800">{ratings.length > 0 ? avg.toFixed(1) : '—'}</div>
            <div className="text-xs text-slate-400">{tt(`من ${ratings.length} تقييم`, `From ${ratings.length} ratings`)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button
            onClick={() => setSort('newest')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${sort === 'newest' ? 'bg-brand-600 text-white' : 'text-slate-500'}`}
          >
            {t('الأحدث')}
          </button>
          <button
            onClick={() => setSort('highest')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${sort === 'highest' ? 'bg-brand-600 text-white' : 'text-slate-500'}`}
          >
            {t('الأكثر تقييماً')}
          </button>
          <button
            onClick={() => setSort('lowest')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${sort === 'lowest' ? 'bg-brand-600 text-white' : 'text-slate-500'}`}
          >
            {t('الأقل تقييماً')}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((r) => {
          const appt = apptById.get(r.appointment_id);
          return (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {r.customer_id && onOpenCustomer ? (
                    <button
                      onClick={() => onOpenCustomer(r.customer_id!)}
                      className="truncate text-sm font-semibold text-slate-800 hover:text-brand-600 hover:underline"
                    >
                      {r.customer_name_snapshot}
                    </button>
                  ) : (
                    <div className="truncate text-sm font-semibold text-slate-800">{r.customer_name_snapshot}</div>
                  )}
                  {appt?.service_name_snapshot && <div className="truncate text-xs text-slate-400">{appt.service_name_snapshot}</div>}
                </div>
                <div className="shrink-0 text-end">
                  <RatingStars value={r.stars} />
                  <div className="mt-0.5 text-[11px] text-slate-400">{formatDateAr(r.created_at)}</div>
                </div>
              </div>
              {r.comment ? (
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">"{r.comment}"</p>
              ) : (
                <p className="mt-2 text-xs text-slate-300">{t('بدون تعليق')}</p>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            {t('لا توجد تقييمات بعد')}
          </div>
        )}
      </div>
    </div>
  );
}
