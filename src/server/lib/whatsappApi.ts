// إرسال رسالة نصية عبر واتساب باستخدام Twilio (وليس WhatsApp Cloud API
// المباشر من Meta — تعذّر إكمال تسجيل حساب مطوّرين هناك، انظر نقاش الجلسة).
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_NUMBER مطلوبة في
// متغيرات البيئة (انظر .env.example). بدونها هذا الملف يرفض الإرسال بصمت
// مع تسجيل تحذير، على نفس نمط push.ts (لا يوقف تشغيل الخادم في بيئة لم
// تُضبط فيها بعد).
import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER } = process.env;
const twilioConfigured = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_NUMBER);
const client = twilioConfigured ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

if (!twilioConfigured) {
  console.warn('⚠️ TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_NUMBER غير مضبوطة — إرسال رسائل واتساب معطَّل حتى تُضبط في متغيرات البيئة.');
}

// toWhatsappAddress بصيغة Twilio الكاملة: "whatsapp:+9665XXXXXXXX" — هذه
// بالضبط قيمة حقل From في جسم ويب هوك الاستقبال، فتُستخدم كما هي دون أي
// تحويل إضافي (وليست الصيغة المحلية المطبَّعة normalizeSaudiPhone المستخدمة
// في تخزين Customer.phone).
export async function sendWhatsappTextMessage(toWhatsappAddress: string, text: string): Promise<void> {
  if (!client) return;
  try {
    await client.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: toWhatsappAddress,
      body: text,
    });
  } catch (err) {
    console.error('❌ فشل إرسال رسالة واتساب عبر Twilio:', err);
  }
}
