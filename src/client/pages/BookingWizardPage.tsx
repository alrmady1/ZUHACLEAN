import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Phone as PhoneIcon,
  MapPin,
  Search,
  LocateFixed,
  Check,
  ChevronRight,
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { waLink } from '../lib/whatsapp.js';
import { COMPANY_NAME, COMPANY_PHONE, DEFAULT_LANDING_SETTINGS, PREFERRED_TIME_OF_DAY_LABELS_AR } from '../../shared/types.js';
import type { LandingPageSettings, LandingService, PreferredTimeOfDay } from '../../shared/types.js';

// Leaflet محمَّل عالمياً عبر <script> في index.html (نفس ما تستخدمه
// RiyadhZonesTab.tsx وCustomerHeatMapTab.tsx) — بلا حزمة npm ولا مفتاح API.
declare const L: any;

const WHATSAPP_INTRO = `مرحباً ${COMPANY_NAME}، أرغب في الاستفسار عن خدماتكم`;
const RIYADH_CENTER: [number, number] = [24.7136, 46.6753];
const STEP_TITLES = ['البيانات', 'الموقع', 'الخدمة', 'الوقت المفضّل', 'الملخص'];
const TIME_OPTIONS: PreferredTimeOfDay[] = ['morning', 'afternoon', 'evening'];
const WEEKDAY_LABELS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// أول 30 يوماً قادمة (بترتيب الأقرب أولاً) لشريط اختيار التاريخ في الخطوة
// الرابعة — نفس نطاق "٣٠ يوم متاح" في التصميم المرجعي، بلا أي تحقق فعلي
// من جدول مواعيد داخلي (هذا طلب أولي فقط، الفريق يؤكد الموعد الدقيق لاحقاً).
function upcomingDays(n: number): { iso: string; weekday: string; day: number; month: string }[] {
  const out: { iso: string; weekday: string; day: number; month: string }[] = [];
  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    out.push({
      iso: cur.toISOString().slice(0, 10),
      weekday: WEEKDAY_LABELS_AR[cur.getDay()],
      day: cur.getDate(),
      month: monthNames[cur.getMonth()],
    });
  }
  return out;
}

// صفحة عامة خارجية — بلا تسجيل دخول — نموذج طلب متعدد الخطوات، بديل أوسع
// من الاستمارة السريعة المضمَّنة في OrderPage.tsx (تبقى تلك كما هي، هذه
// مسار إضافي منفصل يفتحه زر "اطلب خدمتك الآن" في نفس الصفحة). بلا أي
// أسعار أو باقات أو دفع فعلي عمداً — الموقع لا يعرض أسعاراً علناً أصلاً
// (الفريق يسعّر يدوياً بعد التواصل)، فهذا يبقى طلباً أولياً مثل الاستمارة
// السريعة تماماً، فقط بخطوات أوضح ودقة أعلى (موقع محدَّد على خريطة، وقت
// مفضَّل تقريبي). يُرسَل إلى نفس POST /public/leads فيظهر في "طلبات
// جديدة" (Leads.tsx) للفريق ليتابعه ويحوّله إلى موعد فعلي عند التأكيد.
export default function BookingWizardPage() {
  const [settings, setSettings] = useState<LandingPageSettings>(DEFAULT_LANDING_SETTINGS);
  const [services, setServices] = useState<LandingService[]>([]);
  const [step, setStep] = useState(1);

  // خطوة ١ — البيانات
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // خطوة ٢ — الموقع
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [mapSearch, setMapSearch] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // خطوة ٣ — الخدمة
  const [serviceName, setServiceName] = useState('');

  // خطوة ٤ — الوقت المفضّل
  const days = useMemo(() => upcomingDays(30), []);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState<PreferredTimeOfDay | ''>('');

  // خطوة ٥ — الملخص
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get<LandingPageSettings>('/landing-settings').then(setSettings).catch(() => {});
    api
      .get<LandingService[]>('/landing-services')
      .then((list) => setServices(list.filter((s) => s.is_active)))
      .catch(() => {});
  }, []);

  // نفس تثبيت الإضاءة النهارية في OrderPage.tsx — هذه صفحة عامة أيضاً.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
    };
  }, []);

  const { primary: NAVY, secondary: CREAM, background: OFFWHITE, accent: GREEN } = settings.colors;

  function placeMarker(latVal: number, lngVal: number) {
    setLat(latVal);
    setLng(lngVal);
    const map = mapInstance.current;
    if (map) {
      if (markerRef.current) {
        markerRef.current.setLatLng([latVal, lngVal]);
      } else {
        const marker = L.marker([latVal, lngVal], { draggable: true }).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          placeMarker(p.lat, p.lng);
        });
        markerRef.current = marker;
      }
      map.setView([latVal, lngVal], 15);
    }
    reverseGeocode(latVal, lngVal);
  }

  async function reverseGeocode(latVal: number, lngVal: number) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latVal}&lon=${lngVal}&accept-language=ar`);
      const data = await res.json();
      if (data?.display_name) setAddress(data.display_name);
    } catch {
      // العنوان يبقى بلا تغيير — العميل يستطيع كتابته يدوياً بأي حال.
    }
  }

  // تهيئة الخريطة عند وصول الخطوة الثانية فقط (لا معنى لتحميلها أبكر).
  useEffect(() => {
    if (step !== 2 || !mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current).setView(RIYADH_CENTER, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', (e: any) => placeMarker(e.latlng.lat, e.latlng.lng));
    mapInstance.current = map;
    // نفس إصلاح "leaflet.heat" السابق (انظر CustomerHeatMapTab.tsx) —
    // الخريطة نفسها لا تحتاجه عادةً، لكن تأخير خفيف يضمن اكتمال حساب
    // أبعاد الحاوية الفعلية أولاً (الخطوة كانت مخفية لحظة mount الأول).
    setTimeout(() => map.invalidateSize(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function searchLocation() {
    const q = mapSearch.trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');
    setMapSearchResults([]);
    try {
      const query = encodeURIComponent(`${q}, الرياض, السعودية`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5&accept-language=ar`);
      const data: { display_name: string; lat: string; lon: string }[] = await res.json();
      if (data.length === 0) setSearchError('لم يُعثر على نتائج لهذا العنوان');
      else if (data.length === 1) selectSearchResult(data[0]);
      else setMapSearchResults(data);
    } catch {
      setSearchError('تعذّر البحث — تأكد من الاتصال بالإنترنت');
    } finally {
      setSearching(false);
    }
  }

  function selectSearchResult(r: { display_name: string; lat: string; lon: string }) {
    placeMarker(Number(r.lat), Number(r.lon));
    setAddress(r.display_name);
    setMapSearchResults([]);
    setMapSearch('');
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    setSearchError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        placeMarker(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setSearchError('تعذّر الوصول لموقعك — تأكد من السماح للمتصفح بالوصول للموقع');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const canGoNext =
    step === 1
      ? name.trim().length > 1 && phone.trim().length >= 9
      : step === 2
        ? address.trim().length > 3
        : step === 3
          ? !!serviceName
          : step === 4
            ? !!preferredDate
            : true;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api.post('/public/leads', {
        name: name.trim(),
        phone: phone.trim(),
        area: address.trim() || undefined,
        service_name: serviceName || undefined,
        message: message.trim() || undefined,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        preferred_date: preferredDate || undefined,
        preferred_time: preferredTime || undefined,
      });
      setDone(true);
    } catch {
      setSubmitError('تعذّر إرسال طلبك، حاول مرة أخرى أو تواصل معنا مباشرة عبر واتساب.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div dir="rtl" style={{ backgroundColor: OFFWHITE }} className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto h-14 w-14" style={{ color: GREEN }} />
          <h2 className="mt-4 text-xl font-bold" style={{ color: NAVY }}>
            تم استلام طلبك بنجاح!
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            شكراً لتواصلك مع {COMPANY_NAME}، سيتواصل معك فريقنا في أقرب وقت لتأكيد التفاصيل وتحديد الموعد المناسب.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <a
              href={waLink(COMPANY_PHONE, WHATSAPP_INTRO)}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ backgroundColor: NAVY }}
            >
              <MessageCircle className="h-4 w-4" /> تواصل عبر واتساب
            </a>
            <Link to="/order" className="mt-1 text-xs font-semibold text-slate-400 hover:text-slate-600">
              العودة للصفحة الرئيسية
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ backgroundColor: OFFWHITE }} className="min-h-screen pb-28 text-slate-800">
      <header className="flex items-center justify-between gap-4 px-5 py-3 shadow-md sm:px-10" style={{ backgroundColor: NAVY }}>
        <Link to="/order" className="flex items-center gap-2.5">
          <img src="/icon-192.png" alt={COMPANY_NAME} className="h-9 w-9 rounded-xl" />
          <span className="text-base font-extrabold text-white">{COMPANY_NAME}</span>
        </Link>
        <a href={`tel:${COMPANY_PHONE}`} dir="ltr" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: GREEN, color: NAVY }}>
          <PhoneIcon className="h-3.5 w-3.5" /> {COMPANY_PHONE}
        </a>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-10">
        {/* شريط التقدّم — ٥ أقسام، بلون هوية الموقع نفسها (GREEN) بدل لون
            ثابت، مطابقةً لبقية الصفحة العامة. */}
        <div className="mb-6 flex items-center justify-between gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: CREAM, color: NAVY }}>
            {step} / {STEP_TITLES.length}
          </span>
          <h1 className="text-lg font-bold" style={{ color: NAVY }}>
            {STEP_TITLES[step - 1]}
          </h1>
        </div>
        <div className="mb-8 flex gap-1.5">
          {STEP_TITLES.map((_, i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full transition-all" style={{ width: i < step ? '100%' : '0%', backgroundColor: GREEN }} />
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-lg sm:p-7">
          {step === 1 && (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 flex items-center gap-1.5 font-medium text-slate-600">
                  <User className="h-4 w-4" /> الاسم الكامل
                </span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد محمد" className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 flex items-center gap-1.5 font-medium text-slate-600">
                  <PhoneIcon className="h-4 w-4" /> رقم الجوال
                </span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="05XXXXXXXX" className="input" />
              </label>
              <p className="text-xs text-slate-400">سيتم استخدام هذه البيانات للتواصل معك بخصوص الحجز</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void searchLocation();
                      }
                    }}
                    placeholder="ابحث عن عنوان..."
                    className="input pe-9"
                  />
                  <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <button type="button" onClick={() => void searchLocation()} disabled={searching} className="shrink-0 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: NAVY }}>
                  {searching ? '...' : 'بحث'}
                </button>
              </div>
              {mapSearchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200">
                  {mapSearchResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectSearchResult(r)}
                      className="block w-full truncate border-b border-slate-100 p-2 text-start text-xs text-slate-600 last:border-0 hover:bg-slate-50"
                    >
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: GREEN, color: NAVY }}
              >
                <LocateFixed className="h-4 w-4" /> {locating ? 'جارِ تحديد موقعك…' : 'موقعي الحالي'}
              </button>
              {searchError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {searchError}
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div ref={mapRef} style={{ height: 260 }} />
              </div>
              <label className="block text-sm">
                <span className="mb-1.5 flex items-center gap-1.5 font-medium text-slate-600">
                  <MapPin className="h-4 w-4" /> العنوان
                </span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="حي، شارع، مدينة" className="input" />
              </label>
              <p className="text-xs text-slate-400">انقر على الخريطة أو استخدم البحث/موقعك الحالي لتحديد الموقع، أو اكتب العنوان مباشرة</p>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceName(s.title)}
                  className="flex items-start gap-3 rounded-xl border p-3 text-start transition"
                  style={{ borderColor: serviceName === s.title ? GREEN : CREAM, backgroundColor: serviceName === s.title ? CREAM : '#fff' }}
                >
                  {s.image_url && <img src={s.image_url} alt={s.title} className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold" style={{ color: NAVY }}>{s.title}</span>
                      {serviceName === s.title && <Check className="h-4 w-4 shrink-0" style={{ color: GREEN }} />}
                    </div>
                    {s.description && <p className="mt-0.5 truncate text-xs text-slate-400">{s.description}</p>}
                  </div>
                </button>
              ))}
              {services.length === 0 && <div className="col-span-full py-6 text-center text-sm text-slate-400">جارِ تحميل الخدمات…</div>}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-600">اختر التاريخ المفضّل</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setPreferredDate(d.iso)}
                      className="flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-xs font-medium"
                      style={{
                        borderColor: preferredDate === d.iso ? GREEN : CREAM,
                        backgroundColor: preferredDate === d.iso ? GREEN : '#fff',
                        color: preferredDate === d.iso ? '#fff' : '#334155',
                      }}
                    >
                      <span>{d.weekday}</span>
                      <span className="text-base font-bold">{d.day}</span>
                      <span className="text-[10px] opacity-80">{d.month}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                  <Clock className="h-4 w-4" /> اختر الوقت المفضّل
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {TIME_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPreferredTime(opt)}
                      className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                      style={{
                        borderColor: preferredTime === opt ? GREEN : CREAM,
                        backgroundColor: preferredTime === opt ? GREEN : '#fff',
                        color: preferredTime === opt ? '#fff' : '#334155',
                      }}
                    >
                      {PREFERRED_TIME_OF_DAY_LABELS_AR[opt]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400">هذا وقت مبدئي تقريبي — سيؤكد فريقنا الموعد الدقيق معك عند التواصل</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="space-y-2.5 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">الاسم</span>
                  <span className="font-semibold text-slate-700">{name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">الجوال</span>
                  <span dir="ltr" className="font-semibold text-slate-700">{phone}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="shrink-0 text-slate-400">الموقع</span>
                  <span className="truncate font-semibold text-slate-700">{address}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">الخدمة</span>
                  <span className="font-semibold text-slate-700">{serviceName || '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">التاريخ والوقت</span>
                  <span className="font-semibold text-slate-700">
                    {preferredDate} {preferredTime && `— ${PREFERRED_TIME_OF_DAY_LABELS_AR[preferredTime]}`}
                  </span>
                </div>
              </div>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-600">ملاحظات إضافية (اختياري)</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="أي تفاصيل تساعدنا على خدمتك بشكل أفضل"
                  className="input resize-none"
                />
              </label>
              {submitError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* شريط التنقّل السفلي الثابت — نفس فكرة التصميم المرجعي. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] sm:px-10">
        <button
          type="button"
          onClick={() => (step > 1 ? setStep((s) => s - 1) : undefined)}
          className={`flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${step === 1 ? 'invisible' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <ChevronRight className="h-4 w-4" /> رجوع
        </button>
        {step < STEP_TITLES.length ? (
          <button
            type="button"
            onClick={() => canGoNext && setStep((s) => s + 1)}
            disabled={!canGoNext}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-40 sm:flex-none sm:px-8"
            style={{ backgroundColor: NAVY }}
          >
            التالي: {STEP_TITLES[step]} <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-50 sm:flex-none sm:px-8"
            style={{ backgroundColor: NAVY }}
          >
            {submitting ? 'جارِ الإرسال…' : 'إرسال الطلب'}
          </button>
        )}
      </div>
    </div>
  );
}
