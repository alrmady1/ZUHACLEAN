// خيار تبديل لغة الموقع (عربي/إنجليزي). قرار مقصود لهذه المرحلة: يبقى
// اتجاه الصفحة من اليمين لليسار (RTL) في الحالتين — فقط النصوص تتغيّر.
// عكس اتجاه الصفحة بالكامل (LTR حقيقي للإنجليزية، اتجاه الأيقونات
// والقوائم...) خطوة أكبر ومنفصلة يمكن إضافتها لاحقاً إن رغب المستخدم،
// بعد تجربة النسخة الإنجليزية المترجمة أولاً.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AR_TO_EN } from './translations.js';
import { setDateLang, type Lang } from './date.js';
import { ROLE_LABELS_AR, ROLE_LABELS_EN, type UserRole } from '../../shared/types.js';

const STORAGE_KEY = 'zaha-ops:lang';

interface I18nState {
  lang: Lang;
  toggleLang: () => void;
  // ترجمة نص عربي ثابت عبر قاموس الترجمة — يرجع نفس النص العربي إن لم توجد
  // ترجمة له (شبكة أمان لأي نص لم يُترجم بعد) أو كانت اللغة الحالية عربي.
  t: (arabic: string) => string;
  // لحالات النصوص الديناميكية (تحتوي على قيمة متغيرة مثل اسم عميل) — تمرَّر
  // الصيغتان جاهزتين، ويختار حسب اللغة الحالية.
  tt: (arabic: string, english: string) => string;
  // اسم الوظيفة (مدير عام، مشرف ميداني...) بلغة الواجهة الحالية.
  roleLabel: (role: UserRole) => string;
}

const I18nContext = createContext<I18nState | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' ? 'en' : 'ar';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    setDateLang(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const toggleLang = () => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'));
  const t = (arabic: string) => (lang === 'en' ? (AR_TO_EN[arabic] ?? arabic) : arabic);
  const tt = (arabic: string, english: string) => (lang === 'en' ? english : arabic);
  const roleLabel = (role: UserRole) => (lang === 'en' ? ROLE_LABELS_EN[role] : ROLE_LABELS_AR[role]);

  return <I18nContext.Provider value={{ lang, toggleLang, t, tt, roleLabel }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
