// Uploads appointment before/after photos to Supabase Storage instead of
// embedding base64 image data directly inside the app_state JSONB blob
// (which would bloat the database and slow down every read/write).
//
// The bucket is private; we return a very long-lived signed URL (10 years)
// at upload time and store that URL directly on the photo record. This
// avoids re-signing URLs on every read while keeping the objects
// unlistable/unguessable to anyone without the link.
import { randomUUID } from 'node:crypto';
import { supabase } from './supabaseClient.js';

const BUCKET = 'appointment-photos';
const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;

let bucketReady: Promise<void> | null = null;

// Creates the storage bucket on first use if it doesn't already exist yet
// (idempotent — safe to call on every server start).
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) throw listError;
      if (!buckets?.some((b) => b.name === BUCKET)) {
        const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
        // Ignore a race where another instance created it in between.
        if (createError && !/already exists/i.test(createError.message)) throw createError;
      }
    })();
  }
  return bucketReady;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('صيغة الصورة غير صالحة');
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = contentType.split('/')[1]?.split('+')[0] || 'jpg';
  return { buffer, contentType, ext };
}

// Uploads a base64 data URL to Supabase Storage and returns a long-lived
// signed URL pointing at it.
export async function uploadAppointmentPhoto(
  appointmentId: string,
  stage: string,
  dataUrl: string,
): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `${appointmentId}/${stage}-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// الفيديو أكبر من أن يمر عبر دالة Vercel (حد الطلب ~4.5MB)، فيرفعه المتصفح
// مباشرة إلى Supabase عبر رابط رفع موقَّع قصير العمر نُصدره هنا، ثم يؤكد
// للخادم بالمسار فنخزّن رابط العرض الطويل الأمد (finalizeAppointmentVideo).
export async function createAppointmentVideoUploadUrl(
  appointmentId: string,
  stage: string,
  fileName: string,
): Promise<{ path: string; uploadUrl: string }> {
  await ensureBucket();
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1] ?? 'mp4').toLowerCase();
  const path = `${appointmentId}/${stage}-video-${Date.now()}-${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, uploadUrl: data.signedUrl };
}

export async function finalizeAppointmentVideo(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

// نفس منطق uploadAppointmentPhoto أعلاه بالضبط، لكن لصورة داعمة مرفقة
// بإجازة سنوية (مثل تقرير طبي) بدل صور قبل/بعد الموعد — تُخزَّن في نفس
// الحاوية (bucket) تحت مسار "leaves/" منفصل عن مجلدات المواعيد.
export async function uploadLeavePhoto(leaveId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `leaves/${leaveId}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// نفس منطق uploadAppointmentPhoto أعلاه بالضبط، لكن لصورة أو ملف PDF لسند/
// فاتورة مصروف عام — يُخزَّن في نفس الحاوية تحت مسار "expenses/" منفصل.
// parseDataUrl أعلاه عامّة أصلاً (تعتمد على نوع المحتوى في data URL نفسه)
// فتعمل بلا تعديل مع "application/pdf" كما تعمل مع "image/*".
export async function uploadExpenseInvoice(expenseId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `expenses/${expenseId}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// إيصال تحويل عمولة منصة سيرف (صورة أو PDF) — تحت مسار "sarv-payments/".
export async function uploadSarvPaymentReceipt(invoiceId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `sarv-payments/${invoiceId}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// نفس منطق uploadExpenseInvoice أعلاه بالضبط، لصورة إيصال دفعة موعد
// (PayAppointmentModal.tsx — تظهر فقط عند اختيار طريقة دفع "شبكة") —
// تُخزَّن تحت مسار "payments/" منفصل.
export async function uploadPaymentReceipt(appointmentId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `payments/${appointmentId}/receipt-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}
// الخدمة" العامة (الإعدادات ← الطلبات الخارجية). الرابط الموقَّع يُخدَّم
// مباشرة داخل <img> على صفحة عامة بلا تسجيل دخول — ذلك يعمل بلا مشكلة
// لأن الرابط نفسه هو صلاحية الوصول (bearer-style)، لا حاجة لجعل الحاوية
// عامة. لا يوجد appointmentId/leaveId هنا لأن الصورة قد تُرفَع قبل حفظ
// بطاقة الخدمة نفسها (أثناء تعبئة نموذج إضافة خدمة جديدة).
export async function uploadLandingImage(dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `landing/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// نفس منطق uploadAppointmentPhoto أعلاه بالضبط، لصورة الهوية/الإقامة
// المرفقة بملف الموظف الشخصي (صفحة "الموظفين") — تُخزَّن تحت مسار
// "employees/" منفصل.
export async function uploadEmployeeIdPhoto(profileId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `employees/${profileId}/id-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// نفس منطق uploadEmployeeIdPhoto أعلاه بالضبط، لصورة استمارة المركبة
// (صفحة الإعدادات ← المركبات) — تُخزَّن تحت مسار "vehicles/" منفصل.
export async function uploadVehicleRegistrationPhoto(vehicleId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `vehicles/${vehicleId}/registration-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// نفس منطق uploadEmployeeIdPhoto أعلاه بالضبط، لنسخة عقد الموظف (صفحة
// المحاسبة ← الموظفين) — تُخزَّن تحت مسار "contracts/" منفصل. صورة أو PDF،
// نفس ما يقبله رفع فاتورة المصروف (parseDataUrl عامة أصلاً).
export async function uploadEmployeeContractFile(profileId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `contracts/${profileId}/contract-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// نفس منطق uploadExpenseInvoice أعلاه بالضبط، لفاتورة شراء أصل ثابت
// (صفحة المحاسبة ← الجرد والأصول الثابتة) — تُخزَّن تحت مسار "assets/"
// منفصل. صورة أو PDF، نفس ما يقبله رفع فاتورة المصروف.
export async function uploadAssetPurchaseInvoice(assetId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `assets/${assetId}/invoice-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}

// مرفق بند في سجل تواريخ الانتهاء (صورة أو PDF) — نفس منطق
// uploadAssetPurchaseInvoice أعلاه بالضبط، تحت مسار "expiry-docs/" منفصل.
export async function uploadDocumentExpiryAttachment(docId: string, dataUrl: string): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `expiry-docs/${docId}/attachment-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}
