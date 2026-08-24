// أيام الأسبوع القابلة للاختيار — نفس المفاتيح المستخدمة في
// Contract.visit_days_of_week وProfile.weekly_days_off، ومطابقة لترتيب
// JS Date.getDay() (0=الأحد..6=السبت) — انظر WEEKDAY_INDEX في
// src/server/routes/api.ts للنسخة المطابقة على الخادم.
import type { Profile } from '../../shared/types.js';

export const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الاثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' },
  { key: 'saturday', label: 'السبت' },
];

const WEEKDAY_KEY_BY_JS_DAY = WEEKDAYS.map((d) => d.key);

export function weekdayKeyForDate(dateStr: string): string | undefined {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  return WEEKDAY_KEY_BY_JS_DAY[d.getDay()];
}

export function weekdayLabel(key: string | undefined): string {
  return WEEKDAYS.find((w) => w.key === key)?.label ?? key ?? '';
}

// من بين الأشخاص المُختارين لموعد ما (المشرف والفني عادة)، من كان تاريخ
// هذا الموعد يوافق إجازته الأسبوعية الثابتة (Profile.weekly_days_off)؟
// لا تُستخدم هذه للمنع — فقط لتنبيه تأكيدي قبل الحفظ (انظر
// findDayOffConflicts في مواضع الاستخدام: NewAppointmentModal،
// AppointmentDetailModal).
export function findDayOffConflicts(
  dateStr: string,
  people: { profile: Profile | undefined; roleLabel: string }[],
): { name: string; roleLabel: string }[] {
  const dayKey = weekdayKeyForDate(dateStr);
  if (!dayKey) return [];
  const conflicts: { name: string; roleLabel: string }[] = [];
  for (const { profile, roleLabel } of people) {
    if (profile?.weekly_days_off?.includes(dayKey)) {
      conflicts.push({ name: profile.full_name, roleLabel });
    }
  }
  return conflicts;
}
