export type Lang = 'ar' | 'en' | 'bn';

// حالة اللغة الحالية على مستوى الوحدة (module-level) بدل تمرير lang كمعامل
// لكل نداء — هذه الدوال تُستدعى من عشرات الأماكن في كل صفحة، فتمرير معامل
// إضافي لكل واحدة كان سيعني تعديل كل موقع استدعاء. بدلاً من ذلك، مزوّد اللغة
// (I18nProvider) يستدعي setDateLang() عند كل تبديل، وأي نداء لاحق لهذه
// الدوال يقرأ القيمة المحدَّثة تلقائياً.
let currentLang: Lang = 'ar';
export function setDateLang(lang: Lang): void {
  currentLang = lang;
}

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

export function weekdayAr(iso: string): string {
  const day = new Date(iso).getDay();
  if (currentLang === 'en') return WEEKDAYS_EN[day];
  if (currentLang === 'bn') return WEEKDAYS_BN[day];
  return WEEKDAYS_AR[day];
}

// "-u-nu-latn" يُبقي الأرقام لاتينية (١٢٣ بدل ١٢٣ عربية-هندية أو ১২৩
// بنغالية) — الفنيون البنغاليون في السعودية معتادون على الأرقام اللاتينية
// في الاستخدام اليومي أكثر من الأرقام البنغالية الأصلية، فتبقى موحّدة عبر
// كل اللغات، وتتغيّر فقط أسماء الأشهر/الأيام فعلياً.
function localeFor(lang: Lang): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'bn') return 'bn-BD-u-nu-latn';
  return 'ar-SA';
}

export function formatDateAr(iso: string): string {
  return new Date(iso).toLocaleDateString(localeFor(currentLang), { year: 'numeric', month: 'long', day: 'numeric' });
}

// Unicode "isolate" marks (U+2066 Left-to-Right Isolate … U+2069 Pop
// Directional Isolate) force a number-first English string (e.g. "2 hours",
// "03:17 AM") to render in its own left-to-right run — without them, the
// bidi algorithm can visually reorder a run that *starts* with a weak/number
// character while sitting inside our still-right-to-left page shell (see
// I18nProvider — we deliberately don't flip `dir` for English), flipping
// "2 hours" into "hours 2" on screen even though the DOM text is correct.
// Word-first strings (formatMoney's "SAR 250", formatDateAr's "August 23,
// 2026") already establish an LTR run on their own and don't need this.
// Applies the same to Bengali — it also reads left-to-right.
function ltrIsolate(s: string): string {
  return `⁦${s}⁩`;
}

export function formatTimeAr(iso: string): string {
  const formatted = new Date(iso).toLocaleTimeString(localeFor(currentLang), { hour: '2-digit', minute: '2-digit' });
  return currentLang === 'ar' ? formatted : ltrIsolate(formatted);
}

export function formatMoney(n: number): string {
  if (currentLang === 'ar') return `${n.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س`;
  return `SAR ${n.toLocaleString(localeFor(currentLang), { maximumFractionDigits: 2 })}`;
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

function englishCounted(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

// البنغالية لا تفرّق صيغة المفرد/الجمع نحوياً (نفس الكلمة لأي عدد) — "N
// ঘণ্টা"/"N মিনিট" صحيحة لغوياً لأي قيمة N، بخلاف العربية والإنجليزية.
function bengaliCounted(n: number, word: string): string {
  return `${n} ${word}`;
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (currentLang === 'en') {
    if (hours > 0) parts.push(englishCounted(hours, 'hour', 'hours'));
    if (minutes > 0) parts.push(englishCounted(minutes, 'minute', 'minutes'));
    return ltrIsolate(parts.length > 0 ? parts.join(' ') : '0 minutes');
  }
  if (currentLang === 'bn') {
    if (hours > 0) parts.push(bengaliCounted(hours, 'ঘণ্টা'));
    if (minutes > 0) parts.push(bengaliCounted(minutes, 'মিনিট'));
    return ltrIsolate(parts.length > 0 ? parts.join(' ') : '0 মিনিট');
  }
  if (hours > 0) parts.push(arabicCounted(hours, 'ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة'));
  if (minutes > 0) parts.push(arabicCounted(minutes, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'));
  return parts.length > 0 ? parts.join(' و ') : '0 دقيقة';
}
