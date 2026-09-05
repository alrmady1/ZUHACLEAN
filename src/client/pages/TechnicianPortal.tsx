import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Camera, Image as ImageIcon, X, ChevronRight, ChevronLeft, LayoutGrid, List, ChevronDown, Clock, CheckCircle2, CalendarClock } from 'lucide-react';
import StatCard from '../components/StatCard.js';
import { api } from '../lib/api.js';
import type { Appointment, Customer } from '../../shared/types.js';
import { AppointmentStatusBadge } from '../components/Badge.js';
import { formatDateAr, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { compressImageToDataUrl } from '../lib/image.js';
import { WEEKDAYS_HEADER, getMonthGridDays } from '../lib/calendarGrid.js';
import DayClock from '../components/DayClock.js';

function AppointmentCard({
  appt,
  onChange,
  onOpenPhoto,
}: {
  appt: Appointment;
  onChange: () => void;
  onOpenPhoto: (url: string) => void;
}) {
  const { t } = useI18n();
  const { can } = useAuth();
  const canAddPhotos = can('add_before_after_photos');
  const beforeCameraInput = useRef<HTMLInputElement>(null);
  const beforeGalleryInput = useRef<HTMLInputElement>(null);
  const afterCameraInput = useRef<HTMLInputElement>(null);
  const afterGalleryInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // الاعتماد على أن يعرض المتصفح تلقائياً خيار "كاميرا" أو "معرض" لم يكن
  // ثابتاً عبر كل الأجهزة/المتصفحات — بعضها يعرض المعرض فقط. لذا حقلان
  // منفصلان صراحة لكل مرحلة: كاميرا (capture) ومعرض (multiple)، مع قائمة
  // صغيرة تفتح عند الضغط على الزر لاختيار أيهما.
  const [photoMenu, setPhotoMenu] = useState<'before' | 'after' | null>(null);

  // مع multiple يمكن اختيار أكثر من صورة دفعة واحدة من المعرض؛ نرفعها
  // بالتتابع (بعد ضغطها) ثم نحدّث الواجهة مرة واحدة بعد اكتمال الكل.
  async function uploadPhotos(stage: 'before' | 'after', files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const data_url = await compressImageToDataUrl(file);
        await api.post(`/appointments/${appt.id}/photos`, { stage, data_url });
      }
      onChange();
    } finally {
      setBusy(false);
    }
  }

  // رابط دائم لكل عميل: نستخدم location_url المحفوظ لو موجود، وإلا بحث خرائط
  // جوجل بالعنوان النصي — بحيث تظهر أيقونة الوصول للموقع لكل عميل دائماً
  // حتى لو لم يُحفظ رابط دقيق مسبقاً.
  const locationHref = appt.location_url || (appt.address_snapshot ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appt.address_snapshot)}` : undefined);

  const beforeCount = appt.photos.filter((p) => p.stage === 'before').length;
  const afterCount = appt.photos.filter((p) => p.stage === 'after').length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{appt.customer_name_snapshot}</span>
        <div className="flex items-center gap-2">
          {locationHref && (
            <a
              href={locationHref}
              target="_blank"
              rel="noreferrer"
              title={t('فتح موقع العميل في الخرائط')}
              className="flex items-center justify-center rounded-lg bg-brand-50 p-1.5 text-brand-600 hover:bg-brand-100"
            >
              <MapPin className="h-3.5 w-3.5" />
            </a>
          )}
          <AppointmentStatusBadge status={appt.status} />
        </div>
      </div>
      <div className="mb-1 text-xs text-slate-500">{appt.service_name_snapshot}</div>
      <div className="mb-3 text-xs text-slate-400">
        {formatDateAr(appt.scheduled_at)} · {formatTimeAr(appt.scheduled_at)}
      </div>

      {canAddPhotos && (
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <button
            disabled={busy}
            onClick={() => setPhotoMenu(photoMenu === 'before' ? null : 'before')}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700"
          >
            <Camera className="h-3.5 w-3.5" /> {t('صورة قبل')} ({beforeCount})
          </button>
          {photoMenu === 'before' && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  beforeCameraInput.current?.click();
                  setPhotoMenu(null);
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                <Camera className="h-3.5 w-3.5" /> {t('كاميرا')}
              </button>
              <button
                type="button"
                onClick={() => {
                  beforeGalleryInput.current?.click();
                  setPhotoMenu(null);
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                <ImageIcon className="h-3.5 w-3.5" /> {t('المعرض')}
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            disabled={busy}
            onClick={() => setPhotoMenu(photoMenu === 'after' ? null : 'after')}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700"
          >
            <Camera className="h-3.5 w-3.5" /> {t('صورة بعد')} ({afterCount})
          </button>
          {photoMenu === 'after' && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  afterCameraInput.current?.click();
                  setPhotoMenu(null);
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                <Camera className="h-3.5 w-3.5" /> {t('كاميرا')}
              </button>
              <button
                type="button"
                onClick={() => {
                  afterGalleryInput.current?.click();
                  setPhotoMenu(null);
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                <ImageIcon className="h-3.5 w-3.5" /> {t('المعرض')}
              </button>
            </div>
          )}
        </div>
        <input
          ref={beforeCameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            uploadPhotos('before', e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={beforeGalleryInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            uploadPhotos('before', e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={afterCameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            uploadPhotos('after', e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={afterGalleryInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            uploadPhotos('after', e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      )}

      {/* صور مصغّرة لما تم رفعه فعلياً — الأزرار أعلاه كانت تعرض العدد فقط
          بلا أي طريقة لاستعراض الصور نفسها؛ النقر على أي مصغّرة يفتحها
          بالحجم الكامل عبر onOpenPhoto. */}
      {appt.photos.length > 0 && (
        <div className="mt-3 space-y-2">
          {beforeCount > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-400">{t('صورة قبل')}</div>
              <div className="grid grid-cols-5 gap-1.5">
                {appt.photos
                  .filter((p) => p.stage === 'before')
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenPhoto(p.data_url)}
                      className="aspect-square overflow-hidden rounded-lg border border-slate-200"
                    >
                      <img src={p.data_url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
              </div>
            </div>
          )}
          {afterCount > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-400">{t('صورة بعد')}</div>
              <div className="grid grid-cols-5 gap-1.5">
                {appt.photos
                  .filter((p) => p.stage === 'after')
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenPhoto(p.data_url)}
                      className="aspect-square overflow-hidden rounded-lg border border-slate-200"
                    >
                      <img src={p.data_url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// عرض مضغوط: سطر واحد لكل موعد (الوقت، اسم العميل، الحالة، وعدد الصور
// إن وُجدت) — النقر عليه يفتح/يطوي بطاقة الموعد الكاملة تحته (نفس بطاقة
// عرض "بطاقات" بكل أزرارها) بدل استبدالها بشيء منفصل.
function AppointmentRow({ appt, expanded, onToggle }: { appt: Appointment; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start"
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        <span className="shrink-0 text-xs text-slate-400">{formatTimeAr(appt.scheduled_at)}</span>
        <span className="truncate text-sm font-medium text-slate-800">{appt.customer_name_snapshot}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {appt.photos.length > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
            <Camera className="h-3 w-3" /> {appt.photos.length}
          </span>
        )}
        <AppointmentStatusBadge status={appt.status} />
      </div>
    </button>
  );
}

type TechView = 'clock' | 'all' | 'day' | 'month';
type TechDisplay = 'cards' | 'rows';

export default function TechnicianPortal() {
  const { user, allProfiles } = useAuth();
  const { t } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [asTechnician, setAsTechnician] = useState<string | undefined>(
    user?.role === 'technician' ? user.id : undefined,
  );
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // خيارات عرض المواعيد: "ساعة" (الافتراضي — قرص ساعة تفاعلي لمواعيد يوم
  // واحد، انظر DayClock.tsx)، "الكل" (قائمة زمنية كاملة)، أو جدول "يومي"،
  // أو جدول "شهري" — الأخيران يستخدمان نفس بطاقة الموعد الكاملة (صور،
  // رفع...) لكن مقسّمة على تاريخ محدد بدل قائمة واحدة طويلة.
  const [view, setView] = useState<TechView>('clock');
  const [calDate, setCalDate] = useState(new Date());
  // عرض "بطاقات" (الحالي) أو "أسطر" (سطر واحد مضغوط لكل موعد، يُفتح
  // بالنقر لإظهار البطاقة الكاملة تحته) — ينطبق على عرضي "الكل" و"يومي".
  const [display, setDisplay] = useState<TechDisplay>('cards');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // الموعد المختار من قرص الساعة (عرض "ساعة") — تُعرض بطاقته الكاملة تحت
  // القرص مباشرة، بنفس بطاقة عرضي "الكل"/"يومي" (صور، حالة...).
  const [clockSelectedId, setClockSelectedId] = useState<string | null>(null);

  function refresh() {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(refresh, []);
  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers);
  }, []);

  const technicians = allProfiles.filter((p) => p.role === 'technician');
  const effectiveId = asTechnician ?? technicians[0]?.id;
  // الفني يرى مواعيده المسندة له مباشرة، وأيضاً أي موعد مسنَد للمشرف الذي
  // يتبع له (يُضبط الربط من الإعدادات ← ربط الفنيين بالمشرفين) — بحيث
  // يظهر عمل الفريق كاملاً له، لا فقط ما أُسند له شخصياً.
  const effectiveSupervisorId = allProfiles.find((p) => p.id === effectiveId)?.supervisor_id;
  const mine = appointments
    .filter(
      (a) =>
        a.assignments.some((x) => x.technician_id === effectiveId) ||
        (effectiveSupervisorId && a.supervisor_id === effectiveSupervisorId),
    )
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  // إحصائيات اليوم الخاصة بهذا الفني فقط — تحل محل الصفحة الرئيسية العامة
  // (لوحة التحكم) التي كانت تعرض أرقاماً على مستوى الشركة كاملة، غير
  // ذات معنى لفني يريد فقط معرفة مهامه اليوم.
  const todayMine = useMemo(() => mine.filter((a) => new Date(a.scheduled_at).toDateString() === new Date().toDateString()), [mine]);
  const inProgressTodayCount = todayMine.filter((a) => a.status === 'in_progress').length;
  const completedTodayCount = todayMine.filter((a) => a.status === 'completed').length;
  const completionRate = todayMine.length > 0 ? Math.round((completedTodayCount / todayMine.length) * 100) : 0;

  const apptsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of mine) {
      const key = new Date(a.scheduled_at).toDateString();
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [mine]);

  function shiftCalDate(dir: 1 | -1) {
    const d = new Date(calDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir);
    setCalDate(d);
  }

  const calLabel =
    view === 'day'
      ? calDate.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })
      : calDate.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });

  const dayAppts = apptsByDate.get(calDate.toDateString()) ?? [];

  function renderApptList(list: Appointment[]) {
    if (display === 'rows') {
      return (
        <div className="space-y-2">
          {list.map((appt) => (
            <div key={appt.id}>
              <AppointmentRow
                appt={appt}
                expanded={expandedId === appt.id}
                onToggle={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
              />
              {expandedId === appt.id && (
                <div className="mt-2">
                  <AppointmentCard appt={appt} onChange={refresh} onOpenPhoto={setLightboxUrl} />
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {list.map((appt) => (
          <AppointmentCard key={appt.id} appt={appt} onChange={refresh} onOpenPhoto={setLightboxUrl} />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('بوابة الفني الميداني')}</h1>
        <p className="text-sm text-slate-400">{t('مهامك، الصور، والتحصيل — من جوالك')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Clock}
          iconTint="bg-amber-100 text-amber-600"
          label={t('قيد التنفيذ')}
          value={String(inProgressTodayCount)}
          valueTint="text-amber-500"
          sub={t('جارية الآن')}
          subTint="text-amber-500"
        />
        <StatCard
          icon={CheckCircle2}
          iconTint="bg-emerald-100 text-emerald-600"
          label={t('مكتملة اليوم')}
          value={String(completedTodayCount)}
          valueTint="text-emerald-600"
          sub={`${completionRate}% ${t('نسبة الإنجاز')}`}
          subTint="text-emerald-600"
        />
        <StatCard
          icon={CalendarClock}
          iconTint="bg-slate-100 text-slate-600"
          label={t('مواعيد اليوم')}
          value={String(todayMine.length)}
          valueTint="text-slate-800"
          sub={t('إجمالي مهامك اليوم')}
          subTint="text-slate-400"
        />
      </div>

      {user?.role !== 'technician' && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('عرض كـ فني')}</span>
          <select
            className="input"
            value={asTechnician}
            onChange={(e) => setAsTechnician(e.target.value)}
          >
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          {([
            ['clock', 'عرض الساعة'],
            ['all', 'الكل'],
            ['day', 'يومي'],
            ['month', 'شهري'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === v ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              {t(label)}
            </button>
          ))}
        </div>
        {view !== 'month' && view !== 'clock' && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
            <button
              onClick={() => setDisplay('cards')}
              title={t('بطاقات')}
              className={`rounded-lg p-1.5 ${display === 'cards' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDisplay('rows')}
              title={t('أسطر')}
              className={`rounded-lg p-1.5 ${display === 'rows' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {view === 'clock' && (
        <div className="space-y-3">
          <DayClock
            appointments={mine}
            customers={customers}
            onSelectAppointment={(appt) => setClockSelectedId(appt.id)}
          />
          {clockSelectedId &&
            (() => {
              const selected = appointments.find((a) => a.id === clockSelectedId);
              return selected ? (
                <AppointmentCard appt={selected} onChange={refresh} onOpenPhoto={setLightboxUrl} />
              ) : null;
            })()}
        </div>
      )}

      {view === 'all' && (
        <>
          {renderApptList(mine)}
          {mine.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
              {t('لا توجد مهام مسندة حالياً')}
            </div>
          )}
        </>
      )}

      {(view === 'day' || view === 'month') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => shiftCalDate(-1)}
                aria-label={t('السابق')}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => shiftCalDate(1)}
                aria-label={t('التالي')}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm font-semibold text-slate-700">{calLabel}</span>
            <button
              onClick={() => setCalDate(new Date())}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {t('اليوم')}
            </button>
          </div>

          {view === 'month' && (
            <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-white p-2">
              {WEEKDAYS_HEADER.map((d) => (
                <div key={d} className="pb-1 text-center text-[10px] font-medium text-slate-400">
                  {t(d)}
                </div>
              ))}
              {getMonthGridDays(calDate).map((day) => {
                const key = day.toDateString();
                const count = apptsByDate.get(key)?.length ?? 0;
                const inMonth = day.getMonth() === calDate.getMonth();
                const isToday = key === new Date().toDateString();
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setCalDate(day);
                      setView('day');
                    }}
                    className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs ${
                      isToday ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-300' : 'border-transparent'
                    } ${!inMonth ? 'opacity-30' : ''}`}
                  >
                    <span className={isToday ? 'font-semibold text-brand-700' : 'text-slate-600'}>{day.getDate()}</span>
                    {count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                  </button>
                );
              })}
            </div>
          )}

          {view === 'day' && (
            <>
              {renderApptList(dayAppts)}
              {dayAppts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
                  {t('لا توجد مواعيد في هذا اليوم')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label={t('إغلاق')}
            className="absolute end-4 top-4 rounded-full bg-white/90 p-2 text-slate-700 hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
