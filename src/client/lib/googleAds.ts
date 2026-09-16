// تتبّع تحويلات Google Ads — Google tag (gtag.js) الأساسي + حدث تحويل
// "حجز مكتمل" من بطاقة الحجز بثلاث خطوات في /order (انظر OrderPage.tsx).
//
// يعمل فقط في بيئة الإنتاج: import.meta.env.PROD صحيحة فقط بعد بناء
// إنتاجي فعلي (`vite build`، وهذا ما ينفّذه Vercel عند كل نشر — انظر
// vercel.json)، وخاطئة أثناء التطوير المحلي (`npm run dev`، الذي يشغّل
// خادم Vite في وضع dev). هذا يمنع احتساب زيارات/تحويلات وهمية من التطوير
// أو الاختبار المحلي ضمن إحصاءات الحساب الإعلاني الحقيقي على Google Ads.
const GOOGLE_ADS_ID = 'AW-361136285';
const BOOKING_CONVERSION_SEND_TO = 'AW-361136285/EX00CLfw3fgcEJ2BmqwB';

// كل عملية حجز ناجحة عبر POST /public/leads تُرجع سجلاً له id فريد
// (Lead.id) — يُحفَظ هنا فور إطلاق حدث التحويل لهذا الـid، فلا يتكرر
// الحدث لنفس عملية الحجز حتى لو أعاد المستخدم تحميل الصفحة، أو (لو
// تغيّرت الواجهة مستقبلاً وسمحت بذلك) رجع لخطوة سابقة وتقدّم من جديد
// وأدّى ذلك لاستدعاء نفس معالج النجاح مرتين لنفس الحجز. localStorage لا
// sessionStorage عمداً، حتى يبقى المنع سارياً عبر إعادة تحميل الصفحة أو
// إغلاق وفتح التبويب من جديد.
const FIRED_LEADS_KEY = 'zaha-ops:ads-conversions-fired';
// حدّ أعلى للمعرّفات المحفوظة — تفادياً لنمو localStorage بلا حدود على
// جهاز يُستخدم لحجوزات كثيرة جداً (نادر لهذه الصفحة العامة، لكن احتياط
// رخيص). يكفي الاحتفاظ بآخر عدد معقول؛ الأقدم لن يُعاد إرساله فعلياً على
// أي حال (نفس الصفحة لا تعيد استخدام lead id قديم).
const MAX_STORED_IDS = 200;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let baseTagInjected = false;

// يُستدعى مرة واحدة عند إقلاع التطبيق (main.tsx) — يحقن سكربتَي Google
// tag الأساسيين في <head>. تطبيق هذا الموقع صفحة واحدة (SPA، Vite + React
// Router)، فحقن واحد هنا يغطي كل صفحاته/مساراته دون تكرار لكل صفحة على
// حدة (بخلاف Next.js حيث يوضع هذا في layout الجذري — هذا هو المعادل هنا).
export function initGoogleAdsTag(): void {
  if (!import.meta.env.PROD || baseTagInjected) return;
  baseTagInjected = true;

  const loader = document.createElement('script');
  loader.async = true;
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
  document.head.appendChild(loader);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ADS_ID);
}

function getFiredLeadIds(): string[] {
  try {
    const raw = localStorage.getItem(FIRED_LEADS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markLeadFired(leadId: string) {
  try {
    const ids = getFiredLeadIds();
    if (ids.includes(leadId)) return;
    ids.push(leadId);
    // احتفظ بآخر MAX_STORED_IDS فقط.
    const trimmed = ids.length > MAX_STORED_IDS ? ids.slice(ids.length - MAX_STORED_IDS) : ids;
    localStorage.setItem(FIRED_LEADS_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage قد يكون محظوراً (وضع تصفح خاص مثلاً) — يبقى هذا الحجز
    // بلا حماية من التكرار، لكن بلا كسر لبقية الصفحة.
  }
}

// يُطلَق فقط بعد تأكيد الخادم الفعلي لنجاح الحجز (استلام رد 201 من
// POST /public/leads مع الـlead المُنشأ)، وليس عند مجرد الضغط على زر
// "إرسال الطلب" — استدعِها من نفس نقطة النجاح تلك فقط. leadId يمنع تكرار
// نفس الحدث لنفس عملية الحجز (انظر تعليق FIRED_LEADS_KEY أعلاه).
export function fireBookingConversion(leadId: string): void {
  if (!import.meta.env.PROD) return;
  if (getFiredLeadIds().includes(leadId)) return;
  markLeadFired(leadId);
  window.gtag?.('event', 'conversion', { send_to: BOOKING_CONVERSION_SEND_TO });
}
