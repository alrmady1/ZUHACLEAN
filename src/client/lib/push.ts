// تسجيل Service Worker وتفعيل/إلغاء تفعيل التنبيهات الفورية (Web Push)
// لهذا الجهاز تحديداً — كل جهاز (متصفح/تثبيت على الشاشة الرئيسية) يشترك
// بشكل مستقل عن نفس الحساب، فتفعيلها من جوالك لا يفعّلها تلقائياً على
// حاسوبك. انظر public/sw.js لجهة الاستقبال والعرض، وPOST /push/subscribe
// في src/server/routes/api.ts لجهة الحفظ.
import { api } from './api.js';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushSubscriptionStatus(): Promise<'subscribed' | 'unsubscribed' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsubscribed';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

export async function enablePush(profileId: string): Promise<void> {
  if (!isPushSupported()) throw new Error('التنبيهات غير مدعومة على هذا المتصفح');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يُسمح بإظهار الإشعارات لهذا الموقع');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.get<{ publicKey: string | null }>('/push/vapid-public-key');
  if (!publicKey) throw new Error('التنبيهات غير مفعَّلة من إعدادات الخادم بعد');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  const json = sub.toJSON();
  await api.post('/push/subscribe', {
    profile_id: profileId,
    subscription: { endpoint: json.endpoint, keys: json.keys },
  });
}

// التنبيهات مفعّلة دائماً بدون أي تحكم داخل الواجهة — تُشترك تلقائياً بمجرد
// تسجيل الدخول (إن سمح المتصفح بذلك)، والتحكم الفعلي بها يصير من إعدادات
// الجهاز نفسه (إشعارات الموقع في المتصفح على الحاسوب، أو إشعارات التطبيق
// في نظام أندرويد بعد تثبيته كـ PWA). لا تُظهر أي رسالة للمستخدم هنا: لو
// كان الإذن "denied" فهذا قرار المستخدم من إعدادات جهازه ويجب احترامه
// بصمت، ولو فشل الاشتراك لأي سبب آخر فسيُعاد المحاولة تلقائياً في الجلسة
// التالية دون إزعاج المستخدم.
export async function ensurePushSubscribed(profileId: string): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission === 'denied') return;
  const status = await getPushSubscriptionStatus();
  if (status === 'subscribed' || status === 'unsupported') return;
  try {
    await enablePush(profileId);
  } catch {
    // صامت عمداً — لا يوجد جرس أو زر لإظهار الخطأ عليه.
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  if ('clearAppBadge' in navigator) {
    (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {});
  }
}
