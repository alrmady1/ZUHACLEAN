import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Sparkles, User, Lock, AlertCircle, Languages } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import type { Lang } from '../lib/date.js';

export default function Login() {
  const { user, loading, login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password, remember);
    } catch (err) {
      let message = t('تعذر تسجيل الدخول');
      try {
        const parsed = JSON.parse((err as Error).message);
        if (parsed?.error) message = parsed.error;
      } catch {
        // ignore parse errors, use default message
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
      {/* لا نعرف دور المستخدم قبل تسجيل الدخول، فيُتاح اختيار اللغة الثلاثي
          هنا للجميع بلا استثناء — بعد الدخول، من ليس فنياً يعود لمُبدِّل
          عربي/إنجليزي الثنائي المعتاد في الشريط العلوي (انظر TopBar.tsx). */}
      <div className="fixed end-4 top-4">
        <div className="relative flex items-center">
          <Languages className="pointer-events-none absolute start-2.5 h-4 w-4 text-slate-400" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            title="Language"
            className="appearance-none rounded-xl border border-slate-700 bg-slate-800 py-2 ps-8 pe-2 text-xs font-semibold text-slate-200"
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
            <option value="ur">اردو</option>
          </select>
        </div>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">{t('مرحباً بك في زهى')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('لأعمال الصيانة والتنظيف')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('اسم المستخدم')}</span>
            <div className="relative">
              <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="input ps-9"
                placeholder={t('اسم المستخدم')}
              />
            </div>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('كلمة المرور')}</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input ps-9"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {t('تذكرني')}
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('جارِ تسجيل الدخول…') : t('تسجيل الدخول')}
          </button>
        </form>
      </div>
    </div>
  );
}
