import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Flame } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Appointment, DistrictGeocode } from '../../shared/types.js';
import { useI18n } from '../lib/i18n.js';

// Leaflet + Leaflet.heat محمَّلان عالمياً عبر <script> في index.html —
// نفس أسلوب RiyadhZonesTab.tsx (بلا حزمة npm ولا مفتاح API).
declare const L: any;

const RIYADH_CENTER: [number, number] = [24.7136, 46.6753];

// تدرّج "jet" الكلاسيكي (أزرق ← سماوي ← أخضر ← أصفر ← أحمر) — نفس نمط
// الخرائط الحرارية الرياضية (طلب المستخدم مطابقته حرفياً)، بديل صريح عن
// تدرّج leaflet.heat الافتراضي حتى لا يتغيّر المظهر تلقائياً لو تغيّر
// إعداد المكتبة الافتراضي مستقبلاً.
const HEAT_GRADIENT = {
  0.0: '#0000ff',
  0.25: '#00ffff',
  0.5: '#00ff00',
  0.75: '#ffff00',
  1.0: '#ff0000',
};

// يحاول استخراج إحداثيات دقيقة (خط العرض، خط الطول) من رابط خرائط جوجل
// كامل — نفس الدالة الموجودة في Settings.tsx (FacilityLocationMap)
// لمواقع المرافق، مكرَّرة هنا لأنها غير مُصدَّرة من هناك. !3d/!4d أولاً
// (موقع العلامة الدقيق — يظهر حتى في روابط "مكان" التي لا تحمل @lat,lng
// إطلاقاً)، ثم @lat,lng (مركز نافذة العرض، أقل دقة)، ثم q=/ll=. روابط
// جوجل المختصرة (goo.gl/maps، maps.app.goo.gl) لا تحمل إحداثيات قابلة
// للقراءة مباشرة من الرابط نفسه — ترجع null هنا فيبقى العميل بلا نقطة
// دقيقة (يُحتسَب فقط ضمن كثافة حيّه كما في السابق).
function parseLatLngFromUrl(url: string): [number, number] | null {
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

// تبويب "الخريطة الحرارية" داخل صفحة العملاء — يعرض المناطق (الأحياء كما
// كُتبت في Customer.district) الأكثر طلباً للخدمة، بحسب عدد المواعيد
// المكتملة لعملاء كل حيّ. لا إحداثيات مخزَّنة لكل عميل على حدة (رابط
// الموقع Customer.location_url نص حر بصيغ غير موحَّدة — روابط جوجل
// المختصرة تحديداً لا تحمل إحداثيات قابلة للقراءة مباشرة)، فيُحلَّل موقع
// كل حيّ فريد جغرافياً مرة واحدة فقط عبر Nominatim (نفس ما يفعله تبويب
// "مناطق الرياض")، ويُخزَّن مشتركاً بين الجميع في districtGeocodes حتى لا
// يُعاد البحث لاحقاً.
export default function CustomerHeatMapTab({ customers, appointments }: { customers: Customer[]; appointments: Appointment[] }) {
  const { t, tt } = useI18n();
  const [geocodes, setGeocodes] = useState<DistrictGeocode[]>([]);
  const [resolving, setResolving] = useState(false);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const heatLayer = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const exactMarkers = useRef<any[]>([]);

  useEffect(() => {
    api.get<DistrictGeocode[]>('/district-geocodes').then(setGeocodes);
  }, []);

  // عدد المواعيد المكتملة لكل حيّ — "تم خدمة العملاء فيها" و"الأكثر طلباً"
  // حرفياً: appointment.status === 'completed' فقط، مربوطة بحيّ العميل
  // صاحب الموعد (Customer.district) بعد trim.
  const countByDistrict = useMemo(() => {
    const customersById = new Map(customers.map((c) => [c.id, c]));
    const map = new Map<string, number>();
    for (const a of appointments) {
      if (a.status !== 'completed') continue;
      const district = customersById.get(a.customer_id)?.district?.trim();
      if (!district) continue;
      map.set(district, (map.get(district) ?? 0) + 1);
    }
    return map;
  }, [customers, appointments]);

  const rankedDistricts = useMemo(
    () => Array.from(countByDistrict.entries()).sort((a, b) => b[1] - a[1]),
    [countByDistrict],
  );

  const geocodeByDistrict = useMemo(() => new Map(geocodes.map((g) => [g.district, g])), [geocodes]);

  // عملاء لهم موعد مكتمل واحد على الأقل ولهم رابط موقع يمكن استخراج
  // إحداثيات دقيقة منه — هؤلاء فقط يحصلون على نقطة مضبوطة بدقة على
  // الخريطة (بدل مركز الحيّ التقريبي فقط)، تلبيةً لطلب تحديد "مكان العميل
  // بالضبط بحسب رابط اللوكيشن".
  const exactCustomerPoints = useMemo(() => {
    const completedCountByCustomer = new Map<string, number>();
    for (const a of appointments) {
      if (a.status !== 'completed') continue;
      completedCountByCustomer.set(a.customer_id, (completedCountByCustomer.get(a.customer_id) ?? 0) + 1);
    }
    const points: { customer: Customer; coords: [number, number]; count: number }[] = [];
    for (const c of customers) {
      const count = completedCountByCustomer.get(c.id);
      if (!count || !c.location_url) continue;
      const coords = parseLatLngFromUrl(c.location_url);
      if (coords) points.push({ customer: c, coords, count });
    }
    return points;
  }, [customers, appointments]);

  // تحليل جغرافي تدريجي (حيّ واحد كل ~1.1 ثانية — حدود استخدام Nominatim
  // المجانية) للأحياء الجديدة فقط (غير الموجودة أصلاً في الذاكرة المؤقتة
  // المحفوظة). يعمل مرة واحدة فقط لكل حيّ جديد يظهر — النتيجة تُحفَظ على
  // الخادم فتُستخدَم فوراً بلا بحث إضافي في أي زيارة لاحقة لهذه الصفحة من
  // أي جهاز.
  const districtsKey = Array.from(countByDistrict.keys()).sort().join('|');
  useEffect(() => {
    const toResolve = Array.from(countByDistrict.keys()).filter((d) => !geocodeByDistrict.has(d));
    if (toResolve.length === 0) {
      setUnresolved((prev) => prev.filter((d) => countByDistrict.has(d)));
      return;
    }
    let cancelled = false;
    async function run() {
      setResolving(true);
      const failed: string[] = [];
      for (const district of toResolve) {
        if (cancelled) return;
        try {
          const q = encodeURIComponent(`${district}, الرياض, السعودية`);
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`);
          const data: { lat: string; lon: string }[] = await res.json();
          if (data[0]) {
            const saved = await api.post<DistrictGeocode>('/district-geocodes', {
              district,
              lat: Number(data[0].lat),
              lng: Number(data[0].lon),
            });
            if (!cancelled) setGeocodes((prev) => [...prev.filter((g) => g.district !== district), saved]);
          } else {
            failed.push(district);
          }
        } catch {
          failed.push(district);
        }
        // احترام حدود استخدام Nominatim المجانية (طلب واحد بالثانية كحد أقصى).
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (!cancelled) {
        setUnresolved(failed);
        setResolving(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtsKey]);

  // تهيئة الخريطة مرة واحدة فقط عند أول ظهور لهذا التبويب.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current).setView(RIYADH_CENTER, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapInstance.current = map;
  }, []);

  // إعادة رسم طبقة الخريطة الحرارية وعلامات الأحياء كلما تغيّرت الأعداد أو
  // اكتمل تحليل مواقع جديدة. داخل map.whenReady() + invalidateSize() عمداً
  // — بدونها يفشل leaflet.heat أحياناً بخطأ canvas "source width is 0" لو
  // رُسمت الطبقة قبل أن يكمل Leaflet حساب أبعاد الحاوية فعلياً (تأكَّد هذا
  // بتجربة مباشرة).
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.whenReady(() => {
      map.invalidateSize();
      const counts = Array.from(countByDistrict.values());
      const maxCount = counts.length > 0 ? Math.max(...counts) : 1;
      const points: [number, number, number][] = [];
      for (const [district, count] of countByDistrict) {
        const g = geocodeByDistrict.get(district);
        if (!g) continue;
        points.push([g.lat, g.lng, Math.max(count / maxCount, 0.15)]);
      }

      if (heatLayer.current) map.removeLayer(heatLayer.current);
      if (points.length > 0) {
        heatLayer.current = (L as any)
          .heatLayer(points, { radius: 40, blur: 30, maxZoom: 14, gradient: HEAT_GRADIENT })
          .addTo(map);
      }

      for (const m of markers.current) map.removeLayer(m);
      markers.current = [];
      for (const [district, count] of countByDistrict) {
        const g = geocodeByDistrict.get(district);
        if (!g) continue;
        const marker = L.circleMarker([g.lat, g.lng], {
          radius: 5,
          color: '#0F2A3D',
          fillColor: '#0F2A3D',
          fillOpacity: 0.8,
          weight: 1,
        }).addTo(map);
        marker.bindTooltip(tt(`${district} — ${count} موعد مكتمل`, `${district} — ${count} completed jobs`));
        markers.current.push(marker);
      }

      // نقاط دقيقة (أحمر بحدّ أبيض) فوق كثافة الحيّ — لكل عميل استُخرجت
      // إحداثيات موقعه الفعلي من رابط اللوكيشن المحفوظ، تمييزاً عن علامة
      // الحيّ التقريبية (الكحلية) أعلاه.
      for (const m of exactMarkers.current) map.removeLayer(m);
      exactMarkers.current = [];
      for (const { customer, coords, count } of exactCustomerPoints) {
        const marker = L.circleMarker(coords, {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#ff0000',
          fillOpacity: 0.95,
        }).addTo(map);
        marker.bindTooltip(
          tt(`${customer.name} — ${count} موعد مكتمل (موقع دقيق)`, `${customer.name} — ${count} completed jobs (exact location)`),
        );
        exactMarkers.current.push(marker);
      }
    });
  }, [countByDistrict, geocodeByDistrict, exactCustomerPoints, tt]);

  const totalCompleted = rankedDistricts.reduce((s, [, c]) => s + c, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-400">
          {tt(
            'كثافة كل حيّ تعكس عدد المواعيد المكتملة لعملائه — الحي كما كُتب في بطاقة العميل، مُحدَّد جغرافياً تلقائياً (OpenStreetMap)',
            "Each neighborhood's intensity reflects its customers' completed appointment count — the district as written on the customer's card, geocoded automatically (OpenStreetMap)",
          )}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white bg-red-500" />
          {tt(
            'النقاط الحمراء: موقع العميل الدقيق، مستخرَج من رابط موقعه المحفوظ (يظهر فقط لو كان الرابط كاملاً وليس مختصراً)',
            "Red dots: a customer's exact location, extracted from their saved location link (shown only when the link is a full one, not a shortened link)",
          )}
        </p>
        {resolving && (
          <p className="mt-1 text-xs font-medium text-brand-600">{t('جارِ تحديد مواقع الأحياء الجديدة على الخريطة…')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-slate-200 lg:col-span-2">
          <div ref={mapRef} style={{ height: 500 }} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Flame className="h-4 w-4 text-brand-600" /> {t('الأحياء الأكثر طلباً')}
          </h3>
          <div className="max-h-[440px] space-y-1.5 overflow-y-auto">
            {rankedDistricts.map(([district, count]) => (
              <div key={district} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate font-medium text-slate-700">{district}</span>
                <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                  {count} {t('موعد')}
                </span>
              </div>
            ))}
            {rankedDistricts.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">{t('لا توجد مواعيد مكتملة بعد لعرضها على الخريطة')}</div>
            )}
          </div>
          {totalCompleted > 0 && (
            <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
              {tt(`إجمالي ${totalCompleted} موعد مكتمل عبر ${rankedDistricts.length} حيّ`, `${totalCompleted} completed appointments across ${rankedDistricts.length} neighborhoods`)}
            </p>
          )}
        </div>
      </div>

      {unresolved.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {tt(
              'تعذّر تحديد موقع هذه الأحياء تلقائياً (تحقق من التهجئة في بطاقة العميل):',
              'Could not locate these neighborhoods automatically (check the spelling on the customer card):',
            )}{' '}
            {unresolved.join('، ')}
          </div>
        </div>
      )}
    </div>
  );
}
