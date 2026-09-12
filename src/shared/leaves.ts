// إجازات سنوية — بخلاف weekly_days_off (تنبيه فقط، انظر weekdays.ts)، وجود
// إجازة سارية يمنع فعلياً إسناد موعد جديد لصاحبها خلال فترتها. انظر مواضع
// الاستخدام: NewAppointmentModal، AppointmentDetailModal، وsrc/server/lib/
// scheduling.ts (اختيار مشرف متاح تلقائياً لموعد أنشأه الرد الآلي على
// واتساب) — في src/shared عمداً لأنها بلا أي اعتماد على المتصفح.
import type { LeaveRecord, Profile } from './types.js';
import { LEAVE_TYPE_LABELS_AR, ANNUAL_LEAVE_BALANCE_DAYS, ANNUAL_LEAVE_BALANCE_DAYS_AFTER_5_YEARS } from './types.js';

// نص نوع الإجازة المعروض — "أخرى" تعرض النص الذي كتبه المدير يدوياً
// (other_type_label) بدل التسمية الثابتة العامة.
export function leaveTypeDisplay(leave: LeaveRecord): string {
  if (leave.leave_type === 'other' && leave.other_type_label) return leave.other_type_label;
  return LEAVE_TYPE_LABELS_AR[leave.leave_type];
}

// استحقاق الإجازة السنوية بالأيام حسب مدة الخدمة — ٢١ يوماً أساساً، تصبح
// ٣٠ يوماً بعد إتمام ٥ سنوات خدمة متصلة (المادة ١٠٩ من نظام العمل
// السعودي). بلا تاريخ تعيين مسجَّل تُعتمَد ٢١ يوماً (الأكثر تحفظاً، نفس
// تساهل بقية الأماكن التي لا تملك بيانات كافية للحكم). دالة مشتركة
// (عميل وخادم) — كل مكان يحسب "الرصيد المتبقي" يجب أن يمر منها بدل
// الاعتماد مباشرة على ANNUAL_LEAVE_BALANCE_DAYS الثابت.
export function annualLeaveEntitlementDays(hireDate: string | undefined, asOfDate: Date = new Date()): number {
  if (!hireDate) return ANNUAL_LEAVE_BALANCE_DAYS;
  const fiveYearsAfterHire = new Date(hireDate);
  fiveYearsAfterHire.setFullYear(fiveYearsAfterHire.getFullYear() + 5);
  return asOfDate >= fiveYearsAfterHire ? ANNUAL_LEAVE_BALANCE_DAYS_AFTER_5_YEARS : ANNUAL_LEAVE_BALANCE_DAYS;
}

export interface SickLeavePayBreakdown {
  fullPayDays: number;
  threeQuarterPayDays: number;
  unpaidDays: number;
}

// توزيع أجر الإجازة المرضية على شرائح المادة ١١٧: أول ٣٠ يوماً (تراكمياً
// خلال السنة) بأجر كامل، الـ٦٠ التالية بثلاثة أرباع الأجر، الـ٣٠ الأخيرة
// (حتى سقف ١٢٠ يوماً) بلا أجر. daysUsedBeforeThisLeave = ما استُهلِك من
// الرصيد هذا العام قبل هذه الإجازة تحديداً، thisLeaveDays = عدد أيامها.
// عرض استرشادي فقط في نموذج الإضافة — لا يُطبَّق تلقائياً على الرواتب.
export function sickLeavePayBreakdown(daysUsedBeforeThisLeave: number, thisLeaveDays: number): SickLeavePayBreakdown {
  const start = Math.max(0, daysUsedBeforeThisLeave);
  const end = start + Math.max(0, thisLeaveDays);
  const overlap = (rangeStart: number, rangeEnd: number) => Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
  return {
    fullPayDays: overlap(0, 30),
    threeQuarterPayDays: overlap(30, 90),
    unpaidDays: overlap(90, Infinity),
  };
}

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
// إجازة سارية في تاريخ هذا الموعد؟ عند وجود نتيجة — يجب منع الحفظ فعلياً
// (وليس مجرد تنبيه). العطلة الرسمية (official_holiday) مُستثناة عمداً هنا
// — العمل خلالها مسموح، ويُعوَّض عنه تلقائياً بأوفر تايم بدل منعه (انظر
// findHolidayWorkConflicts أدناه وreconcileHolidayOvertimeForAppointment
// في src/server/lib/overtime.ts)، بخلاف كل أنواع الإجازات الأخرى التي
// تبقى مانعة فعلياً كما كانت.
export function findLeaveConflicts(
  dateStr: string,
  people: { profile: Profile | undefined; roleLabel: string }[],
  leaves: LeaveRecord[],
): LeaveConflict[] {
  if (!dateStr) return [];
  const conflicts: LeaveConflict[] = [];
  for (const { profile, roleLabel } of people) {
    if (!profile) continue;
    const leave = leaves.find((l) => l.profile_id === profile.id && l.leave_type !== 'official_holiday' && isWithinLeave(dateStr, l));
    if (leave) conflicts.push({ name: profile.full_name, roleLabel, leave });
  }
  return conflicts;
}

// نفس فكرة findLeaveConflicts أعلاه، لكن للعطلة الرسمية تحديداً وبلا أي
// منع — استرشادي بحت، يُستخدَم فقط لعرض تنبيه غير مانع في نموذج الحجز بأن
// تعويض أوفر تايم سيُسجَّل تلقائياً لهذا الشخص (التسجيل الفعلي يحدث على
// الخادم عبر reconcileHolidayOvertimeForAppointment بصرف النظر عن هذا
// التنبيه — هذا للعرض فقط).
export function findHolidayWorkConflicts(
  dateStr: string,
  people: { profile: Profile | undefined; roleLabel: string }[],
  leaves: LeaveRecord[],
): LeaveConflict[] {
  if (!dateStr) return [];
  const conflicts: LeaveConflict[] = [];
  for (const { profile, roleLabel } of people) {
    if (!profile) continue;
    const leave = leaves.find((l) => l.profile_id === profile.id && l.leave_type === 'official_holiday' && isWithinLeave(dateStr, l));
    if (leave) conflicts.push({ name: profile.full_name, roleLabel, leave });
  }
  return conflicts;
}
