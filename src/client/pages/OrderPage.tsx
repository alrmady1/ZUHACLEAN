import { useEffect, useState, type FormEvent } from 'react';
import {
  Home,
  Building2,
  Bug,
  Wrench,
  Fan,
  Zap,
  Droplets,
  Hammer,
  Sparkles,
  Phone,
  MessageCircle,
  ShieldCheck,
  BadgeCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { waLink } from '../lib/whatsapp.js';
import { COMPANY_NAME, COMPANY_PHONE, DEFAULT_LANDING_SETTINGS } from '../../shared/types.js';
import type { LandingPageSettings, LandingService } from '../../shared/types.js';

// صفحة عامة خارجية — بلا تسجيل دخول عمداً — لاستقبال طلبات العملاء من
// خارج النظام (يُشارَك رابطها في وسائل التواصل وواتساب الأعمال). الألوان
// والنصوص وبطاقات الخدمات المعروضة أدناه كلها محتوى مُدار من الإعدادات ←
// الطلبات الخارجية (خلف صلاحية edit_landing_page، انظر LandingPageTab في
// src/client/pages/Settings.tsx) — لا قيمة هنا ثابتة فعلياً في الكود
// نفسه، الثوابت المستوردة أعلاه هي فقط قيمة افتراضية أثناء أول تحميل قبل
// وصول رد GET /landing-settings. الاستمارة السريعة تُرسِل إلى
// POST /public/leads (بلا حاجة لجلسة دخول)، وتظهر الطلبات الواردة لفريق
// العمل من صفحة "طلبات جديدة" خلف صلاحية view_leads_page (Leads.tsx).
const WHATSAPP_INTRO = `مرحباً ${COMPANY_NAME}، أرغب في الاستفسار عن خدماتكم`;

function serviceIcon(title: string) {
  if (title.includes('منازل') || title.includes('شقق') || title.includes('فلل')) return Home;
  if (title.includes('مكاتب')) return Building2;
  if (title.includes('حشرات')) return Bug;
  if (title.includes('سباكة')) return Wrench;
  if (title.includes('تكييف') || title.includes('مكيف')) return Fan;
  if (title.includes('كهرباء')) return Zap;
  if (title.includes('سجاد') || title.includes('كنب') || title.includes('موكيت')) return Droplets;
  if (title.includes('تشطيب')) return Hammer;
  return Sparkles;
}

function scrollToForm() {
  document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function OrderPage() {
  const [settings, setSettings] = useState<LandingPageSettings>(DEFAULT_LANDING_SETTINGS);
  const [services, setServices] = useState<LandingService[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get<LandingPageSettings>('/landing-settings').then(setSettings).catch(() => {});
    api
      .get<LandingService[]>('/landing-services')
      .then((list) => setServices(list.filter((s) => s.is_active)))
      .catch(() => {});
  }, []);

  const { primary: NAVY, secondary: CREAM, background: OFFWHITE, accent: GREEN } = settings.colors;

  function pickService(n: string) {
    setServiceName(n);
    scrollToForm();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api.post('/public/leads', {
        name: name.trim(),
        phone: phone.trim(),
        area: area.trim() || undefined,
        service_name: serviceName || undefined,
        message: message.trim() || undefined,
      });
      setDone(true);
    } catch {
      setSubmitError('تعذّر إرسال طلبك، حاول مرة أخرى أو تواصل معنا مباشرة عبر واتساب.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" style={{ backgroundColor: OFFWHITE }} className="min-h-screen text-slate-800">
      {/* ============================== الرأس ============================== */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-3 shadow-md sm:px-10"
        style={{ backgroundColor: NAVY }}
      >
        <div className="flex items-center gap-2.5">
          <img src="/icon-192.png" alt={COMPANY_NAME} className="h-10 w-10 rounded-xl" />
          <div>
            <div className="text-lg font-extrabold text-white">{COMPANY_NAME}</div>
            <div className="text-[11px] text-white/60">{settings.tagline}</div>
          </div>
        </div>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-white/80 sm:flex">
          <a href="#services" className="transition hover:text-white">خدماتنا</a>
          <a href="#why" className="transition hover:text-white">لماذا زهى</a>
          <a href="#contact" className="transition hover:text-white">تواصل معنا</a>
        </nav>
        <a
          href={`tel:${COMPANY_PHONE}`}
          dir="ltr"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold sm:text-sm"
          style={{ backgroundColor: GREEN, color: NAVY }}
        >
          <Phone className="h-4 w-4" /> {COMPANY_PHONE}
        </a>
      </header>

      {/* ============================== الهيرو ============================== */}
      <section
        className="relative overflow-hidden px-5 py-16 text-center sm:px-10 sm:py-24"
        style={{ backgroundColor: NAVY }}
      >
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-20"
          style={{ backgroundColor: GREEN }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full opacity-10"
          style={{ backgroundColor: CREAM }}
        />
        <div className="relative mx-auto max-w-2xl">
          <span
            className="mb-4 inline-block rounded-full px-4 py-1.5 text-xs font-bold"
            style={{ backgroundColor: CREAM, color: NAVY }}
          >
            {COMPANY_NAME} للنظافة والخدمات
          </span>
          <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-5xl">{settings.hero_title}</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">{settings.hero_subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={scrollToForm}
              className="rounded-xl px-6 py-3 text-sm font-bold transition hover:opacity-90"
              style={{ backgroundColor: GREEN, color: NAVY }}
            >
              اطلب الخدمة الآن
            </button>
            <a
              href={waLink(COMPANY_PHONE, WHATSAPP_INTRO)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              <MessageCircle className="h-4 w-4" /> تواصل عبر واتساب
            </a>
          </div>
        </div>
      </section>

      {/* ========================= استمارة الطلب السريع ========================= */}
      <section id="order-form" className="relative -mt-10 px-5 sm:px-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-14 w-14" style={{ color: GREEN }} />
              <h2 className="text-xl font-bold" style={{ color: NAVY }}>
                تم استلام طلبك بنجاح!
              </h2>
              <p className="max-w-sm text-sm text-slate-500">
                شكراً لتواصلك مع {COMPANY_NAME}، سيتواصل معك فريقنا في أقرب وقت لتأكيد التفاصيل
                وتحديد الموعد المناسب.
              </p>
              <a
                href={waLink(COMPANY_PHONE, WHATSAPP_INTRO)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
                style={{ backgroundColor: NAVY }}
              >
                <MessageCircle className="h-4 w-4" /> أو تواصل معنا مباشرة عبر واتساب
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold" style={{ color: NAVY }}>
                  استمارة طلب سريعة
                </h2>
                <p className="mt-1 text-xs text-slate-400">عبّئ بياناتك وسنتواصل معك خلال دقائق</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">الاسم الكامل</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="اسمك الكريم"
                    className="input"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">رقم الجوال</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    dir="ltr"
                    placeholder="05xxxxxxxx"
                    className="input"
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">الخدمة المطلوبة</span>
                  <select value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="input">
                    <option value="">اختر الخدمة (اختياري)</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المنطقة / الحي</span>
                  <input
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="مثال: حي الملقا، الرياض"
                    className="input"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">ملاحظات إضافية (اختياري)</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="اكتب أي تفاصيل تساعدنا على خدمتك بشكل أفضل"
                  className="input resize-none"
                />
              </label>

              {submitError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !name.trim() || !phone.trim()}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                style={{ backgroundColor: NAVY }}
              >
                {submitting ? 'جارِ الإرسال…' : 'إرسال الطلب'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ============================== الخدمات ============================== */}
      <section id="services" className="mx-auto max-w-6xl px-5 py-16 sm:px-10">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl" style={{ color: NAVY }}>
            خدماتنا
          </h2>
          <p className="mt-2 text-sm text-slate-500">مجموعة متكاملة من خدمات التنظيف والصيانة تحت سقف واحد</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {services.map((s) => {
            const Icon = serviceIcon(s.title);
            return (
              <div
                key={s.id}
                className="flex flex-col overflow-hidden rounded-2xl border transition hover:shadow-lg"
                style={{ borderColor: CREAM, backgroundColor: '#fff' }}
              >
                {s.image_url ? (
                  <img src={s.image_url} alt={s.title} className="h-[244px] w-full object-cover" />
                ) : (
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl m-5 mb-0"
                    style={{ backgroundColor: CREAM, color: NAVY }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-bold" style={{ color: NAVY }}>
                    {s.title}
                  </h3>
                  {s.description && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{s.description}</p>}
                  <button
                    type="button"
                    onClick={() => pickService(s.title)}
                    className="mt-4 self-start text-xs font-bold underline underline-offset-2"
                    style={{ color: NAVY }}
                  >
                    اطلب هذه الخدمة ←
                  </button>
                </div>
              </div>
            );
          })}
          {services.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-slate-400">جارِ تحميل الخدمات…</div>
          )}
        </div>
      </section>

      {/* ============================ لماذا زهى ============================ */}
      <section id="why" className="px-5 py-16 sm:px-10" style={{ backgroundColor: CREAM }}>
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl" style={{ color: NAVY }}>
              لماذا تختار زهى؟
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: 'مواد ومعايير آمنة', desc: 'أدوات ومواد تنظيف معتمدة وآمنة على صحة أسرتك وبيئة عملك' },
              { icon: BadgeCheck, title: 'فريق مدرّب ومحترف', desc: 'طاقم عمل مدرّب على أعلى المعايير ومسؤول عن جودة كل زيارة' },
              { icon: Clock, title: 'التزام بالمواعيد', desc: 'نصل في الوقت المحدد وننجز العمل بسرعة ودقة دون إخلال بالجودة' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-white p-6 text-center shadow-sm">
                <div
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: NAVY }}
                >
                  <Icon className="h-6 w-6" style={{ color: GREEN }} />
                </div>
                <h3 className="font-bold" style={{ color: NAVY }}>
                  {title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ شريط واتساب ============================ */}
      <section className="px-5 py-12 text-center sm:px-10" style={{ backgroundColor: NAVY }}>
        <h2 className="text-xl font-extrabold text-white sm:text-2xl">جاهز نبدأ بخدمتك؟</h2>
        <p className="mt-2 text-sm text-white/60">تواصل معنا الآن واحصل على أفضل عرض يناسب احتياجك</p>
        <a
          href={waLink(COMPANY_PHONE, WHATSAPP_INTRO)}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold"
          style={{ backgroundColor: GREEN, color: NAVY }}
        >
          <MessageCircle className="h-4 w-4" /> تواصل عبر واتساب
        </a>
      </section>

      {/* ============================== تواصل ============================== */}
      <section id="contact" className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-10">
        <h2 className="text-xl font-extrabold" style={{ color: NAVY }}>
          استجابة سريعة بلا تعقيد
        </h2>
        <p className="mt-2 text-sm text-slate-500">اتصل بنا مباشرة أو راسلنا عبر واتساب، فريقنا جاهز للرد عليك</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`tel:${COMPANY_PHONE}`}
            dir="ltr"
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            <Phone className="h-4 w-4" /> {COMPANY_PHONE}
          </a>
          <a
            href={waLink(COMPANY_PHONE, WHATSAPP_INTRO)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold"
            style={{ backgroundColor: GREEN, color: NAVY }}
          >
            <MessageCircle className="h-4 w-4" /> واتساب
          </a>
        </div>
      </section>

      {/* ============================== الفوتر ============================== */}
      <footer className="px-5 py-8 text-center sm:px-10" style={{ backgroundColor: NAVY }}>
        <div className="mb-3 flex items-center justify-center gap-2">
          <img src="/icon-192.png" alt={COMPANY_NAME} className="h-8 w-8 rounded-lg" />
          <span className="font-extrabold text-white">{COMPANY_NAME}</span>
        </div>
        <p className="text-xs text-white/50">© {new Date().getFullYear()} {COMPANY_NAME} للنظافة والخدمات. جميع الحقوق محفوظة.</p>
      </footer>
    </div>
  );
}
