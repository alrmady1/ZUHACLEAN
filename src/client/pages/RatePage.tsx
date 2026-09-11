import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';

// إيموجي تعبيري بدل النجوم — 1 (غير راضٍ إطلاقاً) إلى 5 (سعيد جداً)، بنفس
// معنى Rating.stars في shared/types.ts تماماً (لم يتغيّر شيء في المعنى أو
// التخزين، فقط طريقة العرض).
const EMOJI_BY_STARS: Record<number, string> = { 1: '😡', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

// صفحة تقييم عامة — بلا تسجيل دخول عمداً — يفتحها العميل من رابط واتساب
// يُرسَل يدوياً من زر "طلب تقييم" في AppointmentDetailModal بعد اكتمال
// الخدمة وإصدار الفاتورة. موعد واحد = تقييم واحد فقط (يمنعه الخادم عند
// التكرار، انظر POST /public/ratings في src/server/routes/api.ts).
interface AppointmentPublicInfo {
  id: string;
  customer_name_snapshot: string;
  service_name_snapshot: string;
  scheduled_at: string;
  already_rated: boolean;
}

export default function RatePage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [info, setInfo] = useState<AppointmentPublicInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [stars, setStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    api
      .get<AppointmentPublicInfo>(`/public/appointments/${appointmentId}`)
      .then(setInfo)
      .catch(() => setLoadError('تعذّر العثور على هذا الموعد. تأكد من الرابط المرسل إليك.'));
  }, [appointmentId]);

  // هذه الصفحة العامة تبقى بإضاءة نهارية دائماً، حتى لو كان تفضيل الوضع
  // الداكن للحساب الرئيسي مفعّلاً على نفس المتصفح — نفس منطق OrderPage.tsx
  // بالضبط (localStorage مشترك على مستوى النطاق لا الحساب)، مع استثناء
  // /rate الموازي في index.html لمنع "وميض" الوضع الداكن قبل هذا الأثر.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
    };
  }, []);

  async function submit() {
    if (!appointmentId || stars === 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api.post('/public/ratings', { appointment_id: appointmentId, stars, comment: comment.trim() || undefined });
      setDone(true);
    } catch (err) {
      let message = 'تعذّر إرسال التقييم، حاول مرة أخرى.';
      try {
        const parsed = JSON.parse((err as Error).message);
        if (parsed?.error) message = parsed.error;
      } catch {
        // ignore parse errors, use default message
      }
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const showThankYou = done || info?.already_rated;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/invoice-logo.png" alt="زهى" className="mb-4 h-14 w-14 rounded-2xl" />
          <p className="text-sm text-slate-400">لأعمال الصيانة والتنظيف</p>
        </div>

        {loadError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
          </div>
        )}

        {!loadError && !info && (
          <div className="py-6 text-center text-sm text-slate-400">جارِ التحميل…</div>
        )}

        {info && showThankYou && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <h2 className="text-lg font-bold text-slate-800">شكراً لك!</h2>
            <p className="text-sm text-slate-500">تم استلام تقييمك بنجاح، نقدّر وقتك ورأيك ونسعى دائماً لتقديم الأفضل.</p>
          </div>
        )}

        {info && !showThankYou && (
          <div className="space-y-5">
            <div className="space-y-1.5 text-center text-sm text-slate-600">
              <p>
                أهلاً <span className="font-semibold text-slate-800">{info.customer_name_snapshot || 'العميل الكريم'}</span> 👋
              </p>
              <p>نتمنى أن تكون خدماتنا اليوم حازت على رضاك!</p>
              <p>يسعدنا تقييمك السريع للخدمة</p>
              <p>شاكرين لك اختيارك لنا!</p>
            </div>

            <div className="flex justify-center gap-2" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  onMouseEnter={() => setHoverStars(n)}
                  onMouseLeave={() => setHoverStars(0)}
                  aria-label={`${n} من ٥`}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl transition ${
                    n === (hoverStars || stars) ? 'scale-110 bg-brand-50 ring-2 ring-brand-200' : 'grayscale hover:grayscale-0'
                  }`}
                >
                  {EMOJI_BY_STARS[n]}
                </button>
              ))}
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">شاركنا رأيك باختصار (اختياري)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="اكتب رأيك هنا..."
                className="input resize-none bg-slate-50"
              />
            </label>

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
              </div>
            )}

            <button
              type="button"
              disabled={stars === 0 || submitting}
              onClick={submit}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الإرسال…' : 'إرسال التقييم'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
