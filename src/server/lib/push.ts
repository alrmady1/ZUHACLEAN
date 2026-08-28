// إرسال تنبيهات فورية (Web Push) إلى المتصفح/التطبيق المثبَّت على الجهاز
// — تظهر كإشعار نظام حقيقي (مع نغمة) حتى لو كان المتصفح مغلقاً، لأن
// المتصفح يوقظ Service Worker الجهاز (public/sw.js) لعرضها. مطلوب ضبط
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT في متغيرات البيئة
// (انظر .env.example) — بدونها هذا الملف يعمل بصمت دون إرسال أي شيء
// (حتى لا يوقف تشغيل السيرفر في بيئة لم تُضبط فيها بعد).
import webpush from 'web-push';
import { store } from '../store/db.js';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
} else {
  console.warn('⚠️ VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY غير مضبوطين — تنبيهات Web Push معطَّلة حتى تُضبط في متغيرات البيئة.');
}

export interface PushPayload {
  title: string;
  body: string;
  // مسار داخل التطبيق يُفتح عند الضغط على التنبيه (مثال: /appointments).
  url?: string;
  // تجميع تنبيهات نفس الموعد تحت إشعار واحد يتحدَّث بدل التكديس.
  tag?: string;
}

// يرسل لكل اشتراكات (أجهزة) مجموعة من المستخدمين. اشتراك منتهي الصلاحية
// أو أُلغي من طرف المستخدم (404/410 من خدمة الدفع) يُحذف تلقائياً هنا.
export async function sendPushToProfiles(profileIds: string[], payload: PushPayload): Promise<void> {
  if (!vapidConfigured || profileIds.length === 0) return;
  const idSet = new Set(profileIds);
  const subs = store.pushSubscriptions.list().filter((s) => idSet.has(s.profile_id));
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          store.pushSubscriptions.removeByEndpoint(sub.endpoint);
        } else {
          console.error('❌ فشل إرسال تنبيه Web Push:', err);
        }
      }
    }),
  );
}

// اختصار شائع: مدير الموعد (مشرف + فني مباشر) + كل من يملك صلاحية
// "الاطلاع على كافة المواعيد لجميع المشرفين" ضمن general_manager/admin —
// يُستخدم عند إنشاء موعد جديد (انظر api.ts).
export function appointmentNotifyProfileIds(supervisorId: string | undefined, technicianIds: string[]): string[] {
  const ids = new Set<string>(technicianIds);
  if (supervisorId) ids.add(supervisorId);
  for (const p of store.profiles.list()) {
    if (p.role === 'general_manager' || p.role === 'admin') ids.add(p.id);
  }
  return [...ids];
}

// المدير العام ومدير النظام والمشرفين الإداريين — يُستخدم لتنبيه من
// يتابع صفحة "طلبات جديدة" (Leads.tsx) بوصول طلب خارجي من صفحة "اطلب
// الخدمة" العامة (انظر POST /public/leads في api.ts)، ليتعاملوا معه
// بسرعة قبل أن يفقد العميل الاهتمام. لا يشمل المشرفين الميدانيين ولا
// الفنيين عمداً — نفس فئة GM_ADMIN_ADMINSUP في src/shared/types.ts.
export function leadNotifyProfileIds(): string[] {
  return store.profiles
    .list()
    .filter((p) => p.role === 'general_manager' || p.role === 'admin' || p.role === 'admin_supervisor')
    .map((p) => p.id);
}
