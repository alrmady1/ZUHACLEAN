import { IdCard, UserCog, CalendarOff } from 'lucide-react';
import { USER_LANGUAGE_LABELS_AR } from '../../shared/types.js';
import { WEEKDAYS } from '../../shared/weekdays.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

// نفس منطق EmployeeAccounts.tsx بالضبط — العمر يُحتسَب دائماً من
// date_of_birth بدل تخزينه كرقم ثابت يصبح خاطئاً مع الوقت.
function ageFromBirthDate(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// تبويب "المعلومات الشخصية" — عرض ذاتي (لا يعدّل شيئاً) لبيانات المستخدم
// الحالي نفسه فقط، يظهر للفني الميداني (داخل TechnicianPortal.tsx)
// والمشرف الميداني (داخل Dashboard.tsx) تحديداً — انظر مكان استخدامه في
// كلا الملفين. يعرض نفس حقول "البيانات الشخصية" المُدارة من المحاسبة ←
// الموظفين (EmployeeAccounts.tsx) لكن للقراءة فقط، بالإضافة إلى الإجازة
// الأسبوعية والمشرف المسؤول. السلفيات والعهدة والعمولة انتقلت إلى تبويب
// "المحاسبة" المستقل — انظر AccountingTab.tsx.
export default function PersonalInfoTab() {
  const { user, allProfiles } = useAuth();
  const { t, tt } = useI18n();

  if (!user) return null;

  const supervisor = allProfiles.find((p) => p.id === user.supervisor_id);

  return (
    <div className="space-y-5">
      {/* البيانات الشخصية — نفس حقول المحاسبة ← الموظفين ← البيانات
          الشخصية، للقراءة فقط. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <IdCard className="h-4 w-4 text-brand-600" /> {t('البيانات الشخصية')}
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-slate-400">{t('الاسم الكامل (حسب الهوية)')}</div>
            <div className="font-medium text-slate-700">{user.legal_full_name || user.full_name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('المسمى الوظيفي')}</div>
            <div className="font-medium text-slate-700">{user.job_title || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('الجنسية')}</div>
            <div className="font-medium text-slate-700">{user.nationality || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('العمر')}</div>
            <div className="font-medium text-slate-700">
              {user.date_of_birth ? tt(`${ageFromBirthDate(user.date_of_birth)} سنة`, `${ageFromBirthDate(user.date_of_birth)} yrs`) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('رقم الهوية / الإقامة')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.national_id || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('تاريخ انتهاء الهوية')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.national_id_expiry || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('تاريخ التعيين')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.hire_date || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('رقم الجوال')}</div>
            <div dir="ltr" className="font-medium text-slate-700">{user.phone || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">{t('لغة الواجهة الافتراضية')}</div>
            <div className="font-medium text-slate-700">{user.default_lang ? t(USER_LANGUAGE_LABELS_AR[user.default_lang]) : t('عربي (افتراضي)')}</div>
          </div>
        </div>
        {user.id_photo_url && (
          <a
            href={user.id_photo_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-brand-600"
          >
            <img src={user.id_photo_url} alt={t('صورة الهوية')} className="h-10 w-10 rounded object-cover" />
            {t('عرض صورة الهوية')}
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* المشرف المسؤول */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <UserCog className="h-4 w-4 text-brand-600" /> {t('المشرف المسؤول')}
          </h2>
          <p className="text-sm font-medium text-slate-700">{supervisor ? supervisor.full_name : t('بدون مشرف محدَّد')}</p>
        </div>

        {/* الإجازة الأسبوعية */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <CalendarOff className="h-4 w-4 text-brand-600" /> {t('الإجازة الأسبوعية')}
          </h2>
          {user.weekly_days_off && user.weekly_days_off.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {user.weekly_days_off.map((key) => {
                const w = WEEKDAYS.find((x) => x.key === key);
                return (
                  <span key={key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {w ? t(w.label) : key}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t('لا توجد إجازة أسبوعية محدَّدة')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
