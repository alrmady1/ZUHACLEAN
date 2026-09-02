import { Star } from 'lucide-react';
import type {
  AppointmentStatus,
  PaymentStatus,
  ContractStatus,
} from '../../shared/types.js';
import { useI18n } from '../lib/i18n.js';

// القيم هنا عربية ثابتة على مستوى الوحدة عمداً — لا يمكن استدعاء useI18n()
// خارج مكوّن React، فالترجمة تحصل عند العرض داخل Pill بدل عند تعريف هذه
// الخرائط (نفس الأسلوب المتّبع في APPT_STATUS_STYLE أدناه وأي خريطة حالة
// مشابهة في الملفات الأخرى).
export const APPT_STATUS_STYLE: Record<AppointmentStatus, { label: string; className: string }> = {
  pending_review: { label: 'بانتظار المراجعة', className: 'bg-violet-100 text-violet-700' },
  scheduled: { label: 'مجدولة', className: 'bg-slate-100 text-slate-700' },
  on_the_way: { label: 'في الطريق', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'جارية', className: 'bg-amber-100 text-amber-700' },
  completed: { label: 'مكتملة', className: 'bg-emerald-100 text-emerald-700' },
  delayed: { label: 'مؤجلة', className: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'ملغاة', className: 'bg-red-100 text-red-700' },
};

const PAYMENT_STYLE: Record<PaymentStatus, { label: string; className: string }> = {
  paid: { label: 'مسدد بالكامل', className: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'مسدد جزئياً', className: 'bg-amber-100 text-amber-700' },
  unpaid: { label: 'غير مسدد', className: 'bg-red-100 text-red-700' },
};

const CONTRACT_STYLE: Record<ContractStatus, { label: string; className: string }> = {
  active: { label: 'ساري', className: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'مكتمل', className: 'bg-slate-100 text-slate-700' },
  cancelled: { label: 'ملغى', className: 'bg-red-100 text-red-700' },
  expired: { label: 'منتهي', className: 'bg-slate-200 text-slate-600' },
};

function Pill({ label, className }: { label: string; className: string }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {t(label)}
    </span>
  );
}

export const AppointmentStatusBadge = ({ status }: { status: AppointmentStatus }) => (
  <Pill {...APPT_STATUS_STYLE[status]} />
);
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Pill {...PAYMENT_STYLE[status]} />
);
export const ContractStatusBadge = ({ status }: { status: ContractStatus }) => (
  <Pill {...CONTRACT_STYLE[status]} />
);

// صف نجوم لعرض تقييم فردي واحد — rating.stars عدد صحيح من 1 إلى 5 دائماً
// (يفرضه POST /public/ratings). مستخدَمة في صفحة العملاء وتبويب "المهام
// المكتملة" داخل المواعيد.
export function RatingStars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3 w-3 ${n <= value ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'}`} />
      ))}
    </span>
  );
}

// شارة متوسط تقييم عميل (نجمة + الرقم + عدد التقييمات) — لا تُعرض إن لم
// يوجد أي تقييم بعد.
export function RatingSummaryBadge({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {avg.toFixed(1)} ({count})
    </span>
  );
}
