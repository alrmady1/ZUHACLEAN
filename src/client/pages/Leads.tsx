import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Trash2, MessageCircle, CalendarPlus, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { waLink } from '../lib/whatsapp.js';
import type { Lead, LeadStatus, Customer, Service, Appointment } from '../../shared/types.js';
import { LEAD_STATUS_LABELS_AR } from '../../shared/types.js';
import { formatDateAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import NewAppointmentModal from '../components/NewAppointmentModal.js';

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: 'bg-amber-50 text-amber-600',
  replied: 'bg-blue-50 text-blue-600',
  quote_sent: 'bg-violet-50 text-violet-600',
  appointment_booked: 'bg-emerald-50 text-emerald-600',
};

// طلبات العملاء الواردة من صفحة "اطلب الخدمة" العامة (OrderPage.tsx، بلا
// تسجيل دخول) — عميل محتمل لم يتحول بعد إلى عميل مسجَّل أو موعد فعلي.
// بعد التواصل معه، يمكن تحويله مباشرة إلى موعد فعلي بنفس نافذة حجز
// الموعد المعتادة (NewAppointmentModal، مُعبَّأة مسبقاً ببياناته) — عندها
// تتحدَّث حالته تلقائياً إلى "تم عمل موعد" وتُربَط برقم الموعد الناتج.
// من يستلم الطلب يمكنه أيضاً تحديث الحالة يدوياً (تم الرد / تم إرسال عرض
// سعر) قبل الوصول لمرحلة الحجز.
export default function Leads() {
  const { user, can, allProfiles } = useAuth();
  const { t, tt } = useI18n();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [bookingFor, setBookingFor] = useState<Lead | null>(null);

  function refresh() {
    api.get<Lead[]>('/leads').then(setLeads);
  }

  useEffect(() => {
    refresh();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
  }, []);

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicians = allProfiles.filter((p) => p.role === 'technician');

  async function setStatus(lead: Lead, status: LeadStatus) {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    await api.patch(`/leads/${lead.id}`, { status });
  }

  async function remove(lead: Lead) {
    if (!window.confirm(tt(`حذف طلب "${lead.name}" نهائياً؟`, `Delete request "${lead.name}" permanently?`))) return;
    await api.del(`/leads/${lead.id}`);
    refresh();
  }

  // مخفية عن أي دور لا يملك هذه الصلاحية — حتى لو دخل الرابط مباشرة.
  if (user && !can('view_leads_page')) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('طلبات جديدة')}</h1>
        <p className="text-sm text-slate-400">{t('طلبات واردة من صفحة "اطلب الخدمة" العامة قبل تحويلها إلى موعد')}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('الاسم')}</th>
              <th className="p-3 text-start font-medium">{t('الجوال')}</th>
              <th className="p-3 text-start font-medium">{t('الخدمة')}</th>
              <th className="p-3 text-start font-medium">{t('المنطقة')}</th>
              <th className="p-3 text-start font-medium">{t('التاريخ')}</th>
              <th className="p-3 text-start font-medium">{t('الحالة')}</th>
              <th className="p-3 text-start font-medium">{t('إجراء')}</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-slate-50 align-top last:border-0 hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-700">
                  {l.name}
                  {l.message && <div className="mt-0.5 max-w-[220px] truncate text-xs font-normal text-slate-400" title={l.message}>{l.message}</div>}
                </td>
                <td className="p-3 text-slate-600" dir="ltr">{l.phone}</td>
                <td className="p-3 text-slate-600">{l.service_name || '—'}</td>
                <td className="p-3 text-slate-600">{l.area || '—'}</td>
                <td className="p-3 text-slate-600" dir="ltr">{formatDateAr(l.created_at)}</td>
                <td className="p-3">
                  <select
                    value={l.status}
                    onChange={(e) => setStatus(l, e.target.value as LeadStatus)}
                    className={`rounded-lg border-0 px-2 py-1 text-xs font-semibold ${STATUS_BADGE[l.status]}`}
                  >
                    {(Object.keys(LEAD_STATUS_LABELS_AR) as LeadStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {t(LEAD_STATUS_LABELS_AR[s])}
                      </option>
                    ))}
                  </select>
                  {l.status === 'appointment_booked' && l.linked_appointment_id && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> {t('مرتبط بموعد')}
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setBookingFor(l)}
                      title={t('تحديد موعد لهذا الطلب')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </button>
                    <a
                      href={waLink(l.phone)}
                      target="_blank"
                      rel="noreferrer"
                      title={t('تواصل عبر واتساب')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => remove(l)}
                      title={t('حذف الطلب')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  {t('لا توجد طلبات واردة بعد')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {bookingFor && (
        <NewAppointmentModal
          customers={customers}
          services={services}
          supervisors={supervisors}
          technicians={technicians}
          initialLead={{
            name: bookingFor.name,
            phone: bookingFor.phone,
            area: bookingFor.area,
            serviceName: bookingFor.service_name,
            message: bookingFor.message,
          }}
          onClose={() => setBookingFor(null)}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onCreated={async (appt?: Appointment) => {
            const lead = bookingFor;
            setBookingFor(null);
            if (lead) {
              await api.patch(`/leads/${lead.id}`, {
                status: 'appointment_booked',
                linked_appointment_id: appt?.id,
              });
            }
            refresh();
          }}
        />
      )}
    </div>
  );
}
