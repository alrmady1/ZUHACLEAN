import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, PenLine, Eraser } from 'lucide-react';
import { api } from '../lib/api.js';
import type { RiyadhZone, NeighborhoodZoneAssignment, WorkersHousingLocation } from '../../shared/types.js';
import { WEEKDAYS } from '../../shared/weekdays.js';
import { useI18n } from '../lib/i18n.js';

// Leaflet + Leaflet.draw محمَّلان عالمياً عبر <script> في index.html (بلا
// حزمة npm ولا مفتاح API — OpenStreetMap مجاني) — انظر تعليق index.html.
declare const L: any;

const RIYADH_CENTER: [number, number] = [24.7136, 46.6753];

// تبويب "مناطق الرياض" — الإعدادات ← مناطق الرياض (خلف صلاحية
// manage_riyadh_zones): خريطة تفاعلية لتقسيم المدينة إلى مناطق (شمال/
// جنوب/شرق/غرب/وسط افتراضياً)، وجدول لربط كل حيّ فعلي (كما يُكتب في حقل
// "الحي" عند إضافة عميل) بمنطقته. يُستخدم هذا الربط عند حجز موعد جديد
// لاقتراح أفضل أيام الأسبوع لعميل حسب حيّه (تجميع عملاء نفس المنطقة في
// نفس اليوم يقلل تنقّل الفريق الميداني) — انظر shared/riyadhZones.ts
// وNewAppointmentModal.tsx.
export default function RiyadhZonesTab() {
  const { t, tt } = useI18n();
  const [zones, setZones] = useState<RiyadhZone[]>([]);
  const [assignments, setAssignments] = useState<NeighborhoodZoneAssignment[]>([]);
  const [housingLocation, setHousingLocation] = useState<WorkersHousingLocation | null>(null);
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newNeighborhoodZone, setNewNeighborhoodZone] = useState('');
  const [drawingForZoneId, setDrawingForZoneId] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const layersByZoneId = useRef<Map<string, any>>(new Map());
  const featureGroup = useRef<any>(null);
  const drawHandler = useRef<any>(null);
  const housingMarker = useRef<any>(null);

  function refresh() {
    api.get<RiyadhZone[]>('/riyadh-zones').then(setZones);
    api.get<NeighborhoodZoneAssignment[]>('/neighborhood-zones').then(setAssignments);
    api.get<WorkersHousingLocation>('/workers-housing-location').then(setHousingLocation);
  }
  useEffect(refresh, []);

  // تهيئة الخريطة مرة واحدة فقط.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current).setView(RIYADH_CENTER, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const fg = new L.FeatureGroup().addTo(map);
    featureGroup.current = fg;
    mapInstance.current = map;

    // أداة "تعديل" فقط من شريط أدوات Leaflet.draw — إعادة تشكيل حدود منطقة
    // قائمة بسحب رؤوسها. لا زر حذف هنا عمداً (حذف منطقة كاملة له زر مستقل
    // بالأسفل، تفادياً للّبس بين "حذف الحدود" و"حذف المنطقة").
    const control = new L.Control.Draw({
      position: 'topright',
      draw: false,
      edit: { featureGroup: fg, remove: false },
    });
    map.addControl(control);

    map.on('draw:edited', (e: any) => {
      e.layers.eachLayer((layer: any) => {
        const zoneId = layer.zoneId;
        if (!zoneId) return;
        const latlngs = layer.getLatLngs()[0].map((p: any) => [p.lat, p.lng]);
        api.patch(`/riyadh-zones/${zoneId}`, { boundary: latlngs }).then(refresh);
      });
    });

    map.on('draw:created', (e: any) => {
      const zoneId = drawingForZoneIdRef.current;
      if (!zoneId) return;
      const layer = e.layer;
      layer.zoneId = zoneId;
      fg.addLayer(layer);
      const latlngs = layer.getLatLngs()[0].map((p: any) => [p.lat, p.lng]);
      api.patch(`/riyadh-zones/${zoneId}`, { boundary: latlngs }).then(refresh);
      setDrawingForZoneId(null);
    });
  }, []);

  // drawingForZoneId يتغيَّر بعد أن سُجِّل مستمع draw:created أعلاه (تهيئة
  // لمرة واحدة) — مرجع متزامن يبقى محدَّثاً دون الحاجة لإعادة تسجيل
  // المستمع مع كل تغيير حالة.
  const drawingForZoneIdRef = useRef<string | null>(null);
  useEffect(() => {
    drawingForZoneIdRef.current = drawingForZoneId;
  }, [drawingForZoneId]);

  // إعادة رسم مضلعات المناطق على الخريطة كلما تغيّرت قائمة zones (تحميل
  // أول أو بعد حفظ) — يُفرِّغ المجموعة ويعيد بناءها بالكامل، أبسط من تتبّع
  // فروقات دقيقة لعدد مناطق صغير كهذا.
  useEffect(() => {
    const fg = featureGroup.current;
    if (!fg) return;
    fg.clearLayers();
    layersByZoneId.current.clear();
    for (const zone of zones) {
      if (!zone.boundary || zone.boundary.length < 3) continue;
      const polygon = L.polygon(zone.boundary, { color: zone.color, fillOpacity: 0.25, weight: 2 });
      polygon.zoneId = zone.id;
      polygon.bindTooltip(zone.name, { permanent: true, direction: 'center', className: 'font-bold' });
      fg.addLayer(polygon);
      layersByZoneId.current.set(zone.id, polygon);
    }
  }, [zones]);

  // نقطة انطلاق الفريق الميداني (سكن العمال) — علامة قابلة للسحب منفصلة عن
  // مضلعات المناطق، تُحدَّث بمجرد توفر الموقع أو تغيّره (سحب على الخريطة).
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !housingLocation) return;
    if (housingMarker.current) {
      housingMarker.current.setLatLng([housingLocation.lat, housingLocation.lng]);
      return;
    }
    const icon = L.divIcon({
      html: '<div style="background:#0f172a;color:#fff;border-radius:9999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.4)">🏠</div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const marker = L.marker([housingLocation.lat, housingLocation.lng], { icon, draggable: true }).addTo(map);
    marker.bindTooltip(housingLocation.label, { permanent: true, direction: 'top', offset: [0, -16], className: 'font-bold' });
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      api.patch<WorkersHousingLocation>('/workers-housing-location', { lat: pos.lat, lng: pos.lng }).then(setHousingLocation);
    });
    housingMarker.current = marker;
  }, [housingLocation]);

  function startDrawing(zoneId: string) {
    if (drawHandler.current) drawHandler.current.disable();
    setDrawingForZoneId(zoneId);
    drawHandler.current = new L.Draw.Polygon(mapInstance.current, { shapeOptions: { color: zones.find((z) => z.id === zoneId)?.color } });
    drawHandler.current.enable();
  }

  async function clearBoundary(zoneId: string) {
    await api.patch(`/riyadh-zones/${zoneId}`, { boundary: [] });
    refresh();
  }

  async function addZone() {
    await api.post('/riyadh-zones', { name: tt('منطقة جديدة', 'New Zone'), preferred_weekdays: [] });
    refresh();
  }

  async function updateZone(zoneId: string, patch: Partial<RiyadhZone>) {
    setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)));
    await api.patch(`/riyadh-zones/${zoneId}`, patch);
  }

  async function deleteZone(zone: RiyadhZone) {
    if (!window.confirm(tt(`حذف منطقة "${zone.name}" نهائياً؟ ستفقد كل الأحياء المربوطة بها اقتراح اليوم المفضَّل.`, `Permanently delete "${zone.name}"? Neighborhoods linked to it will lose their day suggestion.`))) {
      return;
    }
    await api.del(`/riyadh-zones/${zone.id}`);
    refresh();
  }

  function toggleWeekday(zone: RiyadhZone, key: string) {
    const next = zone.preferred_weekdays.includes(key)
      ? zone.preferred_weekdays.filter((k) => k !== key)
      : [...zone.preferred_weekdays, key];
    updateZone(zone.id, { preferred_weekdays: next });
  }

  async function addNeighborhood() {
    if (!newNeighborhood.trim() || !newNeighborhoodZone) return;
    await api.post('/neighborhood-zones', { neighborhood: newNeighborhood.trim(), zone_id: newNeighborhoodZone });
    setNewNeighborhood('');
    refresh();
  }

  async function updateNeighborhoodZone(id: string, zone_id: string) {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, zone_id } : a)));
    await api.patch(`/neighborhood-zones/${id}`, { zone_id });
  }

  async function deleteNeighborhood(id: string) {
    await api.del(`/neighborhood-zones/${id}`);
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  async function saveHousingLocation(patch: Partial<WorkersHousingLocation>) {
    const updated = await api.patch<WorkersHousingLocation>('/workers-housing-location', patch);
    setHousingLocation(updated);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{t('مناطق الرياض')}</h2>
        <p className="text-sm text-slate-400">
          {t('قسِّم الرياض إلى مناطق واربط كل حيّ بمنطقته — عند حجز موعد جديد يقترح النظام أفضل أيام الأسبوع لحيّ العميل تلقائياً، لتجميع عملاء المنطقة الواحدة وتقليل تنقّل الفريق الميداني')}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div ref={mapRef} style={{ height: 420 }} />
      </div>

      {housingLocation && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-700">{t('نقطة انطلاق الفريق الميداني')}</h3>
          <p className="mb-3 text-xs text-slate-400">
            {t('اسحب العلامة 🏠 على الخريطة لتغيير الموقع، أو أدخل الإحداثيات مباشرة هنا')}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('الاسم')}</span>
              <input
                value={housingLocation.label}
                onChange={(e) => setHousingLocation({ ...housingLocation, label: e.target.value })}
                onBlur={(e) => saveHousingLocation({ label: e.target.value })}
                className="input"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('خط العرض (Latitude)')}</span>
              <input
                type="number"
                step="any"
                value={housingLocation.lat}
                onChange={(e) => setHousingLocation({ ...housingLocation, lat: Number(e.target.value) })}
                onBlur={(e) => saveHousingLocation({ lat: Number(e.target.value) })}
                className="input w-40"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('خط الطول (Longitude)')}</span>
              <input
                type="number"
                step="any"
                value={housingLocation.lng}
                onChange={(e) => setHousingLocation({ ...housingLocation, lng: Number(e.target.value) })}
                onBlur={(e) => saveHousingLocation({ lng: Number(e.target.value) })}
                className="input w-40"
              />
            </label>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">{t('المناطق')}</h3>
          <button
            onClick={addZone}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> {t('إضافة منطقة')}
          </button>
        </div>
        <div className="space-y-3">
          {zones.map((zone) => (
            <div key={zone.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={zone.color}
                  onChange={(e) => updateZone(zone.id, { color: e.target.value })}
                  className="h-8 w-9 shrink-0 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                />
                <input
                  value={zone.name}
                  onChange={(e) => setZones((prev) => prev.map((z) => (z.id === zone.id ? { ...z, name: e.target.value } : z)))}
                  onBlur={(e) => updateZone(zone.id, { name: e.target.value })}
                  className="input flex-1 font-semibold"
                />
                <button
                  onClick={() => startDrawing(zone.id)}
                  title={t('رسم/إعادة رسم الحدود')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    drawingForZoneId === zone.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <PenLine className="h-3.5 w-3.5" /> {t('رسم الحدود')}
                </button>
                {zone.boundary && zone.boundary.length > 0 && (
                  <button
                    onClick={() => clearBoundary(zone.id)}
                    title={t('حذف الحدود المرسومة')}
                    className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => deleteZone(zone)}
                  title={t('حذف المنطقة نهائياً')}
                  className="flex items-center gap-1 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2.5">
                <div className="mb-1 text-[11px] font-medium text-slate-400">{t('الأيام المفضَّلة لجدولة هذه المنطقة')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => toggleWeekday(zone, d.key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        zone.preferred_weekdays.includes(d.key) ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {t(d.label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {zones.length === 0 && <div className="py-6 text-center text-sm text-slate-400">{t('لا توجد مناطق بعد')}</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('ربط الأحياء بالمناطق')}</h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={newNeighborhood}
            onChange={(e) => setNewNeighborhood(e.target.value)}
            placeholder={t('اسم الحي (كما يُكتب في بيانات العميل)')}
            className="input flex-1"
          />
          <select value={newNeighborhoodZone} onChange={(e) => setNewNeighborhoodZone(e.target.value)} className="input w-auto">
            <option value="">{t('اختر المنطقة')}</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <button
            onClick={addNeighborhood}
            disabled={!newNeighborhood.trim() || !newNeighborhoodZone}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t('إضافة حي')}
          </button>
        </div>
        <div className="max-h-[26rem] overflow-y-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="p-2 text-start font-medium">{t('الحي')}</th>
                <th className="p-2 text-start font-medium">{t('منطقة الرياض')}</th>
                <th className="p-2 text-start font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-medium text-slate-700">{a.neighborhood}</td>
                  <td className="p-2">
                    <select value={a.zone_id} onChange={(e) => updateNeighborhoodZone(a.id, e.target.value)} className="input">
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <button onClick={() => deleteNeighborhood(a.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-slate-400">
                    {t('لا توجد أحياء مربوطة بعد')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
