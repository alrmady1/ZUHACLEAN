// حجز موعد من الزر العام في الشريط العلوي (TopBar) يتم خارج الصفحة المفتوحة،
// فلا تعلم الصفحة (المواعيد/الرئيسية) بوجود موعد جديد دون هذا الإشعار.
export const APPOINTMENT_CREATED_EVENT = 'zaha:appointment-created';

export function notifyAppointmentCreated() {
  window.dispatchEvent(new Event(APPOINTMENT_CREATED_EVENT));
}
