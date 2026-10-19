// TikTok Pixel — يُحقَن فقط من الصفحات العامة التي يراها العملاء (/order،
// /order/book، /rate/:id)، وليس من main.tsx ولا index.html، لأن index.html
// قالب مشترك لكل مسارات التطبيق (لوحة التحكم والمحاسبة أيضاً)؛ نفس نهج
// Google Ads في googleAds.ts. هذا المعادل هنا لوضع الكود في <head>، وهو
// بالضبط كود TikTok الرسمي (الأساسي) لكن يُنفَّذ عند فتح صفحة عامة.
//
// معرّف البكسل يأتي من متغير البيئة TIKTOK_PIXEL_ID على الخادم عبر
// GET /public/tracking-config (متغيرات Vite لا تصل المتصفح إلا إن بدأت
// بـ VITE_). كل أحداث هذا الملف تحمل event_id فريداً (رقم الحجز لحدث
// PlaceAnOrder) ليُزال التكرار لاحقاً مع Events API من الخادم.
//
// يعمل فقط في الإنتاج (import.meta.env.PROD) حتى لا تُحتسب زيارات أو
// أحداث وهمية من التطوير المحلي ضمن حساب الإعلانات الحقيقي.
import { useEffect } from 'react';
import { api } from './api.js';

interface Ttq {
  load: (id: string, options?: unknown) => void;
  page: () => void;
  track: (event: string, params?: Record<string, unknown>, options?: { event_id?: string }) => void;
  identify: (params: Record<string, string>) => void;
  [key: string]: unknown;
}

declare global {
  interface Window {
    ttq?: Ttq;
    TiktokAnalyticsObject?: string;
  }
}

const CURRENCY = 'SAR';
const FIRED_ORDERS_KEY = 'zaha-ops:tiktok-orders-fired';
const MAX_STORED_IDS = 200;

// كود TikTok الأساسي نفسه (حرفياً من لوحة TikTok) بصياغة TypeScript.
function injectBaseCode(pixelId: string): void {
  const w = window as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = 'ttq';
  w.TiktokAnalyticsObject = t;
  const ttq: any = (w[t] = w[t] || []); // eslint-disable-line @typescript-eslint/no-explicit-any
  ttq.methods = [
    'page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group',
    'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent',
  ];
  ttq.setAndDefer = (target: any, method: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    target[method] = (...args: unknown[]) => {
      target.push([method, ...args]);
    };
  };
  for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
  ttq.instance = (id: string) => {
    const inst = ttq._i[id] || [];
    for (const m of ttq.methods) ttq.setAndDefer(inst, m);
    return inst;
  };
  ttq.load = (id: string, options?: { partner?: string }) => {
    const url = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._i = ttq._i || {};
    ttq._i[id] = [];
    ttq._i[id]._u = url;
    ttq._t = ttq._t || {};
    ttq._t[id] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[id] = options || {};
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = `${url}?sdkid=${id}&lib=${t}`;
    const first = document.getElementsByTagName('script')[0];
    if (first?.parentNode) first.parentNode.insertBefore(script, first);
    else document.head.appendChild(script);
  };
  ttq.load(pixelId);
  ttq.page();
}

let ready: Promise<Ttq | null> | null = null;

// أول استدعاء: يجلب المعرّف ويحقن الكود ويُرسل page() الأولى. أي استدعاء
// لاحق (تنقّل بين الصفحات العامة داخل الـSPA) يكتفي بـ ttq.page().
function ensurePixel(): Promise<Ttq | null> {
  if (!import.meta.env.PROD) return Promise.resolve(null);
  if (!ready) {
    ready = api
      .get<{ tiktok_pixel_id?: string }>('/public/tracking-config')
      .then((cfg) => {
        if (!cfg.tiktok_pixel_id) return null;
        injectBaseCode(cfg.tiktok_pixel_id);
        return window.ttq ?? null;
      })
      .catch(() => null);
  }
  return ready;
}

// يُستدعى من كل صفحة عامة عند ظهورها (انظر OrderPage وBookingWizardPage
// وRatePage) — الأولى تُحمّل البكسل، والتالية (تنقّل داخل الـSPA) تُرسل
// ttq.page() فقط. حدث Contact يُطلَق من onClick كل زر واتساب/اتصال مباشرة
// (trackContact أدناه) مع مكان الزر، لا من مستمع عام على الصفحة.
export function useTikTokPageView(): void {
  useEffect(() => {
    trackPageView();
  }, []);
}

let firstPageSent = false;

// عند كل ظهور لصفحة عامة (يُستدعى من useTikTokPageView). الأولى تُطلق
// page() ضمن الحقن نفسه، فلا تُرسل مرتين.
export function trackPageView(): void {
  const isFirst = !firstPageSent;
  firstPageSent = true;
  void ensurePixel().then((ttq) => {
    if (ttq && !isFirst) ttq.page();
  });
}

function newEventId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

function send(event: string, params: Record<string, unknown>, eventId: string): void {
  void ensurePixel().then((ttq) => {
    ttq?.track(event, params, { event_id: eventId });
  });
}

export interface TrackedService {
  id: string;
  name: string;
  price?: number;
}

function contentsOf(service: TrackedService) {
  return [
    {
      content_id: service.id,
      content_type: 'product',
      content_name: service.name,
      quantity: 1,
      ...(service.price !== undefined ? { price: service.price } : {}),
    },
  ];
}

// فتح/اختيار خدمة — لا توجد صفحة مستقلة لكل خدمة في هذا الموقع (بطاقات
// الخدمات داخل صفحة /order ومعالج الحجز)، فيُطلَق عند اختيار الخدمة.
export function trackViewContent(service: TrackedService): void {
  send(
    'ViewContent',
    {
      content_type: 'product',
      content_id: service.id,
      content_name: service.name,
      contents: contentsOf(service),
      currency: CURRENCY,
      ...(service.price !== undefined ? { value: service.price } : {}),
    },
    newEventId('vc'),
  );
}

// الضغط على أي زر/رابط واتساب أو اتصال في الصفحات العامة. placement = مكان
// الزر (header، order-form، contact-section…). لا يمنع فتح الرابط؛ send()
// ينتظر تحميل البكسل إن لم يكتمل بعد بدل إسقاط الحدث.
export function trackContact(method: 'whatsapp' | 'phone', placement: string): void {
  if (!import.meta.env.PROD) return;
  send(
    'Contact',
    {
      content_type: 'product',
      contents: [{ content_id: `contact-${method}`, content_name: placement, quantity: 1 }],
    },
    newEventId('contact'),
  );
}

let checkoutStarted = false;

// بدء تعبئة نموذج الحجز — مرة واحدة لكل جلسة صفحة (أول تفاعل فعلي مع
// النموذج: اختيار خدمة أو الكتابة في أول حقل)، لا عند كل ضغطة مفتاح.
export function trackInitiateCheckout(service?: TrackedService): void {
  if (checkoutStarted) return;
  checkoutStarted = true;
  send(
    'InitiateCheckout',
    {
      currency: CURRENCY,
      ...(service ? { content_type: 'product', content_id: service.id, content_name: service.name, contents: contentsOf(service) } : {}),
      ...(service?.price !== undefined ? { value: service.price } : {}),
    },
    newEventId('checkout'),
  );
}

function getFiredOrders(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FIRED_ORDERS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markOrderFired(id: string): void {
  try {
    const ids = getFiredOrders();
    ids.push(id);
    localStorage.setItem(FIRED_ORDERS_KEY, JSON.stringify(ids.slice(-MAX_STORED_IDS)));
  } catch {
    /* localStorage محظور (تصفح خاص) — يبقى الحجز بلا حماية من التكرار فقط */
  }
}

async function sha256Hex(value: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// رقم جوال سعودي بصيغة دولية E.164 (+9665XXXXXXXX) من أي صيغة محلية
// شائعة (05XXXXXXXX، 5XXXXXXXX، 9665XXXXXXXX، +9665XXXXXXXX).
export function toE164Saudi(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('966')) return `+${digits}`;
  if (digits.startsWith('00966')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('5')) return `+966${digits}`;
  return `+${digits}`;
}

// يُستدعى فقط بعد نجاح الحجز من الخادم (استلام رد 201 مع الـlead). leadId
// هو رقم الحجز ويُستخدم كـevent_id (لإزالة التكرار مع Events API لاحقاً) ولمنع
// إعادة الإرسال لنفس الحجز. identify يسبق الحدث، ببيانات مشفّرة SHA-256.
export async function trackPlaceAnOrder(order: {
  leadId: string;
  service?: TrackedService;
  email?: string;
  phone?: string;
}): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (getFiredOrders().includes(order.leadId)) return;
  markOrderFired(order.leadId);

  const identity: Record<string, string> = {};
  const email = order.email?.trim().toLowerCase();
  const e164 = order.phone ? toE164Saudi(order.phone) : null;
  const [emailHash, phoneHash] = await Promise.all([email ? sha256Hex(email) : null, e164 ? sha256Hex(e164) : null]);
  if (emailHash) identity.email = emailHash;
  if (phoneHash) identity.phone_number = phoneHash;

  const ttq = await ensurePixel();
  if (!ttq) return;
  if (Object.keys(identity).length > 0) ttq.identify(identity);
  ttq.track(
    'PlaceAnOrder',
    {
      content_type: 'product',
      content_id: order.service?.id ?? order.leadId,
      ...(order.service ? { content_name: order.service.name, contents: contentsOf(order.service) } : {}),
      currency: CURRENCY,
      ...(order.service?.price !== undefined ? { value: order.service.price } : {}),
    },
    { event_id: order.leadId },
  );
  checkoutStarted = false;
}

// قيمة تقديرية لكل خدمة بالريال لحدث Purchase — المفاتيح هي عناوين الخدمات
// كما تظهر في صفحة /order (landing services). خدمة غير موجودة هنا = 0.
const SERVICE_VALUES: Record<string, number> = {
  'تنظيف شقق وفلل شامل': 300,
  'تنظيف مكاتب': 250,
  'تنظيف عميق بعد التشطيب': 500,
  'غسيل وتعقيم سجاد وموكيت': 150,
  'مكافحة حشرات': 200,
  'تنظيف كنب ومجالس بالبخار': 200,
  'تنظيف مكيفات سبليت': 100,
};

const FIRED_PURCHASES_KEY = 'zaha-ops:tiktok-purchases-fired';

// حدث Purchase (الحدث القياسي لمسار الشراء في TikTok) مع قيمة الطلب.
// يُستدعى فقط بعد نجاح حفظ الحجز من الخادم؛ orderId (رقم الحجز) = event_id
// ويمنع إعادة الإرسال لنفس الحجز. الجوال بصيغة E.164 ومشفّر SHA-256.
export async function trackBookingSubmitted(opts: { service: string; phone: string; orderId?: string; serviceId?: string }): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (opts.orderId) {
    let fired: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(FIRED_PURCHASES_KEY) ?? '[]');
      fired = Array.isArray(parsed) ? parsed : [];
    } catch {
      /* localStorage محظور */
    }
    if (fired.includes(opts.orderId)) return;
    try {
      fired.push(opts.orderId);
      localStorage.setItem(FIRED_PURCHASES_KEY, JSON.stringify(fired.slice(-MAX_STORED_IDS)));
    } catch {
      /* localStorage محظور */
    }
  }

  const e164 = toE164Saudi(opts.phone);
  const phoneHash = e164 ? await sha256Hex(e164) : null;

  const ttq = await ensurePixel();
  if (!ttq) return;
  if (phoneHash) ttq.identify({ phone_number: phoneHash });
  ttq.track('Purchase', orderEventParams(opts.service, opts.serviceId), opts.orderId ? { event_id: opts.orderId } : undefined);
}

// نفس بيانات Purchase (القيمة من SERVICE_VALUES + contents) لأحداث مسار
// الحجز في صفحة /order، حتى يرى TikTok قيمة متّسقة عبر المسار كله.
function orderEventParams(service: string, serviceId?: string): Record<string, unknown> {
  const contentId = serviceId ?? service;
  return {
    value: SERVICE_VALUES[service] ?? 0,
    currency: CURRENCY,
    content_type: 'product',
    contents: [{ content_id: contentId, content_name: service, quantity: 1 }],
  };
}

// ── أحداث مسار الحجز في صفحة /order ──────────────────────────────────────
// منفصلة عن trackViewContent/trackInitiateCheckout أعلاه، التي ما زال
// معالج الحجز /order/book يستخدمها بتوقيت مختلف (عند اختيار الخدمة/الكتابة).

// ViewContent مرة واحدة عند فتح صفحة /order — بلا content_id (لا خدمة مختارة بعد).
export function trackOrderViewContent(): void {
  if (!import.meta.env.PROD) return;
  send('ViewContent', { content_type: 'product' }, newEventId('vc'));
}

let lastCartService: string | null = null;

// AddToCart عند اختيار خدمة والانتقال لخطوة "بياناتك" — مرة لكل خدمة
// (الرجوع ثم التقدّم بنفس الخدمة لا يكرّره).
export function trackAddToCart(opts: { service: string; serviceId?: string }): void {
  if (!import.meta.env.PROD || !opts.service || lastCartService === opts.service) return;
  lastCartService = opts.service;
  send('AddToCart', orderEventParams(opts.service, opts.serviceId), newEventId('cart'));
}

let lastCheckoutService: string | null = null;

// InitiateCheckout عند الانتقال لخطوة "التأكيد" بعد كتابة الاسم والجوال —
// مرة لكل خدمة كذلك.
export function trackOrderInitiateCheckout(opts: { service: string; serviceId?: string }): void {
  if (!import.meta.env.PROD || !opts.service || lastCheckoutService === opts.service) return;
  lastCheckoutService = opts.service;
  send('InitiateCheckout', orderEventParams(opts.service, opts.serviceId), newEventId('checkout'));
}
