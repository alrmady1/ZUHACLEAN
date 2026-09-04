import type { CapacitorConfig } from '@capacitor/cli';

// غلاف تطبيق للجوال (آندرويد/آيفون) حول صفحة "اطلب الآن" العامة —
// server.url يُحمِّل الصفحة المنشورة فعلياً مباشرة بدل تجميع نسخة ثابتة
// من الواجهة داخل التطبيق، فيبقى التطبيق يعكس أي تحديث يُنشَر على الموقع
// فوراً بلا حاجة لإصدار تحديث جديد على المتاجر لكل تغيير في المحتوى أو
// الأسعار أو الخدمات.
//
// appId: معرّف مبدئي (com.zaha.app) — يمكن تغييره متى احتجت، طالما لم
// يُسجَّل بعد فعلياً في Google Play Console / App Store Connect. بعد أول
// نشر فعلي على أي من المتجرين يصبح appId ثابتاً ولا يمكن تغييره لاحقاً
// لنفس التطبيق، فتأكد من الاسم النهائي قبل أول رفع فعلي.
const config: CapacitorConfig = {
  appId: 'com.zaha.app',
  appName: 'زهى',
  webDir: 'dist/client',
  server: {
    url: 'https://zuhaclean.vercel.app/order',
    androidScheme: 'https',
  },
};

export default config;
