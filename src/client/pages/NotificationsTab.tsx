import { useEffect, useState } from 'react';
import { Send, History as LogIcon } from 'lucide-react';
import { api } from '../lib/api.js';
import type { NotificationLogEntry, UserRole } from '../../shared/types.js';
import { formatDateAr, formatTimeAr } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// كل مسمى وظيفي موجود في النظام — نفس المصفوفة المستخدَمة في تبويب
// الصلاحيات (Settings.tsx)، مكرَّرة هنا محلياً (غير مُصدَّرة من هناك).
const ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'marketer', 'accountant', 'supervisor', 'technician'];

// إشعار مع أسماء/مناصب المُستهدَفين مُحلَّلة (انظر GET /notifications في
// api.ts) — لعرض "أُرسلت إلى: فني — أحمد، فني — محمد" بدل معرّفات مجردة.
interface NotificationWithTargets extends NotificationLogEntry {
  target_profiles: { id: string; full_name: string; role: UserRole }[];
}

// قوالب سريعة اختيارية — تملأ حقلي العنوان والنص، تبقى قابلة للتعديل قبل
// الإرسال كأي نص آخر.
const TEMPLATES: { label: string; title: string; body: string }[] = [
  { label: 'تذكير', title: 'تذكير', body: 'نذكّركم بـ' },
  { label: 'معايدة', title: 'كل عام وأنتم بخير', body: 'نتقدم لكم بأحر التهاني بمناسبة العيد، أعاده الله عليكم باليمن والبركات.' },
];

// الإعدادات ← التنبيهات (خلف صلاحية view_notifications_page): سجل كل
// تنبيه فوري أُرسل في النظام فعلياً (حجز موعد، طلب خارجي جديد، اقتراب
// انتهاء وثيقة...) — نفس notificationLog الذي يغذّي جرس الإشعارات في
// الشريط العلوي (انظر server/lib/push.ts) — بالإضافة إلى نموذج لإرسال
// رسالة حرة (تذكير، معايدة، إعلان...) لموظفين حسب منصبهم مباشرة.
export default function NotificationsTab() {
  const { t, tt, roleLabel } = useI18n();
  const [entries, setEntries] = useState<NotificationWithTargets[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');

  function refresh() {
    api.get<NotificationWithTargets[]>('/notifications').then(setEntries);
  }

  useEffect(refresh, []);

  function toggleRole(role: UserRole) {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function send() {
    setSendError('');
    setSendSuccess('');
    if (!title.trim() || !body.trim()) {
      setSendError(t('العنوان ونص الرسالة مطلوبان'));
      return;
    }
    if (selectedRoles.length === 0) {
      setSendError(t('اختر منصباً واحداً على الأقل'));
      return;
    }
    setSending(true);
    try {
      const res = await api.post<{ sent_to: number }>('/notifications/broadcast', {
        title: title.trim(),
        body: body.trim(),
        roles: selectedRoles,
      });
      setSendSuccess(tt(`تم الإرسال إلى ${res.sent_to} موظف`, `Sent to ${res.sent_to} employees`));
      setTitle('');
      setBody('');
      setSelectedRoles([]);
      refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t('تعذّر إرسال الرسالة'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Send className="h-4 w-4 text-brand-600" /> {t('إرسال رسالة للموظفين')}
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          {t('تصل كتنبيه فوري على جوال كل موظف نشط بالمنصب المختار — تذكير، معايدة، إعلان، أو أي رسالة أخرى')}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() => {
                setTitle(tpl.title);
                setBody(tpl.body);
              }}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              {t(tpl.label)}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('العنوان')}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder={t('مثال: تذكير')} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('نص الرسالة')}</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="input resize-none" />
          </label>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-600">{t('إرسال إلى (حسب المنصب)')}</span>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((role) => {
                const active = selectedRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {roleLabel(role)}
                  </button>
                );
              })}
            </div>
          </div>

          {sendError && <p className="text-xs font-medium text-red-600">{sendError}</p>}
          {sendSuccess && <p className="text-xs font-medium text-emerald-600">{sendSuccess}</p>}

          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> {sending ? t('جارِ الإرسال…') : t('إرسال')}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
          <LogIcon className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700">{t('سجل التنبيهات')}</h3>
        </div>
        {entries === null ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('جارِ التحميل…')}</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('لا توجد تنبيهات بعد')}</div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-start text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="p-3 text-start font-medium">{t('العنوان')}</th>
                  <th className="p-3 text-start font-medium">{t('النص')}</th>
                  <th className="p-3 text-start font-medium">{t('أُرسلت إلى')}</th>
                  <th className="p-3 text-start font-medium">{t('الوقت')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((n) => (
                  <tr key={n.id} className="border-b border-slate-50 last:border-0 align-top">
                    <td className="p-3 font-medium text-slate-700">{n.title}</td>
                    <td className="max-w-xs p-3 text-slate-600">{n.body}</td>
                    <td className="p-3 text-slate-500">
                      {n.target_profiles.length === 0
                        ? tt(`${n.target_profile_ids.length} مستخدم`, `${n.target_profile_ids.length} users`)
                        : n.target_profiles.map((p) => `${p.full_name} (${roleLabel(p.role)})`).join('، ')}
                    </td>
                    <td className="whitespace-nowrap p-3 text-slate-400" dir="ltr">
                      {formatDateAr(n.created_at)} {formatTimeAr(n.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
