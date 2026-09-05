import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import type { LiveChatMessage } from '../../shared/types.js';

const THREAD_ID_STORAGE_KEY = 'zaha-live-chat-thread-id';
const POLL_MS = 4000;

// أيقونة دردشة مباشرة عائمة في صفحة "اطلب الخدمة" العامة (OrderPage.tsx) —
// بديل/تكملة لواتساب، لكن بشرية بالكامل عمداً (بلا ذكاء اصطناعي): كل
// رسالة تُنبِّه الإدارة فوراً (انظر POST /public/chat/messages في api.ts)،
// والرد يكتبه موظف يدوياً من الإعدادات ← الطلبات الخارجية. معرّف المحادثة
// يُحفظ في localStorage فتستمر نفس المحادثة عند عودة نفس الزائر لاحقاً من
// نفس الجهاز/المتصفح.
export default function LiveChatWidget() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THREAD_ID_STORAGE_KEY);
      if (saved) setThreadId(saved);
    } catch {
      // localStorage قد يفشل (وضع تصفح خاص، إلخ) — تبدأ محادثة جديدة، لا مشكلة.
    }
  }, []);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    function poll() {
      api
        .get<{ messages: LiveChatMessage[] }>(`/public/chat/${threadId}/messages`)
        .then((res) => {
          if (!cancelled) setMessages(res.messages);
        })
        .catch(() => {});
    }
    poll();
    if (!open) return;
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [threadId, open]);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await api.post<{ thread_id: string; messages: LiveChatMessage[] }>('/public/chat/messages', {
        thread_id: threadId ?? undefined,
        text: trimmed,
        name: !threadId && name.trim() ? name.trim() : undefined,
      });
      setMessages(res.messages);
      setText('');
      if (!threadId) {
        setThreadId(res.thread_id);
        try {
          localStorage.setItem(THREAD_ID_STORAGE_KEY, res.thread_id);
        } catch {
          // غير حرِج — المحادثة تعمل لهذه الجلسة حتى لو تعذَّر الحفظ.
        }
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 end-5 z-40">
      {open && (
        <div className="mb-3 flex h-[26rem] w-[20rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 sm:w-[22rem]">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
            <span className="text-sm font-bold text-white">دردشة مباشرة</span>
            <button type="button" onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 && (
              <p className="mt-6 text-center text-xs text-slate-400">هلا وغلا! اكتب رسالتك وسيردّ عليك فريقنا بأقرب وقت.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === 'in' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.direction === 'in' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 shadow-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 p-2.5">
            {!threadId && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك (اختياري)"
                className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 placeholder:text-slate-400 focus:outline-none"
              />
            )}
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="اكتب رسالتك…"
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() || sending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl transition hover:bg-brand-700"
        title="دردشة مباشرة"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
