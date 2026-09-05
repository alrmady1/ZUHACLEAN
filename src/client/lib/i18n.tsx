// خيار تبديل لغة الموقع (عربي/إنجليزي/بنغالي/أردو). قرار مقصود لهذه
// المرحلة: يبقى اتجاه الصفحة من اليمين لليسار (RTL) في كل الحالات — فقط
// النصوص تتغيّر (البنغالية تُقرأ من اليسار لليمين مثل الإنجليزية، فتخضع
// لنفس القرار؛ الأردية تُقرأ من اليمين لليسار مثل العربية أصلاً، فلا فرق
// عليها أصلاً). عكس اتجاه الصفحة بالكامل خطوة أكبر ومنفصلة يمكن إضافتها
// لاحقاً إن رغب المستخدم.
// البنغالية والأردية خياران مخصَّصان للفنيين الميدانيين تحديداً (انظر
// TopBar.tsx) — قاموس البنغالية (AR_TO_BN) مقصور عمداً على الشاشات التي
// يستخدمها الفني فعلياً، أما الأردية (AR_TO_UR) فتغطي كامل الموقع تقريباً
// (مصدرها ملف ترجمة كامل رفعه المستخدم). أي نص غير موجود في أيّ قاموس
// يظهر بالعربي تلقائياً (نفس شبكة الأمان المستخدمة أصلاً مع AR_TO_EN لأي
// نص لم يُترجم بعد).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AR_TO_EN, AR_TO_BN, AR_TO_UR } from './translations.js';
import { setDateLang, type Lang } from './date.js';
import { ROLE_LABELS_AR, ROLE_LABELS_EN, ROLE_LABELS_BN, ROLE_LABELS_UR, type UserRole } from '../../shared/types.js';

const STORAGE_KEY = 'zaha-ops:lang';

interface I18nState {
  lang: Lang;
  toggleLang: () => void;
  // للاختيار الصريح بين أكثر من لغتين (مُحدِّد اللغة الخاص بالفنيين في
  // TopBar.tsx) — toggleLang أعلاه يبقى للتبديل الثنائي عربي/إنجليزي
  // المعتاد لبقية المستخدمين.
  setLang: (lang: Lang) => void;
  // ترجمة نص عربي ثابت عبر قاموس الترجمة — يرجع نفس النص العربي إن لم توجد
  // ترجمة له (شبكة أمان لأي نص لم يُترجم بعد) أو كانت اللغة الحالية عربي.
  t: (arabic: string) => string;
  // لحالات النصوص الديناميكية (تحتوي على قيمة متغيرة مثل اسم عميل) — تمرَّر
  // الصيغتان جاهزتين، ويختار حسب اللغة الحالية (بالبنغالية/الأردية: يبحث
  // النص العربي نفسه في قاموسها، بنفس منطق t() أعلاه).
  tt: (arabic: string, english: string) => string;
  // اسم الوظيفة (مدير عام، مشرف ميداني...) بلغة الواجهة الحالية.
  roleLabel: (role: UserRole) => string;
}

const I18nContext = createContext<I18nState | undefined>(undefined);

function isLang(v: string | null): v is Lang {
  return v === 'ar' || v === 'en' || v === 'bn' || v === 'ur';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLang(saved) ? saved : 'ar';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    setDateLang(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const toggleLang = () => setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  const setLang = (next: Lang) => setLangState(next);
  const t = (arabic: string) => {
    if (lang === 'en') return AR_TO_EN[arabic] ?? arabic;
    if (lang === 'bn') return AR_TO_BN[arabic] ?? arabic;
    if (lang === 'ur') return AR_TO_UR[arabic] ?? arabic;
    return arabic;
  };
  const tt = (arabic: string, english: string) => {
    if (lang === 'en') return english;
    if (lang === 'bn') return AR_TO_BN[arabic] ?? arabic;
    if (lang === 'ur') return AR_TO_UR[arabic] ?? arabic;
    return arabic;
  };
  const roleLabel = (role: UserRole) => {
    if (lang === 'en') return ROLE_LABELS_EN[role];
    if (lang === 'bn') return ROLE_LABELS_BN[role];
    if (lang === 'ur') return ROLE_LABELS_UR[role];
    return ROLE_LABELS_AR[role];
  };

  return <I18nContext.Provider value={{ lang, toggleLang, setLang, t, tt, roleLabel }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
