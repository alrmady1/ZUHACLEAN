import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Flame } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Appointment, LocationGeocode } from '../../shared/types.js';
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
// للقراءة مباشرة من الرابط نفسه — ترجع null هنا، وتُحلّ عندئذٍ عبر الخادم
// (انظر /location-geocodes/resolve أدناه).
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

// تبويب "الخريطة الحرارية" داخل صفحة العملاء. الكثافة والعلامات على
// الخريطة نفسها تعكس موقع العميل الدقيق (المبنى) فقط — مستخرَج من رابط
// موقعه المحفوظ (Customer.location_url)، كاملاً أو مختصراً (الأخير يُحلّ
// عبر الخادم، انظر /location-geocodes/resolve) — بلا أي تقريب على مستوى
// الحيّ. القائمة الجانبية "الأحياء الأكثر طلباً" نص فقط (عدد لكل حيّ كما
// كُتب في بطاقة العميل)، لا تحتاج إحداثيات ولا تُعرَض على الخريطة.
export default function CustomerHeatMapTab({ customers, appointments }: { customers: Customer[]; appointments: Appointment[] }) {
  const { t, tt } = useI18n();
  const [locationGeocodes, setLocationGeocodes] = useState<LocationGeocode[]>([]);
  const [resolvingLocations, setResolvingLocations] = useState(false);
  const [unresolvedLocationCount, setUnresolvedLocationCount] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const heatLayer = useRef<any>(null);
  const exactMarkers = useRef<any[]>([]);

  useEffect(() => {
    api.get<LocationGeocode[]>('/location-geocodes').then(setLocationGeocodes);
  }, []);

  // عدد المواعيد المكتملة لكل حيّ — للقائمة الجانبية النصّية فقط ("الأحياء
  // الأكثر طلباً")، appointment.status === 'completed' فقط، مربوطة بحيّ
  // العميل صاحب الموعد (Customer.district) بعد trim.
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

  // عملاء لهم موعد مكتمل واحد على الأقل ولهم رابط موقع — إحداثياتهم
  // الدقيقة تُستخرَج مباشرة من الرابط لو كان كاملاً، وإلا من ذاكرة حلّ
  // الروابط المختصرة (locationGeocodes، انظر الـ effect أدناه). هؤلاء فقط
  // يظهرون على الخريطة (حرارة + علامة) — بلا أي تمثيل على مستوى الحيّ.
  const completedCountByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) {
      if (a.status !== 'completed') continue;
      m.set(a.customer_id, (m.get(a.customer_id) ?? 0) + 1);
    }
    return m;
  }, [appointments]);

  const geocodeByUrl = useMemo(() => new Map(locationGeocodes.map((g) => [g.url, g])), [locationGeocodes]);

  const exactCustomerPoints = useMemo(() => {
    const points: { customer: Customer; coords: [number, number]; count: number }[] = [];
    for (const c of customers) {
      const count = completedCountByCustomer.get(c.id);
      if (!count || !c.location_url) continue;
      const direct = parseLatLngFromUrl(c.location_url);
      if (direct) {
        points.push({ customer: c, coords: direct, count });
        continue;
      }
      const resolved = geocodeByUrl.get(c.location_url);
      if (resolved) points.push({ customer: c, coords: [resolved.lat, resolved.lng], count });
    }
    return points;
  }, [customers, completedCountByCustomer, geocodeByUrl]);

  // روابط الموقع المختصرة (لم تُحلَّل مباشرة من نصها ولا موجودة بعد في
  // الذاكرة المؤقتة) — تحتاج حلاً عبر الخادم (/location-geocodes/resolve،
  // يتبع تحويلة الرابط لأن المتصفح لا يستطيع ذلك بسبب CORS). واحد تلو
  // الآخر مع تأخير بسيط بين كل طلب.
  const unresolvedLocationUrlsKey = useMemo(() => {
    const urls = new Set<string>();
    for (const c of customers) {
      if (!completedCountByCustomer.get(c.id) || !c.location_url) continue;
      if (parseLatLngFromUrl(c.location_url)) continue;
      if (geocodeByUrl.has(c.location_url)) continue;
      urls.add(c.location_url);
    }
    return Array.from(urls).sort().join('|');
  }, [customers, completedCountByCustomer, geocodeByUrl]);

  useEffect(() => {
    const toResolve = unresolvedLocationUrlsKey ? unresolvedLocationUrlsKey.split('|') : [];
    if (toResolve.length === 0) {
      setUnresolvedLocationCount(0);
      return;
    }
    let cancelled = false;
    async function run() {
      setResolvingLocations(true);
      let failedCount = 0;
      for (const url of toResolve) {
        if (cancelled) return;
        try {
          const resolved = await api.post<LocationGeocode>('/location-geocodes/resolve', { url });
          if (!cancelled) setLocationGeocodes((prev) => [...prev.filter((g) => g.url !== url), resolved]);
        } catch {
          failedCount += 1;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) {
        setUnresolvedLocationCount(failedCount);
        setResolvingLocations(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [unresolvedLocationUrlsKey]);

  // تهيئة الخريطة مرة واحدة فقط عند أول ظهور لهذا التبويب.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current).setView(RIYADH_CENTER, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapInstance.current = map;
  }, []);

  // إعادة رسم طبقة الخريطة الحرارية وعلامات العملاء الدقيقة كلما تغيّرت
  // مواقعهم المحلولة. داخل map.whenReady() + invalidateSize() عمداً —
  // بدونها يفشل leaflet.heat أحياناً بخطأ canvas "source width is 0" لو
  // رُسمت الطبقة قبل أن يكمل Leaflet حساب أبعاد الحاوية فعلياً (تأكَّد هذا
  // بتجربة مباشرة).
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.whenReady(() => {
      map.invalidateSize();
      const counts = exactCustomerPoints.map((p) => p.count);
      const maxCount = counts.length > 0 ? Math.max(...counts) : 1;
      const points: [number, number, number][] = exactCustomerPoints.map(({ coords, count }) => [
        coords[0],
        coords[1],
        Math.max(count / maxCount, 0.15),
      ]);

      if (heatLayer.current) map.removeLayer(heatLayer.current);
      if (points.length > 0) {
        heatLayer.current = (L as any)
          .heatLayer(points, { radius: 40, blur: 30, maxZoom: 14, gradient: HEAT_GRADIENT })
          .addTo(map);
      }

      // نقطة دقيقة (أحمر بحدّ أبيض) فوق كل بقعة حرارة — موقع العميل الفعلي
      // كما استُخرج من رابط اللوكيشن المحفوظ.
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
  }, [exactCustomerPoints, tt]);

  const totalCompleted = rankedDistricts.reduce((s, [, c]) => s + c, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-400">
          {tt(
            'كل نقطة على الخريطة هي موقع عميل دقيق (المبنى) مستخرَج من رابط موقعه المحفوظ — كاملاً أو مختصراً — بلا أي تقريب على مستوى الحيّ، وكثافتها تعكس عدد مواعيده المكتملة',
            "Each point on the map is a customer's exact location (the building), extracted from their saved location link — full or shortened — with no district-level approximation, and its intensity reflects their completed appointment count",
          )}
        </p>
        {resolvingLocations && (
          <p className="mt-1 text-xs font-medium text-brand-600">{t('جارِ تحديد مواقع العملاء الدقيقة من روابطهم المحفوظة…')}</p>
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

      {unresolvedLocationCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {tt(
              `تعذّر استخراج الموقع الدقيق من روابط ${unresolvedLocationCount} عميل (رابط غير صالح أو لا يحمل إحداثيات) — لم يظهروا على الخريطة`,
              `Could not extract an exact location from ${unresolvedLocationCount} customers' links (invalid or no coordinates found) — they do not appear on the map`,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
