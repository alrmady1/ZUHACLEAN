import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Moon } from 'lucide-react';
import type { Appointment, Customer } from '../../shared/types.js';
import { weekdayAr, formatTimeAr, type Lang } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// تاريخ ميلادي صراحةً بغضّ النظر عن التقويم الافتراضي — بعض المتصفحات
// (خاصة على الجوال) تعرض التقويم الهجري افتراضياً مع locale "ar-SA" ما
// لم يُفرَض التقويم الميلادي (gregory) صراحةً هكذا.
function formatGregorianDate(d: Date, lang: Lang): string {
  const locale = lang === 'ar' ? 'ar-SA' : lang === 'bn' ? 'bn-BD-u-nu-latn' : lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-US';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', calendar: 'gregory' });
}

// ألوان قطاعات الساعة — دورية حسب ترتيب مواعيد اليوم (وليست ثابتة لكل
// عميل أو خدمة)، بألوان هادئة تُقرأ بوضوح فوق قرص أبيض.
const WEDGE_COLORS = ['#F5A3A3', '#8BE0B4', '#7FD3E8', '#F6C878', '#B9A6EA', '#F3A3CB', '#A6D97F'];

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

// نقطة على محيط دائرة مركزها (cx, cy) ونصف قطرها r، عند زاوية angleDeg
// حيث 0° = الثانية عشرة (لأعلى) وتتزايد باتجاه عقارب الساعة — هذا
// التعريف يطابق قراءة الساعة مباشرة بلا حاجة لتحويل زوايا رياضية معتادة.
function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// قطاع دائري (pie slice) من startDeg بامتداد sweepDeg باتجاه عقارب
// الساعة — يُستخدم لرسم النطاق الزمني لكل موعد فوق القرص. sweepDeg قد
// يتجاوز 180° (موعد طويل يمتد لعدة ساعات)، فتُحسَب علامة "القوس الكبير"
// (large-arc-flag) بناءً على الامتداد الفعلي قبل أي "لف" حول الدائرة.
function wedgePath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const clampedSweep = Math.min(Math.max(sweepDeg, 1), 359.5);
  const start = pointOnCircle(cx, cy, r, startDeg);
  const end = pointOnCircle(cx, cy, r, startDeg + clampedSweep);
  const largeArc = clampedSweep > 180 ? 1 : 0;
  return `M ${cx},${cy} L ${start.x},${start.y} A ${r},${r} 0 ${largeArc} 1 ${end.x},${end.y} Z`;
}

// كسر الساعة الاثنتي عشرية (0..1) لوقت معيّن — 0/1 = الثانية عشرة، 0.5 =
// السادسة، بغضّ النظر عن كونه صباحاً أو مساءً (القرص 12 ساعة كساعة حائط
// عادية، لا 24).
function twelveHourFraction(d: Date): number {
  return ((d.getHours() % 12) + d.getMinutes() / 60 + d.getSeconds() / 3600) / 12;
}

// موعد "ليلي" — من بعد أذان المغرب (٦ م تقريباً) حتى ٦ الصباح. القرص
// الرئيسي أعلاه قرص 12 ساعة عادي (كساعة حائط)، فلا يميّز موعد الساعة ١
// فجراً عن موعد الساعة ١ ظهراً — يظهران في نفس الموضع تماماً. هذا هو سبب
// الحاجة لقرص ثانٍ مستقل مخصَّص لمواعيد الليل فقط (انظر nightFraction
// والقرص الثاني أدناه)، يظهر فقط في الأيام التي تحوي موعداً ليلياً واحداً
// على الأقل.
function isNightHour(d: Date): boolean {
  const h = d.getHours();
  return h >= 18 || h < 6;
}

// كسر الساعة لقرص الليل (0..1) — نطاق الليل نفسه 12 ساعة بالضبط (٦ م
// ← ٦ ص)، فيُعاد تدويره هنا كدورة كاملة مستقلة: 0 = ٦ م (الثانية عشرة
// على القرص)، 0.5 = منتصف الليل (السادسة على القرص)، تصل لِما يقارب 1
// عند الاقتراب من ٦ ص. بخلاف twelveHourFraction أعلاه (التي تكرّر كل
// ساعة مرتين يومياً)، كل ساعة هنا تقع في موضع واحد فريد ضمن نطاق الليل.
function nightFraction(d: Date): number {
  const hoursSince6pm = (d.getHours() + 24 - 18) % 24;
  return (hoursSince6pm + d.getMinutes() / 60 + d.getSeconds() / 3600) / 12;
}

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 10;

// القرص الثانوي (مواعيد الليل) — أصغر، يظهر فقط بجانب القرص الرئيسي عند
// وجود موعد ليلي واحد على الأقل في اليوم المختار.
const SIZE2 = 170;
const CX2 = SIZE2 / 2;
const CY2 = SIZE2 / 2;
const R2 = SIZE2 / 2 - 8;

export default function DayClock({
  appointments,
  customers,
  onSelectAppointment,
}: {
  appointments: Appointment[];
  // لإظهار اسم حي العميل بجانب اسمه في قائمة مواعيد اليوم أسفل الساعة.
  customers: Customer[];
  onSelectAppointment: (appt: Appointment) => void;
}) {
  const { t, tt, lang } = useI18n();
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(new Date(a.scheduled_at), selectedDate))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [appointments, selectedDate],
  );

  // مواعيد الليل من نفس اليوم — colorIndex محفوظ من فهرس الموعد في
  // dayAppointments نفسها، حتى يتطابق لون الموعد بين القرصين (لا فهرس
  // جديد مستقل داخل مواعيد الليل وحدها).
  const nightAppointments = useMemo(
    () =>
      dayAppointments
        .map((a, colorIndex) => ({ a, colorIndex }))
        .filter(({ a }) => isNightHour(new Date(a.scheduled_at))),
    [dayAppointments],
  );

  const isToday = isSameDay(selectedDate, new Date());
  const now = new Date();
  const hourAngle = twelveHourFraction(now) * 360;
  const minuteAngle = (now.getMinutes() / 60) * 360;

  function shiftDay(delta: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta);
      return next;
    });
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-center gap-5">
        <div className="mx-auto w-full max-w-[320px]">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full select-none">
            <circle cx={CX} cy={CY} r={R} fill="#ffffff" stroke="#0f172a" strokeWidth="7" />

            {/* قطاعات مواعيد اليوم المختار — قابلة للضغط لفتح تفاصيل الموعد */}
            {dayAppointments.map((a, i) => {
              const start = new Date(a.scheduled_at);
              const startDeg = twelveHourFraction(start) * 360;
              const sweepDeg = (a.expected_duration_minutes / (12 * 60)) * 360;
              return (
                <path
                  key={a.id}
                  d={wedgePath(CX, CY, R - 5, startDeg, sweepDeg)}
                  fill={WEDGE_COLORS[i % WEDGE_COLORS.length]}
                  opacity={0.8}
                  className="cursor-pointer transition hover:opacity-100"
                  onClick={() => onSelectAppointment(a)}
                >
                  <title>
                    {formatTimeAr(a.scheduled_at)} — {a.customer_name_snapshot}
                  </title>
                </path>
              );
            })}

            {/* علامات الدقائق والساعات */}
            {Array.from({ length: 60 }).map((_, i) => {
              const isHourTick = i % 5 === 0;
              const p1 = pointOnCircle(CX, CY, R - 2, i * 6);
              const p2 = pointOnCircle(CX, CY, R - (isHourTick ? 15 : 7), i * 6);
              return (
                <line
                  key={i}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#1e293b"
                  strokeWidth={isHourTick ? 2.5 : 1}
                  strokeLinecap="round"
                />
              );
            })}

            {/* أرقام الساعات */}
            {Array.from({ length: 12 }).map((_, i) => {
              const num = i === 0 ? 12 : i;
              const p = pointOnCircle(CX, CY, R - 34, i * 30);
              return (
                <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={800} fill="#0f172a">
                  {num}
                </text>
              );
            })}

            {/* عقربا الساعة الحاليان — يظهران فقط عند عرض يوم "اليوم" الفعلي،
                فلا معنى لعرض الوقت الحالي فوق جدول يوم آخر. */}
            {isToday && (
              <>
                <line
                  x1={CX}
                  y1={CY}
                  x2={pointOnCircle(CX, CY, R * 0.5, hourAngle).x}
                  y2={pointOnCircle(CX, CY, R * 0.5, hourAngle).y}
                  stroke="#0f172a"
                  strokeWidth={6}
                  strokeLinecap="round"
                />
                <line
                  x1={CX}
                  y1={CY}
                  x2={pointOnCircle(CX, CY, R * 0.75, minuteAngle).x}
                  y2={pointOnCircle(CX, CY, R * 0.75, minuteAngle).y}
                  stroke="#0f172a"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              </>
            )}
            <circle cx={CX} cy={CY} r={7} fill="#0f172a" />
          </svg>
        </div>

        {/* القرص الثانوي لمواعيد الليل — يظهر فقط في الأيام التي تحوي
            موعداً واحداً على الأقل من بعد ٦ م حتى ٦ ص (انظر isNightHour).
            القرص الرئيسي أعلاه 12 ساعة عادية، فموعد الواحدة فجراً والواحدة
            ظهراً يقعان في نفس الموضع بالضبط عليه — هذا القرص المستقل (12
            ساعة = كامل نطاق الليل، بلا تكرار موضع) يوضّح وقت الموعد
            الليلي الفعلي بلا لبس. */}
        {nightAppointments.length > 0 && (
          <div className="w-full max-w-[180px] shrink-0">
            <div className="mb-1.5 flex items-center justify-center gap-1 text-xs font-semibold text-slate-500">
              <Moon className="h-3.5 w-3.5" /> {t('مواعيد ليلية')}
            </div>
            <svg viewBox={`0 0 ${SIZE2} ${SIZE2}`} className="h-auto w-full select-none">
              <circle cx={CX2} cy={CY2} r={R2} fill="#0f172a0d" stroke="#0f172a" strokeWidth="5" />

              {nightAppointments.map(({ a, colorIndex }) => {
                const start = new Date(a.scheduled_at);
                const startDeg = nightFraction(start) * 360;
                const sweepDeg = (a.expected_duration_minutes / (12 * 60)) * 360;
                return (
                  <path
                    key={a.id}
                    d={wedgePath(CX2, CY2, R2 - 3, startDeg, sweepDeg)}
                    fill={WEDGE_COLORS[colorIndex % WEDGE_COLORS.length]}
                    opacity={0.85}
                    className="cursor-pointer transition hover:opacity-100"
                    onClick={() => onSelectAppointment(a)}
                  >
                    <title>
                      {formatTimeAr(a.scheduled_at)} — {a.customer_name_snapshot}
                    </title>
                  </path>
                );
              })}

              {/* علامات الساعات الاثنتي عشرة — كل علامة تمثّل ساعة واحدة
                  فريدة من نطاق الليل (بخلاف القرص الرئيسي حيث تتكرر كل
                  علامة مرتين يومياً)، بترقيمها الفعلي بصيغة 12 ساعة
                  (٦، ٧،...، ١٢، ١،...، ٥) بدل ترقيم الساعة التقليدي. */}
              {Array.from({ length: 12 }).map((_, i) => {
                const realHour = (18 + i) % 24;
                const label = realHour % 12 === 0 ? 12 : realHour % 12;
                const p = pointOnCircle(CX2, CY2, R2 - 20, i * 30);
                return (
                  <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="#0f172a">
                    {label}
                  </text>
                );
              })}

              <circle cx={CX2} cy={CY2} r={4} fill="#0f172a" />
            </svg>
          </div>
        )}
      </div>

      {dayAppointments.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {dayAppointments.map((a, i) => {
            const district = customers.find((c) => c.id === a.customer_id)?.district;
            return (
            <button
              key={a.id}
              onClick={() => onSelectAppointment(a)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: WEDGE_COLORS[i % WEDGE_COLORS.length] }} />
              {formatTimeAr(a.scheduled_at)} — {a.customer_name_snapshot ?? t('عميل')}
              {district ? ` - ${district}` : ''}
            </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 text-center text-sm text-slate-400">{t('لا توجد مواعيد في هذا اليوم')}</div>
      )}

      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          onClick={() => shiftDay(-1)}
          aria-label={t('اليوم السابق')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 active:bg-slate-100"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
        <div className="min-w-[140px] text-center">
          <div className="text-lg font-bold text-slate-800">{weekdayAr(selectedDate.toISOString())}</div>
          <div className="text-sm text-slate-400">{formatGregorianDate(selectedDate, lang)}</div>
        </div>
        <button
          onClick={() => shiftDay(1)}
          aria-label={t('اليوم التالي')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 active:bg-slate-100"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      </div>
      {!isToday && (
        <div className="mt-2 text-center">
          <button onClick={goToday} className="text-xs font-semibold text-brand-600 hover:underline">
            {tt('العودة إلى اليوم', 'Back to today')}
          </button>
        </div>
      )}
    </div>
  );
}
