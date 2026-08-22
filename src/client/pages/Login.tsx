import { Navigate } from 'react-router-dom';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { ROLE_LABELS_AR } from '../../shared/types.js';

export default function Login() {
  const { user, allProfiles, loading, loginAs } = useAuth();

  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-brand-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">زهى الأعمال</h1>
            <p className="text-xs text-slate-400">نظام إدارة خدمات النظافة والتشغيل والصيانة</p>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            هذا تسجيل دخول تجريبي بدون كلمة مرور لتسريع التطوير — اختر حساباً لتجربة صلاحياته. لاحقاً
            يُستبدل بمصادقة حقيقية (JWT / Supabase Auth).
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400">جارِ التحميل…</div>
        ) : (
          <div className="space-y-2">
            {allProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => loginAs(p.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-start transition hover:border-brand-400 hover:bg-brand-50"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{p.full_name}</span>
                  <span className="block text-xs text-slate-400">{p.email}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {ROLE_LABELS_AR[p.role]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
