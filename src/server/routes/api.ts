import { Router, type Request } from 'express';
import { store, pendingWrites } from '../store/db.js';
import type { StoredProfile } from '../store/db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { uploadAppointmentPhoto, uploadLeavePhoto, uploadLandingImage, uploadExpenseInvoice, uploadEmployeeIdPhoto } from '../lib/storage.js';
import { sendPushToProfiles, appointmentNotifyProfileIds, leadNotifyProfileIds } from '../lib/push.js';
import { handleIncomingWhatsappMessage } from '../lib/whatsappBot.js';
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
  EmployeeDeduction,
  EmployeeViolation,
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
  MobileAppSettings,
  SalesDiscountSettings,
  SalesDiscountKind,
  VisitOutcome,
  ServicePricingTier,
  CustomerType,
  CustomerSource,
  Customer,
  CommissionConfig,
  CommissionTier,
  CommissionEligibility,
  Expense,
  ExpenseEntryType,
  ExpenseIncomeType,
  TerminationReason,
  LiveChatThread,
  RiyadhZone,
  NeighborhoodZoneAssignment,
  DistrictGeocode,
  WorkersHousingLocation,
  CompanyBankAccount,
  Vehicle,
} from '../../shared/types.js';
import {
  VAT_RATE,
  OPEN_DISCOUNT_MAX_PERCENT,
  CUSTODY_CATEGORY_NAME,
  ADVANCE_CATEGORY_NAME,
  SALARY_CATEGORY_NAME,
  EXPENSE_INCOME_TYPE_LABELS_AR,
  TERMINATION_REASON_LABELS_AR,
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

// ---------------------------------------------------------------------------
// إدارة الترجمة — صفحة الإعدادات ← الترجمة (TranslationsTab). القائمة
// الكاملة بالكلمات العربية القابلة للترجمة تبقى محسوبة على العميل وحده
// (قواميس translations.ts الثابتة — AR_TO_EN بصفتها الأشمل) — هذا الطرف
// يخزّن فقط التعديلات/الإضافات الفعلية (values لكل كلمة)، بالإضافة لأي
// لغات جديدة أُضيفت من نفس الصفحة. مقيَّدة في الواجهة فقط (PERMISSIONS_
// ACCESS_ROLES)، كبقية نقاط التحكم في هذا الملف. لا حماية دخول هنا عمداً:
// I18nProvider يقرأها عند بدء التطبيق قبل تسجيل الدخول (شاشة الدخول نفسها
// تعرض مُحدِّد لغة للفنيين).
// ---------------------------------------------------------------------------
api.get('/translations', (_req, res) => {
  res.json({
    overrides: store.translationOverrides.list(),
    languages: store.translationLanguages.list(),
  });
});

api.patch('/translations', (req, res) => {
  const { ar, values } = req.body ?? {};
  if (typeof ar !== 'string' || !ar.trim() || typeof values !== 'object' || values === null) {
    return res.status(400).json({ error: 'ar (نص) وvalues (كائن) مطلوبان' });
  }
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    if (typeof v === 'string') cleaned[k] = v;
  }
  const updated = store.translationOverrides.upsert(ar, cleaned);
  res.json(updated);
});

api.patch('/translations/languages', (req, res) => {
  const languages = Array.isArray(req.body?.languages) ? req.body.languages : [];
  const updated = store.translationLanguages.update(languages);
  logActivity(req, 'تم تعديل قائمة لغات الترجمة');
  res.json(updated);
});

// ---------------------------------------------------------------------------
// مركبات الشركة — صفحة الإعدادات ← المركبات (VehiclesTab). سجل بيانات فقط
// (استمارة/لوحة/تأمين/فحص دوري...) بلا أي منطق تشغيلي آخر مرتبط به.
// ---------------------------------------------------------------------------
api.get('/vehicles', (_req, res) => res.json(store.vehicles.list()));

api.post('/vehicles', (req, res) => {
  const body = req.body ?? {};
  if (!body.type || !body.plate_number) {
    return res.status(400).json({ error: 'type وplate_number مطلوبان' });
  }
  const now = new Date().toISOString();
  const vehicle: Vehicle = {
    id: store.id(),
    type: body.type,
    registration_number: body.registration_number || undefined,
    owner: body.owner || undefined,
    plate_number: body.plate_number,
    serial_number: body.serial_number || undefined,
    registration_expiry: body.registration_expiry || undefined,
    inspection_expiry: body.inspection_expiry || undefined,
    insurance_expiry: body.insurance_expiry || undefined,
    authorized_driver: body.authorized_driver || undefined,
    supervisor_id: body.supervisor_id || undefined,
    last_oil_change: body.last_oil_change || undefined,
    waei_number: body.waei_number || undefined,
    created_at: now,
    updated_at: now,
  };
  store.vehicles.insert(vehicle);
  logActivity(req, `تم إضافة مركبة "${vehicle.type}" (${vehicle.plate_number})`);
  res.status(201).json(vehicle);
});

api.patch('/vehicles/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<Vehicle> = {};
  if (body.type !== undefined) patch.type = body.type;
  if (body.registration_number !== undefined) patch.registration_number = body.registration_number || undefined;
  if (body.owner !== undefined) patch.owner = body.owner || undefined;
  if (body.plate_number !== undefined) patch.plate_number = body.plate_number;
  if (body.serial_number !== undefined) patch.serial_number = body.serial_number || undefined;
  if (body.registration_expiry !== undefined) patch.registration_expiry = body.registration_expiry || undefined;
  if (body.inspection_expiry !== undefined) patch.inspection_expiry = body.inspection_expiry || undefined;
  if (body.insurance_expiry !== undefined) patch.insurance_expiry = body.insurance_expiry || undefined;
  if (body.authorized_driver !== undefined) patch.authorized_driver = body.authorized_driver || undefined;
  if (body.supervisor_id !== undefined) patch.supervisor_id = body.supervisor_id || undefined;
  if (body.last_oil_change !== undefined) patch.last_oil_change = body.last_oil_change || undefined;
  if (body.waei_number !== undefined) patch.waei_number = body.waei_number || undefined;
  const updated = store.vehicles.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'vehicle not found' });
  logActivity(req, `تم تعديل بيانات مركبة "${updated.type}" (${updated.plate_number})`);
  res.json(updated);
});

api.delete('/vehicles/:id', (req, res) => {
  const vehicle = store.vehicles.list().find((v) => v.id === req.params.id);
  const removed = store.vehicles.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'vehicle not found' });
  if (vehicle) logActivity(req, `تم حذف مركبة "${vehicle.type}" (${vehicle.plate_number})`);
  res.status(204).end();
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

api.patch('/profiles/:id', async (req, res) => {
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
  if (body.monthly_salary !== undefined) patch.monthly_salary = body.monthly_salary === null ? undefined : Number(body.monthly_salary);
  if (body.salary_due_day !== undefined) patch.salary_due_day = body.salary_due_day === null ? undefined : Number(body.salary_due_day);
  if (body.date_of_birth !== undefined) patch.date_of_birth = body.date_of_birth || undefined;
  if (body.national_id !== undefined) patch.national_id = body.national_id || undefined;
  if (body.national_id_expiry !== undefined) patch.national_id_expiry = body.national_id_expiry || undefined;
  if (body.hire_date !== undefined) patch.hire_date = body.hire_date || undefined;
  if (body.legal_full_name !== undefined) patch.legal_full_name = body.legal_full_name || undefined;
  if (body.job_title !== undefined) patch.job_title = body.job_title || undefined;
  if (body.nationality !== undefined) patch.nationality = body.nationality || undefined;
  if (body.default_lang !== undefined) {
    patch.default_lang = ['ar', 'en', 'bn', 'ur'].includes(body.default_lang) ? body.default_lang : undefined;
  }
  // صورة الهوية/الإقامة — نفس منطق ملف فاتورة المصروف بالضبط (رفع جديد
  // يستبدل القديم، ملف قديم على Supabase Storage يبقى يتيماً بلا مشكلة).
  if (body.id_photo_data_url) {
    try {
      patch.id_photo_url = await uploadEmployeeIdPhoto(req.params.id, body.id_photo_data_url);
    } catch (err) {
      console.error('❌ فشل رفع صورة الهوية إلى Supabase Storage:', err);
      return res.status(500).json({ error: 'فشل رفع صورة الهوية' });
    }
  } else if (body.remove_id_photo) {
    patch.id_photo_url = undefined;
  }

  const updated = store.profiles.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل بيانات المستخدم "${updated.full_name}"`);
  res.json(toSafeProfile(updated));
});

// تفعيل/إيقاف مشاركة الموقع — بمبادرة الموظف نفسه فقط (زر "مشاركة
// موقعي" في القائمة الجانبية). عملية نادرة الحدوث (وليست تحديث موقع
// متكرر)، فتُسجَّل في سجل العمليات بخلاف نقطة تحديث الإحداثيات أدناه.
api.patch('/profiles/:id/location-sharing', (req, res) => {
  const enabled = !!req.body?.enabled;
  const updated = store.profiles.update(req.params.id, {
    location_sharing_enabled: enabled,
    location_sharing_decision_at: new Date().toISOString(),
  });
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `${enabled ? 'تم تفعيل' : 'تم إيقاف'} مشاركة الموقع لـ "${updated.full_name}"`);
  res.json(toSafeProfile(updated));
});

// تحديث دوري لإحداثيات الموظف من جهازه (كل دقيقة تقريباً طالما مشاركة
// الموقع مفعّلة، انظر Layout.tsx) — بلا سجل عمليات عمداً، فهذا تحديث
// تقني متكرر وليس "عملية" يهتم بها من يراجع سجل التدقيق.
api.patch('/profiles/:id/location', (req, res) => {
  const { lat, lng, accuracy } = req.body ?? {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat و lng (أرقام) مطلوبان' });
  }
  const updated = store.profiles.update(req.params.id, {
    last_location: {
      lat,
      lng,
      accuracy: typeof accuracy === 'number' ? accuracy : undefined,
      updated_at: new Date().toISOString(),
    },
  });
  if (!updated) return res.status(404).json({ error: 'not found' });
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

api.get('/ratings', (req, res) => {
  const { appointment_id } = req.query;
  let list = store.ratings.list();
  if (appointment_id && typeof appointment_id === 'string') {
    list = list.filter((r) => r.appointment_id === appointment_id);
  }
  res.json(list);
});

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
api.get('/customer-ratings', (req, res) => {
  const { appointment_id } = req.query;
  let list = store.customerRatings.list();
  if (appointment_id && typeof appointment_id === 'string') {
    list = list.filter((r) => r.appointment_id === appointment_id);
  }
  res.json(list);
});

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
  const {
    name,
    phone,
    address,
    district,
    city,
    location_url,
    notes,
    customer_type,
    source,
    source_call_profile_id,
    tax_number,
    national_address,
    commercial_registration_number,
    marketer_id,
  } = req.body ?? {};
  if (!name || !phone || !address) {
    return res.status(400).json({ error: 'name, phone و address مطلوبة' });
  }
  const isCompany = customer_type === 'company';
  const customer = store.customers.insert({
    id: store.id(),
    name,
    phone: normalizeSaudiPhone(phone),
    address,
    district,
    city,
    location_url,
    notes,
    customer_type: customer_type || undefined,
    source: source || undefined,
    source_call_profile_id: source === 'outbound_call' ? source_call_profile_id || undefined : undefined,
    tax_number: isCompany ? tax_number || undefined : undefined,
    national_address: isCompany ? national_address || undefined : undefined,
    commercial_registration_number: isCompany ? commercial_registration_number || undefined : undefined,
    marketer_id: marketer_id || undefined,
    created_at: new Date().toISOString(),
  });
  logActivity(req, `تم إضافة عميل "${customer.name}"`);
  res.status(201).json(customer);
});

api.patch('/customers/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<{
    name: string;
    phone: string;
    address: string;
    district?: string;
    city?: string;
    location_url?: string;
    notes?: string;
    customer_type?: CustomerType;
    source?: CustomerSource;
    source_call_profile_id?: string;
    tax_number?: string;
    national_address?: string;
    commercial_registration_number?: string;
    marketer_id?: string;
  }> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = normalizeSaudiPhone(body.phone);
  if (body.address !== undefined) patch.address = body.address;
  if (body.district !== undefined) patch.district = body.district || undefined;
  if (body.city !== undefined) patch.city = body.city || undefined;
  if (body.location_url !== undefined) patch.location_url = body.location_url || undefined;
  if (body.notes !== undefined) patch.notes = body.notes || undefined;
  if (body.customer_type !== undefined) patch.customer_type = body.customer_type || undefined;
  if (body.marketer_id !== undefined) patch.marketer_id = body.marketer_id || undefined;
  if (body.source !== undefined) {
    patch.source = body.source || undefined;
    patch.source_call_profile_id = body.source === 'outbound_call' ? body.source_call_profile_id || undefined : undefined;
  }
  if (body.customer_type !== undefined || body.tax_number !== undefined || body.national_address !== undefined || body.commercial_registration_number !== undefined) {
    const isCompany = (body.customer_type !== undefined ? body.customer_type : store.customers.get(req.params.id)?.customer_type) === 'company';
    patch.tax_number = isCompany ? body.tax_number || undefined : undefined;
    patch.national_address = isCompany ? body.national_address || undefined : undefined;
    patch.commercial_registration_number = isCompany ? body.commercial_registration_number || undefined : undefined;
  }

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

// استيراد عملاء بالجملة (من ملف إكسل تُحلِّله الواجهة نفسها إلى صفوف
// JSON — انظر CustomerImport.tsx) — نفس تحقق/تطبيع POST /customers لكل
// صف، مع تخطي أي صف بجوال مكرر (ضمن الملف نفسه أو مطابق لعميل موجود
// أصلاً) بدل رفض الطلب كله دفعة واحدة.
api.post('/customers/import', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: 'لا توجد صفوف للاستيراد' });

  const existingPhones = new Set(store.customers.list().map((c) => c.phone));
  const inserted: Customer[] = [];
  const skipped: { row: number; name?: string; reason: string }[] = [];

  rows.forEach((raw: Record<string, unknown>, i: number) => {
    const rowNum = i + 1;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const phoneRaw = typeof raw.phone === 'string' || typeof raw.phone === 'number' ? String(raw.phone).trim() : '';
    const address = typeof raw.address === 'string' ? raw.address.trim() : '';
    if (!name || !phoneRaw || !address) {
      skipped.push({ row: rowNum, name: name || undefined, reason: 'الاسم أو الجوال أو العنوان مفقود' });
      return;
    }
    const phone = normalizeSaudiPhone(phoneRaw);
    if (existingPhones.has(phone)) {
      skipped.push({ row: rowNum, name, reason: 'رقم جوال مكرر' });
      return;
    }
    const source = typeof raw.source === 'string' && raw.source ? (raw.source as CustomerSource) : undefined;
    const customer = store.customers.insert({
      id: store.id(),
      name,
      phone,
      address,
      district: typeof raw.district === 'string' && raw.district ? raw.district : undefined,
      city: typeof raw.city === 'string' && raw.city ? raw.city : undefined,
      location_url: typeof raw.location_url === 'string' && raw.location_url ? raw.location_url : undefined,
      customer_type: typeof raw.customer_type === 'string' && raw.customer_type ? (raw.customer_type as CustomerType) : undefined,
      source,
      source_call_profile_id:
        source === 'outbound_call' && typeof raw.source_call_profile_id === 'string' && raw.source_call_profile_id
          ? raw.source_call_profile_id
          : undefined,
      created_at: new Date().toISOString(),
    });
    existingPhones.add(phone);
    inserted.push(customer);
  });

  if (inserted.length > 0) logActivity(req, `تم استيراد ${inserted.length} عميل من ملف إكسل`);
  res.status(201).json({ inserted, skipped });
});

// ---------------------------------------------------------------------------
// Services — managed from Settings (name, price, expected duration).
// ---------------------------------------------------------------------------
api.get('/services', (_req, res) => res.json(store.services.list()));

// يقرأ مصفوفة pricing_tiers من جسم الطلب (إن وُجدت وصالحة) — تُتجاهَل
// أي عناصر ناقصة label/unit_price، وتُنشأ key عشوائية لأي عنصر جديد بلا
// key (خدمة جديدة أو مستوى مضاف لتوّه من الواجهة).
function parsePricingTiers(raw: unknown): ServicePricingTier[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tiers = raw
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && typeof t.label === 'string' && t.label.trim())
    .map((t) => ({
      key: typeof t.key === 'string' && t.key ? t.key : store.id(),
      label: (t.label as string).trim(),
      unit_price: Number(t.unit_price ?? 0),
      unit_duration_seconds: t.unit_duration_seconds ? Number(t.unit_duration_seconds) : undefined,
    }));
  return tiers.length > 0 ? tiers : undefined;
}

api.post('/services', (req, res) => {
  const body = req.body ?? {};
  if (!body.name) return res.status(400).json({ error: 'name مطلوب' });
  const isUnitPriced = body.pricing_model && body.pricing_model !== 'fixed';
  const service: Service = {
    id: store.id(),
    name: body.name,
    description: body.description || undefined,
    category: body.category || undefined,
    default_price: Number(body.default_price ?? 0),
    default_duration_minutes: Number(body.default_duration_minutes ?? 60),
    is_active: body.is_active ?? true,
    pricing_model: isUnitPriced ? body.pricing_model : undefined,
    unit_price: isUnitPriced ? Number(body.unit_price ?? 0) : undefined,
    unit_duration_seconds: isUnitPriced && body.unit_duration_seconds ? Number(body.unit_duration_seconds) : undefined,
    pricing_tiers: isUnitPriced ? parsePricingTiers(body.pricing_tiers) : undefined,
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
  if (body.pricing_model !== undefined) {
    patch.pricing_model = body.pricing_model && body.pricing_model !== 'fixed' ? body.pricing_model : undefined;
    patch.unit_price = patch.pricing_model ? Number(body.unit_price ?? 0) : undefined;
    patch.unit_duration_seconds = patch.pricing_model && body.unit_duration_seconds ? Number(body.unit_duration_seconds) : undefined;
    patch.pricing_tiers = patch.pricing_model ? parsePricingTiers(body.pricing_tiers) : undefined;
  }

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

// يبحث عن مسوّق نشط يملك بالضبط هذا الكود (غير حسّاس لحالة الأحرف/
// المسافات الطرفية) — يُستخدَم عند حجز موعد جديد لتطبيق خصمه الحقيقي على
// السعر وربط إيراد ذلك الموعد بهذا المسوّق مباشرة (انظر Appointment.marketer_id
// وcomputeCommissionReport أدناه). لا يُعتَد بأي نسبة/مبلغ يرسله العميل —
// القيم المُستخدَمة فعلياً دائماً من سجل المسوّق نفسه على الخادم.
function resolveMarketerCode(code: string): CommissionEligibility | undefined {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return undefined;
  return store.commissionEligibility
    .list()
    .find((e) => e.role === 'marketer' && e.active && e.discount_code?.trim().toLowerCase() === normalized);
}

// يطبّق خصم كود المسوّق (إن وُجد كود صالح) على مبلغ قبل الخصم، ويُرجع
// المبلغ بعد الخصم مع بيانات المسوّق للتخزين على الموعد. amount هنا هو
// دائماً "قبل الخصم" كما يُرسِله العميل، تماماً كمبدأ خصومات المبيعات.
function applyMarketerCode(
  code: string | undefined,
  preDiscountAmount: number,
): { amount: number; marketer_code?: string; marketer_id?: string; marketer_discount_amount?: number } {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (!trimmed) return { amount: preDiscountAmount };
  const marketer = resolveMarketerCode(trimmed);
  if (!marketer) return { amount: preDiscountAmount, marketer_code: trimmed };
  const kind = marketer.discount_kind ?? 'percent';
  const discount =
    kind === 'fixed'
      ? Math.min(Math.max(marketer.discount_amount ?? 0, 0), preDiscountAmount)
      : Math.round((preDiscountAmount * Math.max(marketer.discount_percent ?? 0, 0)) / 100 * 100) / 100;
  return {
    amount: Math.round((preDiscountAmount - discount) * 100) / 100,
    marketer_code: trimmed,
    marketer_id: marketer.profile_id,
    marketer_discount_amount: discount > 0 ? discount : undefined,
  };
}

api.post('/appointments', (req, res) => {
  const body = req.body ?? {};
  const preDiscountAmount = Number(body.amount ?? 0);
  const marketerCodeResult = applyMarketerCode(body.marketer_code, preDiscountAmount);
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
    amount: marketerCodeResult.amount,
    status: 'scheduled',
    supervisor_id: body.supervisor_id,
    address_snapshot: body.address_snapshot ?? '',
    location_url: body.location_url,
    notes: body.notes,
    total_paid: 0,
    remaining_amount: marketerCodeResult.amount,
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
    marketer_code: marketerCodeResult.marketer_code,
    marketer_id: marketerCodeResult.marketer_id,
    marketer_discount_amount: marketerCodeResult.marketer_discount_amount,
  };
  store.appointments.insert(appointment);
  const marketerNote = appointment.marketer_id
    ? ` (كود مسوّق "${appointment.marketer_code}" — ${store.profiles.get(appointment.marketer_id)?.full_name ?? ''})`
    : '';
  logActivity(
    req,
    (appointment.kind === 'visit'
      ? `تم تحديد زيارة معاينة للعميل "${appointment.customer_name_snapshot ?? ''}"`
      : `تم إضافة موعد للعميل "${appointment.customer_name_snapshot ?? ''}"`) + marketerNote,
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
  pending_review: 'بانتظار المراجعة',
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
  const existing = store.appointments.get(req.params.id);
  // تعديل السعر (مثلاً عند تغيير نوع الخدمة من تفاصيل الموعد) يجب أن
  // يعيد حساب المتبقي وحالة الدفع فوراً بنفس صيغة تحصيل الدفعات أدناه،
  // وإلا بقي "المتبقي" يعكس السعر القديم رغم تغيّر قيمة الخدمة نفسها.
  if (typeof patch.amount === 'number' && existing) {
    const remaining_amount = Math.max(patch.amount - existing.total_paid, 0);
    patch.remaining_amount = remaining_amount;
    patch.payment_status = remaining_amount === 0 ? 'paid' : existing.total_paid > 0 ? 'partial' : 'unpaid';
  }
  // رفع نتيجة زيارة معاينة (نوع التنظيف المطلوب + السعر ثم الحالة) —
  // ينهي الزيارة نفسها فوراً (لا مراحل لاحقة عليها كموعد خدمة عادي).
  const isVisitOutcome = typeof patch.visit_outcome === 'string';
  if (isVisitOutcome) {
    patch.visit_outcome_at = new Date().toISOString();
    if (!patch.status) patch.status = 'completed';
  }
  // موعد مولَّد من عقد دوري ينتقل من/إلى "مكتمل" — يُحدَّث completed_visits
  // على العقد نفسه تبعاً لذلك (زيادة أو تراجع)، حتى يعكس عدّاد الزيارات في
  // صفحة العقود (والمحاسبة ← العقود) الواقع الفعلي بدل البقاء صفراً دوماً.
  if (existing?.contract_id && typeof patch.status === 'string') {
    const wasCompleted = existing.status === 'completed';
    const willBeCompleted = patch.status === 'completed';
    if (wasCompleted !== willBeCompleted) {
      const contract = store.contracts.get(existing.contract_id);
      if (contract) {
        const nextCount = Math.max(0, contract.completed_visits + (willBeCompleted ? 1 : -1));
        store.contracts.update(contract.id, { completed_visits: nextCount });
      }
    }
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
    payment_method: body.payment_method || undefined,
    due_date: body.due_date || undefined,
    payments: [],
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
  const patch = { ...(req.body ?? {}) };
  // تغيير القيمة الإجمالية يجب أن يعيد حساب المتبقي وحالة الدفع فوراً بنفس
  // منطق تحصيل الدفعات (paid_amount يبقى كما هو، فقط المتبقي يتغيّر)، وإلا
  // بقي "المتبقي" يعكس القيمة القديمة رغم تعديل قيمة العقد نفسها.
  if (typeof patch.total_amount === 'number') {
    const existing = store.contracts.get(req.params.id);
    if (existing) {
      const remaining_amount = Math.max(patch.total_amount - existing.paid_amount, 0);
      patch.remaining_amount = remaining_amount;
      patch.payment_status = remaining_amount === 0 ? 'paid' : existing.paid_amount > 0 ? 'partial' : 'unpaid';
    }
  }
  const updated = store.contracts.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'العقد غير موجود' });
  logActivity(req, `تم تعديل العقد "${updated.contract_number}"`);
  res.json(updated);
});

// تسجيل دفعة فعلية على عقد — نفس منطق POST /appointments/:id/payments
// بالضبط (مبلغ + طريقة، تُعاد حساب paid_amount/remaining_amount/
// payment_status تلقائياً). مقيَّدة في الواجهة بصلاحية edit_contracts.
api.post('/contracts/:id/payments', (req, res) => {
  const contract = store.contracts.get(req.params.id);
  if (!contract) return res.status(404).json({ error: 'العقد غير موجود' });
  const { amount, method } = req.body ?? {};
  contract.payments.push({ id: store.id(), amount: Number(amount), method, recorded_at: new Date().toISOString() });
  const paid_amount = contract.payments.reduce((s, p) => s + p.amount, 0);
  const remaining_amount = Math.max(contract.total_amount - paid_amount, 0);
  const payment_status = remaining_amount === 0 ? 'paid' : paid_amount > 0 ? 'partial' : 'unpaid';
  const updated = store.contracts.update(contract.id, { payments: contract.payments, paid_amount, remaining_amount, payment_status });
  logActivity(req, `تم تسجيل دفعة ${amount} ر.س على العقد "${contract.contract_number}"`);
  res.status(201).json(updated);
});

// تعديل دفعة مسجَّلة على عقد — نفس منطق PATCH
// /appointments/:id/payments/:paymentId بالضبط.
api.patch('/contracts/:id/payments/:paymentId', (req, res) => {
  const contract = store.contracts.get(req.params.id);
  if (!contract) return res.status(404).json({ error: 'العقد غير موجود' });
  const payment = contract.payments.find((p) => p.id === req.params.paymentId);
  if (!payment) return res.status(404).json({ error: 'payment not found' });
  const { amount, method } = req.body ?? {};
  if (amount !== undefined) payment.amount = Number(amount);
  if (method !== undefined) payment.method = method;
  const paid_amount = contract.payments.reduce((s, p) => s + p.amount, 0);
  const remaining_amount = Math.max(contract.total_amount - paid_amount, 0);
  const payment_status = remaining_amount === 0 ? 'paid' : paid_amount > 0 ? 'partial' : 'unpaid';
  const updated = store.contracts.update(contract.id, { payments: contract.payments, paid_amount, remaining_amount, payment_status });
  logActivity(req, `تم تعديل دفعة على العقد "${contract.contract_number}"`);
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
// دائماً الأحدث تاريخاً أولاً — بصرف النظر عن ترتيب الإدخال (مصروف قد
// يُسجَّل بتاريخ سابق بعد مصروف آخر أحدث)، بحيث تُعرَض هذه القائمة في أي
// صفحة تستهلكها (المصروفات العامة، العهد، كشف حساب الموظفين) مرتَّبة دوماً
// من مصدرها بدل الاعتماد على كل صفحة لترتيبها بنفسها.
api.get('/expenses', (_req, res) =>
  res.json(store.expenses.list().slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())),
);

// مبلغ الضريبة على فاتورة مصروف — يُحتسَب من amount نفسه بافتراض أنه شامل
// الضريبة (نفس اصطلاح كل تسعير في هذا النظام، انظر VAT_RATE)، وليس حقلاً
// يُدخله المستخدم يدوياً؛ يُحتسَب فقط عند وسم الفاتورة كـ"ضريبية".
function computeExpenseTax(isTaxInvoice: boolean, amount: number): number | undefined {
  if (!isTaxInvoice) return undefined;
  return Math.round((amount - amount / (1 + VAT_RATE)) * 100) / 100;
}

api.post('/expenses', async (req, res) => {
  const body = req.body ?? {};
  const isCustody = body.category === CUSTODY_CATEGORY_NAME;
  const isAdvance = body.category === ADVANCE_CATEGORY_NAME;
  const isSalary = body.category === SALARY_CATEGORY_NAME;
  // الأصناف الثلاثة (عهدة، سلفية، رواتب) تحمل "موظفاً معنياً" بنفس
  // الحقلين — انظر التعليق على custody_holder_id في shared/types.ts.
  const linksEmployee = isCustody || isAdvance || isSalary;
  const expenseId = store.id();
  // صورة أو PDF اختياري لسند الفاتورة — نفس منطق صورة الإجازة في POST
  // /leaves أعلاه بالضبط (نرفعه أولاً باستخدام المعرّف المولَّد سلفاً، ثم
  // نحفظ رابطه فقط ضمن سجل المصروف).
  let invoiceFileUrl: string | undefined;
  if (body.invoice_file_data_url) {
    try {
      invoiceFileUrl = await uploadExpenseInvoice(expenseId, body.invoice_file_data_url);
    } catch (err) {
      console.error('❌ فشل رفع ملف الفاتورة إلى Supabase Storage:', err);
      return res.status(500).json({ error: 'فشل رفع ملف الفاتورة' });
    }
  }
  const amount = Number(body.amount ?? 0);
  const isTaxInvoice = Boolean(body.is_tax_invoice);
  const entryType: ExpenseEntryType = body.entry_type === 'income' ? 'income' : 'expense';
  const incomeType: ExpenseIncomeType | undefined =
    entryType === 'income' ? (body.income_type === 'additional_capital' ? 'additional_capital' : 'return') : undefined;
  const expense = store.expenses.insert({
    id: expenseId,
    title: body.title,
    category: body.category,
    entry_type: entryType,
    income_type: incomeType,
    sub_category: body.sub_category || undefined,
    period_type: body.period_type ?? 'daily',
    amount,
    is_tax_invoice: isTaxInvoice,
    tax_amount: computeExpenseTax(isTaxInvoice, amount),
    date: body.date ?? new Date().toISOString().slice(0, 10),
    invoice_number: body.invoice_number,
    unit_or_vehicle_ref: body.unit_or_vehicle_ref,
    recorded_by: body.recorded_by ?? 'unknown',
    recorded_by_name: body.recorded_by_name,
    supervisor_id: body.supervisor_id,
    supervisor_name: body.supervisor_name,
    custody_holder_id: linksEmployee ? body.custody_holder_id || undefined : undefined,
    custody_holder_name: linksEmployee && body.custody_holder_id ? store.profiles.get(body.custody_holder_id)?.full_name : undefined,
    // جدولة استقطاع السلفية من الراتب — ذات معنى فقط عندما isAdvance، تبقى
    // 'none' (بلا استقطاع تلقائي) افتراضياً حتى يُختار وضع صراحةً.
    advance_deduction_mode: isAdvance && body.advance_deduction_mode ? body.advance_deduction_mode : 'none',
    advance_installment_months: isAdvance && body.advance_installment_months ? Number(body.advance_installment_months) : undefined,
    advance_period_start: isAdvance ? body.advance_period_start || undefined : undefined,
    advance_period_end: isAdvance ? body.advance_period_end || undefined : undefined,
    advance_settled_amount: isAdvance ? 0 : undefined,
    payment_method: body.payment_method ?? 'cash',
    notes: body.notes,
    invoice_file_url: invoiceFileUrl,
    invoice_file_name: invoiceFileUrl ? body.invoice_file_name || undefined : undefined,
    created_at: new Date().toISOString(),
  });
  logActivity(
    req,
    isCustody
      ? `تم إضافة عهدة "${expense.amount} ر.س" لـ "${expense.custody_holder_name ?? ''}"`
      : isAdvance
        ? `تم إضافة سلفية "${expense.amount} ر.س" لـ "${expense.custody_holder_name ?? ''}"`
        : isSalary
          ? `تم إضافة راتب "${expense.amount} ر.س" لـ "${expense.custody_holder_name ?? ''}"`
          : entryType === 'income'
            ? `تم تسجيل إيراد (${EXPENSE_INCOME_TYPE_LABELS_AR[incomeType ?? 'return']}) "${expense.title}" بقيمة ${expense.amount} ر.س`
            : `تم إضافة مصروف "${expense.title}" بقيمة ${expense.amount} ر.س`,
  );
  res.status(201).json(expense);
});

// تعديل مصروف قائم — مقيَّد في الواجهة بصلاحية edit_delete_expenses
// (افتراضياً المدير العام ومدير النظام فقط، انظر DEFAULT_PERMISSIONS).
api.patch('/expenses/:id', async (req, res) => {
  const body = req.body ?? {};
  const target = store.expenses.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'not found' });
  const isCustody = (body.category ?? target.category) === CUSTODY_CATEGORY_NAME;
  const isAdvance = (body.category ?? target.category) === ADVANCE_CATEGORY_NAME;
  const isSalary = (body.category ?? target.category) === SALARY_CATEGORY_NAME;
  const linksEmployee = isCustody || isAdvance || isSalary;
  const patch: Partial<Expense> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.category !== undefined) patch.category = body.category;
  if (body.entry_type !== undefined) patch.entry_type = body.entry_type === 'income' ? 'income' : 'expense';
  if (body.income_type !== undefined) patch.income_type = body.income_type === 'additional_capital' ? 'additional_capital' : 'return';
  if (body.sub_category !== undefined) patch.sub_category = body.sub_category || undefined;
  if (body.amount !== undefined) patch.amount = Number(body.amount);
  if (body.date !== undefined) patch.date = body.date;
  if (body.invoice_number !== undefined) patch.invoice_number = body.invoice_number || undefined;
  if (body.payment_method !== undefined) patch.payment_method = body.payment_method;
  if (body.notes !== undefined) patch.notes = body.notes || undefined;
  if (body.custody_holder_id !== undefined || body.category !== undefined) {
    const holderId = linksEmployee ? body.custody_holder_id ?? target.custody_holder_id : undefined;
    patch.custody_holder_id = holderId || undefined;
    patch.custody_holder_name = holderId ? store.profiles.get(holderId)?.full_name : undefined;
  }
  // جدولة استقطاع السلفية — قابلة للتعديل لاحقاً (مثلاً تحويلها من "بلا
  // استقطاع" إلى مُقسَّطة)، لا تُلمَس إن لم تُرسَل في الطلب.
  if (body.advance_deduction_mode !== undefined) patch.advance_deduction_mode = body.advance_deduction_mode;
  if (body.advance_installment_months !== undefined) {
    patch.advance_installment_months = body.advance_installment_months ? Number(body.advance_installment_months) : undefined;
  }
  if (body.advance_period_start !== undefined) patch.advance_period_start = body.advance_period_start || undefined;
  if (body.advance_period_end !== undefined) patch.advance_period_end = body.advance_period_end || undefined;
  // إعادة احتساب ضريبة الفاتورة كلما تغيّر أحد مدخليها (الوسم أو المبلغ)
  // — نفس دالة POST أعلاه، بحيث تبقى tax_amount متسقة دوماً مع amount.
  if (body.is_tax_invoice !== undefined || body.amount !== undefined) {
    const isTaxInvoice = body.is_tax_invoice !== undefined ? Boolean(body.is_tax_invoice) : Boolean(target.is_tax_invoice);
    const amount = patch.amount ?? target.amount;
    patch.is_tax_invoice = isTaxInvoice;
    patch.tax_amount = computeExpenseTax(isTaxInvoice, amount);
  }
  // استبدال/إرفاق ملف فاتورة جديد — نفس منطق POST أعلاه؛ ملف قديم على
  // Supabase Storage يبقى يتيماً بلا مشكلة (نفس منطق حذف صور المواعيد).
  if (body.invoice_file_data_url) {
    try {
      patch.invoice_file_url = await uploadExpenseInvoice(target.id, body.invoice_file_data_url);
      patch.invoice_file_name = body.invoice_file_name || undefined;
    } catch (err) {
      console.error('❌ فشل رفع ملف الفاتورة إلى Supabase Storage:', err);
      return res.status(500).json({ error: 'فشل رفع ملف الفاتورة' });
    }
  } else if (body.remove_invoice_file) {
    patch.invoice_file_url = undefined;
    patch.invoice_file_name = undefined;
  }
  const updated = store.expenses.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل مصروف "${updated.title}"`);
  res.json(updated);
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
// خصم المناسبة (اليوم الوطني، يوم التأسيس...) — سجل إعداد واحد يعدِّله
// المدير العام أو أحد المشرفَين من بطاقة "خصم المناسبة" في صفحة المبيعات
// (خلف صلاحية manage_sales_discount في الواجهة)، ثم يظهر كخيار اختياري
// عند إصدار أي فاتورة طالما بقي مفعَّلاً. القراءة عامة بلا قيد (تُستخدَم
// فقط لعرض حالته الحالية في نموذج فاتورة جديدة)، والتعديل غير مُتحقَّق منه
// على الخادم — نفس مستوى الحماية (واجهة فقط) لبقية مسارات هذا الملف.
// ---------------------------------------------------------------------------
api.get('/sales-discount-settings', (_req, res) => res.json(store.salesDiscountSettings.get()));

api.patch('/sales-discount-settings', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<SalesDiscountSettings> = {};
  if (body.named_discount_enabled !== undefined) patch.named_discount_enabled = Boolean(body.named_discount_enabled);
  if (body.named_discount_label !== undefined) patch.named_discount_label = String(body.named_discount_label).trim() || undefined;
  if (body.named_discount_kind !== undefined) {
    patch.named_discount_kind = body.named_discount_kind === 'fixed' ? 'fixed' : 'percent';
  }
  if (body.named_discount_percent !== undefined) {
    const percent = Number(body.named_discount_percent);
    patch.named_discount_percent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined;
  }
  if (body.named_discount_amount !== undefined) {
    const amount = Number(body.named_discount_amount);
    patch.named_discount_amount = Number.isFinite(amount) ? Math.max(0, amount) : undefined;
  }
  const updated = store.salesDiscountSettings.set(patch);
  logActivity(req, 'تم تعديل إعدادات خصم المناسبة في المبيعات');
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

// نتيجة حسم موحَّدة (نسبة أو مبلغ ثابت على حدٍّ سواء) — amount هو المصدر
// الموثوق الوحيد للقيمة المخصومة فعلياً بالريال؛ percent يُحفَظ فقط للعرض
// عندما يكون الخصم نسبياً (غائب لخصم بمبلغ ثابت).
interface ResolvedDiscount {
  label: string;
  kind: SalesDiscountKind;
  percent?: number;
  amount: number;
}

// خصم المناسبة المفعَّل حالياً من صفحة المبيعات — يُقرأ من الخادم مباشرة،
// لا يُوثَق بأي شيء يرسله العميل عدا اختياره تطبيقه أصلاً (discount_type
// === 'named'). preDiscountSubtotal يُستخدَم فقط لتقييد خصم المبلغ الثابت
// بألا يتجاوز قيمة الفاتورة نفسها (لا يمكن أن يصبح الإجمالي سالباً).
function resolveNamedDiscount(preDiscountSubtotal: number): ResolvedDiscount | null {
  const s = store.salesDiscountSettings.get();
  if (!s.named_discount_enabled) return null;
  const label = s.named_discount_label?.trim() || 'خصم مناسبة';
  if (s.named_discount_kind === 'fixed') {
    const amount = Number(s.named_discount_amount ?? 0);
    if (!(amount > 0)) return null;
    return { label, kind: 'fixed', amount: Math.min(amount, preDiscountSubtotal) };
  }
  const percent = Number(s.named_discount_percent ?? 0);
  if (!(percent > 0)) return null;
  return { label, kind: 'percent', percent, amount: Math.round(((preDiscountSubtotal * percent) / 100) * 100) / 100 };
}

// "الخصم المفتوح" الذي يُدخِله من يُصدر الفاتورة نفسها — نسبة أو مبلغ
// ثابت، كلاهما مقيَّد هنا على الخادم بألا يتجاوز ما يعادل
// OPEN_DISCOUNT_MAX_PERCENT من قيمة الفاتورة (سقف صارم غير قابل للتجاوز
// حتى لو أرسل الطلب قيمة أعلى مباشرةً — هذا هو التحقق الفعلي الوحيد،
// الواجهة تمنعه أيضاً لكن هذا ما يُعتَد به فعلياً).
function resolveOpenDiscount(body: Record<string, unknown>, preDiscountSubtotal: number): ResolvedDiscount | null {
  const label = 'خصم مفتوح';
  const maxFixedAmount = Math.round(((preDiscountSubtotal * OPEN_DISCOUNT_MAX_PERCENT) / 100) * 100) / 100;
  if (body.discount_kind === 'fixed') {
    const requested = Number(body.discount_amount ?? 0);
    if (!(Number.isFinite(requested) && requested > 0)) return null;
    return { label, kind: 'fixed', amount: Math.min(requested, maxFixedAmount, preDiscountSubtotal) };
  }
  const requested = Number(body.discount_percent ?? 0);
  if (!(Number.isFinite(requested) && requested > 0)) return null;
  const percent = Math.min(requested, OPEN_DISCOUNT_MAX_PERCENT);
  return { label, kind: 'percent', percent, amount: Math.round(((preDiscountSubtotal * percent) / 100) * 100) / 100 };
}

api.post('/invoices', (req, res) => {
  const body = req.body ?? {};
  const customer = store.customers.get(body.customer_id);
  // المبلغ المُرسَل من العميل يبقى دائماً "قبل الخصم" (سلوك الحقل نفسه
  // قبل إضافة هذه الميزة) — الخصم، إن وُجد، يُحتسَب هنا على الخادم فقط،
  // ولا يُوثَق بأي نسبة أو مبلغ يحسبه العميل بنفسه.
  const preDiscountSubtotal = Number(body.subtotal ?? 0);

  let discount: ResolvedDiscount | null = null;
  if (body.discount_type === 'named') discount = resolveNamedDiscount(preDiscountSubtotal);
  else if (body.discount_type === 'open') discount = resolveOpenDiscount(body, preDiscountSubtotal);

  const discountAmount = discount?.amount ?? 0;
  const subtotal = Math.round((preDiscountSubtotal - discountAmount) * 100) / 100;
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
    recorded_by: body.recorded_by || undefined,
    recorded_by_name: body.recorded_by_name || undefined,
    discount_label: discount?.label,
    discount_kind: discount?.kind,
    discount_percent: discount?.percent,
    discount_amount: discount ? discountAmount : undefined,
    pre_discount_subtotal: discount ? preDiscountSubtotal : undefined,
  };
  store.invoices.insert(invoice);
  const discountNote = discount
    ? ` بعد خصم "${discount.label}" (${discount.kind === 'fixed' ? `${discountAmount} ر.س` : `${discount.percent}٪`})`
    : '';
  logActivity(req, `تم إصدار فاتورة "${invoice.invoice_number}" للعميل "${invoice.customer_name_snapshot}" بقيمة ${invoice.total} ر.س${discountNote}`);
  res.status(201).json(invoice);
});

// الفواتير سجل مالي دائم عادةً (بلا حذف يومي) — هذا المسار مخصَّص فقط
// لمسح بيانات تجريبية كاملة قبل انطلاق فعلي (استُخدم بطلب صريح من
// المدير)، وليس جزءاً من أي تدفق استخدام عادي في الواجهة.
api.delete('/invoices/:id', (req, res) => {
  const target = store.invoices.list().find((i) => i.id === req.params.id);
  const removed = store.invoices.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف فاتورة "${target?.invoice_number ?? ''}"`);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// كشف حساب الموظف (تبويب داخل صفحة المحاسبة) — خصميات ومخالفات كل موظف.
// راتبه وعهدته وفواتيره تُشتق من /expenses، /custody-invoices و/invoices
// (custody_holder_id و recorded_by على التوالي)، فلا حاجة لمسارات إضافية
// لها هنا.
// ---------------------------------------------------------------------------
api.get('/employee-deductions', (req, res) => {
  const { employee_id } = req.query;
  let list = store.employeeDeductions.list();
  if (employee_id && typeof employee_id === 'string') {
    list = list.filter((d) => d.employee_id === employee_id);
  }
  res.json(list);
});

api.post('/employee-deductions', (req, res) => {
  const body = req.body ?? {};
  if (!body.employee_id || !body.title || body.amount === undefined) {
    return res.status(400).json({ error: 'employee_id، title و amount مطلوبة' });
  }
  const deduction: EmployeeDeduction = {
    id: store.id(),
    employee_id: body.employee_id,
    employee_name: store.profiles.get(body.employee_id)?.full_name ?? body.employee_name,
    title: body.title,
    category: body.category || undefined,
    amount: Number(body.amount) || 0,
    settled_amount: 0,
    installment_months: body.installment_months ? Math.max(1, Number(body.installment_months)) : 1,
    date: body.date ?? new Date().toISOString().slice(0, 10),
    notes: body.notes || undefined,
    recorded_by: body.recorded_by || undefined,
    recorded_by_name: body.recorded_by_name || undefined,
    created_at: new Date().toISOString(),
  };
  store.employeeDeductions.insert(deduction);
  logActivity(req, `تم إضافة خصم "${deduction.title}" على "${deduction.employee_name ?? ''}"`);
  res.status(201).json(deduction);
});

// تسوية خصم يدوياً بالكامل (بدل انتظار اكتمال أقساطه عبر الرواتب) — يضبط
// settled_amount = amount مباشرة.
api.patch('/employee-deductions/:id/settle', (req, res) => {
  const target = store.employeeDeductions.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'not found' });
  const updated = store.employeeDeductions.update(req.params.id, { settled_amount: target.amount });
  logActivity(req, `تم تسوية خصم "${target.title}" على "${target.employee_name ?? ''}" يدوياً`);
  res.json(updated);
});

api.delete('/employee-deductions/:id', (req, res) => {
  const target = store.employeeDeductions.list().find((d) => d.id === req.params.id);
  const removed = store.employeeDeductions.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف خصم "${target?.title ?? ''}" عن "${target?.employee_name ?? ''}"`);
  res.status(204).end();
});

api.get('/employee-violations', (req, res) => {
  const { employee_id } = req.query;
  let list = store.employeeViolations.list();
  if (employee_id && typeof employee_id === 'string') {
    list = list.filter((v) => v.employee_id === employee_id);
  }
  res.json(list);
});

api.post('/employee-violations', (req, res) => {
  const body = req.body ?? {};
  if (!body.employee_id || !body.title) {
    return res.status(400).json({ error: 'employee_id و title مطلوبة' });
  }
  const violation: EmployeeViolation = {
    id: store.id(),
    employee_id: body.employee_id,
    employee_name: store.profiles.get(body.employee_id)?.full_name ?? body.employee_name,
    title: body.title,
    amount: body.amount !== undefined && body.amount !== '' ? Number(body.amount) || 0 : undefined,
    date: body.date ?? new Date().toISOString().slice(0, 10),
    notes: body.notes || undefined,
    recorded_by: body.recorded_by || undefined,
    recorded_by_name: body.recorded_by_name || undefined,
    created_at: new Date().toISOString(),
  };
  store.employeeViolations.insert(violation);
  logActivity(req, `تم إضافة مخالفة "${violation.title}" على "${violation.employee_name ?? ''}"`);
  res.status(201).json(violation);
});

api.delete('/employee-violations/:id', (req, res) => {
  const target = store.employeeViolations.list().find((v) => v.id === req.params.id);
  const removed = store.employeeViolations.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف مخالفة "${target?.title ?? ''}" عن "${target?.employee_name ?? ''}"`);
  res.status(204).end();
});

// فرق الأشهر بين شهرين بصيغة YYYY-MM (شامل الطرفين) — 2026-01 إلى
// 2026-01 = 1 شهر، 2026-01 إلى 2026-04 = 4 أشهر.
function monthsBetweenInclusive(startMonth: string, endMonth: string): number {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

// قسط هذا الشهر من سلفية واحدة (Expense بفئة ADVANCE_CATEGORY_NAME) — بلا
// استقطاع تلقائي إطلاقاً ما لم يُختَر وضع صراحةً (advance_deduction_mode
// !== 'none'، انظر تعليقه في shared/types.ts). لوضع 'period' لا استقطاع
// خارج [advance_period_start, advance_period_end].
function computeAdvanceInstallment(advance: Expense, currentMonth: string): number {
  const mode = advance.advance_deduction_mode ?? 'none';
  if (mode === 'none') return 0;
  const remaining = advance.amount - (advance.advance_settled_amount ?? 0);
  if (remaining <= 0.005) return 0;

  if (mode === 'full_next') return Math.round(remaining * 100) / 100;

  if (mode === 'installments') {
    const months = Math.max(1, advance.advance_installment_months ?? 1);
    return Math.round(Math.min(advance.amount / months, remaining) * 100) / 100;
  }

  if (mode === 'period') {
    if (!advance.advance_period_start || !advance.advance_period_end) return 0;
    if (currentMonth < advance.advance_period_start || currentMonth > advance.advance_period_end) return 0;
    const months = monthsBetweenInclusive(advance.advance_period_start, advance.advance_period_end);
    return Math.round(Math.min(advance.amount / months, remaining) * 100) / 100;
  }

  return 0;
}

// تسجيل راتب شهري لموظف — الطريقة الوحيدة لإضافة مصروف رواتب الآن (لم تعد
// "رواتب" خياراً في نموذج "مصروف جديد" العام، انظر تعليق SALARY_CATEGORY_NAME
// وGeneralExpensesTab في Expenses.tsx). تحسب صافي الراتب تلقائياً: الراتب
// الثابت (Profile.monthly_salary) زائد عمولة هذا الشهر المستحقة له فعلياً
// (مسوّق أو مشرف — نفس computeCommissionReport المستخدَم في تبويب
// "العمولات"، وليس رقماً يرسله العميل)، ناقص قسط هذا الشهر من كل خصم نشط
// (له مبلغ متبقٍ لم يُسدَّد بعد — انظر تعليق installment_months في
// EmployeeDeduction) وقسط هذا الشهر من كل سلفية مجدولة للاستقطاع (انظر
// computeAdvanceInstallment أعلاه)، ثم تُنشئ مصروف رواتب بالصافي وتُحدِّث
// settled_amount/advance_settled_amount لكل ما شارك في الاستقطاع، بعملية
// واحدة ذرية.
api.post('/employees/:id/pay-salary', (req, res) => {
  const profile = store.profiles.get(req.params.id);
  if (!profile) return res.status(404).json({ error: 'الموظف غير موجود' });
  if (!profile.monthly_salary || profile.monthly_salary <= 0) {
    return res.status(400).json({ error: 'الراتب الشهري لهذا الموظف غير محدَّد بعد' });
  }
  const body = req.body ?? {};
  const month = typeof body.month === 'string' && /^\d{4}-\d{2}$/.test(body.month) ? body.month : new Date().toISOString().slice(0, 7);
  const baseSalary = profile.monthly_salary;
  const commissionReport = computeCommissionReport(month);
  const commission =
    commissionReport.marketers.find((m) => m.profile_id === profile.id)?.commission_due ??
    commissionReport.supervisors.find((s) => s.profile_id === profile.id)?.commission_due ??
    0;
  const gross = Math.round((baseSalary + commission) * 100) / 100;

  const activeDeductions = store.employeeDeductions
    .list()
    .filter((d) => d.employee_id === profile.id && d.amount - (d.settled_amount ?? 0) > 0.005);

  let totalWithheld = 0;
  const applied: { deduction: EmployeeDeduction; installment: number }[] = [];
  for (const d of activeDeductions) {
    const remaining = d.amount - (d.settled_amount ?? 0);
    const perMonth = d.amount / Math.max(1, d.installment_months ?? 1);
    const installment = Math.round(Math.min(perMonth, remaining) * 100) / 100;
    if (installment <= 0) continue;
    totalWithheld += installment;
    applied.push({ deduction: d, installment });
  }

  // سلفيات هذا الموظف المجدولة للاستقطاع فقط (advance_deduction_mode !== 'none')
  // — انظر computeAdvanceInstallment أعلاه.
  const scheduledAdvances = store.expenses
    .list()
    .filter((e) => e.category === ADVANCE_CATEGORY_NAME && e.custody_holder_id === profile.id && (e.advance_deduction_mode ?? 'none') !== 'none');
  let totalAdvanceWithheld = 0;
  const appliedAdvances: { advance: Expense; installment: number }[] = [];
  for (const a of scheduledAdvances) {
    const installment = computeAdvanceInstallment(a, month);
    if (installment <= 0) continue;
    totalAdvanceWithheld += installment;
    appliedAdvances.push({ advance: a, installment });
  }

  const totalWithheldAll = Math.round((totalWithheld + totalAdvanceWithheld) * 100) / 100;
  const net = Math.max(Math.round((gross - totalWithheldAll) * 100) / 100, 0);

  const noteParts: string[] = [`راتب أساسي ${baseSalary} ر.س`];
  if (commission > 0) noteParts.push(`+ عمولة ${commission} ر.س (${month})`);
  if (totalWithheld > 0) noteParts.push(`- خصميات ${totalWithheld} ر.س (${applied.length} خصم نشط)`);
  if (totalAdvanceWithheld > 0) noteParts.push(`- سلفيات ${totalAdvanceWithheld} ر.س (${appliedAdvances.length} سلفية مجدولة)`);
  noteParts.push(`= صافي ${net} ر.س`);

  const expense = store.expenses.insert({
    id: store.id(),
    title: `راتب ${profile.full_name} — ${body.month_label ?? month}`,
    category: SALARY_CATEGORY_NAME,
    entry_type: 'expense',
    period_type: 'monthly',
    amount: net,
    date: body.date ?? new Date().toISOString().slice(0, 10),
    recorded_by: body.recorded_by ?? 'unknown',
    recorded_by_name: body.recorded_by_name,
    custody_holder_id: profile.id,
    custody_holder_name: profile.full_name,
    payment_method: body.payment_method ?? 'bank_transfer',
    notes: commission > 0 || totalWithheldAll > 0 ? noteParts.join(' ') : undefined,
    created_at: new Date().toISOString(),
  });

  for (const { deduction, installment } of applied) {
    store.employeeDeductions.update(deduction.id, { settled_amount: (deduction.settled_amount ?? 0) + installment });
  }
  for (const { advance, installment } of appliedAdvances) {
    store.expenses.update(advance.id, { advance_settled_amount: (advance.advance_settled_amount ?? 0) + installment });
  }

  logActivity(req, `تم تسجيل راتب "${profile.full_name}" — إجمالي ${gross} ر.س (منه عمولة ${commission} ر.س)، صافي ${net} ر.س بعد الخصميات والسلفيات`);
  res.status(201).json({
    expense,
    base_salary: baseSalary,
    commission,
    gross,
    withheld: totalWithheldAll,
    withheld_deductions: totalWithheld,
    withheld_advances: totalAdvanceWithheld,
    net,
    deductions: store.employeeDeductions.list().filter((d) => d.employee_id === profile.id),
  });
});

// مكافأة نهاية الخدمة وفق المادتين ٨٤ و٨٥ من نظام العمل السعودي — تقدير
// أولي مبني على أشيع صيغتين في النظام:
//  المادة ٨٤: نصف أجر شهر عن كل سنة من أول ٥ سنوات، وأجر شهر كامل عن كل
//  سنة تالية بعد ذلك، على أساس آخر أجر (الراتب الشهري الحالي).
//  المادة ٨٥: عند الاستقالة فقط، تُخفَّض المكافأة تناسبياً حسب مدة الخدمة
//  (أقل من سنتين = لا شيء، ٢-٥ سنوات = الثلث، ٥-١٠ = الثلثان، ١٠ فأكثر =
//  كاملة). إنهاء من صاحب العمل أو انتهاء مدة العقد = المكافأة كاملة دون
//  أي خصم تناسبي، بصرف النظر عن المدة.
// ملاحظة: هذا تقدير آلي مبسَّط لأشيع الحالات فقط — لا يغطي حالات الفصل
// التأديبي بلا مكافأة (المادة ٨٠)، رصيد الإجازات غير المستخدَمة، أو بدل
// الإشعار؛ يُنصح دوماً بمراجعتها مع مختص قبل الصرف النهائي.
function computeEndOfServiceGratuity(
  hireDate: string,
  terminationDate: string,
  lastMonthlySalary: number,
  reason: TerminationReason,
): { years: number; fullGratuity: number; fraction: number; gratuity: number } {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = Math.max(0, (new Date(terminationDate).getTime() - new Date(hireDate).getTime()) / msPerYear);
  const first5 = Math.min(years, 5);
  const beyond5 = Math.max(years - 5, 0);
  const fullGratuity = Math.round((first5 * 0.5 + beyond5 * 1) * lastMonthlySalary * 100) / 100;

  let fraction = 1;
  if (reason === 'resignation') {
    if (years < 2) fraction = 0;
    else if (years < 5) fraction = 1 / 3;
    else if (years < 10) fraction = 2 / 3;
    else fraction = 1;
  }

  return {
    years: Math.round(years * 100) / 100,
    fullGratuity,
    fraction,
    gratuity: Math.round(fullGratuity * fraction * 100) / 100,
  };
}

// إنهاء عقد موظف — يحتسب مكافأة نهاية الخدمة تلقائياً (انظر
// computeEndOfServiceGratuity أعلاه)، يسجّلها كمصروف مستقل عن الراتب
// الشهري، يحفظ تفاصيل الإنهاء على ملف الموظف، ويعطّل حسابه (is_active).
api.post('/employees/:id/terminate', (req, res) => {
  const profile = store.profiles.get(req.params.id);
  if (!profile) return res.status(404).json({ error: 'الموظف غير موجود' });
  if (!profile.hire_date) return res.status(400).json({ error: 'تاريخ التعيين غير محدَّد — لا يمكن احتساب مدة الخدمة بدونه' });
  if (!profile.monthly_salary || profile.monthly_salary <= 0) {
    return res.status(400).json({ error: 'الراتب الشهري لهذا الموظف غير محدَّد — أساس احتساب المكافأة' });
  }
  const body = req.body ?? {};
  const reason: TerminationReason =
    body.reason === 'resignation' || body.reason === 'contract_expiry' ? body.reason : 'employer_termination';
  const terminationDate = body.termination_date || new Date().toISOString().slice(0, 10);

  const result = computeEndOfServiceGratuity(profile.hire_date, terminationDate, profile.monthly_salary, reason);

  let expense = null;
  if (result.gratuity > 0) {
    expense = store.expenses.insert({
      id: store.id(),
      title: `مكافأة نهاية خدمة — ${profile.full_name}`,
      category: 'مكافأة نهاية الخدمة',
      entry_type: 'expense',
      period_type: 'daily',
      amount: result.gratuity,
      date: terminationDate,
      recorded_by: body.recorded_by ?? 'unknown',
      recorded_by_name: body.recorded_by_name,
      custody_holder_id: profile.id,
      custody_holder_name: profile.full_name,
      payment_method: body.payment_method ?? 'bank_transfer',
      notes: `مدة الخدمة ${result.years} سنة، سبب الإنهاء: ${TERMINATION_REASON_LABELS_AR[reason]}، آخر راتب شهري ${profile.monthly_salary} ر.س، إجمالي المكافأة قبل أي خصم تناسبي ${result.fullGratuity} ر.س${result.fraction < 1 ? ` (نسبة الاستحقاق ${Math.round(result.fraction * 100)}%)` : ''}.`,
      created_at: new Date().toISOString(),
    });
  }

  const updated = store.profiles.update(profile.id, {
    termination_date: terminationDate,
    termination_reason: reason,
    end_of_service_amount: result.gratuity,
    is_active: false,
  });

  logActivity(
    req,
    `تم إنهاء عقد "${profile.full_name}" (${TERMINATION_REASON_LABELS_AR[reason]}) — مكافأة نهاية الخدمة ${result.gratuity} ر.س عن ${result.years} سنة خدمة`,
  );
  res.status(201).json({ profile: toSafeProfile(updated!), expense, ...result });
});

// ---------------------------------------------------------------------------
// نظام العمولات — إعدادات (نقطة تعادل، مستهدفات، شرائح تصاعدية، من
// يستحق فعلياً) + تقرير محسوب شهرياً. لا تحقق صلاحيات على مستوى الخادم
// (كبقية هذا التطبيق) — view_commissions/manage_commissions يُطبَّقان في
// الواجهة فقط.
// ---------------------------------------------------------------------------
api.get('/commission-config', (_req, res) => res.json(store.commissionConfig.get()));

api.patch('/commission-config', (req, res) => {
  const body = req.body ?? {};
  const current = store.commissionConfig.get();
  const next: CommissionConfig = {
    monthly_fixed_expenses: body.monthly_fixed_expenses !== undefined ? Number(body.monthly_fixed_expenses) : current.monthly_fixed_expenses,
    effective_work_days: body.effective_work_days !== undefined ? Number(body.effective_work_days) : current.effective_work_days,
    base_target: body.base_target !== undefined ? Number(body.base_target) : current.base_target,
    growth_target: body.growth_target !== undefined ? Number(body.growth_target) : current.growth_target,
    stretch_target: body.stretch_target !== undefined ? Number(body.stretch_target) : current.stretch_target,
    supervisor_max_complaint_rate:
      body.supervisor_max_complaint_rate !== undefined ? Number(body.supervisor_max_complaint_rate) : current.supervisor_max_complaint_rate,
    min_company_share: body.min_company_share !== undefined ? Number(body.min_company_share) : current.min_company_share,
    updated_at: new Date().toISOString(),
  };
  store.commissionConfig.set(next);
  logActivity(req, 'تم تعديل إعدادات العمولات');
  res.json(next);
});

api.get('/commission-tiers', (_req, res) => res.json(store.commissionTiers.list()));

api.post('/commission-tiers', (req, res) => {
  const body = req.body ?? {};
  if (body.from === undefined || body.marketer_rate === undefined || body.supervisor_rate === undefined) {
    return res.status(400).json({ error: 'from, marketer_rate و supervisor_rate مطلوبة' });
  }
  const tier: CommissionTier = {
    id: store.id(),
    from: Number(body.from),
    to: body.to === null || body.to === undefined || body.to === '' ? null : Number(body.to),
    marketer_rate: Number(body.marketer_rate),
    supervisor_rate: Number(body.supervisor_rate),
  };
  store.commissionTiers.insert(tier);
  logActivity(req, `تم إضافة شريحة عمولة (${tier.from} - ${tier.to ?? '∞'})`);
  res.status(201).json(tier);
});

api.patch('/commission-tiers/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<CommissionTier> = {};
  if (body.from !== undefined) patch.from = Number(body.from);
  if (body.to !== undefined) patch.to = body.to === null || body.to === '' ? null : Number(body.to);
  if (body.marketer_rate !== undefined) patch.marketer_rate = Number(body.marketer_rate);
  if (body.supervisor_rate !== undefined) patch.supervisor_rate = Number(body.supervisor_rate);
  const updated = store.commissionTiers.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل شريحة عمولة (${updated.from} - ${updated.to ?? '∞'})`);
  res.json(updated);
});

api.delete('/commission-tiers/:id', (req, res) => {
  const target = store.commissionTiers.list().find((t) => t.id === req.params.id);
  const removed = store.commissionTiers.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف شريحة عمولة (${target?.from ?? ''} - ${target?.to ?? '∞'})`);
  res.status(204).end();
});

api.get('/commission-eligibility', (_req, res) => res.json(store.commissionEligibility.list()));

api.post('/commission-eligibility', (req, res) => {
  const body = req.body ?? {};
  if (!body.profile_id || (body.role !== 'marketer' && body.role !== 'supervisor')) {
    return res.status(400).json({ error: 'profile_id و role (marketer|supervisor) مطلوبان' });
  }
  const profile = store.profiles.get(body.profile_id);
  const entry: CommissionEligibility = {
    id: store.id(),
    profile_id: body.profile_id,
    profile_name: profile?.full_name,
    role: body.role,
    active: body.active ?? true,
    created_at: new Date().toISOString(),
  };
  store.commissionEligibility.insert(entry);
  logActivity(req, `تم إضافة "${entry.profile_name ?? ''}" كمستحق عمولة ${entry.role === 'marketer' ? 'مسوّق' : 'مشرف'}`);
  res.status(201).json(entry);
});

api.patch('/commission-eligibility/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<CommissionEligibility> = {};
  if (body.active !== undefined) patch.active = !!body.active;
  if (body.discount_code !== undefined) {
    const code = String(body.discount_code).trim();
    if (code) {
      // فريد بين كل المسوّقين النشطين (غير حسّاس لحالة الأحرف) — كودان
      // متطابقان يجعلان تحليل الكود عند الحجز غامضاً (أي مسوّق يُقصَد؟).
      const clash = store.commissionEligibility
        .list()
        .find(
          (e) =>
            e.id !== req.params.id &&
            e.role === 'marketer' &&
            e.active &&
            e.discount_code?.trim().toLowerCase() === code.toLowerCase(),
        );
      if (clash) {
        return res.status(409).json({ error: `هذا الكود مستخدَم بالفعل من "${clash.profile_name ?? 'مسوّق آخر'}"` });
      }
    }
    patch.discount_code = code || undefined;
  }
  if (body.discount_kind !== undefined) patch.discount_kind = body.discount_kind === 'fixed' ? 'fixed' : 'percent';
  if (body.discount_percent !== undefined) {
    const percent = Number(body.discount_percent);
    patch.discount_percent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined;
  }
  if (body.discount_amount !== undefined) {
    const amount = Number(body.discount_amount);
    patch.discount_amount = Number.isFinite(amount) ? Math.max(0, amount) : undefined;
  }
  const updated = store.commissionEligibility.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(
    req,
    body.active !== undefined
      ? `${updated.active ? 'تم تفعيل' : 'تم إيقاف'} استحقاق عمولة "${updated.profile_name ?? ''}"`
      : `تم تعديل كود خصم المسوّق "${updated.profile_name ?? ''}"`,
  );
  res.json(updated);
});

api.delete('/commission-eligibility/:id', (req, res) => {
  const target = store.commissionEligibility.list().find((e) => e.id === req.params.id);
  const removed = store.commissionEligibility.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف استحقاق عمولة "${target?.profile_name ?? ''}"`);
  res.status(204).end();
});

// تقرير محسوب لشهر محدَّد (افتراضياً الشهر الحالي) — الإيراد المحصَّل
// الفعلي فقط (Payment.recorded_at ضمن الشهر، بصرف النظر عن تاريخ الموعد
// نفسه)، الشرائح التصاعدية مطبَّقة على إجمالي إيراد الشركة (لا إيراد كل
// شخص وحده)، ثم توزَّع كل من حصة المسوّقين وحصة المشرفين نسبياً حسب حصة
// كل شخص الفعلية من إجمالي إيراد الشركة. شرط الأمان (أدنى حصة للشركة)
// يُخفِّض كل الحصص المستحقة تناسبياً (لا يُلغي الاستحقاق نفسه) لو
// تجاوزتها الشرائح المُعدَّة يدوياً.
// مستخرَجة كدالة مستقلة (بدل بقائها داخل معالج GET /commission-report
// فقط) حتى يستدعيها أيضاً POST /employees/:id/pay-salary — العمولة
// المستحقة لهذا الشهر تُضاف تلقائياً كزيادة على الراتب الصافي عند تسجيله،
// دون تكرار منطق الاحتساب أو تصديق رقم يرسله العميل.
function computeCommissionReport(month: string) {
  const config = store.commissionConfig.get();
  const tiers = store.commissionTiers.list();
  const appointments = store.appointments.list();
  const customers = store.customers.list();
  const ratings = store.ratings.list();

  const inMonth = (iso: string) => iso.slice(0, 7) === month;

  let companyRevenue = 0;
  const revenueByCustomer = new Map<string, number>();
  const revenueBySupervisor = new Map<string, number>();
  const revenueByMarketer = new Map<string, number>();
  const customersById = new Map(customers.map((c) => [c.id, c]));
  for (const a of appointments) {
    // كود خصم مسوّق طُبِّق عند حجز هذا الموعد تحديداً (Appointment.marketer_id)
    // يتفوّق على مسوّق العميل الثابت (customer.marketer_id) — عائد هذا
    // الموعد وحده يُنسَب لصاحب الكود، بصرف النظر عن مسوّق العميل المعتاد.
    // غياب الكود يعني: نفس السلوك السابق تماماً (الاعتماد على مسوّق العميل).
    const effectiveMarketerId = a.marketer_id ?? customersById.get(a.customer_id)?.marketer_id;
    for (const p of a.payments) {
      if (!inMonth(p.recorded_at)) continue;
      companyRevenue += p.amount;
      revenueByCustomer.set(a.customer_id, (revenueByCustomer.get(a.customer_id) ?? 0) + p.amount);
      if (a.supervisor_id) revenueBySupervisor.set(a.supervisor_id, (revenueBySupervisor.get(a.supervisor_id) ?? 0) + p.amount);
      if (effectiveMarketerId) revenueByMarketer.set(effectiveMarketerId, (revenueByMarketer.get(effectiveMarketerId) ?? 0) + p.amount);
    }
  }
  companyRevenue = Math.round(companyRevenue * 100) / 100;

  // نسبة شكاوى كل مشرف هذا الشهر — تقييمات ١-٢ نجوم ÷ إجمالي التقييمات
  // على مواعيد ذلك المشرف تحديداً (Rating.created_at ضمن الشهر).
  const apptById = new Map(appointments.map((a) => [a.id, a]));
  const complaintStatsBySupervisor = new Map<string, { total: number; complaints: number }>();
  for (const r of ratings) {
    if (!inMonth(r.created_at)) continue;
    const appt = apptById.get(r.appointment_id);
    if (!appt?.supervisor_id) continue;
    const stat = complaintStatsBySupervisor.get(appt.supervisor_id) ?? { total: 0, complaints: 0 };
    stat.total += 1;
    if (r.stars <= 2) stat.complaints += 1;
    complaintStatsBySupervisor.set(appt.supervisor_id, stat);
  }

  const excess = Math.max(0, Math.round((companyRevenue - config.base_target) * 100) / 100);

  function tierPoolAmount(rateKey: 'marketer_rate' | 'supervisor_rate'): number {
    let total = 0;
    for (const tier of tiers) {
      if (companyRevenue <= tier.from) continue;
      const upper = tier.to ?? Infinity;
      const amountInTier = Math.min(companyRevenue, upper) - tier.from;
      if (amountInTier <= 0) continue;
      total += amountInTier * tier[rateKey];
    }
    return total;
  }

  const rawMarketerPool = excess > 0 ? tierPoolAmount('marketer_rate') : 0;
  const rawSupervisorPool = excess > 0 ? tierPoolAmount('supervisor_rate') : 0;
  const rawTotal = rawMarketerPool + rawSupervisorPool;
  const maxAllowedTotal = excess * (1 - config.min_company_share);
  const safetyScale = excess > 0 && rawTotal > maxAllowedTotal && rawTotal > 0 ? maxAllowedTotal / rawTotal : 1;

  const marketerPool = Math.round(rawMarketerPool * safetyScale * 100) / 100;
  const supervisorPool = Math.round(rawSupervisorPool * safetyScale * 100) / 100;

  const eligibility = store.commissionEligibility.list().filter((e) => e.active);

  const marketers = eligibility
    .filter((e) => e.role === 'marketer')
    .map((e) => {
      const personalRevenue = revenueByMarketer.get(e.profile_id) ?? 0;
      const share = companyRevenue > 0 ? personalRevenue / companyRevenue : 0;
      return {
        profile_id: e.profile_id,
        profile_name: e.profile_name ?? store.profiles.get(e.profile_id)?.full_name ?? '',
        personal_revenue: Math.round(personalRevenue * 100) / 100,
        share_percent: Math.round(share * 10000) / 100,
        commission_due: Math.round(marketerPool * share * 100) / 100,
      };
    });

  const supervisors = eligibility
    .filter((e) => e.role === 'supervisor')
    .map((e) => {
      const personalRevenue = revenueBySupervisor.get(e.profile_id) ?? 0;
      const stat = complaintStatsBySupervisor.get(e.profile_id);
      const complaintRate = stat && stat.total > 0 ? stat.complaints / stat.total : 0;
      const eligible = complaintRate <= config.supervisor_max_complaint_rate;
      const share = companyRevenue > 0 ? personalRevenue / companyRevenue : 0;
      return {
        profile_id: e.profile_id,
        profile_name: e.profile_name ?? store.profiles.get(e.profile_id)?.full_name ?? '',
        personal_revenue: Math.round(personalRevenue * 100) / 100,
        share_percent: Math.round(share * 10000) / 100,
        complaint_rate: Math.round(complaintRate * 10000) / 100,
        rated_count: stat?.total ?? 0,
        eligible,
        commission_due: eligible ? Math.round(supervisorPool * share * 100) / 100 : 0,
      };
    });

  const totalMarketerDue = Math.round(marketers.reduce((s, m) => s + m.commission_due, 0) * 100) / 100;
  const totalSupervisorDue = Math.round(supervisors.reduce((s, v) => s + v.commission_due, 0) * 100) / 100;

  return {
    month,
    config,
    tiers,
    company_revenue: companyRevenue,
    daily_breakeven: Math.round((config.monthly_fixed_expenses / config.effective_work_days) * 100) / 100,
    excess,
    progress_percent: config.base_target > 0 ? Math.round((companyRevenue / config.base_target) * 10000) / 100 : 0,
    raw_marketer_pool: Math.round(rawMarketerPool * 100) / 100,
    raw_supervisor_pool: Math.round(rawSupervisorPool * 100) / 100,
    safety_scale_applied: safetyScale < 1,
    marketer_pool: marketerPool,
    supervisor_pool: supervisorPool,
    total_marketer_due: totalMarketerDue,
    total_supervisor_due: totalSupervisorDue,
    company_net_share: Math.round((companyRevenue - totalMarketerDue - totalSupervisorDue) * 100) / 100,
    marketers,
    supervisors,
  };
}

api.get('/commission-report', (req, res) => {
  const month =
    typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
  res.json(computeCommissionReport(month));
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
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const lead: Lead = {
    id: store.id(),
    name: name.slice(0, 200),
    phone: normalizeSaudiPhone(phone),
    area: typeof body.area === 'string' && body.area.trim() ? body.area.trim().slice(0, 200) : undefined,
    service_name: typeof body.service_name === 'string' && body.service_name.trim() ? body.service_name.trim().slice(0, 200) : undefined,
    message: typeof body.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 1000) : undefined,
    status: 'new',
    created_at: new Date().toISOString(),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    preferred_date: typeof body.preferred_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.preferred_date) ? body.preferred_date : undefined,
    preferred_time: ['morning', 'afternoon', 'evening'].includes(body.preferred_time) ? body.preferred_time : undefined,
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

// ---------------------------------------------------------------------------
// دردشة مباشرة — أيقونة عائمة في صفحة "اطلب الخدمة" العامة (بلا تسجيل
// دخول)، بديل/تكملة لواتساب لكن بشرية بالكامل عمداً (بلا ذكاء اصطناعي):
// كل رسالة عميل تُنبِّه الإدارة فوراً (نفس leadNotifyProfileIds أعلاه)،
// والرد يكتبه موظف يدوياً من الإعدادات ← الطلبات الخارجية (LandingPageTab
// في Settings.tsx، خلف صلاحية edit_landing_page). نقطتا POST/GET أدناه
// عامتان (نفس مستوى حماية /public/leads)، والباقي للاستخدام الداخلي فقط.
// ---------------------------------------------------------------------------
api.post('/public/chat/messages', (req, res) => {
  const body = req.body ?? {};
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  if (!text) return res.status(400).json({ error: 'نص الرسالة مطلوب' });

  const threadId = typeof body.thread_id === 'string' ? body.thread_id : undefined;
  let thread = threadId ? store.liveChatThreads.get(threadId) : undefined;
  const isNewThread = !thread;
  if (!thread) {
    const now = new Date().toISOString();
    thread = store.liveChatThreads.insert({
      id: store.id(),
      customer_name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 200) : undefined,
      customer_phone: typeof body.phone === 'string' && body.phone.trim() ? normalizeSaudiPhone(body.phone.trim()) : undefined,
      messages: [],
      status: 'open',
      unread: false,
      created_at: now,
      updated_at: now,
    });
  }

  const updated = store.liveChatThreads.appendMessage(
    thread.id,
    { id: store.id(), direction: 'in', text, created_at: new Date().toISOString() },
    { unread: true },
  );
  if (isNewThread) logActivity(req, `محادثة دردشة مباشرة جديدة${thread.customer_name ? ` من "${thread.customer_name}"` : ''}`);
  res.status(201).json({ thread_id: thread.id, messages: updated?.messages ?? [] });

  sendPushToProfiles(leadNotifyProfileIds(), {
    title: 'رسالة دردشة مباشرة جديدة',
    body: `${thread.customer_name ?? 'زائر'}: ${text.slice(0, 80)}`,
    url: '/settings',
    tag: `live-chat-${thread.id}`,
  }).catch((err) => console.error('❌ فشل إرسال تنبيه الدردشة المباشرة:', err));
});

// يستطلعها العميل (polling) بعد إرسال أول رسالة ليرى ردود الموظف.
api.get('/public/chat/:id/messages', (req, res) => {
  const thread = store.liveChatThreads.get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'not found' });
  res.json({ messages: thread.messages, status: thread.status });
});

api.get('/chat/threads', (_req, res) => res.json(store.liveChatThreads.list()));

api.post('/chat/threads/:id/reply', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 2000) : '';
  if (!text) return res.status(400).json({ error: 'نص الرد مطلوب' });
  const thread = store.liveChatThreads.get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'not found' });
  const senderName = typeof req.body?.sender_name === 'string' ? req.body.sender_name : undefined;
  const updated = store.liveChatThreads.appendMessage(
    thread.id,
    { id: store.id(), direction: 'out', text, sender_name: senderName, created_at: new Date().toISOString() },
    { unread: false },
  );
  res.json(updated);
});

// إغلاق/إعادة فتح محادثة، أو تعليمها كمقروءة بلا رد (فتح الموظف لها فقط).
api.patch('/chat/threads/:id', (req, res) => {
  const patch: Partial<LiveChatThread> = {};
  if (req.body?.status === 'open' || req.body?.status === 'closed') patch.status = req.body.status;
  if (req.body?.unread === false) patch.unread = false;
  const updated = store.liveChatThreads.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

api.delete('/chat/threads/:id', (req, res) => {
  const removed = store.liveChatThreads.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// مناطق الرياض — تقسيم جغرافي (شمال/جنوب/شرق/غرب/وسط افتراضياً) يُدار من
// الإعدادات ← مناطق الرياض (خلف صلاحية manage_riyadh_zones)، ويُستخدم عند
// حجز موعد جديد لاقتراح أفضل أيام الأسبوع حسب حيّ العميل. انظر RiyadhZone/
// NeighborhoodZoneAssignment في src/shared/types.ts.
// ---------------------------------------------------------------------------
api.get('/riyadh-zones', (_req, res) => res.json(store.riyadhZones.list()));

api.post('/riyadh-zones', (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'اسم المنطقة مطلوب' });
  const now = new Date().toISOString();
  const zone: RiyadhZone = {
    id: store.id(),
    name,
    color: typeof body.color === 'string' && body.color ? body.color : '#64748B',
    boundary: Array.isArray(body.boundary) ? body.boundary : undefined,
    preferred_weekdays: Array.isArray(body.preferred_weekdays) ? body.preferred_weekdays : [],
    created_at: now,
    updated_at: now,
  };
  store.riyadhZones.insert(zone);
  logActivity(req, `تم إضافة منطقة "${zone.name}" إلى تقسيم الرياض`);
  res.status(201).json(zone);
});

api.patch('/riyadh-zones/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<RiyadhZone> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.color === 'string' && body.color) patch.color = body.color;
  if (Array.isArray(body.boundary)) patch.boundary = body.boundary;
  if (Array.isArray(body.preferred_weekdays)) patch.preferred_weekdays = body.preferred_weekdays;
  const updated = store.riyadhZones.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم تعديل منطقة "${updated.name}"`);
  res.json(updated);
});

api.delete('/riyadh-zones/:id', (req, res) => {
  const target = store.riyadhZones.get(req.params.id);
  const removed = store.riyadhZones.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  logActivity(req, `تم حذف منطقة "${target?.name ?? ''}" من تقسيم الرياض`);
  res.status(204).end();
});

api.get('/neighborhood-zones', (_req, res) => res.json(store.neighborhoodZoneAssignments.list()));

api.post('/neighborhood-zones', (req, res) => {
  const body = req.body ?? {};
  const neighborhood = typeof body.neighborhood === 'string' ? body.neighborhood.trim() : '';
  const zone_id = typeof body.zone_id === 'string' ? body.zone_id : '';
  if (!neighborhood || !zone_id) return res.status(400).json({ error: 'اسم الحي والمنطقة مطلوبان' });
  const row = store.neighborhoodZoneAssignments.insert({ id: store.id(), neighborhood, zone_id });
  logActivity(req, `تم ربط حي "${neighborhood}" بمنطقة "${store.riyadhZones.get(zone_id)?.name ?? ''}"`);
  res.status(201).json(row);
});

api.patch('/neighborhood-zones/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<NeighborhoodZoneAssignment> = {};
  if (typeof body.neighborhood === 'string' && body.neighborhood.trim()) patch.neighborhood = body.neighborhood.trim();
  if (typeof body.zone_id === 'string' && body.zone_id) patch.zone_id = body.zone_id;
  const updated = store.neighborhoodZoneAssignments.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

api.delete('/neighborhood-zones/:id', (req, res) => {
  const removed = store.neighborhoodZoneAssignments.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// ذاكرة تخزين مؤقت لمواقع الأحياء جغرافياً (Nominatim) — تُستخدَم في
// "الخريطة الحرارية" بصفحة العملاء (Customers.tsx). العميل نفسه يبحث عبر
// Nominatim مباشرة (نفس ما يفعله تبويب "مناطق الرياض")، ثم يحفظ هنا كل
// نتيجة جديدة عبر POST حتى لا يُعاد البحث عن نفس الحيّ من متصفح آخر أو
// زيارة لاحقة لنفس الصفحة.
// ---------------------------------------------------------------------------
api.get('/district-geocodes', (_req, res) => res.json(store.districtGeocodes.list()));

api.post('/district-geocodes', (req, res) => {
  const body = req.body ?? {};
  const district = typeof body.district === 'string' ? body.district.trim() : '';
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!district || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'district وlat وlng مطلوبة' });
  }
  const entry: DistrictGeocode = { district, lat, lng, resolved_at: new Date().toISOString() };
  store.districtGeocodes.upsert(entry);
  res.status(201).json(entry);
});

// نقطة انطلاق الفريق الميداني (سكن العمال افتراضياً) — نفس خريطة مناطق
// الرياض، علامة واحدة قابلة للسحب وإعادة التموضع (انظر WorkersHousingLocation).
api.get('/workers-housing-location', (_req, res) => res.json(store.workersHousingLocation.get()));

api.patch('/workers-housing-location', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<WorkersHousingLocation> = {};
  if (typeof body.lat === 'number') patch.lat = body.lat;
  if (typeof body.lng === 'number') patch.lng = body.lng;
  if (typeof body.label === 'string' && body.label.trim()) patch.label = body.label.trim();
  const updated = store.workersHousingLocation.set(patch);
  logActivity(req, `تم تحديث موقع "${updated.label}" على خريطة مناطق الرياض`);
  res.json(updated);
});

// بيانات الحساب البنكي للشركة — سجل واحد، تُدار من الإعدادات ← طرق الدفع
// وتُستخدَم لإنشاء صورة قابلة للمشاركة عند اختيار "حوالة بنكية" كطريقة دفع
// (انظر CompanyBankAccount).
api.get('/company-bank-account', (_req, res) => res.json(store.companyBankAccount.get()));

api.patch('/company-bank-account', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<CompanyBankAccount> = {};
  if (typeof body.account_holder_name === 'string') patch.account_holder_name = body.account_holder_name.trim();
  if (typeof body.bank_name === 'string') patch.bank_name = body.bank_name.trim();
  if (typeof body.iban === 'string') patch.iban = body.iban.trim();
  if (typeof body.account_number === 'string') patch.account_number = body.account_number.trim();
  if (typeof body.swift_code === 'string') patch.swift_code = body.swift_code.trim();
  const updated = store.companyBankAccount.set(patch);
  logActivity(req, 'تم تحديث بيانات الحساب البنكي للشركة');
  res.json(updated);
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
// ويب هوك واتساب (Twilio) — نقطة POST واحدة تستقبل كل رسالة عميل واردة
// (Twilio لا تحتاج مصافحة تحقق منفصلة كـ Meta). الجسم يصل بصيغة
// form-urlencoded (انظر express.urlencoded في index.ts/api/index.ts)، بحقول
// From/To/Body/MessageSid/ProfileName المسطّحة القياسية لدى Twilio. عامة
// بالضرورة (نفس مستوى حماية /public/leads) — انظر src/server/lib/
// whatsappBot.ts لمعالجة الرسائل فعلياً.
// ---------------------------------------------------------------------------
api.post('/whatsapp/webhook', async (req, res) => {
  // يُنتظَر هنا فعلياً قبل الرد — على عكس نمط "رد فوري ثم عمل بالخلفية"
  // المعتاد لهذه الأنواع من الويب هوك: بيئة Vercel Serverless تُجمِّد/تُنهي
  // الدالة بعد إرسال الاستجابة مباشرة، فأي عمل غير مُنتظَر بعد res.sendStatus
  // (استدعاء الذكاء الاصطناعي، الكتابة على قاعدة البيانات) قد يُقطَع قبل
  // اكتماله فعلياً بلا أي خطأ ظاهر (هذا بالضبط ما حدث عند أول نشر — الرد
  // وصل 200 لكن لم يُنشأ أي شيء). Twilio تتحمل استجابة تستغرق عدة ثوانٍ.
  try {
    await handleIncomingWhatsappMessage(req.body);
  } catch (err) {
    console.error('❌ فشل معالجة رسالة واتساب واردة:', err);
  }
  // TwiML فارغ صراحةً (وليس res.sendStatus(200) — نص جسمها الافتراضي
  // الحرفي هو "OK"، وTwilio تُرسِل أي جسم استجابة غير XML صالح كرسالة
  // واتساب تلقائية للعميل! هذا بالضبط سبب ظهور رد "OK" الغامض في كل
  // رسالة — Response> فارغ يعني صراحة "لا رد تلقائي هنا، الرد الفعلي يصل
  // لاحقاً عبر REST API في sendWhatsappTextMessage أعلاه).
  res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
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
    show_installments_banner:
      typeof body.show_installments_banner === 'boolean' ? body.show_installments_banner : current.show_installments_banner ?? true,
  };
  store.landingSettings.set(next);
  logActivity(req, 'تم تعديل إعدادات صفحة الطلبات الخارجية (الألوان/النصوص)');
  res.json(next);
});

// إعدادات تطبيق الجوال (بانر الرئيسية ونصوص شاشة الدخول) — عامة بلا تسجيل
// دخول (يستهلكها تطبيق زهى للجوال مباشرة، نفس مستوى حماية /landing-settings
// أعلاه)، تُعدَّل من الإعدادات ← تطبيق الجوال خلف صلاحية edit_landing_page.
api.get('/mobile-app-settings', (_req, res) => res.json(store.mobileAppSettings.get()));

// الصورة نفسها تُرفَع أولاً من العميل عبر /landing-images الموجودة أصلاً
// (نفس الحاوية المستخدَمة لصور بطاقات الخدمات)، ثم يُرسَل رابطها الناتج
// هنا كـ home_banner_image_url عادي — لا حاجة لمسار رفع منفصل لصورة واحدة.
api.patch('/mobile-app-settings', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<MobileAppSettings> = {};
  if (body.home_banner_title !== undefined) patch.home_banner_title = body.home_banner_title.trim() || undefined;
  if (body.home_banner_subtitle !== undefined) patch.home_banner_subtitle = body.home_banner_subtitle.trim() || undefined;
  if (body.home_banner_image_url !== undefined) patch.home_banner_image_url = body.home_banner_image_url || undefined;
  if (body.login_title !== undefined) patch.login_title = body.login_title.trim() || undefined;
  if (body.login_subtitle !== undefined) patch.login_subtitle = body.login_subtitle.trim() || undefined;
  const updated = store.mobileAppSettings.set(patch);
  logActivity(req, 'تم تعديل إعدادات تطبيق الجوال (البانر/نصوص الدخول)');
  res.json(updated);
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
