import { useEffect, useRef, useState } from 'react';
import { MapPin, Camera, Banknote, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, PaymentMethod } from '../../shared/types.js';
import { AppointmentStatusBadge } from '../components/Badge.js';
import { formatDateAr, formatTimeAr, formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AppointmentCard({ appt, onChange }: { appt: Appointment; onChange: () => void }) {
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadPhoto(stage: 'before' | 'after', file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data_url = await fileToDataUrl(file);
      await api.post(`/appointments/${appt.id}/photos`, { stage, data_url });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(status: Appointment['status']) {
    setBusy(true);
    try {
      await api.patch(`/appointments/${appt.id}`, { status });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment() {
    const amountStr = window.prompt('المبلغ المُحصَّل (ر.س)', String(appt.remaining_amount));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return;
    const method = (window.prompt('طريقة الدفع: cash / card / bank_transfer', 'cash') || 'cash') as PaymentMethod;
    setBusy(true);
    try {
      await api.post(`/appointments/${appt.id}/payments`, { amount, method });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const beforeCount = appt.photos.filter((p) => p.stage === 'before').length;
  const afterCount = appt.photos.filter((p) => p.stage === 'after').length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{appt.customer_name_snapshot}</span>
        <AppointmentStatusBadge status={appt.status} />
      </div>
      <div className="mb-1 text-xs text-slate-500">{appt.service_name_snapshot}</div>
      <div className="mb-3 text-xs text-slate-400">
        {formatDateAr(appt.scheduled_at)} · {formatTimeAr(appt.scheduled_at)}
      </div>

      {appt.location_url && (
        <a
          href={appt.location_url}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-medium text-brand-700"
        >
          <MapPin className="h-4 w-4" /> فتح موقع العميل في الخرائط
        </a>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={() => beforeInput.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700"
        >
          <Camera className="h-3.5 w-3.5" /> صورة قبل ({beforeCount})
        </button>
        <button
          disabled={busy}
          onClick={() => afterInput.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700"
        >
          <Camera className="h-3.5 w-3.5" /> صورة بعد ({afterCount})
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

      <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
        <span className="text-slate-500">المتبقي للتحصيل</span>
        <span className="font-semibold text-slate-700">{formatMoney(appt.remaining_amount)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy || appt.status === 'completed'}
          onClick={() => updateStatus(appt.status === 'scheduled' ? 'on_the_way' : appt.status === 'on_the_way' ? 'in_progress' : 'completed')}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          {appt.status === 'scheduled' ? 'في الطريق' : appt.status === 'on_the_way' ? 'بدء التنفيذ' : appt.status === 'in_progress' ? 'إنهاء الزيارة' : 'مكتملة'}
        </button>
        <button
          disabled={busy || appt.remaining_amount <= 0}
          onClick={recordPayment}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
        >
          <Banknote className="h-3.5 w-3.5" /> تسجيل تحصيل
        </button>
      </div>
    </div>
  );
}

export default function TechnicianPortal() {
  const { user, allProfiles } = useAuth();
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
        <h1 className="text-xl font-bold text-slate-800">بوابة الفني الميداني</h1>
        <p className="text-sm text-slate-400">مهامك، الصور، والتحصيل — من جوالك</p>
      </div>

      {user?.role !== 'technician' && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">عرض كـ فني</span>
          <select
            className="input"
            value={asTechnician}
            onChange={(e) => setAsTechnician(e.target.value)}
          >
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
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
            لا توجد مهام مسندة حالياً
          </div>
        )}
      </div>
    </div>
  );
}
