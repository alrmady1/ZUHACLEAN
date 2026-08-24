// Shared month-grid helpers used by both the main Appointments calendar and
// the Technician Portal's monthly/daily view — kept in one place so both
// stay in sync instead of duplicating the same date math.

// Sunday-first, matching how the week actually flows in the DOM under
// dir="rtl" (first child renders on the right) so Saturday ends up on the
// visual left — same order the reference calendar uses.
export const WEEKDAYS_HEADER = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function getMonthGridDays(monthRef: Date): Date[] {
  const firstOfMonth = new Date(monthRef.getFullYear(), monthRef.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}
