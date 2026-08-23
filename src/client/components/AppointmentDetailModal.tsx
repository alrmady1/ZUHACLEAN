import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X, MapPin, Phone, Camera, Wallet, Clock, Pencil, MessageCircle, Printer, Trash2, Users as TeamIcon, Map as MapIcon, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Profile, PaymentMethodOption, AppointmentStatus, Payment, Invoice } from '../../shared/types.js';
import {
  CAN_EDIT_PAYMENTS_ROLES,
  CAN_BOOK_APPOINTMENT_ROLES,
  CAN_ASSIGN_TEAM_ROLES,
  CAN_EDIT_LOCATION_ROLES,
} from '../../shared/types.js';
import { APPT_STATUS_STYLE } from './Badge.js';
import PayAppointmentModal from './PayAppointmentModal.js';
import InvoiceDocument from './InvoiceDocument.js';
import { formatDateAr, formatTimeAr, formatDuration, formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { waLink } from '../lib/whatsapp.js';

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
  const { user } = useAuth();
  const { t, tt, roleLabel } = useI18n();
  const canEditPayments = user ? CAN_EDIT_PAYMENTS_ROLES.includes(user.role) : false;
  const canReprintInvoice = user ? CAN_BOOK_APPOINTMENT_ROLES.includes(user.role) : false;
  const canAssignTeam = user ? CAN_ASSIGN_TEAM_ROLES.includes(user.role) : false;
  const canEditLocation = user ? CAN_EDIT_LOCATION_ROLES.includes(user.role) : false;
  const [busy, setBusy] = useState(false);
  const [photoTab, setPhotoTab] = useState<'all' | 'before' | 'after'>('all');
  const [showPay, setShowPay] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamSupervisorId, setTeamSupervisorId] = useState(appointment.supervisor_id ?? '');
  const [teamTechnicianId, setTeamTechnicianId] = useState(appointment.assignments[0]?.technician_id ?? '');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationUrlInput, setLocationUrlInput] = useState(appointment.location_url ?? customer?.location_url ?? '');
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  // Look up whether this appointment already has an invoice, so a
  // "reprint" option can be offered once the work is completed and paid.
  useEffect(() => {
    api
      .get<Invoice[]>(`/invoices?appointment_id=${appointment.id}`)
      .then((list) => setInvoice(list[list.length - 1] ?? null));
  }, [appointment.id, appointment.total_paid]);

  const supervisor = allProfiles.find((p) => p.id === appointment.supervisor_id);
  const endTime = new Date(new Date(appointment.scheduled_at).getTime() + appointment.expected_duration_minutes * 60000);
  const supervisorOptions = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicianOptions = allProfiles.filter((p) => p.role === 'technician');

  async function saveTeam() {
    setBusy(true);
    try {
      const technicianName = technicianOptions.find((tech) => tech.id === teamTechnicianId)?.full_name;
      await api.patch(`/appointments/${appointment.id}`, {
        supervisor_id: teamSupervisorId || undefined,
        assignments: teamTechnicianId
          ? [{ id: appointment.assignments[0]?.id ?? crypto.randomUUID(), technician_id: teamTechnicianId, technician_name: technicianName }]
          : [],
      });
      onChanged();
      setEditingTeam(false);
    } finally {
      setBusy(false);
    }
  }

  // يُحفظ على العميل نفسه (يفيد كل مواعيده القادمة) وعلى هذا الموعد مباشرة
  // (حتى تظهر أيقونة الموقع فوراً بدون انتظار موعد جديد).
  async function saveLocation() {
    setBusy(true);
    try {
      const url = locationUrlInput.trim() || undefined;
      if (customer) await api.patch(`/customers/${customer.id}`, { location_url: url });
      await api.patch(`/appointments/${appointment.id}`, { location_url: url });
      onChanged();
      setEditingLocation(false);
    } finally {
      setBusy(false);
    }
  }

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

  async function deletePhoto(photoId: string) {
    if (!window.confirm(t('حذف هذه الصورة؟ لا يمكن التراجع عن هذا الإجراء.'))) return;
    setBusy(true);
    try {
      await api.del(`/appointments/${appointment.id}/photos/${photoId}`);
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
            <h2 className="text-lg font-bold text-slate-800">{t('تفاصيل المهمة والموعد')}</h2>
            <p className="text-xs text-slate-400">{t('رقم المرجع:')} #{appointment.id.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Customer + location */}
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <div className="mb-2 text-xs text-slate-400">{t('بيانات العميل والموقع')}</div>
            <div className="mb-1 text-sm font-semibold">{appointment.customer_name_snapshot}</div>
            {appointment.address_snapshot && (
              <div className="mb-3 flex items-start gap-1.5 text-xs text-slate-300">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{appointment.address_snapshot}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {customer?.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Phone className="h-3.5 w-3.5" /> {t('اتصال')}
                </a>
              )}
              {customer?.phone && (
                <a
                  href={waLink(customer.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> {t('واتساب')}
                </a>
              )}
              {appointment.location_url && !editingLocation && (
                <a
                  href={appointment.location_url}
                  target="_blank"
                  rel="noreferrer"
                  title={t('فتح موقع العميل في الخريطة')}
                  className="flex items-center justify-center rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700"
                >
                  <MapPin className="h-3.5 w-3.5" />
                </a>
              )}
              {canEditLocation && !editingLocation && (
                <button
                  onClick={() => {
                    setLocationUrlInput(appointment.location_url ?? customer?.location_url ?? '');
                    setEditingLocation(true);
                  }}
                  title={appointment.location_url ? t('تعديل رابط الموقع') : t('إضافة رابط الموقع')}
                  className="flex items-center justify-center rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/20"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editingLocation && (
              <div className="mt-3 space-y-2 rounded-xl bg-white/5 p-3">
                <span className="block text-xs font-medium text-slate-300">{t('رابط موقع العميل (خرائط جوجل)')}</span>
                <div className="flex gap-2">
                  <input
                    dir="ltr"
                    value={locationUrlInput}
                    onChange={(e) => setLocationUrlInput(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="input flex-1"
                  />
                  <a
                    href="https://www.google.com/maps"
                    target="_blank"
                    rel="noreferrer"
                    title={t('فتح خرائط جوجل لتحديد الموقع يدويًا ولصق رابطه هنا')}
                    className="flex shrink-0 items-center justify-center rounded-lg bg-white/10 px-2.5 text-white hover:bg-white/20"
                  >
                    <MapIcon className="h-4 w-4" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy}
                    onClick={saveLocation}
                    className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> {busy ? t('جارِ الحفظ…') : t('حفظ')}
                  </button>
                  <button onClick={() => setEditingLocation(false)} className="text-xs font-medium text-slate-300 hover:text-white">
                    {t('إلغاء')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status picker — the only place status can change now */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-medium text-slate-600">{t('تحديث حالة المهمة الحالية:')}</div>
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
                  {t(APPT_STATUS_STYLE[s].label)}
                </button>
              ))}
            </div>
          </div>

          {/* Service / schedule info */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400">{t('نوع الخدمة')}</div>
              <div className="text-sm font-semibold text-slate-700">{appointment.service_name_snapshot}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('موعد الزيارة')}</div>
              <div className="text-sm font-semibold text-slate-700">
                {formatDateAr(appointment.scheduled_at)} - {formatTimeAr(appointment.scheduled_at)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('المدة المقدرة')}</div>
              <div className="text-sm font-semibold text-slate-700">{formatDuration(appointment.expected_duration_minutes)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('نهاية العمل المتوقعة')}</div>
              <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                <Clock className="h-3.5 w-3.5 text-slate-400" /> {formatTimeAr(endTime.toISOString())}
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <TeamIcon className="h-4 w-4" /> {t('فريق العمل المسند')}
              </div>
              {canAssignTeam && !editingTeam && (
                <button
                  onClick={() => {
                    setTeamSupervisorId(appointment.supervisor_id ?? '');
                    setTeamTechnicianId(appointment.assignments[0]?.technician_id ?? '');
                    setEditingTeam(true);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                </button>
              )}
            </div>

            {editingTeam ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-600">{t('المشرف المسؤول')}</span>
                    <select value={teamSupervisorId} onChange={(e) => setTeamSupervisorId(e.target.value)} className="input">
                      <option value="">{t('-- بدون تحديد --')}</option>
                      {supervisorOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({roleLabel(s.role)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-600">{t('الفني المسند')}</span>
                    <select value={teamTechnicianId} onChange={(e) => setTeamTechnicianId(e.target.value)} className="input">
                      <option value="">{t('-- بدون تحديد --')}</option>
                      {technicianOptions.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy}
                    onClick={saveTeam}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busy ? t('جارِ الحفظ…') : t('حفظ')}
                  </button>
                  <button
                    onClick={() => setEditingTeam(false)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-600"
                  >
                    {t('إلغاء')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {supervisor && (
                  <span className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {supervisor.full_name} ({roleLabel(supervisor.role)})
                  </span>
                )}
                {appointment.assignments.map((asg) => (
                  <span
                    key={asg.id}
                    className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                  >
                    {asg.technician_name ?? t('فني')} ({t('فني')})
                  </span>
                ))}
                {!supervisor && appointment.assignments.length === 0 && (
                  <span className="text-xs text-slate-400">{t('لا يوجد فريق مسند بعد')}</span>
                )}
              </div>
            )}
            {appointment.notes && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <div className="mb-1 font-medium">{t('تعليمات وملاحظات:')}</div>
                {appointment.notes}
              </div>
            )}
          </div>

          {/* Photos */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <Camera className="h-4 w-4" /> {t('صور توثيق العمل (قبل وبعد)')}
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => beforeInput.current?.click()}
                className="flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
              >
                {t('+ صور قبل العمل')}
              </button>
              <button
                disabled={busy}
                onClick={() => afterInput.current?.click()}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
              >
                {t('+ صور بعد العمل')}
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
              {PHOTO_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setPhotoTab(tab.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${photoTab === tab.value ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
                >
                  {t(tab.label)} (
                  {tab.value === 'all' ? appointment.photos.length : tab.value === 'before' ? beforeCount : afterCount})
                </button>
              ))}
            </div>

            {visiblePhotos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {visiblePhotos.map((p) => (
                  <div key={p.id} className="relative aspect-square">
                    <img src={p.data_url} alt={p.stage} className="h-full w-full rounded-xl object-cover" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deletePhoto(p.id)}
                      title={t('حذف الصورة')}
                      className="absolute end-1 top-1 rounded-lg bg-slate-900/60 p-1 text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                <Camera className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                {t('لم يتم رفع صور لهذا الموعد بعد')}
                <br />
                {tt(
                  'انقر على "+ صور قبل العمل" أو "+ صور بعد العمل" لتوثيق الخدمة',
                  'Tap "+ Before Work Photos" or "+ After Work Photos" to document the service',
                )}
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                  <Wallet className="h-4 w-4" /> {t('المدفوعات والمستحقات المالية')}
                </div>
                <p className="text-xs text-slate-400">{t('تسجيل الدفعات النقدية والشبكة ومتابعة المتبقي')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {appointment.remaining_amount > 0 && appointment.status === 'completed' && (
                  <button
                    onClick={() => setShowPay(true)}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    {t('+ تسجيل دفعة')}
                  </button>
                )}
                {invoice && appointment.status === 'completed' && canReprintInvoice && (
                  <button
                    onClick={() => setShowInvoice(true)}
                    className="flex items-center gap-1 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                  >
                    <Printer className="h-3.5 w-3.5" /> {t('إعادة طباعة الفاتورة')}
                  </button>
                )}
              </div>
            </div>
            {appointment.remaining_amount > 0 && appointment.status !== 'completed' && (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {tt(
                  'لا يمكن تحصيل الدفعة وإصدار الفاتورة إلا بعد اختيار حالة المهمة "مكتملة" أعلاه.',
                  'The payment cannot be collected and the invoice cannot be issued until the task status above is set to "Completed".',
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-red-50 p-3 text-center">
                <div className="text-xs text-red-600">{t('المتبقي المطلوب')}</div>
                <div className="text-sm font-bold text-red-700">{formatMoney(appointment.remaining_amount)}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-center">
                <div className="text-xs text-emerald-600">{t('المدفوع المستلم')}</div>
                <div className="text-sm font-bold text-emerald-700">{formatMoney(appointment.total_paid)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs text-slate-500">{t('قيمة الخدمة')}</div>
                <div className="text-sm font-bold text-slate-700">{formatMoney(appointment.amount)}</div>
              </div>
            </div>

            {appointment.payments.length > 0 && (
              <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2">
                {appointment.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700">{formatMoney(p.amount)}</div>
                      <div className="text-xs text-slate-400">
                        {paymentMethods.find((m) => m.id === p.method)?.name ?? p.method} — {formatDateAr(p.recorded_at)}
                      </div>
                    </div>
                    {canEditPayments && (
                      <button
                        onClick={() => setEditingPayment(p)}
                        title={t('تعديل المبلغ')}
                        className="flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-brand-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingPayment && (
        <EditPaymentModal
          appointmentId={appointment.id}
          payment={editingPayment}
          paymentMethods={paymentMethods}
          onClose={() => setEditingPayment(null)}
          onSaved={() => {
            setEditingPayment(null);
            onChanged();
          }}
        />
      )}

      {showPay && (
        <PayAppointmentModal
          appointment={appointment}
          customer={customer}
          paymentMethods={paymentMethods}
          onClose={() => setShowPay(false)}
          onPaid={onChanged}
        />
      )}

      {showInvoice && invoice && (
        <InvoiceDocument
          invoice={invoice}
          customer={customer}
          appointment={appointment}
          paymentMethods={paymentMethods}
          onClose={() => setShowInvoice(false)}
        />
      )}
    </div>
  );
}

// المدير العام / مدير النظام فقط يصلون لهذا (see CAN_EDIT_PAYMENTS_ROLES) —
// تصحيح مبلغ أو طريقة دفعة مسجّلة مسبقاً، بدل حذفها وتسجيل واحدة جديدة.
function EditPaymentModal({
  appointmentId,
  payment,
  paymentMethods,
  onClose,
  onSaved,
}: {
  appointmentId: string;
  payment: Payment;
  paymentMethods: PaymentMethodOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.patch(`/appointments/${appointmentId}/payments/${payment.id}`, {
        amount: Number(form.get('amount')),
        method: form.get('method'),
      });
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t('تعديل الدفعة')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('المبلغ (ر.س)')}</span>
            <input type="number" name="amount" min={0} step="0.01" defaultValue={payment.amount} required className="input" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('طريقة الدفع')}</span>
            <select name="method" defaultValue={payment.method} required className="input">
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ الحفظ…') : t('حفظ التعديل')}
        </button>
      </form>
    </div>
  );
}
