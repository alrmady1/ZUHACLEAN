import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { Appointment, Customer } from '../../shared/types.js';
import { weekdayAr, formatTimeAr, type Lang } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// تاريخ ميلادي صراحةً بغضّ النظر عن التقويم الافتراضي — بعض المتصفحات
// (خاصة على الجوال) تعرض التقويم الهجري افتراضياً مع locale "ar-SA" ما
// لم يُفرَض التقويم الميلادي (gregory) صراحةً هكذا.
function formatGregorianDate(d: Date, lang: Lang): string {
  const locale = lang === 'ar' ? 'ar-SA' : lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-US';
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

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 10;

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
