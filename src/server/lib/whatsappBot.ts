// الرد الآلي على واتساب — يستقبله ويب هوك WhatsApp Cloud API
// (POST /api/whatsapp/webhook في api.ts)، يستدعي Claude لصياغة رد باللهجة
// السعودية واستخراج تفاصيل الحجز، يرسل الرد فعلياً عبر whatsappApi.ts،
// وعند اكتمال التفاصيل ينشئ موعداً بحالة 'pending_review' (بانتظار مراجعة
// موظف — لا يُعامَل كموعد مؤكَّد أبداً، حتى لو أكَّد العميل خلال المحادثة).
// ANTHROPIC_API_KEY مطلوب في متغيرات البيئة (انظر .env.example) — بدونه
// هذا الملف يرفض الرد بصمت مع تسجيل تحذير، على نفس نمط push.ts/whatsappApi.ts.
import Anthropic from '@anthropic-ai/sdk';
import { store } from '../store/db.js';
import { normalizeSaudiPhone } from '../../shared/phone.js';
import { pickAvailableSupervisor } from './scheduling.js';
import { sendWhatsappTextMessage } from './whatsappApi.js';
import { sendPushToProfiles, leadNotifyProfileIds } from './push.js';
import type { Service, WhatsappMessage, WhatsappThread } from '../../shared/types.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const anthropicConfigured = Boolean(ANTHROPIC_API_KEY);
const anthropic = anthropicConfigured ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

if (!anthropicConfigured) {
  console.warn('⚠️ ANTHROPIC_API_KEY غير مضبوط — الرد الآلي على واتساب معطَّل حتى يُضبط في متغيرات البيئة.');
}

export interface WhatsappBookingExtraction {
  customerName?: string;
  serviceRequested?: string;
  area?: string;
  preferredDate?: string; // 'YYYY-MM-DD'
  preferredTime?: string; // 'HH:MM' بنظام 24 ساعة، بتوقيت السعودية المحلي
}

export interface WhatsappBotResult {
  replyText: string;
  extraction: WhatsappBookingExtraction;
  bookingReady: boolean;
}

const RESPOND_TOOL: Anthropic.Tool = {
  name: 'respond_to_customer',
  description: 'رد على العميل عبر واتساب مع استخراج تفاصيل الحجز المعروفة حتى الآن من كامل المحادثة.',
  input_schema: {
    type: 'object',
    properties: {
      reply_message: { type: 'string', description: 'الرد الذي سيُرسل للعميل، بالهجة السعودية الدارجة العامية' },
      customer_name: { type: 'string' },
      service_requested: { type: 'string' },
      area: { type: 'string', description: 'الحي أو المنطقة' },
      preferred_date: { type: 'string', description: 'YYYY-MM-DD إن عُرف' },
      preferred_time: { type: 'string', description: 'HH:MM بنظام 24 ساعة إن عُرف' },
      booking_ready: {
        type: 'boolean',
        description: 'true فقط إذا عُرفت الخدمة والمنطقة والتاريخ والوقت وأكّد العميل رغبته بالحجز',
      },
    },
    required: ['reply_message', 'booking_ready'],
  },
};

function buildSystemPrompt(params: { contactProfileName?: string; services: Service[]; todayIso: string }): string {
  const serviceNames = params.services.map((s) => `- ${s.name}`).join('\n');
  return `أنت مساعد حجز آلي لشركة "زهى" لخدمات التنظيف والصيانة، تردّ على عملاء يراسلون رقم واتساب الشركة.

تحدَّث بلهجة سعودية دارجة عامية (مثل: "هلا وغلا"، "تمام"، "أبشر"، "وش الخدمة اللي تحتاجها؟") — إطلاقاً ليس بالفصحى الرسمية.

اليوم: ${params.todayIso} (استخدمه لتفسير تواريخ نسبية مثل "بكرة" أو "بعد بكرة" أو "الأسبوع الجاي").

الخدمات المتوفرة فعلياً (لا تخترع خدمة غير موجودة في هذه القائمة):
${serviceNames || '- (لا توجد خدمات نشطة حالياً)'}

اسأل عن معلومة واحدة ناقصة في كل مرة، لا تستجوب العميل بكل الأسئلة دفعة واحدة. المعلومات المطلوبة: نوع الخدمة، المنطقة/الحي، التاريخ، والوقت المفضّل.

مهم جداً: لا تقل أبداً إن الموعد "مؤكَّد" أو "محجوز نهائياً" — فقط قل إن فريق العمل سيراجع الطلب ويؤكده قريباً، لأن كل حجز عبر واتساب يمر بمراجعة موظف أولاً بلا استثناء.

استدعِ أداة respond_to_customer في كل رد، حتى لو لم تكتمل كل التفاصيل بعد.`;
}

export async function generateWhatsappReply(params: {
  incomingText: string;
  history: WhatsappMessage[];
  contactProfileName?: string;
  services: Service[];
  todayIso: string;
}): Promise<WhatsappBotResult> {
  if (!anthropic) {
    return {
      replyText: 'عذراً، خدمة الرد الآلي غير متاحة حالياً — يرجى الاتصال بنا مباشرة وسيتواصل معك فريقنا.',
      extraction: {},
      bookingReady: false,
    };
  }
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: buildSystemPrompt(params),
    tools: [RESPOND_TOOL],
    tool_choice: { type: 'tool', name: 'respond_to_customer' },
    messages: [
      ...params.history.map((m) => ({ role: m.direction === 'in' ? ('user' as const) : ('assistant' as const), content: m.text })),
      { role: 'user' as const, content: params.incomingText },
    ],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const input = (toolUse?.input ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  return {
    replyText: str(input.reply_message) ?? 'تمام، وش تحتاج بالضبط؟',
    extraction: {
      customerName: str(input.customer_name),
      serviceRequested: str(input.service_requested),
      area: str(input.area),
      preferredDate: str(input.preferred_date),
      preferredTime: str(input.preferred_time),
    },
    bookingReady: input.booking_ready === true,
  };
}

// ---------------------------------------------------------------------------
// معالجة رسالة واتساب واردة — الدالة المُركِّبة (composition root) التي
// يستدعيها ويب هوك POST /api/whatsapp/webhook. تُقرأ دفاعياً من جسم الطلب
// الخام دون افتراض أي حقل مضمون الوجود، لأنها نقطة نهاية عامة تستقبل
// مدخلات خارجية مباشرة من Twilio (حقول form-urlencoded مسطّحة: From/To/
// Body/MessageSid/ProfileName/NumMedia).
// ---------------------------------------------------------------------------
export async function handleIncomingWhatsappMessage(rawBody: unknown): Promise<void> {
  const body = rawBody as {
    From?: string;
    Body?: string;
    MessageSid?: string;
    ProfileName?: string;
    NumMedia?: string;
  };
  const from = body?.From; // "whatsapp:+9665XXXXXXXX" — نفس الصيغة تُستخدَم للرد لاحقاً
  if (!from) return; // جسم غير متوقَّع — لا شيء لمعالجته

  const messageSid = body.MessageSid;
  const contactName = body.ProfileName;
  const localPhone = normalizeSaudiPhone(from);

  let thread = store.whatsappThreads.getByPhone(localPhone);
  // تجاهل إعادة إرسال Twilio لنفس الرسالة (retry نادر لكن وارد)
  if (messageSid && thread?.messages.some((m) => m.wa_message_id === messageSid)) return;

  if (!thread) {
    const now = new Date().toISOString();
    thread = store.whatsappThreads.insert({
      id: store.id(),
      phone: localPhone,
      contact_name: contactName,
      messages: [],
      status: 'active',
      created_at: now,
      updated_at: now,
    });
  }

  const hasMedia = Number(body.NumMedia ?? '0') > 0;
  if (hasMedia || typeof body.Body !== 'string') {
    // صور/موقع/ملصقات... — خارج نطاق النسخة الأولى، رد ثابت بدل الصمت
    store.whatsappThreads.appendMessage(thread.id, {
      id: store.id(),
      direction: 'in',
      text: hasMedia ? '[مرفق وسائط — غير مدعوم حالياً]' : '[رسالة بلا نص]',
      wa_message_id: messageSid,
      created_at: new Date().toISOString(),
    });
    const fallback = 'هلا وغلا! حالياً أقدر أساعدك بالرسائل النصية فقط 🙏 تكرم تكتب طلبك؟';
    await sendWhatsappTextMessage(from, fallback);
    store.whatsappThreads.appendMessage(thread.id, {
      id: store.id(),
      direction: 'out',
      text: fallback,
      created_at: new Date().toISOString(),
    });
    return;
  }

  const text = body.Body;
  store.whatsappThreads.appendMessage(thread.id, {
    id: store.id(),
    direction: 'in',
    text,
    wa_message_id: messageSid,
    created_at: new Date().toISOString(),
  });

  const result = await generateWhatsappReply({
    incomingText: text,
    history: thread.messages,
    contactProfileName: contactName,
    services: store.services.list().filter((s) => s.is_active),
    todayIso: new Date().toISOString().slice(0, 10),
  });

  await sendWhatsappTextMessage(from, result.replyText);
  store.whatsappThreads.appendMessage(thread.id, {
    id: store.id(),
    direction: 'out',
    text: result.replyText,
    created_at: new Date().toISOString(),
  });

  const { extraction } = result;
  if (result.bookingReady && extraction.preferredDate && extraction.preferredTime && thread.status !== 'booked') {
    await createPendingAppointmentFromWhatsapp(thread, localPhone, contactName, extraction);
  }
}

async function createPendingAppointmentFromWhatsapp(
  thread: WhatsappThread,
  localPhone: string,
  contactName: string | undefined,
  extraction: WhatsappBookingExtraction,
): Promise<void> {
  // مطابقة أفضل جهد لاسم الخدمة المستخرَج مقابل دليل الخدمات الفعلي —
  // بدون تطابق واثق تُترك service_id فارغة (نفس نمط مواعيد "زيارة عميل"
  // kind: 'visit' الموجود مسبقاً)، السعر والمدة يُصحَّحان أثناء المراجعة.
  const activeServices = store.services.list().filter((s) => s.is_active);
  const matchedService = extraction.serviceRequested
    ? activeServices.find(
        (s) => s.name.includes(extraction.serviceRequested!) || extraction.serviceRequested!.includes(s.name),
      )
    : undefined;

  // بناء وقت الموعد بتوقيت السعودية المحلي (+03:00) صراحةً — الخادم يعمل
  // على Vercel وغالباً بتوقيت UTC، فـ`new Date(`${date}T${time}`)` كانت
  // ستُفسَّر بتوقيت غير صحيح خلافاً للعميل الذي يعتمد توقيت المتصفح المحلي.
  const scheduledAt = new Date(`${extraction.preferredDate}T${extraction.preferredTime}:00+03:00`);
  if (Number.isNaN(scheduledAt.getTime())) return; // تاريخ/وقت غير صالح من الاستخراج — لا تُنشئ موعداً فاسداً
  const scheduledAtIso = scheduledAt.toISOString();

  let customer = store.customers.list().find((c) => c.phone === localPhone);
  if (!customer) {
    customer = store.customers.insert({
      id: store.id(),
      name: extraction.customerName || contactName || localPhone,
      phone: localPhone,
      address: extraction.area || 'لم يُحدَّد بعد — من محادثة واتساب',
      district: extraction.area,
      created_at: new Date().toISOString(),
    });
  }

  const durationMinutes = matchedService?.default_duration_minutes ?? 120;
  const supervisors = store.profiles.list().filter((p) => p.role === 'supervisor' && p.is_active);
  const supervisor = pickAvailableSupervisor(
    supervisors,
    { scheduledAtIso, durationMinutes },
    store.appointments.list(),
    store.leaves.list(),
  );

  const appointment = store.appointments.insert({
    id: store.id(),
    customer_id: customer.id,
    customer_name_snapshot: customer.name,
    service_id: matchedService?.id ?? '',
    service_name_snapshot: matchedService?.name ?? extraction.serviceRequested ?? '',
    scheduled_at: scheduledAtIso,
    expected_duration_minutes: durationMinutes,
    amount: matchedService?.default_price ?? 0,
    status: 'pending_review',
    supervisor_id: supervisor?.id,
    address_snapshot: customer.address,
    total_paid: 0,
    remaining_amount: matchedService?.default_price ?? 0,
    payment_status: 'unpaid',
    assignments: [],
    photos: [],
    payments: [],
    created_at: new Date().toISOString(),
    whatsapp_thread_id: thread.id,
  });

  store.whatsappThreads.update(thread.id, { status: 'booked', linked_appointment_id: appointment.id });

  store.activityLog.insert({
    id: store.id(),
    action: `تم إنشاء موعد تلقائي (بانتظار المراجعة) من محادثة واتساب مع "${customer.name}"`,
    actor_name: 'الرد الآلي (واتساب)',
    created_at: new Date().toISOString(),
  });

  sendPushToProfiles(leadNotifyProfileIds(), {
    title: 'موعد جديد من واتساب — بانتظار المراجعة',
    body: `${customer.name}${appointment.service_name_snapshot ? ` — ${appointment.service_name_snapshot}` : ''}`,
    url: '/appointments',
    tag: `appointment-${appointment.id}`,
  }).catch((err) => console.error('❌ فشل إرسال تنبيه الموعد الجديد من واتساب:', err));
}
