import { useRef, useState } from 'react';
import { X, MapPin, ExternalLink, Phone, Camera, Wallet, Clock } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Profile, PaymentMethodOption, AppointmentStatus } from '../../shared/types.js';
import { ROLE_LABELS_AR } from '../../shared/types.js';
import { APPT_STATUS_STYLE } from './Badge.js';
import PayAppointmentModal from './PayAppointmentModal.js';
import { formatDateAr, formatTimeAr, formatDuration, formatMoney } from '../lib/date.js';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const STATUS_ORDER: AppointmentStatus[] = ['scheduled', 'on_the_way', 'in_progress', 'completed', 'delayed', 'cancelled'];
const PHOTO_TABS: { value: 'all' | 'before' | 'after'; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'before', label: 'قبل العمل' },
  { value: 'after', label: 'بعد العمل' },
];

export default function AppointmentDetailModal({
  appointment,
  customer,
  allProfiles,
  paymentMethods,
  onClose,
  onChanged,
}: {
  appointment: Appointment;
  customer: Customer | undefined;
  allProfiles: Profile[];
  paymentMethods: PaymentMethodOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [photoTab, setPhotoTab] = useState<'all' | 'before' | 'after'>('all');
  const [showPay, setShowPay] = useState(false);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  const supervisor = allProfiles.find((p) => p.id === appointment.supervisor_id);
  const endTime = new Date(new Date(appointment.scheduled_at).getTime() + appointment.expected_duration_minutes * 60000);

  async function setStatus(status: AppointmentStatus) {
    if (status === appointment.status) return;
    setBusy(true);
    try {
      await api.patch(`/appointments/${appointment.id}`, { status });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(stage: 'before' | 'after', file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data_url = await fileToDataUrl(file);
      await api.post(`/appointments/${appointment.id}/photos`, { stage, data_url });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const visiblePhotos = appointment.photos.filter((p) => photoTab === 'all' || p.stage === photoTab);
  const beforeCount = appointment.photos.filter((p) => p.stage === 'before').length;
  const afterCount = appointment.photos.filter((p) => p.stage === 'after').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">تفاصيل المهمة والموعد</h2>
            <p className="text-xs text-slate-400">رقم المرجع: #{appointment.id.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Customer + location */}
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <div className="mb-2 text-xs text-slate-400">بيانات العميل والموقع</div>
            <div className="mb-1 text-sm font-semibold">{appointment.customer_name_snapshot}</div>
            {appointment.address_snapshot && (
              <div className="mb-3 flex items-start gap-1.5 text-xs text-slate-300">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{appointment.address_snapshot}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {appointment.location_url && (
                <a
                  href={appointment.location_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> فتح الخريطة
                </a>
              )}
              {customer?.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Phone className="h-3.5 w-3.5" /> اتصال
                </a>
              )}
            </div>
          </div>

          {/* Status picker — the only place status can change now */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-medium text-slate-600">تحديث حالة المهمة الحالية:</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  disabled={busy}
                  onClick={() => setStatus(s)}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                    appointment.status === s
                      ? 'bg-brand-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {APPT_STATUS_STYLE[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Service / schedule info */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400">نوع الخدمة</div>
              <div className="text-sm font-semibold text-slate-700">{appointment.service_name_snapshot}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">موعد الزيارة</div>
              <div className="text-sm font-semibold text-slate-700">
                {formatDateAr(appointment.scheduled_at)} - {formatTimeAr(appointment.scheduled_at)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">المدة المقدرة</div>
              <div className="text-sm font-semibold text-slate-700">{formatDuration(appointment.expected_duration_minutes)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">نهاية العمل المتوقعة</div>
              <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                <Clock className="h-3.5 w-3.5 text-slate-400" /> {formatTimeAr(endTime.toISOString())}
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-medium text-slate-600">فريق العمل المسند</div>
            <div className="flex flex-wrap gap-2">
              {supervisor && (
                <span className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {supervisor.full_name} ({ROLE_LABELS_AR[supervisor.role]})
                </span>
              )}
              {appointment.assignments.map((asg) => (
                <span
                  key={asg.id}
                  className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                >
                  {asg.technician_name ?? 'فني'} (فني)
                </span>
              ))}
              {!supervisor && appointment.assignments.length === 0 && (
                <span className="text-xs text-slate-400">لا يوجد فريق مسند بعد</span>
              )}
            </div>
            {appointment.notes && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <div className="mb-1 font-medium">تعليمات وملاحظات:</div>
                {appointment.notes}
              </div>
            )}
          </div>

          {/* Photos */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <Camera className="h-4 w-4" /> صور توثيق العمل (قبل وبعد)
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => beforeInput.current?.click()}
                className="flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
              >
                + صور قبل العمل
              </button>
              <button
                disabled={busy}
                onClick={() => afterInput.current?.click()}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
              >
                + صور بعد العمل
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

            <div className="mb-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
              {PHOTO_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setPhotoTab(t.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${photoTab === t.value ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                >
                  {t.label} (
                  {t.value === 'all' ? appointment.photos.length : t.value === 'before' ? beforeCount : afterCount})
                </button>
              ))}
            </div>

            {visiblePhotos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {visiblePhotos.map((p) => (
                  <img key={p.id} src={p.data_url} alt={p.stage} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                <Camera className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                لم يتم رفع صور لهذا الموعد بعد
                <br />
                انقر على "+ صور قبل العمل" أو "+ صور بعد العمل" لتوثيق الخدمة
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                  <Wallet className="h-4 w-4" /> المدفوعات والمستحقات المالية
                </div>
                <p className="text-xs text-slate-400">تسجيل الدفعات النقدية والشبكة ومتابعة المتبقي</p>
              </div>
              {appointment.remaining_amount > 0 && (
                <button
                  onClick={() => setShowPay(true)}
                  className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  + تسجيل دفعة
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-red-50 p-3 text-center">
                <div className="text-xs text-red-600">المتبقي المطلوب</div>
                <div className="text-sm font-bold text-red-700">{formatMoney(appointment.remaining_amount)}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-center">
                <div className="text-xs text-emerald-600">المدفوع المستلم</div>
                <div className="text-sm font-bold text-emerald-700">{formatMoney(appointment.total_paid)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs text-slate-500">قيمة الخدمة</div>
                <div className="text-sm font-bold text-slate-700">{formatMoney(appointment.amount)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPay && (
        <PayAppointmentModal
          appointment={appointment}
          customer={customer}
          paymentMethods={paymentMethods}
          onClose={() => setShowPay(false)}
          onPaid={onChanged}
        />
      )}
    </div>
  );
}
