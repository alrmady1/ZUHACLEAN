// منطق التحقق من التوفر (تعارض حجز، إجازة سنوية، إجازة أسبوعية) — نفس
// الحسابات المستخدمة في NewAppointmentModal.tsx عند الحجز اليدوي
// (supervisorDayBookings/conflict)، مُستخرَجة هنا كدوال مستقلة قابلة
// للاستخدام من الخادم، لاختيار مشرف متاح تلقائياً عند حجز عبر الرد الآلي
// على واتساب (src/server/lib/whatsappBot.ts). لا يوجد موظف بشري يقرر
// "أستمر مع ذلك؟" في هذا المسار الآلي، فكل تعارض هنا مانع فعلي (بما فيها
// الإجازة الأسبوعية الثابتة، التي تبقى مجرد تنبيه في الحجز اليدوي).
import type { Appointment, LeaveRecord, Profile } from '../../shared/types.js';
import { findDayOffConflicts } from '../../shared/weekdays.js';
import { findLeaveConflicts } from '../../shared/leaves.js';

export interface SlotRequest {
  scheduledAtIso: string;
  durationMinutes: number;
}

// تعارض حجز فعلي (تداخل وقت) لمشرف واحد — يفحص كل مواعيده غير الملغاة في
// نفس اليوم، ويرجع أول موعد يتقاطع زمنياً مع الفترة المطلوبة، أو null.
export function findBookingOverlap(supervisorId: string, slot: SlotRequest, appointments: Appointment[]): Appointment | null {
  const start = new Date(slot.scheduledAtIso);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + slot.durationMinutes * 60000);
  const dateKey = slot.scheduledAtIso.slice(0, 10);

  const dayBookings = appointments.filter(
    (a) => a.supervisor_id === supervisorId && a.status !== 'cancelled' && a.scheduled_at.slice(0, 10) === dateKey,
  );
  for (const a of dayBookings) {
    const bStart = new Date(a.scheduled_at);
    const bEnd = new Date(bStart.getTime() + a.expected_duration_minutes * 60000);
    if (start < bEnd && end > bStart) return a;
  }
  return null;
}

// أول مشرف متاح فعلياً في هذه الفترة من بين supervisors، أو undefined لو
// لم يتوفر أحد (الاستدعاء عندها يترك الموعد بلا مشرف — يُسنَده الموظف
// يدوياً أثناء المراجعة، انظر §5 من خطة تكامل واتساب).
export function pickAvailableSupervisor(
  supervisors: Profile[],
  slot: SlotRequest,
  appointments: Appointment[],
  leaves: LeaveRecord[],
): Profile | undefined {
  const dateKey = slot.scheduledAtIso.slice(0, 10);
  return supervisors.find((supervisor) => {
    if (findBookingOverlap(supervisor.id, slot, appointments)) return false;
    if (findLeaveConflicts(dateKey, [{ profile: supervisor, roleLabel: '' }], leaves).length > 0) return false;
    if (findDayOffConflicts(dateKey, [{ profile: supervisor, roleLabel: '' }]).length > 0) return false;
    return true;
  });
}
