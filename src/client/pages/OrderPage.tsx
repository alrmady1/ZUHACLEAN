import { useEffect, useState } from 'react';
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
  Landmark,
  Apple,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  UserPlus,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { waLink } from '../lib/whatsapp.js';
import LiveChatWidget from '../components/LiveChatWidget.js';
import { COMPANY_NAME, COMPANY_LEGAL_NAME, COMPANY_PHONE, DEFAULT_LANDING_SETTINGS } from '../../shared/types.js';
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

// خطوات بطاقة "احجز خدمتك" في الهيرو — الخدمة أولاً (أهم قرار للعميل
// وأول ما يراه)، ثم بياناته، ثم تأكيد سريع قبل الإرسال. نسخة مُصغَّرة
// عمداً من معالج الحجز الكامل (BookingWizardPage.tsx، 5 خطوات بموقع على
// خريطة وتاريخ/وقت مفضَّل) — هذي هنا مجرد "طلب أولي" خفيف داخل الصفحة
// الرئيسية نفسها، بلا أي تنقّل لصفحة منفصلة.
const HERO_STEP_TITLES = ['الخدمة', 'بياناتك', 'التأكيد'];

export default function OrderPage() {
  const [settings, setSettings] = useState<LandingPageSettings>(DEFAULT_LANDING_SETTINGS);
  const [services, setServices] = useState<LandingService[]>([]);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  // أُغلق الإعلان المنبثق مرة واحدة بالفعل خلال هذه الجلسة (تبويب/متصفح) —
  // sessionStorage عمداً لا localStorage، حتى يظهر مجدداً في زيارة لاحقة
  // منفصلة بدل الاختفاء نهائياً بعد أول إغلاق.
  const [popupDismissed, setPopupDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('zaha-ops:popup-ad-dismissed') === '1';
    } catch {
      return false;
    }
  });
  function dismissPopup() {
    setPopupDismissed(true);
    try {
      sessionStorage.setItem('zaha-ops:popup-ad-dismissed', '1');
    } catch {
      /* متصفح يمنع sessionStorage (وضع خاص مثلاً) — يبقى الإغلاق يعمل لهذا
         العرض فقط، بلا تذكّر */
    }
  }

  useEffect(() => {
    api.get<LandingPageSettings>('/landing-settings').then(setSettings).catch(() => {});
    api
      .get<LandingService[]>('/landing-services')
      .then((list) => setServices(list.filter((s) => s.is_active)))
      .catch(() => {});
  }, []);

  // هذه الصفحة العامة تبقى بإضاءة نهارية دائماً، حتى لو كان تفضيل الوضع
  // الداكن للحساب الرئيسي مفعّلاً على نفس المتصفح — localStorage.
  // "zaha-ops:theme" مشترك على مستوى النطاق كاملاً، لا الحساب، فقاعدة
  // index.html تمنع تطبيقه عند التحميل المباشر لهذا المسار، وهذا الأثر
  // هنا يغطي أيضاً الوصول إليها بالتنقل الداخلي (SPA navigation) بلا
  // إعادة تحميل الصفحة، مع إعادة الحالة عند مغادرتها.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
    };
  }, []);

  const { primary: NAVY, secondary: CREAM, background: OFFWHITE, accent: GREEN } = settings.colors;

  // يُختار من بطاقات قسم "خدماتنا" الأدنى في الصفحة — الخدمة معروفة
  // بالفعل حينها، فيُقفز مباشرة لخطوة "بياناتك" بدل تكرار خطوة الاختيار.
  function pickService(n: string) {
    setServiceName(n);
    setStep(2);
    scrollToForm();
  }

  const canGoNext = step === 1 ? Boolean(serviceName) : step === 2 ? name.trim().length > 1 && phone.trim().length >= 9 : true;

  function goNext() {
    if (!canGoNext) return;
    setStep((s) => Math.min(s + 1, HERO_STEP_TITLES.length));
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function submit() {
    if (!name.trim() || !phone.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api.post('/public/leads', {
        name: name.trim(),
        phone: phone.trim(),
        service_name: serviceName || undefined,
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
      {/* الإعلان المنبثق — مُفعَّل وصورته من الإعدادات ← الطلبات الخارجية
          (LandingPageTab في Settings.tsx). إعلان بحت بلا أي نموذج داخله؛
          إغلاقه لا يمنع أي تصفّح أو حجز لاحق. */}
      {settings.popup_ad_enabled && settings.popup_ad_image_url && !popupDismissed && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
          onClick={dismissPopup}
        >
          <div className="relative max-h-[85vh] max-w-md" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={dismissPopup}
              aria-label="إغلاق"
              className="absolute -top-3 -end-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={settings.popup_ad_image_url}
              alt=""
              className="max-h-[85vh] w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* ============================== الرأس ============================== */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-3 shadow-md sm:px-10"
        style={{ backgroundColor: NAVY }}
      >
        <div className="flex items-center gap-2.5">
          <img src="/order-page-logo.png" alt={COMPANY_NAME} className="h-10 w-10 rounded-xl" />
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
        <div className="flex items-center gap-3 sm:gap-4">
          <a
            href={waLink(COMPANY_PHONE, WHATSAPP_INTRO)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition hover:opacity-90 sm:px-4 sm:text-sm"
            style={{ backgroundColor: '#25D366', color: '#fff' }}
          >
            <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> تواصل معنا
          </a>
          <a
            href={`tel:${COMPANY_PHONE}`}
            dir="ltr"
            className="hidden items-center gap-1.5 text-sm font-bold text-white/90 transition hover:text-white sm:flex"
          >
            {COMPANY_PHONE} <Phone className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* ================== الهيرو: لوحة الثقة + بطاقة حجز بثلاث خطوات ==================
          لوحة الصورة/العنوان أولاً في DOM ثم بطاقة الحجز ثانياً — في RTL
          أول عنصر يظهر يميناً، مطابقةً للتصميم المرجعي (الصورة يميناً،
          بطاقة الحجز يساراً). على الجوال تُكدَّس الصورة أعلى وبطاقة الحجز
          أسفلها بنفس ترتيب الشجرة (flex-col عادي، بلا reverse). */}
      <section className="px-5 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-stretch">
          {/* لوحة الصورة/الثقة — صورة فعلية واضحة (لا شفافية خافتة كالتصميم
              القديم) مع تدرّج داكن أسفلها لوضوح النص الأبيض فوقها. */}
          <div className="relative min-h-[360px] w-full overflow-hidden rounded-3xl shadow-2xl lg:flex-1">
            <img src="/hero-worker.jpeg" alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(180deg, ${NAVY}05 0%, ${NAVY}B3 60%, ${NAVY}F0 100%)` }}
            />
            <div className="relative flex h-full flex-col justify-end p-6 sm:p-9">
              <span
                className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold shadow-sm"
                style={{ color: NAVY }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: GREEN }} /> خدمة واضحة من أول طلب
              </span>
              <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">{settings.hero_title}</h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">{settings.hero_subtitle}</p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-white/90 sm:gap-x-8">
                <span className="flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4" style={{ color: GREEN }} /> فريق مدرّب
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" style={{ color: GREEN }} /> مواد آمنة
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" style={{ color: GREEN }} /> الالتزام بالموعد
                </span>
              </div>
            </div>
          </div>

          {/* بطاقة "احجز خدمتك" — ثلاث خطوات: الخدمة ← بياناتك ← التأكيد. */}
          <div id="order-form" className="w-full rounded-3xl bg-white p-6 shadow-2xl sm:p-7 lg:w-[440px] lg:shrink-0">
            {done ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
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
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: NAVY }}>
                      احجز خدمتك
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">ثلاث خطوات بسيطة ونرجع لك بالتأكيد.</p>
                  </div>
                  <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: CREAM, color: NAVY }}>
                    {step} من {HERO_STEP_TITLES.length}
                  </span>
                </div>

                <div className="mb-6 mt-4 flex gap-1.5">
                  {HERO_STEP_TITLES.map((_, i) => (
                    <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: i < step ? '100%' : '0%', backgroundColor: GREEN }}
                      />
                    </div>
                  ))}
                </div>

                {step === 1 && (
                  <div>
                    <p className="mb-3 text-sm font-bold" style={{ color: NAVY }}>
                      وش الخدمة اللي تحتاجها؟
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {services.map((s) => {
                        const Icon = serviceIcon(s.title);
                        const active = serviceName === s.title;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setServiceName(s.title)}
                            className="flex flex-col items-start rounded-2xl border p-3.5 text-start transition"
                            style={{ borderColor: active ? GREEN : '#ECE8DE', backgroundColor: active ? `${GREEN}1A` : '#fff' }}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: CREAM, color: NAVY }}>
                                <Icon className="h-4 w-4" />
                              </span>
                              {active && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: NAVY }}>
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                            <span className="mt-2.5 block text-sm font-bold leading-tight" style={{ color: NAVY }}>
                              {s.title}
                            </span>
                            {s.short_tag && <span className="mt-0.5 block text-xs text-slate-400">{s.short_tag}</span>}
                          </button>
                        );
                      })}
                      {services.length === 0 && (
                        <div className="col-span-2 py-6 text-center text-xs text-slate-400">جارِ تحميل الخدمات…</div>
                      )}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium text-slate-600">الاسم</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: محمد العتيبي" className="input" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium text-slate-600">رقم الجوال</span>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="05XXXXXXXX" className="input" />
                    </label>
                    <p className="text-xs text-slate-400">سيتم استخدام هذه البيانات للتواصل معك بخصوص طلبك</p>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <div className="space-y-2.5 rounded-xl bg-slate-50 p-4 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">الخدمة</span>
                        <span className="font-semibold" style={{ color: NAVY }}>
                          {serviceName || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">الاسم</span>
                        <span className="font-semibold" style={{ color: NAVY }}>
                          {name}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">الجوال</span>
                        <span dir="ltr" className="font-semibold" style={{ color: NAVY }}>
                          {phone}
                        </span>
                      </div>
                    </div>
                    {submitError && (
                      <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 flex items-center gap-2">
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex items-center gap-1 rounded-xl px-3 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                    >
                      <ChevronRight className="h-4 w-4" /> رجوع
                    </button>
                  )}
                  {step < HERO_STEP_TITLES.length ? (
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={!canGoNext}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-40"
                      style={{ backgroundColor: NAVY }}
                    >
                      التالي: {HERO_STEP_TITLES[step]} <ChevronLeft className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={submitting}
                      className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                      style={{ backgroundColor: NAVY }}
                    >
                      {submitting ? 'جارِ الإرسال…' : 'إرسال الطلب'}
                    </button>
                  )}
                </div>
                <a
                  href={waLink(COMPANY_PHONE, WHATSAPP_INTRO)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> أو تواصل معنا مباشرة عبر واتساب
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =================== دفع مرن وآمن (تابي وتمارا ومدى وApple Pay) ===================
          يظهر افتراضياً (undefined = true، للسجلات المحفوظة قبل إضافة هذا
          الخيار) ويُخفى بالكامل فقط لو عطّله المدير صراحةً من الإعدادات ←
          الطلبات الخارجية. */}
      {settings.show_installments_banner !== false && (
        <section className="px-5 pb-2 pt-2 sm:px-10">
          <div
            className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-2xl px-6 py-5 shadow-sm sm:flex-row-reverse sm:justify-between sm:px-8"
            style={{ backgroundColor: NAVY }}
          >
            <div className="text-center sm:text-right">
              <p className="text-base font-extrabold text-white sm:text-lg">دفع مرن وآمن</p>
              <p className="mt-1 text-sm text-white/60">خيارات متعددة بعد تأكيد تفاصيل الخدمة والسعر.</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {/* مدى */}
              <div className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5">
                <div className="h-5 w-8 overflow-hidden rounded-sm">
                  <div className="h-1/2" style={{ backgroundColor: '#1D9BD8' }} />
                  <div className="h-1/2" style={{ backgroundColor: '#84B440' }} />
                </div>
                <span className="text-sm font-bold text-slate-800">مدى</span>
              </div>
              {/* Apple Pay */}
              <div className="flex items-center gap-1 rounded-full bg-white px-4 py-2.5 text-slate-900">
                <Apple className="h-4 w-4" fill="currentColor" />
                <span className="text-sm font-semibold">Pay</span>
              </div>
              {/* تابي — الشعار الرسمي كما هو. */}
              <img src="/tabby-logo.png" alt="Tabby" className="h-9 w-auto rounded-full shadow-sm" />
              {/* تمارا — نفس كبسولة التدرّج الرسمية. */}
              <span
                className="flex items-center justify-center rounded-full px-4 py-2.5 shadow-sm"
                style={{
                  background:
                    'radial-gradient(circle at 12% 15%, #ffcf6b 0%, transparent 48%), radial-gradient(circle at 78% 18%, #ff8fa8 0%, transparent 55%), radial-gradient(circle at 12% 88%, #a7ddf5 0%, transparent 50%), radial-gradient(circle at 85% 85%, #b48cfe 0%, transparent 55%), linear-gradient(135deg, #ffdca0, #ffb0b8)',
                }}
              >
                <img src="/tamara-logo.svg" alt="Tamara" className="h-3.5 w-auto" />
              </span>
            </div>
          </div>
        </section>
      )}

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

      {/* ============================== تواصل ============================== */}
      <section id="contact" className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-10">
        <h2 className="text-[2.5rem] font-extrabold" style={{ color: NAVY }}>
          اطلب الان
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

      {/* ========================= طرق دفع آمنة ========================= */}
      <section className="bg-white px-5 py-12 text-center sm:px-10">
        <h2 className="mb-8 text-lg font-bold text-slate-400 sm:text-xl">طرق دفع آمنة</h2>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 sm:gap-14">
          {/* تحويل بنكي */}
          <Landmark className="h-9 w-9 shrink-0" style={{ color: '#8a6a4f' }} />
          {/* Apple Pay */}
          <div className="flex shrink-0 items-center gap-1 text-slate-900">
            <Apple className="h-8 w-8" fill="currentColor" />
            <span className="text-2xl font-semibold">Pay</span>
          </div>
          {/* مدى — شريطان أفقيان بلونَي الهوية الرسمية + الاسم عربي/إنجليزي. */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="h-9 w-14 overflow-hidden rounded-md shadow-sm">
              <div className="h-1/2" style={{ backgroundColor: '#1D9BD8' }} />
              <div className="h-1/2" style={{ backgroundColor: '#84B440' }} />
            </div>
            <div className="text-start leading-tight">
              <div className="text-lg font-bold text-slate-800">مدى</div>
              <div className="text-sm font-medium text-slate-500">mada</div>
            </div>
          </div>
          {/* تابي — نفس الشعار الرسمي المستخدَم أعلى الصفحة. */}
          <img src="/tabby-logo.png" alt="Tabby" className="h-10 w-auto shrink-0 rounded-2xl shadow-sm" />
          {/* تمارا — نفس الشعار والكبسولة المتدرّجة المستخدَمة أعلى الصفحة. */}
          <span
            className="flex shrink-0 items-center justify-center rounded-full px-6 py-3 shadow-sm"
            style={{
              background:
                'radial-gradient(circle at 12% 15%, #ffcf6b 0%, transparent 48%), radial-gradient(circle at 78% 18%, #ff8fa8 0%, transparent 55%), radial-gradient(circle at 12% 88%, #a7ddf5 0%, transparent 50%), radial-gradient(circle at 85% 85%, #b48cfe 0%, transparent 55%), linear-gradient(135deg, #ffdca0, #ffb0b8)',
            }}
          >
            <img src="/tamara-logo.svg" alt="Tamara" className="h-4 w-auto" />
          </span>
        </div>
      </section>

      {/* ============================== الفوتر ============================== */}
      <footer className="px-5 py-8 text-center sm:px-10" style={{ backgroundColor: NAVY }}>
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className="font-extrabold text-white">{COMPANY_LEGAL_NAME}</span>
        </div>
        <p className="text-xs text-white/50">© {new Date().getFullYear()} {COMPANY_NAME} للنظافة والخدمات. جميع الحقوق محفوظة.</p>
      </footer>

      <LiveChatWidget />
    </div>
  );
}
