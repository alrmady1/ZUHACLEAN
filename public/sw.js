// Service Worker — يستقبل تنبيهات Web Push ويعرضها كإشعار نظام حقيقي
// (بنغمة تنبيهات الجهاز، حتى لو كان المتصفح/التطبيق مغلقاً)، ويحدِّث رقم
// أيقونة التطبيق (Badging API) بعدد التنبيهات غير المفتوحة بعد. لا يقوم
// بأي تخزين مؤقت (offline caching) عمداً — الهدف الوحيد هنا هو التنبيهات.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// عدد الإشعارات المعروضة حالياً (لم يُفتح أيّ منها بعد) — يُستخدم كرقم
// التنبيهات الظاهر خارج الأيقونة على الشاشة الرئيسية (Android/Chrome).
async function refreshBadge() {
  if (!('setAppBadge' in self)) return;
  try {
    const notifications = await self.registration.getNotifications();
    if (notifications.length > 0) {
      await self.setAppBadge(notifications.length);
    } else {
      await self.clearAppBadge();
    }
  } catch {
    // Badging API غير مدعومة على هذا المتصفح — تجاهل بصمت.
  }
}

self.addEventListener('push', (event) => {
  let data = { title: 'زهى', body: '' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // نفس tag يستبدل الإشعار القديم بدل تكديس عدة إشعارات لنفس الموعد
        // (مثال: تحديث حالة نفس الموعد مرتين).
        tag: data.tag || undefined,
        data: { url: data.url || '/' },
        vibrate: [120, 60, 120],
      });
      await refreshBadge();
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = allClients.find((c) => 'focus' in c);
      if (existing) {
        existing.navigate(targetUrl);
        existing.focus();
      } else {
        await self.clients.openWindow(targetUrl);
      }
      await refreshBadge();
    })(),
  );
});

// السماح للصفحة بطلب تصفير رقم التنبيهات فوراً (مثلاً عند فتح صفحة
// المواعيد) — انظر src/client/lib/push.ts.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-badge') {
    event.waitUntil(
      (async () => {
        const notifications = await self.registration.getNotifications();
        notifications.forEach((n) => n.close());
        if ('clearAppBadge' in self) await self.clearAppBadge();
      })(),
    );
  }
});
