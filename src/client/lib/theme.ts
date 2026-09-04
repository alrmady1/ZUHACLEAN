import { useEffect, useState } from 'react';

// تفضيل الوضع الداكن — يُطبَّق كـ class="dark" على <html> (Tailwind
// class-based dark mode)، ويُحفَظ محلياً حتى يبقى ثابتاً بين الجلسات.
// نفس المفتاح الذي يقرأه السكربت المضمَّن في index.html لتطبيق الوضع
// قبل أول رسم للصفحة (يمنع "وميض" الوضع الفاتح عند التحميل).
const THEME_STORAGE_KEY = 'zaha-ops:theme';

function isStoredDark(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return document.documentElement.classList.contains('dark');
  }
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    /* التخزين المحلي معطَّل (وضع خاص مثلاً) — الوضع يبقى فعّالاً لهذه الجلسة فقط. */
  }
}

// [isDark, toggle] — يُستخدَم في زر تفعيل الوضع الداكن (TopBar.tsx).
export function useDarkMode(): [boolean, () => void] {
  const [isDark, setIsDark] = useState(isStoredDark);

  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  return [isDark, () => setIsDark((v) => !v)];
}
