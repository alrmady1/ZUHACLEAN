import { useEffect, useRef, useState } from 'react';
import { MapPin, Camera } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment } from '../../shared/types.js';
import { AppointmentStatusBadge } from '../components/Badge.js';
import { formatDateAr, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { compressImageToDataUrl } from '../lib/image.js';

function AppointmentCard({ appt, onChange }: { appt: Appointment; onChange: () => void }) {
  const { t } = useI18n();
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadPhoto(stage: 'before' | 'after', file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data_url = await compressImageToDataUrl(file);
      await api.post(`/appointments/${appt.id}/photos`, { stage, data_url });
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

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={() => beforeInput.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700"
        >
          <Camera className="h-3.5 w-3.5" /> {t('صورة قبل')} ({beforeCount})
        </button>
        <button
          disabled={busy}
          onClick={() => afterInput.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700"
        >
          <Camera className="h-3.5 w-3.5" /> {t('صورة بعد')} ({afterCount})
        </button>
        <input
          ref={beforeInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => uploadPhoto('before', e.target.files?.[0])}
        />
        <input
          ref={afterInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => uploadPhoto('after', e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

export default function TechnicianPortal() {
  const { user, allProfiles } = useAuth();
  const { t } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [asTechnician, setAsTechnician] = useState<string | undefined>(
    user?.role === 'technician' ? user.id : undefined,
  );

  function refresh() {
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }

  useEffect(refresh, []);

  const technicians = allProfiles.filter((p) => p.role === 'technician');
  const effectiveId = asTechnician ?? technicians[0]?.id;
  const mine = appointments
    .filter((a) => a.assignments.some((x) => x.technician_id === effectiveId))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('بوابة الفني الميداني')}</h1>
        <p className="text-sm text-slate-400">{t('مهامك، الصور، والتحصيل — من جوالك')}</p>
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

      <div className="space-y-3">
        {mine.map((appt) => (
          <AppointmentCard key={appt.id} appt={appt} onChange={refresh} />
        ))}
        {mine.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
            {t('لا توجد مهام مسندة حالياً')}
          </div>
        )}
      </div>
    </div>
  );
}
