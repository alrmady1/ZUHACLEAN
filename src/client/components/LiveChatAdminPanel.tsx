import { useEffect, useRef, useState } from 'react';
import { Send, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';
import type { LiveChatThread } from '../../shared/types.js';
import { formatDateAr, formatTimeAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

const SENDER_NAME_STORAGE_KEY = 'zaha-live-chat-sender-name';

// لوحة مراسلة "الدردشة المباشرة" الإدارية — قائمة المحادثات + محادثة
// مفتوحة + رد يدوي، مستخدَمة في مكانين: كبطاقة كاملة العرض داخل الإعدادات
// ← الطلبات الخارجية (compact=false)، وداخل نافذة الأيقونة العائمة
// الظاهرة في كل صفحات النظام (compact=true، انظر AdminLiveChatWidget.tsx)
// — بشرية بالكامل عمداً، بلا أي رد آلي (انظر تعليق LiveChatThread في
// shared/types.ts).
export default function LiveChatAdminPanel({
  compact = false,
  onUnreadChange,
}: {
  compact?: boolean;
  onUnreadChange?: (count: number) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [threads, setThreads] = useState<LiveChatThread[] | null>(null);
  const [openThread, setOpenThread] = useState<LiveChatThread | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // الاسم الذي يظهر للعميل مع كل رد — يبدأ باسم الحساب المسجَّل دخوله،
  // لكنه قابل للتعديل يدوياً (مثلاً لكتابة "فريق الدعم" بدل اسم شخصي، أو
  // لو أكثر من موظف يشارك نفس الحساب) ويُحفظ في المتصفح ليبقى كما هو في
  // المرة القادمة.
  const [senderName, setSenderName] = useState(() => {
    try {
      return localStorage.getItem(SENDER_NAME_STORAGE_KEY) || user?.full_name || '';
    } catch {
      return user?.full_name || '';
    }
  });

  function refresh() {
    api.get<LiveChatThread[]>('/chat/threads').then((list) => {
      setThreads(list);
      onUnreadChange?.(list.filter((th) => th.unread).length);
    });
  }
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [openThread?.messages.length]);

  async function openChat(th: LiveChatThread) {
    setOpenThread(th);
    if (th.unread) {
      const updated = await api.patch<LiveChatThread>(`/chat/threads/${th.id}`, { unread: false });
      setThreads((prev) => {
        const next = prev && prev.map((x) => (x.id === updated.id ? updated : x));
        onUnreadChange?.((next ?? []).filter((th2) => th2.unread).length);
        return next;
      });
    }
  }

  function updateSenderName(value: string) {
    setSenderName(value);
    try {
      localStorage.setItem(SENDER_NAME_STORAGE_KEY, value);
    } catch {
      // غير حرِج — الاسم يبقى صحيحاً لهذه الجلسة حتى لو تعذَّر حفظه.
    }
  }

  async function sendReply() {
    if (!openThread || !reply.trim() || sending) return;
    setSending(true);
    try {
      const updated = await api.post<LiveChatThread>(`/chat/threads/${openThread.id}/reply`, {
        text: reply.trim(),
        sender_name: senderName.trim() || user?.full_name,
      });
      setOpenThread(updated);
      setReply('');
      setThreads((prev) => prev && prev.map((x) => (x.id === updated.id ? updated : x)));
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus(th: LiveChatThread) {
    const updated = await api.patch<LiveChatThread>(`/chat/threads/${th.id}`, { status: th.status === 'open' ? 'closed' : 'open' });
    setThreads((prev) => prev && prev.map((x) => (x.id === updated.id ? updated : x)));
    if (openThread?.id === th.id) setOpenThread(updated);
  }

  const list = (
    <div className={compact ? 'flex-1 space-y-2 overflow-y-auto p-2.5' : 'space-y-2 overflow-y-auto lg:max-h-[28rem]'}>
      {threads === null && <div className="p-4 text-center text-sm text-slate-400">{t('جارِ التحميل…')}</div>}
      {threads?.length === 0 && <div className="p-4 text-center text-sm text-slate-400">{t('لا توجد محادثات بعد')}</div>}
      {threads?.map((th) => {
        const last = th.messages[th.messages.length - 1];
        return (
          <button
            key={th.id}
            onClick={() => openChat(th)}
            className={`w-full rounded-xl border p-3 text-start transition ${
              openThread?.id === th.id ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-slate-800">{th.customer_name || t('زائر')}</span>
              {th.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
            </div>
            {last && <p className="mt-0.5 truncate text-xs text-slate-400">{last.text}</p>}
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] text-slate-300">
                {formatDateAr(th.updated_at)} {formatTimeAr(th.updated_at)}
              </span>
              {th.status === 'closed' && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">{t('مغلقة')}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  const conversation = !openThread ? (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">{t('اختر محادثة لعرضها')}</div>
  ) : (
    <>
      <div className="flex items-center justify-between border-b border-slate-100 p-3">
        <div className="flex items-center gap-2">
          {compact && (
            <button onClick={() => setOpenThread(null)} className="text-slate-400 hover:text-slate-600" title={t('رجوع')}>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <div>
            <div className="text-sm font-bold text-slate-800">{openThread.customer_name || t('زائر')}</div>
            {openThread.customer_phone && <div dir="ltr" className="text-end text-[11px] text-slate-400">{openThread.customer_phone}</div>}
          </div>
        </div>
        <button onClick={() => toggleStatus(openThread)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
          {openThread.status === 'open' ? t('إغلاق المحادثة') : t('إعادة فتح المحادثة')}
        </button>
      </div>
      <div ref={listRef} className={`flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 ${compact ? '' : 'max-h-80'}`}>
        {openThread.messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                m.direction === 'out' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 shadow-sm'
              }`}
            >
              {m.text}
              {m.sender_name && <div className="mt-0.5 text-[10px] opacity-70">{m.sender_name}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 p-2.5">
        <input
          value={senderName}
          onChange={(e) => updateSenderName(e.target.value)}
          placeholder={t('اسمك الظاهر للعميل')}
          className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 placeholder:text-slate-400 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void sendReply();
              }
            }}
            placeholder={t('اكتب ردك…')}
            className="input flex-1"
          />
          <button
            onClick={() => void sendReply()}
            disabled={!reply.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  if (compact) {
    // نافذة عائمة ضيقة — يُعرض إما القائمة أو المحادثة المفتوحة، وليس
    // كلاهما جنباً إلى جنب (لا تتسع المساحة)، مثل تطبيقات المراسلة على الجوال.
    return <div className="flex h-full flex-col">{openThread ? conversation : list}</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {list}
      <div className="flex flex-col rounded-xl border border-slate-200">{conversation}</div>
    </div>
  );
}
