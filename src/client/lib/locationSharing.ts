// إرسال دوري لموقع الجهاز إلى الخادم أثناء تفعيل "مشاركة موقعي" (انظر
// المفتاح في Layout.tsx) — تُستدعى startLocationSharing عند تسجيل
// الدخول لموظف مفعِّل للمشاركة أو فور تفعيلها، وstopLocationSharing عند
// إيقافها أو تسجيل الخروج. يعمل بصمت (بلا throw) عند رفض إذن الموقع أو
// عدم دعم المتصفح له — المشاركة اختيارية بطبيعتها، فشلها ليس خطأ حرجاً.
import { api } from './api.js';

// كل هذه المدة نُرسل نبضة موقع جديدة — كافية لتتبّع ميداني معقول بلا
// استنزاف بطارية جهاز الموظف (بخلاف watchPosition المستمر).
const REPORT_INTERVAL_MS = 60000;

let intervalId: ReturnType<typeof setInterval> | null = null;

function reportOnce(profileId: string) {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      api
        .patch(`/profiles/${profileId}/location`, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        .catch(() => {});
    },
    () => {
      // رفض الإذن أو تعذّر تحديد الموقع — يُتجاهَل بصمت، يُحاول مجدداً
      // في النبضة التالية.
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
  );
}

export function startLocationSharing(profileId: string): void {
  if (intervalId) return; // مُفعَّلة بالفعل
  reportOnce(profileId);
  intervalId = setInterval(() => reportOnce(profileId), REPORT_INTERVAL_MS);
}

export function stopLocationSharing(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
