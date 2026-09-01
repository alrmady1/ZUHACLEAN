import { Router, type Request } from 'express';
import { store, pendingWrites } from '../store/db.js';
import type { StoredProfile } from '../store/db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { uploadAppointmentPhoto, uploadLeavePhoto, uploadLandingImage } from '../lib/storage.js';
import { sendPushToProfiles, appointmentNotifyProfileIds, leadNotifyProfileIds } from '../lib/push.js';
import type {
  Appointment,
  Contract,
  VisitFrequency,
  Invoice,
  Service,
  PaymentMethodOption,
  ServiceCategory,
  ExpenseCategoryItem,
  CustodyInvoice,
  PermissionKey,
  UserRole,
  LeaveRecord,
  LeaveType,
  Rating,
  CustomerRating,
  Quote,
  Lead,
  LeadStatus,
  LandingPageSettings,
  LandingService,
  VisitOutcome,
} from '../../shared/types.js';
import {
  VAT_RATE,
  CUSTODY_CATEGORY_NAME,
  ADVANCE_CATEGORY_NAME,
  DEFAULT_PERMISSIONS,
  PERMISSION_LABELS_AR,
  LEAVE_TYPE_LABELS_AR,
  LEAD_STATUS_LABELS_AR,
  VISIT_OUTCOME_LABELS_AR,
} from '../../shared/types.js';
import { normalizeSaudiPhone } from '../../shared/phone.js';

export const api = Router();

// على Vercel (بلا خادم) يُجمَّد تنفيذ الدالة بعد إرسال الاستجابة مباشرة —
// أي كتابة persist() لم تكتمل بعد قد تُفقَد بصمت. بدل تحويل كل مسار في
// هذا الملف إلى async/await على كل استدعاء store.*، تعترض هذه الوسيطة
// res.end() نفسها (النقطة المشتركة التي يمر منها json/send/end جميعاً في
// Express) وتؤخّر إرسال الاستجابة فعلياً حتى تكتمل كل كتابات persist()
// التي أطلقها هذا الطلب (pendingWrites، انظر src/server/store/db.ts).
api.use((_req, res, next) => {
  const originalEnd = res.end.bind(res);
  res.end = ((...args: Parameters<typeof res.end>) => {
    pendingWrites().finally(() => {
      originalEnd(...args);
    });
    return res;
  }) as typeof res.end;
  next();
});

// ---------------------------------------------------------------------------
// سجل العمليات — الإعدادات ← سجل العمليات (مقيَّد للمدير العام ومدير
// النظام فقط، ACTIVITY_LOG_ACCESS_ROLES). العميل يرسل هوية المستخدم
// الحالي تلقائياً مع كل طلب تعديل/إضافة/حذف عبر ترويسة X-Actor-Id (انظر
// src/client/lib/api.ts) — لا حاجة لتمريرها يدوياً في كل نقطة، فقط
// استدعاء logActivity(req, 'وصف العملية') بعد نجاح كل عملية مؤثرة.
// ---------------------------------------------------------------------------
function actorFromReq(req: Request): { id?: string; name?: string } {
  const id = typeof req.headers['x-actor-id'] === 'string' ? req.headers['x-actor-id'] : undefined;
  const name = id ? store.profiles.list().find((p) => p.id === id)?.full_name : undefined;
  return { id, name };
}

function logActivity(req: Request, action: string): void {
  const { id, name } = actorFromReq(req);
  store.activityLog.insert({
    id: store.id(),
    action,
    actor_id: id,
    actor_name: name ?? 'مستخدم غير معروف',
    created_at: new Date().toISOString(),
  });
}

// مقيَّدة في الواجهة فقط (view_activity_log الديناميكية للاطلاع،
// ACTIVITY_LOG_DELETE_ROLES الثابتة للحذف) — لا تحقق صلاحيات من جهة
// الخادم، مطابقةً لبقية نقاط التحكم في هذا الملف.
api.get('/activity-log', (_req, res) => res.json(store.activityLog.list()));

// حذف جماعي لسطور من سجل العمليات (تحديد سطر أو الكل ثم زر حذف من
// ActivityLogTab) — محصور بالمدير العام في الواجهة فقط.
api.delete('/activity-log', (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'ids (مصفوفة معرّفات نصية) مطلوبة' });
  }
  const removed = store.activityLog.removeMany(ids);
  if (removed > 0) logActivity(req, `تم حذف ${removed} من سجلات العمليات`);
  res.json({ removed });
});

// ---------------------------------------------------------------------------
// Permissions — صفحة الإعدادات ← الصلاحيات (المدير العام ومدير النظام،
// مقيَّد في الواجهة فقط عبر PERMISSIONS_ACCESS_ROLES، كبقية نقاط التحكم في
// هذا الملف). القراءة تدمج القيم المحفوظة مع DEFAULT_PERMISSIONS بحيث أي
// صلاحية لم تُعدَّل يدوياً بعد — أو أُضيفت حديثاً للكود — تُقرأ بقيمتها
// الافتراضية دون الحاجة لأي migration على البيانات المخزَّنة.
// ---------------------------------------------------------------------------
// ترتيب الصفوف الحالي: كل مفتاح محفوظ في permissionsOrder (بترتيبه)، ثم أي
// صلاحية جديدة أُضيفت للكود ولم تُدرَج في الترتيب المحفوظ بعد — تُذيَّل
// تلقائياً في النهاية بترتيبها الطبيعي في PERMISSION_LABELS_AR.
function orderedPermissionKeys(): PermissionKey[] {
  const allKeys = Object.keys(PERMISSION_LABELS_AR) as PermissionKey[];
  const known = new Set<string>(allKeys);
  const savedOrder = store.permissionsOrder.list().filter((k) => known.has(k)) as PermissionKey[];
  const missing = allKeys.filter((k) => !savedOrder.includes(k));
  return [...savedOrder, ...missing];
}

api.get('/permissions', (_req, res) => {
  const stored = store.permissions.list();
  // كائن JS يحافظ على ترتيب إدخال مفاتيحه النصية — بناء الاستجابة بهذا
  // الترتيب يكفي لتُعرَض بنفس الترتيب في جدول العميل (Object.entries).
  const merged: Record<string, { label: string; roles: UserRole[] }> = {};
  for (const key of orderedPermissionKeys()) {
    merged[key] = { label: PERMISSION_LABELS_AR[key], roles: stored[key] ?? DEFAULT_PERMISSIONS[key] };
  }
  res.json(merged);
});

// يجب تسجيلها قبل '/permissions/:key' أدناه، وإلا التقطها ذلك المسار
// الأعم (بمعاملة "order" كأنه مفتاح صلاحية).
api.patch('/permissions/order', (req, res) => {
  const order = Array.isArray(req.body?.order) ? (req.body.order as string[]) : [];
  const updated = store.permissionsOrder.update(order);
  logActivity(req, 'تم إعادة ترتيب جدول الصلاحيات');
  res.json(updated);
});

api.patch('/permissions/:key', (req, res) => {
  const key = req.params.key as PermissionKey;
  if (!(key in PERMISSION_LABELS_AR)) return res.status(404).json({ error: 'unknown permission key' });
  const roles = Array.isArray(req.body?.roles) ? (req.body.roles as UserRole[]) : [];
  const updated = store.permissions.update(key, roles);
  logActivity(req, `تم تعديل صلاحية "${PERMISSION_LABELS_AR[key]}"`);
  res.json(updated);
});

// Strip the password hash before a profile ever leaves the server.
function toSafeProfile(p: StoredProfile) {
  const { password_hash, ...safe } = p;
  return safe;
}

// ---------------------------------------------------------------------------
// Profiles / users — managed from Settings (add users, edit name/role,
// set username + password).
// ---------------------------------------------------------------------------
api.get('/profiles', (_req, res) => res.json(store.profiles.list().map(toSafeProfile)));

// Real username/password sign-in. Credentials are set per-user from
// Settings → المستخدمون (تعديل).
api.post('/auth/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }
  const profile = store.profiles.list().find((p) => p.username === username);
  if (!profile || !profile.password_hash || !verifyPassword(password, profile.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  if (!profile.is_active) {
    return res.status(403).json({ error: 'هذا الحساب موقوف، تواصل مع الإدارة' });
  }
  res.json(toSafeProfile(profile));
});

api.post('/profiles', (req, res) => {
  const body = req.body ?? {};
  if (!body.full_name || !body.role) {
    return res.status(400).json({ error: 'full_name و role مطلوبة' });
  }
  const now = new Date().toISOString();
  const profile = store.profiles.insert({
    id: store.id(),
    full_name: body.full_name,
    email: body.email ?? '',
    phone: body.phone ? normalizeSaudiPhone(body.phone) : undefined,
    role: body.role,
    supervisor_id: body.supervisor_id || undefined,
    username: body.username || undefined,
    password_hash: body.password ? hashPassword(body.password) : undefined,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  logActivity(req, `تم إضافة مستخدم "${profile.full_name}"`);
  res.status(201).json(toSafeProfile(profile));
});

api.patch('/profiles/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<StoredProfile> = {};
  if (body.full_name !== undefined) patch.full_name = body.full_name;
  if (body.email !== undefined) patch.email = body.email;
  if (body.phone !== undefined) patch.phone = body.phone ? normalizeSaudiPhone(body.phone) : undefined;
  if (body.role !== undefined) patch.role = body.role;
  if (body.supervisor_id !== undefined) patch.supervisor_id = body.supervisor_id || undefined;
  if (body.weekly_days_off !== undefined) patch.weekly_days_off = Array.isArray(body.weekly_days_off) ? body.weekly_days_off : [];
  if (body.username !== undefined) patch.username = body.username || undefined;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.password) patch.password_hash = hashPassword(body.password);

  const updated = store.profiles.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل بيانات المستخدم "${updated.full_name}"`);
  res.json(toSafeProfile(updated));
});

api.delete('/profiles/:id', (req, res) => {
  const target = store.profiles.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'not found' });
  // Never allow the last general_manager account to be removed — that
  // would lock everyone out of the Settings/Users screen entirely.
  if (target.role === 'general_manager') {
    const managerCount = store.profiles.list().filter((p) => p.role === 'general_manager').length;
    if (managerCount <= 1) {
      return res.status(400).json({ error: 'لا يمكن حذف آخر حساب مدير عام في النظام' });
    }
  }
  store.profiles.remove(req.params.id);
  logActivity(req, `تم حذف المستخدم "${target.full_name}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Leaves — إجازات سنوية (مرضية/اضطرارية/غياب/بدون راتب) لمشرف ميداني أو
// فني، مقيَّدة في الواجهة عبر صلاحية edit_days_off. عدد الأيام يُحسب هنا
// دائماً من التاريخين — لا يُعتمَد على أي قيمة يرسلها العميل.
// ---------------------------------------------------------------------------
function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(diffDays, 0);
}

api.get('/leaves', (_req, res) => res.json(store.leaves.list()));

api.post('/leaves', async (req, res) => {
  const body = req.body ?? {};
  if (!body.profile_id || !body.leave_type || !body.start_date || !body.end_date) {
    return res.status(400).json({ error: 'profile_id، leave_type، start_date، end_date مطلوبة' });
  }
  if (!(body.leave_type in LEAVE_TYPE_LABELS_AR)) {
    return res.status(400).json({ error: 'نوع إجازة غير معروف' });
  }
  if (body.leave_type === 'other' && !body.other_type_label) {
    return res.status(400).json({ error: 'يجب كتابة نوع الإجازة عند اختيار "أخرى"' });
  }
  if (body.end_date < body.start_date) {
    return res.status(400).json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء' });
  }
  const leave: LeaveRecord = {
    id: store.id(),
    profile_id: body.profile_id,
    leave_type: body.leave_type as LeaveType,
    other_type_label: body.leave_type === 'other' ? body.other_type_label : undefined,
    start_date: body.start_date,
    end_date: body.end_date,
    days_count: daysBetweenInclusive(body.start_date, body.end_date),
    notes: body.notes || undefined,
    created_at: new Date().toISOString(),
  };
  // صورة داعمة اختيارية (مثل تقرير طبي) — يرسلها العميل كـ base64 data URL،
  // نرفعها إلى Supabase Storage ونحفظ رابطها فقط (نفس منطق صور المواعيد).
  if (body.photo_data_url) {
    try {
      leave.photo_url = await uploadLeavePhoto(leave.id, body.photo_data_url);
    } catch (err) {
      console.error('❌ فشل رفع صورة الإجازة إلى Supabase Storage:', err);
      return res.status(500).json({ error: 'فشل رفع الصورة' });
    }
  }
  store.leaves.insert(leave);
  const leaveOwner = store.profiles.get(leave.profile_id)?.full_name ?? 'موظف';
  logActivity(req, `تم إضافة إجازة لـ "${leaveOwner}" من ${leave.start_date} إلى ${leave.end_date}`);
  res.status(201).json(leave);
});

api.delete('/leaves/:id', (req, res) => {
  const target = store.leaves.list().find((l) => l.id === req.params.id);
  const removed = store.leaves.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  const leaveOwner = target ? (store.profiles.get(target.profile_id)?.full_name ?? 'موظف') : 'موظف';
  logActivity(req, `تم حذف إجازة لـ "${leaveOwner}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// تقييم العميل — صفحة عامة تُفتح من رابط يُرسَل عبر واتساب بعد اكتمال
// الخدمة وإصدار الفاتورة (انظر AppointmentDetailModal وRatePage.tsx). بلا
// تسجيل دخول عمداً، لذا تُعيد GET أدناه أقل بيانات ممكنة عن الموعد (وليس
// كامل السجل) حتى لا تُعرِّض بيانات العميل أو الشركة لمن يملك الرابط فقط.
// ---------------------------------------------------------------------------
api.get('/public/appointments/:id', (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'الموعد غير موجود' });
  res.json({
    id: appt.id,
    customer_name_snapshot: appt.customer_name_snapshot ?? store.customers.get(appt.customer_id)?.name ?? '',
    service_name_snapshot: appt.service_name_snapshot,
    scheduled_at: appt.scheduled_at,
    already_rated: !!store.ratings.getByAppointment(appt.id),
  });
});

api.post('/public/ratings', async (req, res) => {
  const { appointment_id, stars, comment } = req.body ?? {};
  const appt = store.appointments.get(appointment_id);
  if (!appt) return res.status(404).json({ error: 'الموعد غير موجود' });
  const starsNum = Number(stars);
  if (!Number.isInteger(starsNum) || starsNum < 1 || starsNum > 5) {
    return res.status(400).json({ error: 'التقييم يجب أن يكون من 1 إلى 5 نجوم' });
  }
  if (store.ratings.getByAppointment(appointment_id)) {
    return res.status(409).json({ error: 'تم إرسال تقييمك مسبقاً لهذا الموعد، شكراً لك' });
  }
  const rating: Rating = {
    id: store.id(),
    appointment_id,
    customer_id: appt.customer_id,
    customer_name_snapshot: appt.customer_name_snapshot ?? store.customers.get(appt.customer_id)?.name ?? 'عميل',
    stars: starsNum,
    comment: typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 500) : undefined,
    created_at: new Date().toISOString(),
  };
  store.ratings.insert(rating);
  res.status(201).json(rating);
});

api.get('/ratings', (_req, res) => res.json(store.ratings.list()));

api.delete('/ratings/:id', (req, res) => {
  const removed = store.ratings.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, 'تم حذف تقييم عميل للخدمة');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// تقييم المشرف للعميل — عكس ratings أعلاه (تقييم العميل للخدمة). يُدخَل من
// داخل التطبيق (تبويب "المهام المكتملة")، لا رابط عام. موعد واحد = تقييم
// عميل واحد فقط لكنه يُستبدَل بإعادة الإرسال (upsert) لا يُمنَع.
// ---------------------------------------------------------------------------
api.get('/customer-ratings', (_req, res) => res.json(store.customerRatings.list()));

api.post('/customer-ratings', (req, res) => {
  const { appointment_id, stars, notes, rated_by } = req.body ?? {};
  const appt = store.appointments.get(appointment_id);
  if (!appt) return res.status(404).json({ error: 'الموعد غير موجود' });
  const starsNum = Number(stars);
  if (!Number.isInteger(starsNum) || starsNum < 1 || starsNum > 5) {
    return res.status(400).json({ error: 'التقييم يجب أن يكون من 1 إلى 5 نجوم' });
  }
  const rater = rated_by ? store.profiles.list().find((p) => p.id === rated_by) : undefined;
  const existing = store.customerRatings.getByAppointment(appointment_id);
  const rating: CustomerRating = {
    id: existing?.id ?? store.id(),
    appointment_id,
    customer_id: appt.customer_id,
    customer_name_snapshot: appt.customer_name_snapshot ?? store.customers.get(appt.customer_id)?.name,
    rated_by: rated_by || existing?.rated_by,
    rated_by_name: rater?.full_name ?? existing?.rated_by_name,
    stars: starsNum,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 1000) : undefined,
    created_at: existing?.created_at ?? new Date().toISOString(),
    updated_at: existing ? new Date().toISOString() : undefined,
  };
  store.customerRatings.upsert(rating);
  logActivity(req, `تم ${existing ? 'تعديل' : 'إضافة'} تقييم للعميل "${rating.customer_name_snapshot ?? 'عميل'}"`);
  res.status(existing ? 200 : 201).json(rating);
});

api.delete('/customer-ratings/:id', (req, res) => {
  const removed = store.customerRatings.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, 'تم حذف تقييم عميل');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Push notifications — تفعيل التنبيهات الفورية لهذا الجهاز من الإعدادات.
// كل جهاز (متصفح/تثبيت PWA) يشترك بشكل مستقل — نفس المستخدم على جهازين
// يملك اشتراكين منفصلين، وكلاهما يستقبل التنبيه.
// ---------------------------------------------------------------------------
api.get('/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

api.post('/push/subscribe', (req, res) => {
  const { profile_id, subscription } = req.body ?? {};
  if (!profile_id || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'profile_id و subscription (endpoint + keys) مطلوبة' });
  }
  store.pushSubscriptions.insert({
    id: store.id(),
    profile_id,
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    created_at: new Date().toISOString(),
  });
  res.status(201).json({ ok: true });
});

api.post('/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint مطلوب' });
  store.pushSubscriptions.removeByEndpoint(endpoint);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
api.get('/customers', (_req, res) => res.json(store.customers.list()));

api.post('/customers', (req, res) => {
  const { name, phone, address, district, city, location_url, notes } = req.body ?? {};
  if (!name || !phone || !address) {
    return res.status(400).json({ error: 'name, phone و address مطلوبة' });
  }
  const customer = store.customers.insert({
    id: store.id(),
    name,
    phone: normalizeSaudiPhone(phone),
    address,
    district,
    city,
    location_url,
    notes,
    created_at: new Date().toISOString(),
  });
  logActivity(req, `تم إضافة عميل "${customer.name}"`);
  res.status(201).json(customer);
});

api.patch('/customers/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<{ name: string; phone: string; address: string; district?: string; city?: string; location_url?: string; notes?: string }> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = normalizeSaudiPhone(body.phone);
  if (body.address !== undefined) patch.address = body.address;
  if (body.district !== undefined) patch.district = body.district || undefined;
  if (body.city !== undefined) patch.city = body.city || undefined;
  if (body.location_url !== undefined) patch.location_url = body.location_url || undefined;
  if (body.notes !== undefined) patch.notes = body.notes || undefined;

  const updated = store.customers.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل بيانات العميل "${updated.name}"`);
  res.json(updated);
});

api.delete('/customers/:id', (req, res) => {
  const target = store.customers.get(req.params.id);
  const removed = store.customers.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف العميل "${target?.name ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Services — managed from Settings (name, price, expected duration).
// ---------------------------------------------------------------------------
api.get('/services', (_req, res) => res.json(store.services.list()));

api.post('/services', (req, res) => {
  const body = req.body ?? {};
  if (!body.name) return res.status(400).json({ error: 'name مطلوب' });
  const service: Service = {
    id: store.id(),
    name: body.name,
    description: body.description || undefined,
    category: body.category || undefined,
    default_price: Number(body.default_price ?? 0),
    default_duration_minutes: Number(body.default_duration_minutes ?? 60),
    is_active: body.is_active ?? true,
  };
  store.services.insert(service);
  logActivity(req, `تم إضافة خدمة "${service.name}"`);
  res.status(201).json(service);
});

api.patch('/services/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<Service> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description || undefined;
  if (body.category !== undefined) patch.category = body.category || undefined;
  if (body.default_price !== undefined) patch.default_price = Number(body.default_price);
  if (body.default_duration_minutes !== undefined) patch.default_duration_minutes = Number(body.default_duration_minutes);
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  const updated = store.services.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل خدمة "${updated.name}"`);
  res.json(updated);
});

api.delete('/services/:id', (req, res) => {
  const target = store.services.get(req.params.id);
  const removed = store.services.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف خدمة "${target?.name ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Service categories — managed from the services catalog. Renaming or
// deleting one cascades to every service that used it (see store).
// ---------------------------------------------------------------------------
api.get('/service-categories', (_req, res) => res.json(store.serviceCategories.list()));

api.post('/service-categories', (req, res) => {
  const body = req.body ?? {};
  if (!body.name) return res.status(400).json({ error: 'name مطلوب' });
  const category: ServiceCategory = { id: store.id(), name: body.name };
  store.serviceCategories.insert(category);
  logActivity(req, `تم إضافة تصنيف خدمة "${category.name}"`);
  res.status(201).json(category);
});

api.patch('/service-categories/:id', (req, res) => {
  const body = req.body ?? {};
  if (!body.name) return res.status(400).json({ error: 'name مطلوب' });
  const updated = store.serviceCategories.update(req.params.id, { name: body.name });
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل تصنيف خدمة إلى "${updated.name}"`);
  res.json(updated);
});

api.delete('/service-categories/:id', (req, res) => {
  const target = store.serviceCategories.list().find((c) => c.id === req.params.id);
  const removed = store.serviceCategories.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف تصنيف خدمة "${target?.name ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
api.get('/appointments', (req, res) => {
  const { supervisor_id } = req.query;
  let list = store.appointments.list();
  if (supervisor_id && typeof supervisor_id === 'string') {
    list = list.filter((a) => a.supervisor_id === supervisor_id);
  }
  res.json(list);
});

api.post('/appointments', (req, res) => {
  const body = req.body ?? {};
  const appointment: Appointment = {
    id: store.id(),
    customer_id: body.customer_id,
    customer_name_snapshot: store.customers.get(body.customer_id)?.name,
    service_id: body.service_id,
    // Prefer the client-supplied snapshot (it may combine several service
    // names into one appointment) and only fall back to a fresh lookup.
    service_name_snapshot: body.service_name_snapshot || store.services.get(body.service_id)?.name || '',
    scheduled_at: body.scheduled_at,
    expected_duration_minutes: body.expected_duration_minutes ?? 120,
    amount: body.amount ?? 0,
    status: 'scheduled',
    supervisor_id: body.supervisor_id,
    address_snapshot: body.address_snapshot ?? '',
    location_url: body.location_url,
    notes: body.notes,
    total_paid: 0,
    remaining_amount: body.amount ?? 0,
    payment_status: 'unpaid',
    assignments: body.assignments ?? [],
    photos: [],
    payments: [],
    created_at: new Date().toISOString(),
    created_by: body.created_by || undefined,
    created_by_name: body.created_by ? store.profiles.list().find((p) => p.id === body.created_by)?.full_name : undefined,
    // زيارة معاينة (لا خدمة أو سعر محدد بعد) بدل موعد خدمة عادي — انظر
    // AppointmentKind في shared/types.ts. غائب/'service' لا يغيّر شيئاً.
    kind: body.kind === 'visit' ? 'visit' : undefined,
  };
  store.appointments.insert(appointment);
  logActivity(
    req,
    appointment.kind === 'visit'
      ? `تم تحديد زيارة معاينة للعميل "${appointment.customer_name_snapshot ?? ''}"`
      : `تم إضافة موعد للعميل "${appointment.customer_name_snapshot ?? ''}"`,
  );
  res.status(201).json(appointment);

  // تنبيه فوري (Web Push) لكل من له علاقة بالموعد: المشرف والفني
  // المُسنَدان، بالإضافة إلى المدير العام ومدير النظام دائماً لكل موعد —
  // لا يُنتظر (لا يُبطئ الاستجابة، ويُهمَل بصمت لو لم يُضبط VAPID بعد).
  // زيارة المعاينة تحديداً تصل أيضاً للمشرفين الإداريين (بجانب المشرف
  // الميداني المُسنَد ومدير النظام)، بطلب صريح — appointmentNotifyProfileIds
  // وحدها لا تشملهم.
  const technicianIds = appointment.assignments.map((a) => a.technician_id);
  const notifyIds =
    appointment.kind === 'visit'
      ? [...new Set([...appointmentNotifyProfileIds(appointment.supervisor_id, technicianIds), ...leadNotifyProfileIds()])]
      : appointmentNotifyProfileIds(appointment.supervisor_id, technicianIds);
  const when = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(appointment.scheduled_at),
  );
  sendPushToProfiles(notifyIds, {
    title: appointment.kind === 'visit' ? 'زيارة معاينة جديدة' : 'موعد جديد',
    body: `${appointment.customer_name_snapshot ?? 'عميل'} — ${when}`,
    url: '/appointments',
    tag: `appointment-${appointment.id}`,
  }).catch((err) => console.error('❌ فشل إرسال تنبيه الموعد الجديد:', err));
});

const APPT_STATUS_LABEL_AR: Record<string, string> = {
  scheduled: 'مجدولة',
  on_the_way: 'في الطريق',
  in_progress: 'جارية',
  completed: 'مكتملة',
  delayed: 'مؤجلة',
  cancelled: 'ملغاة',
};

// موعد واحد له مسارات تعديل مختلفة جداً من نفس نقطة النهاية هذه (حالة،
// فريق، وقت، خدمة، موقع...) — يُخمَّن وصف العملية من الحقول الفعلية
// الموجودة في الطلب بترتيب أولوية، بدل رسالة عامة واحدة لا تفيد قارئ
// السجل بشيء.
function describeAppointmentPatch(patch: Record<string, unknown>, customerName: string): string {
  if (typeof patch.visit_outcome === 'string') {
    return `تمت زيارة العميل "${customerName}" — ${VISIT_OUTCOME_LABELS_AR[patch.visit_outcome as VisitOutcome] ?? patch.visit_outcome}`;
  }
  if (typeof patch.status === 'string') {
    return `تم تحديث حالة موعد "${customerName}" إلى: ${APPT_STATUS_LABEL_AR[patch.status] ?? patch.status}`;
  }
  if (patch.service_id !== undefined || patch.service_name_snapshot !== undefined) {
    return `تم تعديل نوع الخدمة لموعد "${customerName}"`;
  }
  if (patch.scheduled_at !== undefined) {
    return `تم تعديل وقت موعد "${customerName}"`;
  }
  if (patch.supervisor_id !== undefined || patch.assignments !== undefined) {
    return `تم تعديل الفريق المسند لموعد "${customerName}"`;
  }
  if (patch.location_url !== undefined) {
    return `تم تعديل رابط موقع موعد "${customerName}"`;
  }
  return `تم تعديل بيانات موعد "${customerName}"`;
}

api.patch('/appointments/:id', (req, res) => {
  const patch = { ...(req.body ?? {}) };
  // تعديل السعر (مثلاً عند تغيير نوع الخدمة من تفاصيل الموعد) يجب أن
  // يعيد حساب المتبقي وحالة الدفع فوراً بنفس صيغة تحصيل الدفعات أدناه،
  // وإلا بقي "المتبقي" يعكس السعر القديم رغم تغيّر قيمة الخدمة نفسها.
  if (typeof patch.amount === 'number') {
    const appt = store.appointments.get(req.params.id);
    if (appt) {
      const remaining_amount = Math.max(patch.amount - appt.total_paid, 0);
      patch.remaining_amount = remaining_amount;
      patch.payment_status = remaining_amount === 0 ? 'paid' : appt.total_paid > 0 ? 'partial' : 'unpaid';
    }
  }
  // رفع نتيجة زيارة معاينة (نوع التنظيف المطلوب + السعر ثم الحالة) —
  // ينهي الزيارة نفسها فوراً (لا مراحل لاحقة عليها كموعد خدمة عادي).
  const isVisitOutcome = typeof patch.visit_outcome === 'string';
  if (isVisitOutcome) {
    patch.visit_outcome_at = new Date().toISOString();
    if (!patch.status) patch.status = 'completed';
  }
  const updated = store.appointments.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, describeAppointmentPatch(patch, updated.customer_name_snapshot ?? ''));
  res.json(updated);

  // تنبيه فوري للإدارة (المدير العام، مدير النظام، المشرفين الإداريين)
  // بانتهاء زيارة المعاينة ونتيجتها — لا يُنتظر، ويُهمَل بصمت لو لم يُضبط
  // VAPID بعد.
  if (isVisitOutcome) {
    sendPushToProfiles(leadNotifyProfileIds(), {
      title: 'اكتملت زيارة معاينة',
      body: `${updated.customer_name_snapshot ?? 'عميل'} — ${VISIT_OUTCOME_LABELS_AR[patch.visit_outcome as VisitOutcome] ?? patch.visit_outcome}`,
      url: '/appointments',
      tag: `visit-${updated.id}`,
    }).catch((err) => console.error('❌ فشل إرسال تنبيه اكتمال الزيارة:', err));
  }
});

// حذف الموعد بالكامل — للمدير العام فقط (مقيَّد في الواجهة عبر
// CAN_DELETE_APPOINTMENT_ROLES؛ لا يوجد تحقق صلاحيات من جهة الخادم في هذا
// التطبيق أصلاً، مطابقةً لبقية نقاط التحكم بالصلاحيات هنا).
api.delete('/appointments/:id', (req, res) => {
  const target = store.appointments.get(req.params.id);
  const removed = store.appointments.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف موعد العميل "${target?.customer_name_snapshot ?? ''}"`);
  res.status(204).end();
});

// Technician: attach a before/after photo. The client sends a base64 data
// URL; we upload it to Supabase Storage and keep only the resulting URL
// (never the raw base64) on the appointment record.
api.post('/appointments/:id/photos', async (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'not found' });
  const { stage, data_url } = req.body ?? {};
  if (!stage || !data_url) return res.status(400).json({ error: 'stage و data_url مطلوبان' });
  try {
    const url = await uploadAppointmentPhoto(appt.id, stage, data_url);
    appt.photos.push({ id: store.id(), stage, data_url: url, taken_at: new Date().toISOString() });
    store.appointments.update(appt.id, { photos: appt.photos });
    const stageLabel = stage === 'before' ? 'قبل العمل' : stage === 'after' ? 'بعد العمل' : 'الموقع الحالي';
    logActivity(req, `تم إضافة صورة ${stageLabel} لموعد "${appt.customer_name_snapshot ?? ''}"`);
    res.status(201).json(appt);
  } catch (err) {
    console.error('❌ فشل رفع الصورة إلى Supabase Storage:', err);
    res.status(500).json({ error: 'فشل رفع الصورة' });
  }
});

// Remove a wrongly-attached or test photo from an appointment. Only the
// database reference is removed — the object stays in Supabase Storage
// (private bucket, harmless to leave orphaned) to keep this simple.
api.delete('/appointments/:id/photos/:photoId', (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'not found' });
  const nextPhotos = appt.photos.filter((p) => p.id !== req.params.photoId);
  if (nextPhotos.length === appt.photos.length) return res.status(404).json({ error: 'photo not found' });
  const updated = store.appointments.update(appt.id, { photos: nextPhotos });
  logActivity(req, `تم حذف صورة توثيق لموعد "${appt.customer_name_snapshot ?? ''}"`);
  res.json(updated);
});

// Technician: record a field payment
api.post('/appointments/:id/payments', (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'not found' });
  const { amount, method } = req.body ?? {};
  appt.payments.push({ id: store.id(), amount, method, recorded_at: new Date().toISOString() });
  const total_paid = appt.payments.reduce((s, p) => s + p.amount, 0);
  const remaining_amount = Math.max(appt.amount - total_paid, 0);
  const payment_status = remaining_amount === 0 ? 'paid' : total_paid > 0 ? 'partial' : 'unpaid';
  const updated = store.appointments.update(appt.id, { total_paid, remaining_amount, payment_status });
  logActivity(req, `تم تسجيل دفعة ${amount} ر.س لموعد "${appt.customer_name_snapshot ?? ''}"`);
  res.status(201).json(updated);
});

// Correct an already-recorded payment amount/method — gated client-side to
// المدير العام / مدير النظام (see CAN_EDIT_PAYMENTS_ROLES).
api.patch('/appointments/:id/payments/:paymentId', (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'not found' });
  const payment = appt.payments.find((p) => p.id === req.params.paymentId);
  if (!payment) return res.status(404).json({ error: 'payment not found' });
  const { amount, method } = req.body ?? {};
  if (amount !== undefined) payment.amount = Number(amount);
  if (method !== undefined) payment.method = method;
  const total_paid = appt.payments.reduce((s, p) => s + p.amount, 0);
  const remaining_amount = Math.max(appt.amount - total_paid, 0);
  const payment_status = remaining_amount === 0 ? 'paid' : total_paid > 0 ? 'partial' : 'unpaid';
  const updated = store.appointments.update(appt.id, { payments: appt.payments, total_paid, remaining_amount, payment_status });
  logActivity(req, `تم تعديل دفعة لموعد "${appt.customer_name_snapshot ?? ''}"`);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Contracts + automatic visit generation engine
// ---------------------------------------------------------------------------
api.get('/contracts', (_req, res) => res.json(store.contracts.list()));

function addFrequency(date: Date, freq: VisitFrequency): Date {
  const d = new Date(date);
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  else if (freq === 'bi_weekly') d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// getDay() index (0=Sunday..6=Saturday) — matches the keys the client's
// weekday checkboxes send.
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const WEEKDAY_KEY_BY_INDEX: Record<number, string> = Object.fromEntries(
  Object.entries(WEEKDAY_INDEX).map(([key, idx]) => [idx, key]),
);

function generateAppointmentsForContract(contract: Contract): Appointment[] {
  const customer = store.customers.get(contract.customer_id);
  const service = store.services.get(contract.service_id);
  const [visitHour, visitMinute] = (contract.visit_time ?? '09:00').split(':').map(Number);
  const start = new Date(`${contract.start_date}T${contract.visit_time ?? '09:00'}:00`);
  const end = new Date(contract.end_date);

  const dates: Date[] = [];
  const selectedDayIndices = (contract.visit_days_of_week ?? [])
    .map((d) => WEEKDAY_INDEX[d])
    .filter((n) => n !== undefined);

  if (contract.visit_frequency === 'weekly' && selectedDayIndices.length > 0) {
    // أكثر من زيارة في الأسبوع الواحد (مثلاً الأحد والثلاثاء والخميس) —
    // نمشي يوماً بيوم من تاريخ البدء حتى الانتهاء، ونُبقي فقط الأيام التي
    // تطابق أحد الأيام المختارة.
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= endDay && dates.length < 400) {
      if (selectedDayIndices.includes(cursor.getDay())) {
        const visit = new Date(cursor);
        visit.setHours(visitHour || 9, visitMinute || 0, 0, 0);
        dates.push(visit);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    // Pass 1: walk the frequency to find every visit date, so we know the
    // real visit count before splitting total_amount across visits (the
    // contract form doesn't ask the user for total_visits directly).
    // Also the fallback for bi_weekly/monthly contracts and for legacy
    // weekly contracts saved before visit_days_of_week existed — those
    // keep visiting on start_date's own weekday, one visit per cycle.
    let cursor = start;
    while (cursor <= end && dates.length < 200) {
      dates.push(new Date(cursor));
      cursor = addFrequency(cursor, contract.visit_frequency);
    }
  }

  const perVisitAmount = dates.length > 0 ? contract.total_amount / dates.length : 0;
  const roundedAmount = Math.round(perVisitAmount * 100) / 100;

  // Pass 2: build the actual appointment records now that the per-visit
  // amount is known.
  return dates.map((date) => ({
    id: store.id(),
    customer_id: contract.customer_id,
    customer_name_snapshot: customer?.name,
    service_id: contract.service_id,
    service_name_snapshot: contract.service_name_snapshot || service?.name || '',
    scheduled_at: date.toISOString(),
    expected_duration_minutes: service?.default_duration_minutes ?? 120,
    amount: roundedAmount,
    status: 'scheduled',
    // مشرف اليوم المحدَّد (day_supervisors) له الأولوية على المشرف
    // الافتراضي للعقد — بسبب احتمال اختلاف المشرف من يوم لآخر.
    supervisor_id: contract.day_supervisors?.[WEEKDAY_KEY_BY_INDEX[date.getDay()]] || contract.supervisor_id,
    address_snapshot: customer?.address ?? '',
    location_url: customer?.location_url,
    contract_id: contract.id,
    contract_number: contract.contract_number,
    total_paid: 0,
    remaining_amount: roundedAmount,
    payment_status: 'unpaid',
    assignments: (contract.assigned_technician_ids ?? []).map((tid) => ({
      id: store.id(),
      technician_id: tid,
      technician_name: store.profiles.get(tid)?.full_name,
    })),
    photos: [],
    payments: [],
    created_at: new Date().toISOString(),
  }));
}

api.post('/contracts', (req, res) => {
  const body = req.body ?? {};
  const service = store.services.get(body.service_id);
  const contract: Contract = {
    id: store.id(),
    contract_number: body.contract_number ?? `CT-${new Date().getFullYear()}-${String(store.contracts.list().length + 1).padStart(3, '0')}`,
    customer_id: body.customer_id,
    service_id: body.service_id,
    service_name_snapshot: service?.name ?? '',
    contract_type: body.contract_type,
    visit_frequency: body.visit_frequency,
    visit_days_of_week: Array.isArray(body.visit_days_of_week) ? body.visit_days_of_week : undefined,
    visit_time: body.visit_time ?? '09:00',
    start_date: body.start_date,
    end_date: body.end_date,
    total_visits: Number(body.total_visits ?? 0),
    completed_visits: 0,
    total_amount: Number(body.total_amount ?? 0),
    paid_amount: 0,
    remaining_amount: Number(body.total_amount ?? 0),
    payment_status: 'unpaid',
    supervisor_id: body.supervisor_id,
    day_supervisors:
      body.day_supervisors && typeof body.day_supervisors === 'object' ? body.day_supervisors : undefined,
    assigned_technician_ids: body.assigned_technician_ids ?? [],
    status: 'active',
    notes: body.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.contracts.insert(contract);

  // Auto-generate the recurring visits and drop them straight into the
  // shared appointments schedule — this is the "auto appointment engine"
  // called out in the system blueprint.
  const generated = generateAppointmentsForContract(contract);
  store.appointments.insertMany(generated);
  store.contracts.update(contract.id, { total_visits: generated.length, remaining_amount: contract.total_amount });

  const contractCustomerName = store.customers.get(contract.customer_id)?.name ?? '';
  logActivity(req, `تم إضافة عقد "${contract.contract_number}" للعميل "${contractCustomerName}" (${generated.length} زيارة)`);
  res.status(201).json({ contract: store.contracts.get(contract.id), generated_appointments: generated.length });
});

// تعديل بيانات عقد قائم — مقيَّد في الواجهة عبر صلاحية edit_contracts.
// لا يعيد توليد المواعيد ولا يمسّها حتى لو تغيّر التكرار/الأيام/التاريخ؛
// المواعيد المولَّدة سابقاً تبقى كما هي (نفس منطق حذف العقد أدناه).
api.patch('/contracts/:id', (req, res) => {
  const updated = store.contracts.update(req.params.id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: 'العقد غير موجود' });
  logActivity(req, `تم تعديل العقد "${updated.contract_number}"`);
  res.json(updated);
});

// حذف عقد بالكامل — للمدير العام فقط (مقيَّد في الواجهة عبر
// CAN_DELETE_CONTRACT_ROLES). لا يحذف هذا المواعيد المولَّدة سابقاً من
// العقد — تبقى في جدول المواعيد كسجل تاريخي (نفس منطق حذف صور الموعد).
api.delete('/contracts/:id', (req, res) => {
  const target = store.contracts.get(req.params.id);
  const removed = store.contracts.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف العقد "${target?.contract_number ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
api.get('/expenses', (_req, res) => res.json(store.expenses.list()));

api.post('/expenses', (req, res) => {
  const body = req.body ?? {};
  const isCustody = body.category === CUSTODY_CATEGORY_NAME;
  const isAdvance = body.category === ADVANCE_CATEGORY_NAME;
  // كلا الصنفين (عهدة وسلفية) يحملان "موظفاً معنياً" بنفس الحقلين —
  // انظر التعليق على custody_holder_id في shared/types.ts.
  const linksEmployee = isCustody || isAdvance;
  const expense = store.expenses.insert({
    id: store.id(),
    title: body.title,
    category: body.category,
    sub_category: body.sub_category || undefined,
    period_type: body.period_type ?? 'daily',
    amount: Number(body.amount ?? 0),
    tax_amount: body.tax_amount ? Number(body.tax_amount) : undefined,
    date: body.date ?? new Date().toISOString().slice(0, 10),
    invoice_number: body.invoice_number,
    unit_or_vehicle_ref: body.unit_or_vehicle_ref,
    recorded_by: body.recorded_by ?? 'unknown',
    recorded_by_name: body.recorded_by_name,
    supervisor_id: body.supervisor_id,
    supervisor_name: body.supervisor_name,
    custody_holder_id: linksEmployee ? body.custody_holder_id || undefined : undefined,
    custody_holder_name: linksEmployee && body.custody_holder_id ? store.profiles.get(body.custody_holder_id)?.full_name : undefined,
    payment_method: body.payment_method ?? 'cash',
    notes: body.notes,
    created_at: new Date().toISOString(),
  });
  logActivity(
    req,
    isCustody
      ? `تم إضافة عهدة "${expense.amount} ر.س" لـ "${expense.custody_holder_name ?? ''}"`
      : isAdvance
        ? `تم إضافة سلفية "${expense.amount} ر.س" لـ "${expense.custody_holder_name ?? ''}"`
        : `تم إضافة مصروف "${expense.title}" بقيمة ${expense.amount} ر.س`,
  );
  res.status(201).json(expense);
});

// Deleting an expense (used for custody grants — see CAN_DELETE_CUSTODY_ROLES,
// المدير العام only) is unrestricted server-side like the rest of this app.
api.delete('/expenses/:id', (req, res) => {
  const target = store.expenses.list().find((e) => e.id === req.params.id);
  const removed = store.expenses.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  const isCustody = target?.category === CUSTODY_CATEGORY_NAME;
  const isAdvance = target?.category === ADVANCE_CATEGORY_NAME;
  logActivity(
    req,
    isCustody
      ? `تم حذف عهدة "${target?.custody_holder_name ?? ''}"`
      : isAdvance
        ? `تم حذف سلفية "${target?.custody_holder_name ?? ''}"`
        : `تم حذف مصروف "${target?.title ?? ''}"`,
  );
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Expense categories — two-level (main group + optional sub-item), managed
// from Settings → العهد والمصروفات. Renaming or deleting a group cascades
// into every expense that referenced it (see store); deleting a group also
// deletes its sub-items.
// ---------------------------------------------------------------------------
api.get('/expense-categories', (_req, res) => res.json(store.expenseCategories.list()));

api.post('/expense-categories', (req, res) => {
  const body = req.body ?? {};
  if (!body.name) return res.status(400).json({ error: 'name مطلوب' });
  const item: ExpenseCategoryItem = {
    id: store.id(),
    name: body.name,
    parent_id: body.parent_id || undefined,
    is_active: body.is_active ?? true,
  };
  store.expenseCategories.insert(item);
  logActivity(req, `تم إضافة تصنيف مصروفات "${item.name}"`);
  res.status(201).json(item);
});

api.patch('/expense-categories/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<ExpenseCategoryItem> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  const updated = store.expenseCategories.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل تصنيف مصروفات "${updated.name}"`);
  res.json(updated);
});

api.delete('/expense-categories/:id', (req, res) => {
  const target = store.expenseCategories.list().find((c) => c.id === req.params.id);
  const removed = store.expenseCategories.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف تصنيف مصروفات "${target?.name ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Custody invoices — receipts an employee submits to account for money
// spent out of their custody (عهدة). Each one deducts from that employee's
// running balance; the balance itself is derived on the client from the
// custody-category expenses (money handed to them) minus these invoices.
// ---------------------------------------------------------------------------
api.get('/custody-invoices', (req, res) => {
  const { custody_holder_id } = req.query;
  let list = store.custodyInvoices.list();
  if (custody_holder_id && typeof custody_holder_id === 'string') {
    list = list.filter((i) => i.custody_holder_id === custody_holder_id);
  }
  res.json(list);
});

api.post('/custody-invoices', (req, res) => {
  const body = req.body ?? {};
  if (!body.custody_holder_id || !body.title || body.amount === undefined) {
    return res.status(400).json({ error: 'custody_holder_id، title و amount مطلوبة' });
  }
  const invoice: CustodyInvoice = {
    id: store.id(),
    custody_holder_id: body.custody_holder_id,
    custody_holder_name: store.profiles.get(body.custody_holder_id)?.full_name ?? body.custody_holder_name,
    title: body.title,
    amount: Number(body.amount) || 0,
    invoice_number: body.invoice_number || undefined,
    date: body.date ?? new Date().toISOString().slice(0, 10),
    notes: body.notes || undefined,
    recorded_by: body.recorded_by || undefined,
    recorded_by_name: body.recorded_by_name || undefined,
    created_at: new Date().toISOString(),
  };
  store.custodyInvoices.insert(invoice);
  logActivity(req, `تم إضافة سند عهدة "${invoice.title}" لـ "${invoice.custody_holder_name ?? ''}"`);
  res.status(201).json(invoice);
});

// Deleting custody entries (grants or the invoices submitted against them)
// is gated client-side to المدير العام only (see CAN_DELETE_CUSTODY_ROLES).
api.delete('/custody-invoices/:id', (req, res) => {
  const target = store.custodyInvoices.list().find((i) => i.id === req.params.id);
  const removed = store.custodyInvoices.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف سند عهدة "${target?.title ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Payment methods — managed from Settings (cash / card / bank transfer by
// default, admins can add or rename more). Expense.payment_method and
// Payment.method just store the id of one of these as a free-form string.
// ---------------------------------------------------------------------------
api.get('/payment-methods', (_req, res) => res.json(store.paymentMethods.list()));

api.post('/payment-methods', (req, res) => {
  const body = req.body ?? {};
  if (!body.name) return res.status(400).json({ error: 'name مطلوب' });
  const method: PaymentMethodOption = {
    id: store.id(),
    name: body.name,
    is_active: body.is_active ?? true,
  };
  store.paymentMethods.insert(method);
  logActivity(req, `تم إضافة طريقة دفع "${method.name}"`);
  res.status(201).json(method);
});

api.patch('/payment-methods/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<PaymentMethodOption> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  const updated = store.paymentMethods.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل طريقة دفع "${updated.name}"`);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Invoices (VAT 15%)
// ---------------------------------------------------------------------------
api.get('/invoices', (req, res) => {
  const { appointment_id } = req.query;
  let list = store.invoices.list();
  if (appointment_id && typeof appointment_id === 'string') {
    list = list.filter((i) => i.appointment_id === appointment_id);
  }
  res.json(list);
});

api.post('/invoices', (req, res) => {
  const body = req.body ?? {};
  const customer = store.customers.get(body.customer_id);
  const subtotal = Number(body.subtotal ?? 0);
  const vat_amount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const invoice: Invoice = {
    id: store.id(),
    invoice_number: body.invoice_number ?? `INV-${Date.now()}`,
    customer_id: body.customer_id,
    customer_name_snapshot: customer?.name ?? '',
    appointment_id: body.appointment_id,
    contract_id: body.contract_id,
    subtotal,
    vat_amount,
    total: Math.round((subtotal + vat_amount) * 100) / 100,
    payment_status: body.payment_status ?? 'unpaid',
    payment_method: body.payment_method || undefined,
    issue_date: body.issue_date ?? new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    notes: body.notes,
  };
  store.invoices.insert(invoice);
  logActivity(req, `تم إصدار فاتورة "${invoice.invoice_number}" للعميل "${invoice.customer_name_snapshot}" بقيمة ${invoice.total} ر.س`);
  res.status(201).json(invoice);
});

// ---------------------------------------------------------------------------
// عروض الأسعار — تبويب "عرض سعر" داخل صفحة العقود. مستند مستقل تماماً عن
// Contract/Invoice: مجرد اقتراح سعر يُطبَع ويُرسَل للعميل قبل أي التزام،
// فلا يُنشئ عقداً أو موعداً تلقائياً (ذلك قرار لاحق منفصل إن قَبِل العميل).
// ---------------------------------------------------------------------------
api.get('/quotes', (_req, res) => res.json(store.quotes.list()));

api.post('/quotes', (req, res) => {
  const body = req.body ?? {};
  if (!body.customer_id || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: 'customer_id وقائمة items (خدمة واحدة على الأقل) مطلوبة' });
  }
  const customer = store.customers.get(body.customer_id);
  const items = body.items.map((it: { service_id: string; service_name: string; price: number }) => ({
    service_id: it.service_id,
    service_name: it.service_name,
    price: Number(it.price) || 0,
  }));
  const total = Math.round(items.reduce((sum: number, it: { price: number }) => sum + it.price, 0) * 100) / 100;
  const quote: Quote = {
    id: store.id(),
    quote_number: body.quote_number ?? `QT-${Date.now()}`,
    customer_id: body.customer_id,
    customer_name_snapshot: customer?.name ?? body.customer_name_snapshot ?? '',
    customer_phone_snapshot: customer?.phone,
    path_type: body.path_type === 'contract' ? 'contract' : 'single_visit',
    items,
    total,
    payment_note: typeof body.payment_note === 'string' ? body.payment_note : '',
    issue_date: body.issue_date ?? new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    created_by: body.created_by || undefined,
    created_by_name: body.created_by ? store.profiles.list().find((p) => p.id === body.created_by)?.full_name : undefined,
  };
  store.quotes.insert(quote);
  logActivity(req, `تم إنشاء عرض سعر "${quote.quote_number}" للعميل "${quote.customer_name_snapshot}" بقيمة ${quote.total} ر.س`);
  res.status(201).json(quote);
});

api.delete('/quotes/:id', (req, res) => {
  const target = store.quotes.get(req.params.id);
  const removed = store.quotes.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف عرض سعر "${target?.quote_number ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// طلبات العملاء الواردة — عميل محتمل يملأ استمارة سريعة من صفحة "اطلب
// الخدمة" العامة (src/client/pages/OrderPage.tsx) بلا تسجيل دخول، فتُحفَظ
// هنا ليتابعها فريق العمل من صفحة "طلبات العملاء" (Leads.tsx، خلف صلاحية
// view_leads_page). نفس نمط /public/ratings أعلاه: نقطة POST عامة غير
// محمية + نقاط GET/PATCH/DELETE للاستخدام الداخلي فقط.
// ---------------------------------------------------------------------------
api.post('/public/leads', (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!name || !phone) {
    return res.status(400).json({ error: 'الاسم ورقم الجوال مطلوبان' });
  }
  const lead: Lead = {
    id: store.id(),
    name: name.slice(0, 200),
    phone: normalizeSaudiPhone(phone),
    area: typeof body.area === 'string' && body.area.trim() ? body.area.trim().slice(0, 200) : undefined,
    service_name: typeof body.service_name === 'string' && body.service_name.trim() ? body.service_name.trim().slice(0, 200) : undefined,
    message: typeof body.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 1000) : undefined,
    status: 'new',
    created_at: new Date().toISOString(),
  };
  store.leads.insert(lead);
  logActivity(req, `طلب جديد من العميل "${lead.name}"${lead.service_name ? ` (${lead.service_name})` : ''} عبر صفحة اطلب الخدمة`);
  res.status(201).json(lead);

  // تنبيه فوري (Web Push) للمدير العام ومدير النظام والمشرفين الإداريين
  // بوصول طلب خارجي جديد — لا يُنتظر (لا يُبطئ استجابة صفحة "اطلب
  // الخدمة" العامة، ويُهمَل بصمت لو لم يُضبط VAPID بعد).
  sendPushToProfiles(leadNotifyProfileIds(), {
    title: 'طلب خارجي جديد',
    body: `${lead.name}${lead.service_name ? ` — ${lead.service_name}` : ''}`,
    url: '/leads',
    tag: `lead-${lead.id}`,
  }).catch((err) => console.error('❌ فشل إرسال تنبيه الطلب الجديد:', err));
});

api.get('/leads', (_req, res) => res.json(store.leads.list()));

api.patch('/leads/:id', (req, res) => {
  const status = req.body?.status as LeadStatus | undefined;
  if (status && !['new', 'replied', 'quote_sent', 'appointment_booked'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير صحيحة' });
  }
  const linkedAppointmentId = req.body?.linked_appointment_id;
  const patch: Partial<Lead> = {};
  if (status) patch.status = status;
  if (typeof linkedAppointmentId === 'string') patch.linked_appointment_id = linkedAppointmentId;
  const updated = store.leads.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  if (status) logActivity(req, `تم تحديث حالة طلب العميل "${updated.name}" إلى "${LEAD_STATUS_LABELS_AR[status]}"`);
  res.json(updated);
});

api.delete('/leads/:id', (req, res) => {
  const target = store.leads.get(req.params.id);
  const removed = store.leads.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف طلب العميل "${target?.name ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// إعدادات صفحة "اطلب الخدمة" العامة (الإعدادات ← الطلبات الخارجية، خلف
// صلاحية edit_landing_page) — ألوان الهوية، نصوص الهيرو، وقائمة بطاقات
// الخدمات التسويقية المعروضة (منفصلة عمداً عن دليل الخدمات التشغيلي).
// نقطتا GET هنا عامتان (بلا حماية) لأن OrderPage.tsx نفسها تستدعيهما بلا
// تسجيل دخول.
// ---------------------------------------------------------------------------
api.get('/landing-settings', (_req, res) => res.json(store.landingSettings.get()));

api.patch('/landing-settings', (req, res) => {
  const body = req.body ?? {};
  const current = store.landingSettings.get();
  const next: LandingPageSettings = {
    colors: { ...current.colors, ...(body.colors ?? {}) },
    hero_title: typeof body.hero_title === 'string' && body.hero_title.trim() ? body.hero_title.trim() : current.hero_title,
    hero_subtitle: typeof body.hero_subtitle === 'string' ? body.hero_subtitle.trim() : current.hero_subtitle,
    tagline: typeof body.tagline === 'string' && body.tagline.trim() ? body.tagline.trim() : current.tagline,
  };
  store.landingSettings.set(next);
  logActivity(req, 'تم تعديل إعدادات صفحة الطلبات الخارجية (الألوان/النصوص)');
  res.json(next);
});

api.get('/landing-services', (_req, res) => res.json(store.landingServices.list()));

// مسار حرفي مسجَّل قبل '/landing-services/:id' عمداً — وإلا لطابقه إكسبرس
// كأنه :id بقيمة "reorder" ولن يصل الطلب لهذا المسار إطلاقاً.
api.patch('/landing-services/reorder', (req, res) => {
  const order = req.body?.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order (مصفوفة معرّفات) مطلوبة' });
  const next = store.landingServices.reorder(order);
  res.json(next);
});

api.post('/landing-services', (req, res) => {
  const body = req.body ?? {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'اسم الخدمة مطلوب' });
  const item: LandingService = {
    id: store.id(),
    title: title.slice(0, 200),
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 500) : undefined,
    image_url: typeof body.image_url === 'string' && body.image_url ? body.image_url : undefined,
    is_active: body.is_active !== false,
    created_at: new Date().toISOString(),
  };
  store.landingServices.insert(item);
  logActivity(req, `تم إضافة خدمة "${item.title}" لصفحة الطلبات الخارجية`);
  res.status(201).json(item);
});

api.patch('/landing-services/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<LandingService> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 200);
  if ('description' in body) patch.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 500) : undefined;
  if ('image_url' in body) patch.image_url = typeof body.image_url === 'string' && body.image_url ? body.image_url : undefined;
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  const updated = store.landingServices.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل خدمة "${updated.title}" في صفحة الطلبات الخارجية`);
  res.json(updated);
});

api.delete('/landing-services/:id', (req, res) => {
  const target = store.landingServices.get(req.params.id);
  const removed = store.landingServices.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف خدمة "${target?.title ?? ''}" من صفحة الطلبات الخارجية`);
  res.status(204).end();
});

// رفع صورة بطاقة خدمة — مستقل عن معرّف الخدمة لأن الصورة قد تُرفَع أثناء
// تعبئة نموذج "إضافة خدمة جديدة" قبل وجود معرّف أصلاً (انظر
// uploadLandingImage في src/server/lib/storage.ts).
api.post('/landing-images', async (req, res) => {
  const dataUrl = req.body?.data_url;
  if (typeof dataUrl !== 'string' || !dataUrl) return res.status(400).json({ error: 'data_url مطلوب' });
  try {
    const url = await uploadLandingImage(dataUrl);
    res.status(201).json({ url });
  } catch {
    res.status(500).json({ error: 'تعذّر رفع الصورة' });
  }
});
