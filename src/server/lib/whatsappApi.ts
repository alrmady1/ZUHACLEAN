// إرسال رسالة نصية عبر واتساب عبر Twilio REST API مباشرة — بطلب fetch خام
// بدل حزمة twilio الرسمية عمداً: تلك الحزمة رمت خطأ
// "Cannot convert argument to a ByteString" في بيئة Vercel تحديداً عند
// إرسال نص عربي (حروف خارج Latin1) داخل جسم الرسالة، على الأرجح خلل توافق
// بين عميلها الداخلي وبيئة تشغيل Vercel. URLSearchParams هنا يُرمِّز أي نص
// UTF-8 (بما فيه العربي) إلى ASCII بحت (percent-encoding) قبل الإرسال، فلا
// يمر أي حرف غير Latin1 عبر أي واجهة تفرض قيد ByteString إطلاقاً.
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_NUMBER مطلوبة في
// متغيرات البيئة (انظر .env.example). بدونها هذا الملف يرفض الإرسال بصمت
// مع تسجيل تحذير، على نفس نمط push.ts (لا يوقف تشغيل الخادم في بيئة لم
// تُضبط فيها بعد).
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER } = process.env;
const twilioConfigured = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_NUMBER);

if (!twilioConfigured) {
  console.warn('⚠️ TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_NUMBER غير مضبوطة — إرسال رسائل واتساب معطَّل حتى تُضبط في متغيرات البيئة.');
}

// toWhatsappAddress بصيغة Twilio الكاملة: "whatsapp:+9665XXXXXXXX" — هذه
// بالضبط قيمة حقل From في جسم ويب هوك الاستقبال، فتُستخدم كما هي دون أي
// تحويل إضافي (وليست الصيغة المحلية المطبَّعة normalizeSaudiPhone المستخدمة
// في تخزين Customer.phone).
export async function sendWhatsappTextMessage(toWhatsappAddress: string, text: string): Promise<void> {
  if (!twilioConfigured) return;
  try {
    const params = new URLSearchParams();
    params.set('From', TWILIO_WHATSAPP_NUMBER!);
    params.set('To', toWhatsappAddress);
    params.set('Body', text);
    const authHeader = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      console.error('❌ فشل إرسال رسالة واتساب عبر Twilio:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('❌ خطأ أثناء إرسال رسالة واتساب:', err);
  }
}

// رمز تحقق لتسجيل دخول تطبيق الجوال. واتساب يمنع رسائل النص الحر خارج نافذة
// الـ24 ساعة من آخر رسالة للعميل، والعميل هنا لم يراسلنا غالباً، فالإرسال
// الفعلي يحتاج "قالب مصادقة" معتمداً من واتساب: يُضبط معرّفه (ContentSid) في
// TWILIO_WHATSAPP_OTP_CONTENT_SID، ويكون متغيّره {{1}} هو الرمز. بدون هذا
// المتغيّر يُرسَل نص حر عادي (يعمل مع رقم التجربة Sandbox أو ضمن نافذة الـ24
// ساعة فقط). يرجع true فقط عند قبول Twilio للرسالة — لا يعني وصولها فعلاً.
export async function sendWhatsappOtpCode(toWhatsappAddress: string, code: string): Promise<boolean> {
  if (!twilioConfigured) return false;
  try {
    const params = new URLSearchParams();
    params.set('From', TWILIO_WHATSAPP_NUMBER!);
    params.set('To', toWhatsappAddress);
    const contentSid = process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID;
    if (contentSid) {
      params.set('ContentSid', contentSid);
      params.set('ContentVariables', JSON.stringify({ '1': code }));
    } else {
      params.set('Body', `رمز التحقق الخاص بك في زهى: ${code}`);
    }
    const authHeader = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      console.error('❌ فشل إرسال رمز التحقق عبر واتساب:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('❌ خطأ أثناء إرسال رمز التحقق عبر واتساب:', err);
    return false;
  }
}
