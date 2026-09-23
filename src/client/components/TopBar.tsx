import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Plus, Languages, Moon, Sun, Bell } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import type { Customer, Service, NotificationLogEntry } from '../../shared/types.js';
import { useI18n } from '../lib/i18n.js';
import type { Lang } from '../lib/date.js';
import { useDarkMode } from '../lib/theme.js';
import NewAppointmentModal from './NewAppointmentModal.js';
import { phoneMatchesQuery } from '../../shared/phone.js';

// آخر وقت فتح فيه المستخدم قائمة الإشعارات على هذا الجهاز — لتحديد أيها
// "جديدة" (نقطة حمراء على الجرس) دون أي حالة "مقروء/غير مقروء" مخزَّنة
// على الخادم لكل تنبيه (غير ضروري لقائمة من 5 عناصر فقط).
const NOTIFICATIONS_SEEN_KEY = 'zaha-ops:notifications-seen-at';

// The global top bar: lives in Layout's <header>, which sits outside the
// scrollable <main> area — so it naturally stays pinned at the top on every
// page without needing extra sticky/fixed CSS.
export default function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, allProfiles, can } = useAuth();
  const { t, roleLabel, lang, toggleLang, setLang } = useI18n();
  const isTechnician = user?.role === 'technician';
  const navigate = useNavigate();
  const [isDark, toggleDark] = useDarkMode();

  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // جرس الإشعارات — يفتح مباشرة الإعدادات ← الإشعارات (سجل كامل + إرسال
  // رسائل للموظفين هناك)، بلا قائمة منسدلة هنا. النقطة الحمراء وحدها تُبنى
  // من آخر 5 تنبيهات استهدفت هذا المستخدم (انظر GET /notifications/recent
  // وnotificationLog في server/lib/push.ts).
  const [notifications, setNotifications] = useState<NotificationLogEntry[]>([]);
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(NOTIFICATIONS_SEEN_KEY) ?? '');
  const canViewNotificationsPage = can('view_notifications_page');

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
  }, []);

  useEffect(() => {
    function loadNotifications() {
      api.get<NotificationLogEntry[]>('/notifications/recent').then(setNotifications).catch(() => {});
    }
    loadNotifications();
    // بلا Web Socket في هذا التطبيق — استطلاع دوري بسيط يكفي لنقطة "جديد"
    // على الجرس (ليس مصدر التنبيه الفوري نفسه، ذاك عبر Web Push).
    const interval = setInterval(loadNotifications, 60_000);
    return () => clearInterval(interval);
  }, []);

  const hasUnseenNotification = notifications.some((n) => n.created_at > seenAt);

  function openNotifications() {
    const now = new Date().toISOString();
    localStorage.setItem(NOTIFICATIONS_SEEN_KEY, now);
    setSeenAt(now);
    navigate(canViewNotificationsPage ? '/settings?tab=notifications' : '/settings');
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? customers
        .filter(
          (c) =>
            [c.name, c.address].filter(Boolean).join(' ').toLowerCase().includes(q) || phoneMatchesQuery(c.phone, q),
        )
        .slice(0, 6)
    : [];

  function goToCustomer(term: string) {
    navigate(`/customers?q=${encodeURIComponent(term)}`);
    setQuery('');
    setShowResults(false);
  }

  const supervisors = allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin_supervisor');
  const technicians = allProfiles.filter((p) => p.role === 'technician');
  const canBook = can('create_appointments');

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <button
        onClick={onOpenMenu}
        aria-label={t('فتح القائمة')}
        className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div ref={boxRef} className="relative min-w-0 flex-1">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) goToCustomer(query.trim());
            }}
            placeholder={t('بحث عن عميل، أو موعد، أو رقم جوال...')}
            className="input ps-9"
          />
        </div>
        {showResults && results.length > 0 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => goToCustomer(c.name)}
                className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-700">{c.name}</span>
                <span className="text-xs text-slate-400" dir="ltr">
                  {c.phone}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isTechnician ? (
        // خيارات لغة إضافية (بنغالية وأردية) مخصَّصة للفنيين الميدانيين
        // تحديداً — قائمة منسدلة بدل زر التبديل الثنائي المعتاد، بقية
        // المستخدمين لا يرونها.
        <div className="relative flex shrink-0 items-center">
          <Languages className="pointer-events-none absolute start-2.5 h-4 w-4 text-slate-400" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            title="Language"
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 ps-8 pe-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
            <option value="ur">اردو</option>
          </select>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggleLang}
          title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Languages className="h-4 w-4" />
          {lang === 'ar' ? 'EN' : 'عربي'}
        </button>
      )}

      {canViewNotificationsPage && (
        <button
          type="button"
          onClick={openNotifications}
          title={t('الإشعارات')}
          className="relative flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
        >
          <Bell className="h-4 w-4" />
          {hasUnseenNotification && <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
        </button>
      )}

      <button
        type="button"
        onClick={toggleDark}
        title={isDark ? t('تعطيل الوضع الداكن') : t('تفعيل الوضع الداكن')}
        className="flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {canBook && (
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('حجز موعد جديد')}
        </button>
      )}

      {user && (
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {user.full_name.trim().charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-slate-700">{user.full_name}</div>
            <div className="truncate text-[11px] text-slate-400">({roleLabel(user.role)})</div>
          </div>
        </div>
      )}

      {canBook && showQuickAdd && (
        <NewAppointmentModal
          customers={customers}
          services={services}
          supervisors={supervisors}
          technicians={technicians}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => api.get<Customer[]>('/customers').then(setCustomers)}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
        />
      )}
    </header>
  );
}
