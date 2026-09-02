// إرسال رسالة نصية عبر WhatsApp Cloud API (Meta Graph API) —
// WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID مطلوبان في متغيرات
// البيئة (انظر .env.example). بدونهما هذا الملف يرفض الإرسال بصمت مع
// تسجيل تحذير، على نفس نمط push.ts (لا يوقف تشغيل الخادم في بيئة لم
// تُضبط فيها بعد).
const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
const whatsappConfigured = Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);

if (!whatsappConfigured) {
  console.warn('⚠️ WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID غير مضبوطين — إرسال رسائل واتساب معطَّل حتى تُضبط في متغيرات البيئة.');
}

// toPhoneIntl بصيغة دولية بلا "+" (مثال: "9665XXXXXXXX") — نفس صيغة
// message.from الواردة من ويب هوك واتساب مباشرة، وليست الصيغة المحلية
// المطبَّعة (normalizeSaudiPhone) المستخدمة في تخزين Customer.phone.
export async function sendWhatsappTextMessage(toPhoneIntl: string, text: string): Promise<void> {
  if (!whatsappConfigured) return;
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhoneIntl,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      console.error('❌ فشل إرسال رسالة واتساب:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('❌ خطأ أثناء إرسال رسالة واتساب:', err);
  }
}
