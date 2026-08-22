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

// Arabic has dual/plural agreement for counted nouns (ساعة/ساعتان/٣ ساعات),
// so a plain "N hour(s)" template doesn't read naturally — build the phrase
// by count instead.
function arabicCounted(n: number, singular: string, dual: string, plural3to10: string, pluralMany: string): string {
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${n} ${plural3to10}`;
  return `${n} ${pluralMany}`;
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(arabicCounted(hours, 'ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة'));
  if (minutes > 0) parts.push(arabicCounted(minutes, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'));
  return parts.length > 0 ? parts.join(' و ') : '0 دقيقة';
}
