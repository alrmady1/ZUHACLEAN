// تعويض "أوفر تايم" العمل في العطل الرسمية — المادة ١٠٧ من نظام العمل
// السعودي تُلزم بتعويض العمل في العطل الرسمية بأجر إضافي (١٥٠٪ من الأجر
// اليومي على الأقل) بدل منع العمل فيها؛ لذلك استُثنيت العطلة الرسمية
// (official_holiday) من findLeaveConflicts (لا تمنع حجز موعد لصاحبها،
// بخلاف كل أنواع الإجازات الأخرى) — وبدل ذلك، reconcileHolidayOvertimeFor
// Appointment أدناه تُستدعى عند كل إنشاء/تعديل/حذف موعد (المسار اليدوي في
// api.ts وحجز الرد الآلي على واتساب في whatsappBot.ts كلاهما) لتُبقي
// سجلات EmployeeOvertimeRecord مطابقة دائماً لواقع الموعد الفعلي: تُنشئ
// سجلاً جديداً لكل موظف مُسنَد (مشرف أو فني) يعمل خلال عطلة رسمية مسجَّلة
// له، وتُعلِّم "أُلغي" أي سجل لم يعد ينطبق (الموظف أُزيل من الموعد، الموعد
// أُلغي/حُذف، أو لم يعد التاريخ ضمن عطلة). سجلات "مدفوع" لا تُمَس أبداً.
import { store } from '../store/db.js';
import type { LeaveRecord } from '../../shared/types.js';
import { HOLIDAY_OVERTIME_MULTIPLIER } from '../../shared/types.js';
import { leaveTypeDisplay } from '../../shared/leaves.js';

export function reconcileHolidayOvertimeForAppointment(appointmentId: string): void {
  const appointment = store.appointments.get(appointmentId);
  const existingRecords = store.employeeOvertimeRecords.list().filter((r) => r.appointment_id === appointmentId);

  // من يجب أن يكون له سجل تعويض ساري الآن — موظف مُسنَد فعلياً + الموعد
  // غير ملغى/محذوف + لديه عطلة رسمية مسجَّلة تغطي تاريخ الموعد.
  const shouldExistFor = new Map<string, LeaveRecord>();
  if (appointment && appointment.status !== 'cancelled') {
    const dateKey = appointment.scheduled_at.slice(0, 10);
    const assignedIds = new Set<string>();
    if (appointment.supervisor_id) assignedIds.add(appointment.supervisor_id);
    for (const a of appointment.assignments) assignedIds.add(a.technician_id);

    const holidayLeaves = store.leaves.list().filter((l) => l.leave_type === 'official_holiday');
    for (const employeeId of assignedIds) {
      const holidayLeave = holidayLeaves.find(
        (l) => l.profile_id === employeeId && dateKey >= l.start_date && dateKey <= l.end_date,
      );
      if (holidayLeave) shouldExistFor.set(employeeId, holidayLeave);
    }
  }

  // إلغاء أي سجل "بانتظار الدفع" لم يعد ينطبق — لا يُمس سجل "مدفوع" أبداً
  // (لقطة تاريخية ثابتة حتى لو تغيّر الموعد لاحقاً).
  for (const record of existingRecords) {
    if (record.status !== 'pending') continue;
    if (!shouldExistFor.has(record.employee_id)) {
      store.employeeOvertimeRecords.update(record.id, { status: 'dismissed' });
    }
  }

  // إنشاء سجل لكل موظف ينطبق عليه الشرط وليس له سجل ساري (غير مُلغى) بعد.
  for (const [employeeId, holidayLeave] of shouldExistFor) {
    const hasActiveRecord = existingRecords.some((r) => r.employee_id === employeeId && r.status !== 'dismissed');
    if (hasActiveRecord) continue;
    const profile = store.profiles.get(employeeId);
    if (!profile || !appointment) continue;
    const dailyWage = profile.monthly_salary ? Math.round((profile.monthly_salary / 30) * 100) / 100 : 0;
    const now = new Date().toISOString();
    store.employeeOvertimeRecords.insert({
      id: store.id(),
      employee_id: employeeId,
      employee_name: profile.full_name,
      appointment_id: appointment.id,
      holiday_label: holidayLeave.notes || leaveTypeDisplay(holidayLeave),
      work_date: appointment.scheduled_at.slice(0, 10),
      daily_wage_snapshot: dailyWage,
      multiplier: HOLIDAY_OVERTIME_MULTIPLIER,
      amount: Math.round(dailyWage * HOLIDAY_OVERTIME_MULTIPLIER * 100) / 100,
      status: 'pending',
      created_at: now,
      updated_at: now,
    });
  }
}
