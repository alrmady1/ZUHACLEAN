// إجازات سنوية — بخلاف weekly_days_off (تنبيه فقط، انظر weekdays.ts)، وجود
// إجازة سارية يمنع فعلياً إسناد موعد جديد لصاحبها خلال فترتها. انظر مواضع
// الاستخدام: NewAppointmentModal، AppointmentDetailModal.
import type { LeaveRecord, Profile } from '../../shared/types.js';

// appointment.scheduled_at كامل (ISO datetime)، وحقل التاريخ في نماذج
// الحجز "YYYY-MM-DD" — كلاهما يبدأ بـ"YYYY-MM-DD" فتكفي مقارنة نصية بسيطة
// مع start_date/end_date (بنفس الصيغة) دون الحاجة لتحويل توقيت.
function toDateOnly(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function isWithinLeave(dateStr: string, leave: LeaveRecord): boolean {
  const d = toDateOnly(dateStr);
  return d >= leave.start_date && d <= leave.end_date;
}

export interface LeaveConflict {
  name: string;
  roleLabel: string;
  leave: LeaveRecord;
}

// من بين الأشخاص المُختارين لموعد ما (المشرف والفني عادة)، من كانت لديه
// إجازة سنوية سارية في تاريخ هذا الموعد؟ عند وجود نتيجة — يجب منع الحفظ
// فعلياً (وليس مجرد تنبيه).
export function findLeaveConflicts(
  dateStr: string,
  people: { profile: Profile | undefined; roleLabel: string }[],
  leaves: LeaveRecord[],
): LeaveConflict[] {
  if (!dateStr) return [];
  const conflicts: LeaveConflict[] = [];
  for (const { profile, roleLabel } of people) {
    if (!profile) continue;
    const leave = leaves.find((l) => l.profile_id === profile.id && isWithinLeave(dateStr, l));
    if (leave) conflicts.push({ name: profile.full_name, roleLabel, leave });
  }
  return conflicts;
}
