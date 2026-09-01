import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { MapPin, ExternalLink, Clock } from 'lucide-react';
import type { UserRole } from '../../shared/types.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

// كل هذه المدة نُعيد جلب قائمة الملفات الشخصية لتحديث آخر موقع مُبلَّغ
// عنه — نفس نمط الاستطلاع الدوري المعتمد في بقية التطبيق (مثال:
// NEW_APPOINTMENT_POLL_MS في Dashboard.tsx).
const REFRESH_MS = 20000;

const TRACKED_ROLES: UserRole[] = ['supervisor', 'admin_supervisor', 'technician'];

function relativeTimeAr(iso: string, tt: (ar: string, en: string) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return tt('الآن', 'just now');
  if (mins < 60) return tt(`منذ ${mins} دقيقة`, `${mins} min ago`);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tt(`منذ ${hours} ساعة`, `${hours} hr ago`);
  const days = Math.floor(hours / 24);
  return tt(`منذ ${days} يوم`, `${days} day(s) ago`);
}

export default function Tracking() {
  const { user, can, allProfiles, refreshProfiles } = useAuth();
  const { t, tt, roleLabel } = useI18n();

  useEffect(() => {
    const interval = setInterval(() => refreshProfiles(), REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // مخفية عن أي دور لا يملك هذه الصلاحية — حتى لو دخل الرابط مباشرة.
  if (user && !can('view_employee_tracking')) return <Navigate to="/" replace />;

  const tracked = allProfiles.filter((p) => TRACKED_ROLES.includes(p.role) && p.is_active);
  const sharing = tracked.filter((p) => p.location_sharing_enabled);
  const notSharing = tracked.filter((p) => !p.location_sharing_enabled);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('تتبع الموظفين')}</h1>
        <p className="text-sm text-slate-400">
          {t('يظهر هنا فقط من فعَّل "مشاركة موقعي" بنفسه من حسابه — لا يمكن تفعيلها نيابة عنه.')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sharing.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {p.last_location ? (
              <iframe
                title={p.full_name}
                src={`https://www.google.com/maps?q=${p.last_location.lat},${p.last_location.lng}&z=15&output=embed`}
                className="h-40 w-full border-0"
                loading="lazy"
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center bg-slate-50 text-slate-300">
                <MapPin className="h-8 w-8" />
              </div>
            )}
            <div className="p-4">
              <div className="font-semibold text-slate-800">{p.full_name}</div>
              <div className="text-xs text-slate-400">{roleLabel(p.role)}</div>
              {p.last_location ? (
                <>
                  <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5" /> {relativeTimeAr(p.last_location.updated_at, tt)}
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${p.last_location.lat},${p.last_location.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> {t('فتح في خرائط جوجل')}
                  </a>
                </>
              ) : (
                <div className="mt-2 text-xs text-amber-600">{t('بانتظار أول تحديث للموقع…')}</div>
              )}
            </div>
          </div>
        ))}
        {sharing.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            {t('لا يوجد أحد مفعِّل لمشاركة موقعه حالياً')}
          </div>
        )}
      </div>

      {notSharing.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-600">{t('لم يُفعِّلوا مشاركة الموقع بعد')}</div>
          <div className="flex flex-wrap gap-2">
            {notSharing.map((p) => (
              <span key={p.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                {p.full_name} — {roleLabel(p.role)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
