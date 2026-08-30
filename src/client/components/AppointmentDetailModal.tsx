import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MapPin, Phone, Camera, Image as ImageIcon, Wallet, Clock, Pencil, MessageCircle, Printer, Trash2, Users as TeamIcon, Map as MapIcon, Check, Star, ChevronDown } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Profile, PaymentMethodOption, AppointmentStatus, Payment, Invoice, LeaveRecord, Service, VisitOutcome } from '../../shared/types.js';
import { CAN_EDIT_LOCATION_ROLES, CAN_DELETE_PHOTOS_ROLES, VISIT_OUTCOME_LABELS_AR } from '../../shared/types.js';
import { APPT_STATUS_STYLE } from './Badge.js';
import PayAppointmentModal from './PayAppointmentModal.js';
import InvoiceDocument from './InvoiceDocument.js';
import { formatDateAr, formatTimeAr, formatDuration, formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { waLink, ratingRequestMessage } from '../lib/whatsapp.js';
import { compressImageToDataUrl } from '../lib/image.js';
import { findDayOffConflicts } from '../lib/weekdays.js';
import { findLeaveConflicts } from '../lib/leaves.js';

// تحويل ISO إلى صيغة <input type="datetime-local"> (بالتوقيت المحلي —
// datetime-local لا يفهم "Z"/UTC، فيجب بناء السلسلة يدوياً من مكوّنات
// التاريخ المحلية بدل استخدام toISOString مباشرة).
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  services,
  paymentMethods,
  onClose,
  onChanged,
}: {
  appointment: Appointment;
  customer: Customer | undefined;
  allProfiles: Profile[];
  services: Service[];
  paymentMethods: PaymentMethodOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user, can } = useAuth();
  const { t, tt, roleLabel } = useI18n();
  const navigate = useNavigate();
  const canEditPayments = can('issue_invoices');
  const canReprintInvoice = can('issue_invoices');
  // canAssignTeam يتحكم بالمشرف المسؤول عن الموعد فقط — اختيار/تغيير
  // الفني صار صلاحية مستقلة (assign_appointment_technician) حتى يمكن
  // منح شخص إسناد الفني دون المشرف أو العكس.
  const canAssignTeam = can('edit_appointment_team');
  const canAssignTechnician = can('assign_appointment_technician');
  const canEditLocation = user ? CAN_EDIT_LOCATION_ROLES.includes(user.role) : false;
  const canDeletePhotos = user ? CAN_DELETE_PHOTOS_ROLES.includes(user.role) : false;
  const canDeleteAppointment = can('delete_appointments');
  const canEditTime = can('edit_appointments');
  // نفس صلاحية تعديل موعد الزيارة — تعديل نوع الخدمة جزء طبيعي من تعديل
  // الموعد نفسه، بلا صلاحية مستقلة جديدة.
  const canEditServices = can('edit_appointments');
  const canUpdateStatus = can('update_appointment_status');
  const canAddPhotos = can('add_before_after_photos');
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
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState(toDatetimeLocalValue(appointment.scheduled_at));
  const [editingServices, setEditingServices] = useState(false);
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);
  const [editAmount, setEditAmount] = useState<number | ''>(appointment.amount);
  const [editDuration, setEditDuration] = useState<number | ''>(appointment.expected_duration_minutes);
  const [showEditServiceDropdown, setShowEditServiceDropdown] = useState(false);
  const editServiceBoxRef = useRef<HTMLDivElement>(null);
  const beforeCameraInput = useRef<HTMLInputElement>(null);
  const beforeGalleryInput = useRef<HTMLInputElement>(null);
  const afterCameraInput = useRef<HTMLInputElement>(null);
  const afterGalleryInput = useRef<HTMLInputElement>(null);
  // صور الموقع الحالي — بديل قبل/بعد لمواعيد "زيارة عميل" فقط (انظر
  // قسم الصور أدناه).
  const siteCameraInput = useRef<HTMLInputElement>(null);
  const siteGalleryInput = useRef<HTMLInputElement>(null);
  // الاعتماد على أن يعرض المتصفح تلقائياً خيار "كاميرا" أو "معرض" لم يكن
  // ثابتاً عبر كل الأجهزة/المتصفحات — بعضها يعرض المعرض فقط. لذا حقلان
  // منفصلان صراحة لكل مرحلة: كاميرا (capture) ومعرض (multiple)، مع قائمة
  // صغيرة تفتح عند الضغط على الزر لاختيار أيهما.
  const [photoMenu, setPhotoMenu] = useState<'before' | 'after' | 'site' | null>(null);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  // نتيجة زيارة المعاينة (Appointment.kind === 'visit') — نوع التنظيف
  // المطلوب والسعر يُرفعان مرة واحدة فقط، مع النتيجة النهائية للزيارة
  // (انظر قسم "نتيجة الزيارة" أدناه).
  const [visitServiceType, setVisitServiceType] = useState(appointment.visit_service_type ?? '');
  const [visitAmount, setVisitAmount] = useState<number | ''>(appointment.amount || '');
  const [submittingVisit, setSubmittingVisit] = useState<VisitOutcome | null>(null);

  // Look up whether this appointment already has an invoice, so a
  // "reprint" option can be offered once the work is completed and paid.
  useEffect(() => {
    api
      .get<Invoice[]>(`/invoices?appointment_id=${appointment.id}`)
      .then((list) => setInvoice(list[list.length - 1] ?? null));
  }, [appointment.id, appointment.total_paid]);

  useEffect(() => {
    api.get<LeaveRecord[]>('/leaves').then(setLeaves);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (editServiceBoxRef.current && !editServiceBoxRef.current.contains(e.target as Node)) setShowEditServiceDropdown(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const supervisor = allProfiles.find((p) => p.id === appointment.supervisor_id);
  const endTime = new Date(new Date(appointment.scheduled_at).getTime() + appointment.expected_duration_minutes * 60000);
  const supervisorOptions = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicianOptions = allProfiles.filter((p) => p.role === 'technician');

  async function saveTeam() {
    // منع فعلي (وليس مجرد تنبيه) — إن كان المشرف أو الفني المختار في إجازة
    // سنوية سارية يوم هذا الموعد (Settings ← الإجازات)، لا يمكن الحفظ إطلاقاً.
    const leaveConflicts = findLeaveConflicts(
      appointment.scheduled_at,
      [
        { profile: supervisorOptions.find((s) => s.id === teamSupervisorId), roleLabel: t('المشرف') },
        { profile: technicianOptions.find((tech) => tech.id === teamTechnicianId), roleLabel: t('الفني') },
      ],
      leaves,
    );
    if (leaveConflicts.length > 0) {
      const names = leaveConflicts.map((c) => `${c.roleLabel} ${c.name}`).join('، ');
      window.alert(tt(
        `${names} في إجازة سنوية خلال تاريخ هذا الموعد — لا يمكن إسناده له. اختر شخصاً آخر.`,
        `${names} is on annual leave during this appointment's date — cannot be assigned. Choose someone else.`,
      ));
      return;
    }
    // تنبيه (وليس منعاً) إن كان المشرف أو الفني المختار في إجازته الأسبوعية
    // الثابتة يوم هذا الموعد (Settings ← أيام الإجازة الأسبوعية).
    const dayOffConflicts = findDayOffConflicts(appointment.scheduled_at, [
      { profile: supervisorOptions.find((s) => s.id === teamSupervisorId), roleLabel: t('المشرف') },
      { profile: technicianOptions.find((tech) => tech.id === teamTechnicianId), roleLabel: t('الفني') },
    ]);
    if (dayOffConflicts.length > 0) {
      const names = dayOffConflicts.map((c) => `${c.roleLabel} ${c.name}`).join('، ');
      const proceed = window.confirm(tt(
        `${names} لديه إجازة أسبوعية في هذا اليوم. هل ترغب باستكمال إجراءات إسناد الموعد؟`,
        `${names} has a weekly day off on this day. Do you want to continue assigning the appointment?`,
      ));
      if (!proceed) return;
    }
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

  async function saveTime() {
    if (!timeInput) return;
    const newScheduledAt = new Date(timeInput).toISOString();
    // منع فعلي — المشرف/الفني المسندان حالياً قد يصبحان في إجازة سنوية
    // سارية على التاريخ الجديد بعد تعديل الوقت.
    const leaveConflicts = findLeaveConflicts(
      newScheduledAt,
      [
        { profile: supervisor, roleLabel: t('المشرف') },
        { profile: allProfiles.find((p) => p.id === appointment.assignments[0]?.technician_id), roleLabel: t('الفني') },
      ],
      leaves,
    );
    if (leaveConflicts.length > 0) {
      const names = leaveConflicts.map((c) => `${c.roleLabel} ${c.name}`).join('، ');
      window.alert(tt(
        `${names} في إجازة سنوية خلال هذا التاريخ — لا يمكن نقل الموعد إليه. اختر تاريخاً آخر أو عدِّل الفريق المسند أولاً.`,
        `${names} is on annual leave during this date — the appointment cannot be moved there. Choose another date or reassign the team first.`,
      ));
      return;
    }
    // نفس تنبيه الإجازة الأسبوعية، لكن على التاريخ الجديد بعد تعديل الوقت
    // (المشرف/الفني المسندان حالياً لهذا الموعد قد يصبحان في إجازتهما).
    const dayOffConflicts = findDayOffConflicts(newScheduledAt, [
      { profile: supervisor, roleLabel: t('المشرف') },
      { profile: allProfiles.find((p) => p.id === appointment.assignments[0]?.technician_id), roleLabel: t('الفني') },
    ]);
    if (dayOffConflicts.length > 0) {
      const names = dayOffConflicts.map((c) => `${c.roleLabel} ${c.name}`).join('، ');
      const proceed = window.confirm(tt(
        `${names} لديه إجازة أسبوعية في هذا اليوم. هل ترغب باستكمال إجراءات تعديل وقت الموعد؟`,
        `${names} has a weekly day off on this day. Do you want to continue changing the appointment time?`,
      ));
      if (!proceed) return;
    }
    setBusy(true);
    try {
      await api.patch(`/appointments/${appointment.id}`, { scheduled_at: newScheduledAt });
      onChanged();
      setEditingTime(false);
    } finally {
      setBusy(false);
    }
  }

  // service_id على الموعد يخزّن أول خدمة فقط حتى عند اختيار عدة خدمات
  // عند الحجز (نفس تصرف NewAppointmentModal) — الاسم المركّب في
  // service_name_snapshot ("خدمة أ، خدمة ب") هو المصدر الوحيد لمعرفة كل
  // الخدمات المختارة أصلاً، فتُعاد مطابقتها بالاسم هنا لتمهيد التعديل.
  function startEditingServices() {
    const names = appointment.service_name_snapshot.split('،').map((n) => n.trim()).filter(Boolean);
    const matched = services.filter((s) => names.includes(s.name));
    setEditServiceIds(matched.length > 0 ? matched.map((s) => s.id) : [appointment.service_id].filter(Boolean));
    setEditAmount(appointment.amount);
    setEditDuration(appointment.expected_duration_minutes);
    setEditingServices(true);
  }

  // اختيار/إلغاء خدمة يعيد حساب السعر والمدة تلقائياً كمجموع القيم
  // الافتراضية للخدمات المختارة — يبقى قابلاً للتعديل يدوياً بعدها (نفس
  // منطق NewAppointmentModal عند الحجز الأول).
  function toggleEditService(id: string) {
    setEditServiceIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const chosen = services.filter((s) => next.includes(s.id));
      setEditAmount(chosen.reduce((sum, s) => sum + s.default_price, 0));
      setEditDuration(chosen.reduce((sum, s) => sum + s.default_duration_minutes, 0));
      return next;
    });
  }

  async function saveServices() {
    if (editServiceIds.length === 0) {
      window.alert(t('اختر خدمة واحدة على الأقل'));
      return;
    }
    const chosen = services.filter((s) => editServiceIds.includes(s.id));
    setBusy(true);
    try {
      await api.patch(`/appointments/${appointment.id}`, {
        service_id: editServiceIds[0],
        service_name_snapshot: chosen.map((s) => s.name).join('، '),
        amount: Number(editAmount) || 0,
        expected_duration_minutes: Number(editDuration) || 0,
      });
      onChanged();
      setEditingServices(false);
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

  // رفع نتيجة زيارة المعاينة — نوع التنظيف المطلوب والسعر ثم اختيار
  // إحدى الحالتين، دفعة واحدة (لا يمكن تعديلها بعد الرفع). يحوِّل الخادم
  // حالة الموعد تلقائياً إلى "مكتملة" ويرسل تنبيهاً فورياً للإدارة.
  async function submitVisitOutcome(outcome: VisitOutcome) {
    if (!visitServiceType.trim() || visitAmount === '') return;
    setSubmittingVisit(outcome);
    try {
      await api.patch(`/appointments/${appointment.id}`, {
        visit_service_type: visitServiceType.trim(),
        amount: Number(visitAmount) || 0,
        visit_outcome: outcome,
      });
      onChanged();
    } finally {
      setSubmittingVisit(null);
    }
  }

  // بدون capture="environment" (كان يفتح الكاميرا مباشرة ويتجاوز خيار
  // المعرض) — بدونه يعرض نظام الجهاز نفسه اختيار "كاميرا" أو "معرض
  // الصور"/الملفات، حسب الجهاز والمتصفح. مع multiple يمكن اختيار أكثر من
  // صورة دفعة واحدة من المعرض؛ نرفعها بالتتابع ثم نحدّث الواجهة مرة واحدة.
  async function uploadPhotos(stage: 'before' | 'after' | 'site', files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const data_url = await compressImageToDataUrl(file);
        await api.post(`/appointments/${appointment.id}/photos`, { stage, data_url });
      }
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

  async function deleteAppointment() {
    if (!window.confirm(t('حذف هذا الموعد نهائياً؟ سيُحذف مع كل صوره ومدفوعاته المرتبطة به، ولا يمكن التراجع عن هذا الإجراء.'))) return;
    setBusy(true);
    try {
      await api.del(`/appointments/${appointment.id}`);
      onChanged();
      onClose();
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
            {appointment.created_by_name && (
              <p className="mt-0.5 text-xs text-slate-400">
                {t('تم إضافة الموعد بواسطة:')} {appointment.created_by_name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canDeleteAppointment && (
              <button
                onClick={deleteAppointment}
                disabled={busy}
                title={t('حذف الموعد نهائياً')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* Customer + location */}
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            {customer ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/customers?customerId=${customer.id}`);
                }}
                title={t('فتح صفحة العميل للتعديل والاطلاع على كامل التفاصيل')}
                className="mb-1 text-sm font-semibold text-white underline decoration-white/30 underline-offset-2 hover:decoration-white"
              >
                {appointment.customer_name_snapshot}
              </button>
            ) : (
              <div className="mb-1 text-sm font-semibold">{appointment.customer_name_snapshot}</div>
            )}
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
                  disabled={busy || !canUpdateStatus}
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

          {/* نتيجة زيارة المعاينة — تظهر فقط على المواعيد من نوع "زيارة
              عميل"، وتستبدل قسم الخدمة/السعر العادي (لا خدمة أو سعر محدد
              حتى ترفع النتيجة). بعد الرفع تتحول إلى ملخّص للقراءة فقط. */}
          {appointment.kind === 'visit' &&
            (appointment.visit_outcome ? (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="mb-2 text-sm font-semibold text-violet-800">{t('نتيجة الزيارة')}</div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-violet-500">{t('نوع التنظيف المطلوب')}</div>
                    <div className="font-medium text-violet-900">{appointment.visit_service_type}</div>
                  </div>
                  <div>
                    <div className="text-xs text-violet-500">{t('السعر')}</div>
                    <div className="font-medium text-violet-900">{formatMoney(appointment.amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-violet-500">{t('الحالة')}</div>
                    <div className="font-medium text-violet-900">{t(VISIT_OUTCOME_LABELS_AR[appointment.visit_outcome])}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="mb-3 text-sm font-semibold text-violet-800">{t('رفع نتيجة المعاينة')}</div>
                {canUpdateStatus ? (
                  <div className="space-y-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-violet-700">{t('نوع التنظيف المطلوب')}</span>
                      <input
                        value={visitServiceType}
                        onChange={(e) => setVisitServiceType(e.target.value)}
                        placeholder={t('مثال: تنظيف شقة شامل بعد التشطيب')}
                        className="input"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-violet-700">{t('السعر (SAR)')}</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={visitAmount}
                        onChange={(e) => setVisitAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="input"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!visitServiceType.trim() || visitAmount === '' || !!submittingVisit}
                        onClick={() => submitVisitOutcome('price_given')}
                        className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {submittingVisit === 'price_given' ? t('جارِ الحفظ…') : t(VISIT_OUTCOME_LABELS_AR.price_given)}
                      </button>
                      <button
                        type="button"
                        disabled={!visitServiceType.trim() || visitAmount === '' || !!submittingVisit}
                        onClick={() => submitVisitOutcome('approved_pending_schedule')}
                        className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                      >
                        {submittingVisit === 'approved_pending_schedule' ? t('جارِ الحفظ…') : t(VISIT_OUTCOME_LABELS_AR.approved_pending_schedule)}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-violet-500">{t('لا تملك صلاحية رفع نتيجة الزيارة.')}</p>
                )}
              </div>
            ))}

          {/* Service / schedule info */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <div className={editingServices ? 'col-span-2 sm:col-span-4' : undefined}>
              <div className="mb-0.5 flex items-center gap-1 text-xs text-slate-400">
                {t('نوع الخدمة')}
                {canEditServices && !editingServices && (
                  <button
                    type="button"
                    onClick={startEditingServices}
                    title={t('تعديل نوع الخدمة')}
                    className="text-slate-400 hover:text-brand-600"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {editingServices ? (
                <div className="space-y-2">
                  <div ref={editServiceBoxRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEditServiceDropdown((v) => !v)}
                      className="input flex items-center justify-between gap-2 text-start text-sm"
                    >
                      <span className="truncate text-slate-700">
                        {services.filter((s) => editServiceIds.includes(s.id)).map((s) => s.name).join('، ') ||
                          t('-- اختر نوعاً أو أكثر من الخدمة --')}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                    {showEditServiceDropdown && (
                      <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                        {services.map((s) => {
                          const checked = editServiceIds.includes(s.id);
                          return (
                            <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}
                              >
                                {checked && <Check className="h-3 w-3" />}
                              </span>
                              <input type="checkbox" checked={checked} onChange={() => toggleEditService(s.id)} className="hidden" />
                              <span className="flex-1 text-slate-700">{s.name}</span>
                              <span className="shrink-0 text-xs text-slate-400">{formatMoney(s.default_price)}</span>
                            </label>
                          );
                        })}
                        {services.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">{t('لا توجد خدمات بعد')}</div>}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs">
                      <span className="mb-1 block font-medium text-slate-600">{t('السعر (ر.س)')}</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="input text-sm"
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="mb-1 block font-medium text-slate-600">{t('المدة (دقيقة)')}</span>
                      <input
                        type="number"
                        min={1}
                        value={editDuration}
                        onChange={(e) => setEditDuration(e.target.value === '' ? '' : Number(e.target.value))}
                        className="input text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={saveServices}
                      className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> {busy ? t('جارِ الحفظ…') : t('حفظ')}
                    </button>
                    <button type="button" onClick={() => setEditingServices(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                      {t('إلغاء')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-700">{appointment.service_name_snapshot}</div>
              )}
            </div>
            <div className={editingTime ? 'col-span-2 sm:col-span-2' : undefined}>
              <div className="mb-0.5 flex items-center gap-1 text-xs text-slate-400">
                {t('موعد الزيارة')}
                {canEditTime && !editingTime && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimeInput(toDatetimeLocalValue(appointment.scheduled_at));
                      setEditingTime(true);
                    }}
                    title={t('تعديل وقت الموعد')}
                    className="text-slate-400 hover:text-brand-600"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {editingTime ? (
                <div className="space-y-1.5">
                  <input
                    type="datetime-local"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="input text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={saveTime}
                      className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> {busy ? t('جارِ الحفظ…') : t('حفظ')}
                    </button>
                    <button type="button" onClick={() => setEditingTime(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                      {t('إلغاء')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-700">
                  {formatDateAr(appointment.scheduled_at)} - {formatTimeAr(appointment.scheduled_at)}
                </div>
              )}
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
              {(canAssignTeam || canAssignTechnician) && !editingTeam && (
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
                    {canAssignTeam ? (
                      <select value={teamSupervisorId} onChange={(e) => setTeamSupervisorId(e.target.value)} className="input">
                        <option value="">{t('-- بدون تحديد --')}</option>
                        {supervisorOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name} ({roleLabel(s.role)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="input flex items-center bg-slate-50 text-slate-500">
                        {supervisorOptions.find((s) => s.id === teamSupervisorId)?.full_name ?? t('-- بدون تحديد --')}
                      </div>
                    )}
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-600">{t('الفني المسند')}</span>
                    {canAssignTechnician ? (
                      <select value={teamTechnicianId} onChange={(e) => setTeamTechnicianId(e.target.value)} className="input">
                        <option value="">{t('-- بدون تحديد --')}</option>
                        {technicianOptions.map((tech) => (
                          <option key={tech.id} value={tech.id}>
                            {tech.full_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="input flex items-center bg-slate-50 text-slate-500">
                        {technicianOptions.find((tech) => tech.id === teamTechnicianId)?.full_name ?? t('-- بدون تحديد --')}
                      </div>
                    )}
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

          {/* Photos — زيارة العميل تعرض قسماً مبسّطاً (صور الموقع الحالي
              فقط، بلا قبل/بعد فالخدمة نفسها لم تُنفَّذ بعد)، وأي موعد خدمة
              عادي يحتفظ بقسم قبل/بعد الكامل كما هو. */}
          {appointment.kind === 'visit' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                  <Camera className="h-4 w-4" /> {t('صور الموقع الحالي')}
                </div>
              </div>
              {canAddPhotos && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <div className="relative">
                    <button
                      disabled={busy}
                      onClick={() => setPhotoMenu(photoMenu === 'site' ? null : 'site')}
                      className="flex items-center gap-1.5 rounded-xl bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 disabled:opacity-50"
                    >
                      {t('+ صور الموقع')}
                    </button>
                    {photoMenu === 'site' && (
                      <div className="absolute start-0 top-full z-10 mt-1 flex w-40 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            siteCameraInput.current?.click();
                            setPhotoMenu(null);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Camera className="h-3.5 w-3.5" /> {t('كاميرا')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            siteGalleryInput.current?.click();
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
                    ref={siteCameraInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(e) => {
                      uploadPhotos('site', e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={siteGalleryInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      uploadPhotos('site', e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
              )}

              {appointment.photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {appointment.photos.map((p) => (
                    <div key={p.id} className="relative aspect-square">
                      <img src={p.data_url} alt={p.stage} className="h-full w-full rounded-xl object-cover" />
                      {canDeletePhotos && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deletePhoto(p.id)}
                          title={t('حذف الصورة')}
                          className="absolute end-1 top-1 rounded-lg bg-slate-900/60 p-1 text-white transition hover:bg-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                  <Camera className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  {t('لم يتم رفع صور لهذا الموعد بعد')}
                  <br />
                  {tt('انقر على "+ صور الموقع" لتوثيق حالة الموقع الحالية', 'Tap "+ Site Photos" to document the current site condition')}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                  <Camera className="h-4 w-4" /> {t('صور توثيق العمل (قبل وبعد)')}
                </div>
              </div>
              {canAddPhotos && (
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="relative">
                  <button
                    disabled={busy}
                    onClick={() => setPhotoMenu(photoMenu === 'before' ? null : 'before')}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
                  >
                    {t('+ صور قبل العمل')}
                  </button>
                  {photoMenu === 'before' && (
                    <div className="absolute start-0 top-full z-10 mt-1 flex w-40 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
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
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                  >
                    {t('+ صور بعد العمل')}
                  </button>
                  {photoMenu === 'after' && (
                    <div className="absolute start-0 top-full z-10 mt-1 flex w-40 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
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
                      {canDeletePhotos && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deletePhoto(p.id)}
                          title={t('حذف الصورة')}
                          className="absolute end-1 top-1 rounded-lg bg-slate-900/60 p-1 text-white transition hover:bg-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
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
          )}

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
                {invoice && appointment.status === 'completed' && customer?.phone && (
                  <a
                    href={waLink(
                      customer.phone,
                      ratingRequestMessage(
                        appointment.customer_name_snapshot ?? customer?.name ?? t('عميلنا العزيز'),
                        `${window.location.origin}/rate/${appointment.id}`,
                      ),
                    )}
                    target="_blank"
                    rel="noreferrer"
                    title={t('إرسال رابط تقييم الخدمة للعميل عبر واتساب — أرسِله من جهاز مسجَّل به رقم واتساب الشركة')}
                    className="flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    <Star className="h-3.5 w-3.5" /> {t('طلب تقييم')}
                  </a>
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
