// تكامل تابي (Tabby Checkout API) — نفس فكرة tamara.ts بالضبط (ينشئ طلب
// دفع لمبلغ موعد ويرجع رابطاً يُرسَل للعميل)، لكن آلية التأكيد مختلفة
// جوهرياً عن تمارا:
//
//   تمارا: تُرسل إشعار ويب هوك مضموناً بعد اكتمال الدفع (POST /tamara/webhook).
//   تابي:  لا تضمن كل الحسابات ويب هوك — الآلية الموثَّقة الأساسية هي إعادة
//          توجيه متصفح العميل لرابط "success" الذي نزوّدها به، ومعه
//          payment_id في الاستعلام. خادمنا (GET /tabby/return في api.ts)
//          يستقبل تلك العودة، يتحقق من حالة الدفعة عبر GET، ثم يجب أن
//          "يلتقطها" (capture) صراحة — بدون capture لا يُحوَّل أي مبلغ فعلياً
//          حتى لو ظهرت الدفعة "authorized".
//
// TABBY_SECRET_KEY / TABBY_MERCHANT_CODE مطلوبان (انظر .env.example) —
// بدونهما هذا الملف يرفض العمل بصمت مع تسجيل تحذير، نفس نمط tamara.ts.
//
// ⚠️ أسماء الحقول ومسارات الاستجابة أدناه (Checkout API v2 + Payments v1)
// من توثيق تابي العام وقت كتابة هذا الملف — تحقق من
// https://docs.tabby.ai قبل أول استخدام فعلي، تحديداً: مكان web_url
// بالضبط داخل استجابة /checkout (قد يختلف بين installments/pay_later)،
// وقيمة merchant_code الصحيحة لحسابكم (تظهر في لوحة تابي للتجار).
import { PUBLIC_SITE_URL } from '../../shared/types.js';

const { TABBY_API_URL, TABBY_SECRET_KEY, TABBY_MERCHANT_CODE } = process.env;
const API_URL = TABBY_API_URL || 'https://api.tabby.ai';
const tabbyConfigured = Boolean(TABBY_SECRET_KEY && TABBY_MERCHANT_CODE);

if (!tabbyConfigured) {
  console.warn('⚠️ TABBY_SECRET_KEY/TABBY_MERCHANT_CODE غير مضبوطين — طلبات الدفع عبر تابي معطَّلة حتى يُضبطا في متغيرات البيئة.');
}

export interface TabbyCheckoutRequest {
  orderReferenceId: string; // appointment.id
  amount: number; // ر.س، شامل الضريبة
  description: string;
  customerName: string;
  customerPhone: string;
}

export interface TabbyCheckoutResult {
  paymentId: string;
  checkoutUrl: string;
}

// تنسيق تابي المطلوب للمبالغ: نص عشري بمنزلتين ("120.00") وليس رقماً.
function money(amount: number): string {
  return amount.toFixed(2);
}

export async function createTabbyCheckoutSession(input: TabbyCheckoutRequest): Promise<TabbyCheckoutResult | null> {
  if (!tabbyConfigured) return null;
  // رابط العودة يحمل appointment_id دائماً حتى لو تأخر/فشل استخراج
  // payment_id من استعلام تابي لأي سبب — GET /tabby/return في api.ts
  // يعتمد عليه لتحديد الموعد المعني بصرف النظر عن ذلك.
  const returnBase = `${PUBLIC_SITE_URL}/api/tabby/return?appointment_id=${encodeURIComponent(input.orderReferenceId)}`;
  const body = {
    payment: {
      amount: money(input.amount),
      currency: 'SAR',
      buyer: {
        phone: input.customerPhone,
        name: input.customerName,
        // تابي تشترط بريداً إلكترونياً — عملاؤنا غالباً بلا بريد مسجَّل،
        // فنستخدم عنواناً صورياً ثابتاً غير مستخدَم فعلياً لأي تواصل.
        email: 'customer@zuhaclean.app',
      },
      order: {
        reference_id: input.orderReferenceId,
        items: [
          {
            title: input.description || 'خدمة زهى للتنظيف والصيانة',
            quantity: 1,
            unit_price: money(input.amount),
            reference_id: input.orderReferenceId,
          },
        ],
      },
      buyer_history: { registered_since: new Date().toISOString(), loyalty_level: 0 },
      order_history: [],
      merchant_code: TABBY_MERCHANT_CODE,
    },
    lang: 'ar',
    merchant_urls: {
      success: returnBase,
      cancel: `${returnBase}&outcome=cancel`,
      failure: `${returnBase}&outcome=failure`,
    },
  };

  try {
    const res = await fetch(`${API_URL}/api/v2/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TABBY_SECRET_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('❌ فشل إنشاء طلب دفع تابي:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as {
      id?: string;
      configuration?: {
        available_products?: {
          installments?: { web_url?: string }[];
          pay_later?: { web_url?: string }[];
        };
      };
      web_url?: string;
    };
    const checkoutUrl =
      data.configuration?.available_products?.installments?.[0]?.web_url ||
      data.configuration?.available_products?.pay_later?.[0]?.web_url ||
      data.web_url;
    if (!data.id || !checkoutUrl) {
      console.error('❌ رد تابي لا يحتوي id/web_url المتوقَّعين — راجع بنية الاستجابة الفعلية:', JSON.stringify(data));
      return null;
    }
    return { paymentId: data.id, checkoutUrl };
  } catch (err) {
    console.error('❌ خطأ أثناء الاتصال بواجهة تابي:', err);
    return null;
  }
}

export interface TabbyPayment {
  id: string;
  status: string; // 'created' | 'authorized' | 'closed' | 'rejected' | 'expired' ...
  amount: string;
}

// يجلب حالة دفعة من تابي — يُستدعى فور عودة العميل من صفحة الدفع
// (GET /tabby/return) لمعرفة هل تمّت الموافقة فعلياً قبل محاولة التقاطها.
export async function getTabbyPayment(paymentId: string): Promise<TabbyPayment | null> {
  if (!tabbyConfigured) return null;
  try {
    const res = await fetch(`${API_URL}/api/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${TABBY_SECRET_KEY}` },
    });
    if (!res.ok) {
      console.error('❌ فشل جلب حالة دفعة تابي:', paymentId, res.status, await res.text().catch(() => ''));
      return null;
    }
    return (await res.json()) as TabbyPayment;
  } catch (err) {
    console.error('❌ خطأ أثناء جلب حالة دفعة تابي:', err);
    return null;
  }
}

// يلتقط (capture) دفعة "authorized" فعلياً — بدون هذه الخطوة لا يتحوَّل أي
// مبلغ حقيقي للتاجر مهما بدت الدفعة موافَقاً عليها. amount بالريال (نفس
// وحدة الالتقاط المتوقَّعة — الجزء الكامل أو الجزئي من قيمة الطلب الأصلية).
export async function captureTabbyPayment(paymentId: string, amount: number): Promise<boolean> {
  if (!tabbyConfigured) return false;
  try {
    const res = await fetch(`${API_URL}/api/v1/payments/${paymentId}/captures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TABBY_SECRET_KEY}`,
      },
      body: JSON.stringify({ amount: money(amount) }),
    });
    if (!res.ok) {
      console.error('❌ فشل التقاط دفعة تابي:', paymentId, res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('❌ خطأ أثناء التقاط دفعة تابي:', err);
    return false;
  }
}
