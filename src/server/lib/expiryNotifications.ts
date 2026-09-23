import { store } from '../store/db.js';
import { sendPushToProfiles, generalManagerNotifyProfileIds } from './push.js';
import { expiryDaysRemaining, expiryStatus, DOCUMENT_EXPIRY_NEAR_DAYS, type ExpiryRow } from '../../shared/expiryRegister.js';

// يُستدعى فقط عند فتح تبويب "تواريخ الانتهاء" (GET /expiry-documents) —
// لا يوجد في هذا المشروع تنفيذ مجدوَل (cron) فعلي، فهذا أقرب بديل عملي:
// كل فتح للتبويب يفحص السجل كاملاً ويُرسل إشعاراً فورياً لكل بند تجاوز
// عتبة الاقتراب/الانتهاء لأول مرة منذ آخر فحص. بصمة عدم التكرار محفوظة في
// store.expiryNotificationFlags (مفتاحة بـrow_key، انظر ExpiryRow)، فلا
// يتكرر نفس التنبيه على فتحات لاحقة قبل أن يتغيّر التاريخ أو تُجدَّد
// الوثيقة (عندها تُعاد الأعلام لتُتيح تنبيهاً جديداً عند اقترابها من جديد).
export async function checkExpiryNotifications(rows: ExpiryRow[]): Promise<void> {
  const flagByKey = new Map(store.expiryNotificationFlags.list().map((f) => [f.row_key, f]));
  const notifications: { title: string; body: string; tag: string }[] = [];

  for (const row of rows) {
    const days = expiryDaysRemaining(row.expiry_date);
    if (days === null) continue;
    const status = expiryStatus(days).key;
    const flag = flagByKey.get(row.row_key) ?? { row_key: row.row_key, near_notified: false, expired_notified: false };

    if (status === 'expired') {
      if (!flag.expired_notified) {
        notifications.push({
          title: 'انتهت صلاحية مستند',
          body: `انتهت صلاحية "${row.name}"${row.category ? ` (${row.category})` : ''}.`,
          tag: row.row_key,
        });
        store.expiryNotificationFlags.set({ row_key: row.row_key, near_notified: true, expired_notified: true });
      }
    } else if (status === 'near') {
      if (!flag.near_notified) {
        notifications.push({
          title: 'اقتراب انتهاء مستند',
          body: `سينتهي "${row.name}"${row.category ? ` (${row.category})` : ''} خلال ${days} يوم.`,
          tag: row.row_key,
        });
        store.expiryNotificationFlags.set({ row_key: row.row_key, near_notified: true, expired_notified: false });
      }
    } else if (flag.near_notified || flag.expired_notified) {
      // تاريخ الانتهاء تجاوز عتبة الاقتراب من جديد (تجديد الوثيقة أو
      // تعديل التاريخ) — إعادة ضبط الأعلام ليصلح للتنبيه مرة أخرى لاحقاً.
      store.expiryNotificationFlags.set({ row_key: row.row_key, near_notified: false, expired_notified: false });
    }
  }

  if (notifications.length === 0) return;
  const profileIds = generalManagerNotifyProfileIds();
  await Promise.all(
    notifications.map((n) =>
      sendPushToProfiles(profileIds, { title: n.title, body: n.body, url: '/accounting?tab=expiry_documents', tag: n.tag }),
    ),
  );
}

// مُصدَّرة فقط لاستخدام الواجهة عرضاً (مؤشرات عدد قرب/منتهي) — إعادة تصدير
// حتى لا يستورد الخادم من shared مباشرة في أكثر من مكان بلا داعٍ.
export { DOCUMENT_EXPIRY_NEAR_DAYS };
