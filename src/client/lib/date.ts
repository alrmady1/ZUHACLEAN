const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function weekdayAr(iso: string): string {
  return WEEKDAYS_AR[new Date(iso).getDay()];
}

export function formatDateAr(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatTimeAr(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

export function formatMoney(n: number): string {
  return `${n.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س`;
}

export function monthLabelAr(d: Date): string {
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
}

export function dayLabelAr(d: Date): string {
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Sunday-based start-of-week (matches the Arabic week: الأحد أولاً). */
export function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
