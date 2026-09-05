import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import type { LiveChatThread } from '../../shared/types.js';
import LiveChatAdminPanel from './LiveChatAdminPanel.js';

const UNREAD_POLL_MS = 15000;

// أيقونة عائمة ظاهرة في كل صفحات النظام (مركَّبة في Layout.tsx) — وصول
// سريع لمحادثات "الدردشة المباشرة" (LiveChatWidget.tsx على صفحة "اطلب
// الخدمة" العامة) دون الحاجة للذهاب للإعدادات ← الطلبات الخارجية في كل
// مرة. نفس صلاحية عرض/إدارة تلك المحادثات هناك (edit_landing_page).
export default function AdminLiveChatWidget() {
  const { can } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const allowed = can('edit_landing_page');

  // يستطلع عدد المحادثات غير المقروءة دورياً حتى والنافذة مغلقة، لتظهر
  // الشارة الحمراء فوراً دون فتح النافذة — اللوحة نفسها (LiveChatAdminPanel)
  // تستطلع أسرع (كل 6 ثوانٍ) وتحدِّث هذا العدد أيضاً أثناء فتحها.
  useEffect(() => {
    if (!allowed) return;
    function poll() {
      api
        .get<LiveChatThread[]>('/chat/threads')
        .then((list) => setUnreadCount(list.filter((th) => th.unread).length))
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [allowed]);

  if (!allowed) return null;

  return (
    <div className="fixed bottom-5 end-5 z-40">
      {open && (
        <div className="mb-3 flex h-[30rem] w-[21rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 sm:w-[24rem]">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
            <span className="text-sm font-bold text-white">{t('الدردشة المباشرة')}</span>
            <button type="button" onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <LiveChatAdminPanel compact onUnreadChange={setUnreadCount} />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl transition hover:bg-brand-700"
        title={t('الدردشة المباشرة')}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
