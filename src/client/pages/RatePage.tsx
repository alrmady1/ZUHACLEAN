import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Star, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';

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
          <img src="/icon-192.png" alt="زهى" className="mb-4 h-14 w-14 rounded-2xl" />
          <h1 className="text-xl font-bold text-slate-800">زهى</h1>
          <p className="mt-1 text-sm text-slate-400">لأعمال الصيانة والتنظيف</p>
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
            <div className="text-center">
              <p className="text-sm text-slate-600">
                عزيزنا{' '}
                <span className="font-semibold text-slate-800">
                  {info.customer_name_snapshot || 'العميل الكريم'}
                </span>
                ، كيف كانت تجربتك مع خدمة{' '}
                <span className="font-semibold text-slate-800">{info.service_name_snapshot}</span>؟
              </p>
            </div>

            <div className="flex justify-center gap-1.5" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  onMouseEnter={() => setHoverStars(n)}
                  onMouseLeave={() => setHoverStars(0)}
                  aria-label={`${n} نجوم`}
                  className="p-1"
                >
                  <Star
                    className={`h-9 w-9 transition ${
                      n <= (hoverStars || stars) ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'
                    }`}
                  />
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
                className="input resize-none"
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
