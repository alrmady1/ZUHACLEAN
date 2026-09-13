// تكامل تمارا (Tamara Checkout API) — يُنشئ "طلب دفع" فعلياً بدل تعبئته
// يدوياً من لوحة تمارا للأعمال (تمارا Business Portal ← دفع جديد): نفس
// الحقول الثلاثة بالضبط (قيمة الطلب، جوال العميل، رقم مرجعي)، لكن من داخل
// نافذة "تحصيل الدفعة" في النظام (انظر POST /appointments/:id/tamara-request
// في src/server/routes/api.ts و PayAppointmentModal.tsx).
//
// TAMARA_API_URL / TAMARA_API_TOKEN / TAMARA_NOTIFICATION_TOKEN مطلوبة في
// متغيرات البيئة (انظر .env.example) — بدونها هذا الملف يرفض العمل بصمت
// مع تسجيل تحذير، نفس نمط whatsappApi.ts.
//
// ⚠️ مرجع الحقول أدناه (Checkout API v1) من توثيق تمارا العام وقت كتابة
// هذا الملف — تحقق من https://docs.tamara.co قبل أول استخدام فعلي، تحديداً:
// أسماء أحداث الويب هوك بالضبط (order_approved/order_captured وغيرها) وأي
// حقل consumer إضافي إلزامي قد تشترطه تمارا لاحقاً حسب مبلغ الطلب.
import { PUBLIC_SITE_URL } from '../../shared/types.js';

const { TAMARA_API_URL, TAMARA_API_TOKEN, TAMARA_NOTIFICATION_TOKEN } = process.env;
// افتراضي بيئة الاختبار (Sandbox) إن لم يُحدَّد صراحة — لا تُنشئ طلبات
// حقيقية بأموال فعلية إلا بضبط TAMARA_API_URL=https://api.tamara.co صراحةً
// في بيئة الإنتاج على Vercel بعد التأكد من نجاح الاختبار في Sandbox.
const API_URL = TAMARA_API_URL || 'https://api-sandbox.tamara.co';
const tamaraConfigured = Boolean(TAMARA_API_TOKEN);

if (!tamaraConfigured) {
  console.warn('⚠️ TAMARA_API_TOKEN غير مضبوط — طلبات الدفع عبر تمارا معطَّلة حتى يُضبط في متغيرات البيئة.');
}
if (!TAMARA_NOTIFICATION_TOKEN) {
  console.warn('⚠️ TAMARA_NOTIFICATION_TOKEN غير مضبوط — ويب هوك تمارا (POST /api/tamara/webhook) سيرفض كل الإشعارات الواردة حتى يُضبط.');
}

export interface TamaraCheckoutRequest {
  orderReferenceId: string; // appointment.id — نُعيد استقباله كما هو في الويب هوك لاحقاً
  amount: number; // ر.س، شامل الضريبة (نفس منطق Appointment.amount)
  description: string; // اسم الخدمة — يظهر للعميل في صفحة تمارا
  customerName: string;
  customerPhone: string; // أي صيغة سعودية محلية أو دولية، تمارا تطبّعها بنفسها
}

export interface TamaraCheckoutResult {
  orderId: string;
  checkoutUrl: string;
}

// يبني اسماً أولاً/أخيراً بسيطَين من اسم عميل واحد كما هو مخزَّن — تمارا
// تشترط first_name/last_name منفصلَين، وأسماء عملائنا حقل واحد فقط.
function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  return { first: parts[0] || fullName, last: parts.slice(1).join(' ') || parts[0] || fullName };
}

// ينشئ جلسة دفع (Checkout Session) لدى تمارا لمبلغ موعد بعينه، ويرجع رابط
// الدفع لإرساله للعميل (واتساب/نسخ) — لا يُحصَّل أي مبلغ الآن، فقط يُنشأ
// الطلب؛ التأكيد الفعلي يصل لاحقاً عبر POST /api/tamara/webhook. يرجع
// null بصمت (مع تسجيل الخطأ) عند أي فشل، بدل رمي استثناء، ليقرر المسار
// المستدعي في api.ts رسالة الخطأ المناسبة للواجهة.
export async function createTamaraCheckoutSession(input: TamaraCheckoutRequest): Promise<TamaraCheckoutResult | null> {
  if (!tamaraConfigured) return null;
  const { first, last } = splitName(input.customerName);
  // روابط إعادة التوجيه بعد إتمام/إلغاء/فشل الدفع على صفحة تمارا نفسها —
  // العميل عادة يصله رابط الدفع مباشرة عبر واتساب لا من داخل موقعنا، فلا
  // توجد "رحلة تسوّق" يعود إليها؛ الأبسط والأنسب لسياق هذا التطبيق هو
  // إعادته لمحادثة واتساب الشركة في الحالات الثلاث، بدل بناء صفحات هبوط
  // مخصَّصة (نجاح/فشل/إلغاء) لا قيمة حقيقية منها هنا.
  const waRedirect = `https://wa.me/966${input.customerPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^966/, '')}`;
  const body = {
    total_amount: { amount: input.amount, currency: 'SAR' },
    shipping_amount: { amount: 0, currency: 'SAR' },
    tax_amount: { amount: 0, currency: 'SAR' },
    order_reference_id: input.orderReferenceId,
    order_number: input.orderReferenceId,
    items: [
      {
        reference_id: input.orderReferenceId,
        type: 'Digital',
        name: input.description || 'خدمة زهى للتنظيف والصيانة',
        sku: 'ZUHA-SERVICE',
        quantity: 1,
        unit_price: { amount: input.amount, currency: 'SAR' },
        total_amount: { amount: input.amount, currency: 'SAR' },
      },
    ],
    consumer: {
      first_name: first,
      last_name: last,
      phone_number: input.customerPhone,
    },
    country_code: 'SA',
    description: input.description || 'خدمة زهى للتنظيف والصيانة',
    merchant_url: {
      success: waRedirect,
      failure: waRedirect,
      cancel: waRedirect,
      notification: `${PUBLIC_SITE_URL}/api/tamara/webhook`,
    },
  };

  try {
    const res = await fetch(`${API_URL}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TAMARA_API_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('❌ فشل إنشاء طلب دفع تمارا:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as { order_id?: string; checkout_url?: string };
    if (!data.order_id || !data.checkout_url) {
      console.error('❌ رد تمارا لا يحتوي order_id/checkout_url المتوقَّعين:', data);
      return null;
    }
    return { orderId: data.order_id, checkoutUrl: data.checkout_url };
  } catch (err) {
    console.error('❌ خطأ أثناء الاتصال بواجهة تمارا:', err);
    return null;
  }
}

// تحقّق ويب هوك تمارا — توثّق تمارا كل إشعار وارد بترويسة
// Authorization: Bearer <notification_token> (القيمة نفسها التي تولّدها/
// تربطها عند تسجيل رابط الإشعار في لوحة تمارا للأعمال ← الإعدادات ←
// ويب هوك)، وليس توقيعاً HMAC — لذا مقارنة نصية مباشرة كافية هنا.
export function isValidTamaraWebhookAuth(authorizationHeader: string | undefined): boolean {
  if (!TAMARA_NOTIFICATION_TOKEN) return false;
  if (!authorizationHeader) return false;
  const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
  return token === TAMARA_NOTIFICATION_TOKEN;
}
