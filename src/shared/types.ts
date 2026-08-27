// ============================================================================
// نظام إدارة خدمات النظافة والتشغيل والصيانة - النماذج المشتركة
// Shared TypeScript models used by both the client and the server.
// ============================================================================

export type UserRole =
  | 'general_manager'
  | 'admin'
  | 'admin_supervisor'
  | 'supervisor'
  | 'technician';

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  general_manager: 'المدير العام',
  admin: 'مدير النظام',
  admin_supervisor: 'مشرف إداري',
  supervisor: 'مشرف ميداني',
  technician: 'فني ميداني',
};

export const ROLE_LABELS_EN: Record<UserRole, string> = {
  general_manager: 'General Manager',
  admin: 'Admin',
  admin_supervisor: 'Admin Supervisor',
  supervisor: 'Supervisor',
  technician: 'Technician',
};

// Centralized role-permission groups. This app has no real session/token
// auth (login just returns the matching profile), so these gate the UI
// only — not a server-enforced security boundary.
export const SETTINGS_ACCESS_ROLES: UserRole[] = ['general_manager', 'admin'];
// إضافة/تعديل رابط موقع العميل من تفاصيل الموعد — للجميع ما عدا الفني الميداني.
export const CAN_EDIT_LOCATION_ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'supervisor'];
export const CAN_SEE_CUSTODY_ROLES: UserRole[] = ['general_manager', 'admin'];
export const CAN_DELETE_CUSTODY_ROLES: UserRole[] = ['general_manager'];
// حذف صور توثيق العمل من تفاصيل الموعد — للجميع ما عدا الفني الميداني
// (نفس منطق CAN_EDIT_LOCATION_ROLES). هذه صلاحية حذف صورة واحدة بعد
// رفعها — مختلفة عن "إضافة الصور قبل وبعد" الديناميكية أدناه.
export const CAN_DELETE_PHOTOS_ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'supervisor'];

// ============================================================================
// نظام الصلاحيات الديناميكي — صفحة "الإعدادات ← الصلاحيات" (المدير العام
// ومدير النظام فقط) تتحكم بمن يملك كل صلاحية من القائمة أدناه، لكل مسمى
// وظيفي (دور). القيم تُحفظ في قاعدة البيانات (جدول permissions) وتُقرأ عبر
// useAuth().can('key') — أينما استُبدلت مصفوفة أدوار ثابتة (CAN_XXX_ROLES)
// بهذا النظام. DEFAULT_PERMISSIONS هي القيم المبدئية (قبل أي تعديل يدوي من
// صفحة الصلاحيات) وتطابق تماماً السلوك الذي كان مبرمجاً ثابتاً سابقاً، بحيث
// لا يتغير شيء فعلياً إلا بعد أن يُعدِّل المدير العام/مدير النظام الجدول.
// ============================================================================
export type PermissionKey =
  | 'delete_appointments'
  | 'create_appointments'
  | 'edit_appointments'
  | 'create_customers'
  | 'edit_customers'
  | 'delete_customers'
  | 'view_customer_history'
  | 'view_monthly_sales_total'
  | 'view_expenses_page'
  | 'view_contracts_page'
  | 'create_contracts'
  | 'delete_contracts'
  | 'edit_contracts'
  | 'view_contract_value'
  | 'edit_services'
  | 'edit_payment_methods'
  | 'edit_custody_expenses'
  | 'edit_tech_supervisor_links'
  | 'view_sales_invoices'
  | 'issue_invoices'
  | 'add_before_after_photos'
  | 'view_all_supervisors_appointments'
  | 'view_settings_page'
  | 'update_appointment_status'
  | 'edit_appointment_team'
  | 'edit_days_off'
  | 'assign_appointment_technician'
  | 'view_completed_tasks_page';

export const PERMISSION_LABELS_AR: Record<PermissionKey, string> = {
  delete_appointments: 'حذف المواعيد',
  create_appointments: 'إضافة المواعيد',
  edit_appointments: 'تعديل المواعيد',
  update_appointment_status: 'تحديث حالة المهمة للموعد',
  edit_appointment_team: 'تعديل الفريق المسند للموعد',
  create_customers: 'إضافة عميل',
  edit_customers: 'تعديل عميل',
  delete_customers: 'حذف عميل',
  view_customer_history: 'عرض سجل العميل',
  view_monthly_sales_total: 'الاطلاع على اجمالي المبيعات الشهرية',
  view_expenses_page: 'الاطلاع على صفحة المصروفات',
  view_contracts_page: 'الاطلاع على صفحة العقود',
  create_contracts: 'اضافة عقد جديد',
  delete_contracts: 'حذف عقد',
  edit_contracts: 'تعديل العقد',
  view_contract_value: 'الاطلاع على قيمة العقود',
  edit_services: 'تعديل الخدمات',
  edit_payment_methods: 'تعديل طرق الدفع',
  edit_custody_expenses: 'تعديل العهد والمصروفات',
  edit_tech_supervisor_links: 'تعديل ربط الفنيين بالمشرفين',
  view_sales_invoices: 'الاطلاع على المبيعات والفواتير',
  // كانت "اصدار الفواتير" فقط — وسِّع الاسم ليشمل إعادة الطباعة التي كانت
  // مشمولة بها فعلياً منذ البداية (نفس الصلاحية، تسمية أدق).
  issue_invoices: 'اصدار وطباعة الفواتير',
  add_before_after_photos: 'اضافة الصور قبل وبعد',
  view_all_supervisors_appointments: 'الاطلاع على كافة المواعيد لجميع المشرفين',
  view_settings_page: 'الاطلاع على الاعدادات',
  // كانت "تعديل أيام الإجازة الأسبوعية" فقط — وسِّع الاسم بعد إضافة
  // الإجازات السنوية تحت نفس الصلاحية (نفس الصلاحية، تسمية أشمل).
  edit_days_off: 'تعديل الإجازات',
  assign_appointment_technician: 'اضافة وتعديل الفني للموعد',
  view_completed_tasks_page: 'الاطلاع على صفحة المهام المكتملة',
};

const GM_ADMIN: UserRole[] = ['general_manager', 'admin'];
const GM_ADMIN_ADMINSUP: UserRole[] = ['general_manager', 'admin', 'admin_supervisor'];
const NOT_TECHNICIAN: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'supervisor'];
const EVERYONE: UserRole[] = ['general_manager', 'admin', 'admin_supervisor', 'supervisor', 'technician'];

export const DEFAULT_PERMISSIONS: Record<PermissionKey, UserRole[]> = {
  delete_appointments: GM_ADMIN,
  create_appointments: NOT_TECHNICIAN,
  edit_appointments: NOT_TECHNICIAN,
  create_customers: NOT_TECHNICIAN,
  edit_customers: NOT_TECHNICIAN,
  delete_customers: NOT_TECHNICIAN,
  view_customer_history: NOT_TECHNICIAN,
  view_monthly_sales_total: GM_ADMIN,
  view_expenses_page: GM_ADMIN_ADMINSUP,
  view_contracts_page: GM_ADMIN_ADMINSUP,
  create_contracts: GM_ADMIN_ADMINSUP,
  delete_contracts: GM_ADMIN,
  edit_contracts: GM_ADMIN,
  view_contract_value: GM_ADMIN,
  edit_services: GM_ADMIN,
  edit_payment_methods: GM_ADMIN,
  edit_custody_expenses: GM_ADMIN_ADMINSUP,
  edit_tech_supervisor_links: GM_ADMIN_ADMINSUP,
  view_sales_invoices: GM_ADMIN,
  issue_invoices: GM_ADMIN,
  add_before_after_photos: EVERYONE,
  view_all_supervisors_appointments: GM_ADMIN_ADMINSUP,
  view_settings_page: GM_ADMIN_ADMINSUP,
  update_appointment_status: NOT_TECHNICIAN,
  edit_appointment_team: GM_ADMIN,
  edit_days_off: GM_ADMIN_ADMINSUP,
  // صلاحية جديدة مستقلة عن edit_appointment_team (التي تبقى تتحكم فقط
  // بالمشرف المسؤول عن الموعد) — تتحكم تحديداً بمن يستطيع اختيار/تغيير
  // الفني عند حجز موعد جديد وعند تعديل موعد قائم. الافتراضي هنا يطابق من
  // كان يستطيع اختيار الفني أصلاً عند الحجز (NOT_TECHNICIAN، بلا صلاحية
  // مستقلة سابقاً) — تعديل الفني على موعد قائم كان مقصوراً على GM_ADMIN
  // عبر edit_appointment_team فقط، وهذا يوسِّعه عمداً ليطابق سلوك الحجز؛
  // يمكن تضييقه لاحقاً من صفحة الصلاحيات لو رغب المدير العام.
  assign_appointment_technician: NOT_TECHNICIAN,
  // مخفية عن الفني الميداني تحديداً — تبويب "المهام المكتملة" داخل صفحة
  // المواعيد (انظر Appointments.tsx).
  view_completed_tasks_page: NOT_TECHNICIAN,
};

// من يملك حق فتح صفحة "الصلاحيات" نفسها وتعديل الجدول أعلاه — المدير
// العام ومدير النظام فقط، بلا استثناء (ثابتة عمداً، غير قابلة للتعديل من
// نفس الصفحة حتى لا يستطيع أحد إقصاء نفسه أو غيره من الوصول إليها).
export const PERMISSIONS_ACCESS_ROLES: UserRole[] = ['general_manager', 'admin'];

export type AppointmentStatus =
  | 'scheduled'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'cancelled';

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
// A free-form key referencing a PaymentMethodOption.id below — kept as
// `string` (not a fixed union) so admins can add methods beyond the
// built-in cash/card/bank_transfer from Settings without a code change.
export type PaymentMethod = string;
export type ContractType = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export type ContractStatus = 'active' | 'completed' | 'cancelled' | 'expired';
export type VisitFrequency = 'weekly' | 'bi_weekly' | 'monthly';

// Expense categories are a managed, two-level vocabulary (main group + an
// optional sub-item under it) editable from Settings → العهد والمصروفات —
// same "stored by name string" pattern as ServiceCategory/PaymentMethodOption.
export interface ExpenseCategoryItem {
  id: string;
  name: string;
  // Undefined = top-level group (e.g. "مركبات"). Set = a sub-item nested
  // under that group's id (e.g. "بنزين" under "مركبات").
  parent_id?: string;
  is_active: boolean;
}

// The main-category name that triggers the "custody holder" employee
// picker in the expense form. Matched by name, like every other managed
// vocabulary in this app — renaming this category in Settings also renames
// the trigger.
export const CUSTODY_CATEGORY_NAME = 'مصاريف عهدة';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  supervisor_id?: string;
  // أيام الإجازة الأسبوعية الثابتة (لمشرف ميداني أو فني) — مفاتيح أيام
  // الأسبوع (sunday..saturday، انظر src/client/lib/weekdays.ts). لا تمنع
  // إسناد موعد في هذا اليوم، فقط تُظهر تنبيهاً تأكيدياً قبل الحفظ (انظر
  // findDayOffConflicts وموضعي استخدامها: NewAppointmentModal،
  // AppointmentDetailModal).
  weekly_days_off?: string[];
  username?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type LeaveType = 'sick' | 'emergency' | 'absence' | 'unpaid' | 'paid' | 'other';

export const LEAVE_TYPE_LABELS_AR: Record<LeaveType, string> = {
  sick: 'مرضية',
  emergency: 'اضطرارية',
  absence: 'غياب',
  unpaid: 'بدون راتب',
  paid: 'إجازة مدفوعة',
  other: 'أخرى',
};

// إجازة سنوية مسجَّلة لمشرف ميداني أو فني — بخلاف weekly_days_off (إجازة
// أسبوعية ثابتة متكررة، تُنبِّه فقط)، هذه فترة محددة بتاريخين لا يمكن خلالها
// إسناد موعد جديد لهذا الشخص إطلاقاً (منع فعلي، انظر findLeaveConflicts في
// src/client/lib/leaves.ts وموضعي استخدامها: NewAppointmentModal،
// AppointmentDetailModal).
export interface LeaveRecord {
  id: string;
  profile_id: string;
  leave_type: LeaveType;
  // مطلوب فقط حين leave_type === 'other' — نوع الإجازة كما كتبه المدير
  // يدوياً (انظر leaveTypeDisplay في src/client/lib/leaves.ts).
  other_type_label?: string;
  start_date: string;
  end_date: string;
  // عدد أيام الإجازة شاملاً تاريخي البدء والانتهاء — يُحسب على الخادم عند
  // الإضافة (لا يُعتمَد على قيمة يرسلها العميل).
  days_count: number;
  notes?: string;
  // صورة داعمة اختيارية للملاحظات (مثل تقرير طبي أو مستند إثبات) — تُرفع
  // إلى Supabase Storage مثل صور المواعيد، ويُحفَظ رابطها فقط هنا.
  photo_url?: string;
  created_at: string;
}

// اشتراك دفع (Web Push) لجهاز واحد لمستخدم واحد — نفس المستخدم قد يملك
// أكثر من اشتراك (جوال + حاسوب مثلاً)، فكل جهاز يشترك بشكل منفصل. تُرسَل
// تنبيهات إلى كل اشتراكات صاحب الموعد (مشرف/فني) وإلى كل اشتراكات المدير
// العام ومدير النظام لكل موعد (انظر sendPushToProfiles في
// src/server/lib/push.ts).
export interface PushSubscriptionRecord {
  id: string;
  profile_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  created_at: string;
}

// سجل عملية واحدة — صفحة الإعدادات ← سجل العمليات (المدير العام ومدير
// النظام فقط، انظر ACTIVITY_LOG_ACCESS_ROLES أدناه). actor_id/actor_name
// يُرسَلان تلقائياً من العميل مع كل طلب POST/PATCH/DELETE عبر ترويسة
// X-Actor-Id (انظر src/client/lib/api.ts)، لا حاجة لتمريرهما يدوياً في كل
// استدعاء — الخادم يقرأها ويلتقط اسم الملف الشخصي وقت التسجيل نفسه
// (لقطة، لا تتغيّر لو تغيّر اسم المستخدم لاحقاً).
export interface ActivityLogEntry {
  id: string;
  action: string;
  actor_id?: string;
  actor_name?: string;
  created_at: string;
}

// مطابقة تماماً لـ PERMISSIONS_ACCESS_ROLES — صفحة سجل العمليات مقيَّدة
// دائماً بنفس الدورين، بلا استثناء وبلا إمكانية تعديل من صفحة الصلاحيات
// نفسها (لا صلاحية ديناميكية لها عمداً، حساسية البيانات هنا أعلى من أي
// صفحة أخرى).
export const ACTIVITY_LOG_ACCESS_ROLES: UserRole[] = ['general_manager', 'admin'];

// تقييم عميل لموعد مكتمل — يُرسَل رابطها للعميل عبر واتساب بعد اكتمال
// الخدمة وإصدار الفاتورة (انظر زر "تقييم العميل" في AppointmentDetailModal
// وصفحة التقييم العامة src/client/pages/RatePage.tsx). موعد واحد = تقييم
// واحد على الأكثر (يمنعه الخادم عند التكرار، انظر POST /public/ratings).
export interface Rating {
  id: string;
  appointment_id: string;
  customer_id?: string;
  customer_name_snapshot: string;
  stars: number; // 1..5
  comment?: string;
  created_at: string;
}

// عكس Rating أعلاه — تقييم المشرف (أو أي موظف) للعميل بعد اكتمال الطلب،
// وليس تقييم العميل للخدمة. يظهر داخل تبويب "المهام المكتملة" في صفحة
// المواعيد. موعد واحد = تقييم عميل واحد فقط (يُستبدَل عند إعادة التقييم،
// انظر POST /customer-ratings — upsert وليس منع تكرار كما في Rating).
export interface CustomerRating {
  id: string;
  appointment_id: string;
  customer_id: string;
  customer_name_snapshot?: string;
  rated_by: string; // معرّف الملف الشخصي لمن قيَّم
  rated_by_name?: string;
  stars: number; // 1..5
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  district?: string;
  city?: string;
  location_url?: string;
  notes?: string;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  category?: string;
  default_price: number;
  default_duration_minutes: number;
  is_active: boolean;
}

export interface PaymentMethodOption {
  id: string;
  name: string;
  is_active: boolean;
}

export interface ServiceCategory {
  id: string;
  name: string;
}

export interface Contract {
  id: string;
  contract_number: string;
  customer_id: string;
  service_id: string;
  service_name_snapshot: string;
  contract_type: ContractType;
  visit_frequency: VisitFrequency;
  // أيام الأسبوع المختارة للزيارة (يمكن أكثر من يوم معاً، مثل الأحد
  // والثلاثاء والخميس لعقد بثلاث زيارات أسبوعياً) — تُستخدم فقط مع
  // visit_frequency === 'weekly'؛ عقود نصف الشهر والشهرية ما زالت تعتمد
  // على يوم أسبوع تاريخ البدء كما كانت (انظر generateAppointmentsForContract).
  visit_days_of_week?: string[];
  visit_time?: string;
  start_date: string;
  end_date: string;
  total_visits: number;
  completed_visits: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  // مشرف افتراضي للعقد — يُستخدم للعقود غير الأسبوعية، وكقيمة احتياطية
  // لأي يوم أسبوعي لم يُحدَّد له مشرف خاص في day_supervisors أدناه.
  supervisor_id?: string;
  // مشرف مختلف لكل يوم من أيام الزيارة الأسبوعية (visit_days_of_week) —
  // بسبب احتمال اختلاف المشرف المسؤول من يوم لآخر لنفس العقد. المفتاح هو
  // مفتاح اليوم (sunday..saturday) والقيمة معرّف المشرف؛ يوم بلا مفتاح هنا
  // يستخدم supervisor_id كافتراضي. تُستخدم فقط مع visit_frequency === 'weekly'.
  day_supervisors?: Record<string, string>;
  assigned_technician_ids?: string[];
  status: ContractStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  // بنود وشروط العقد الرسمي (انظر ContractDocument.tsx) — غائبة على أي
  // عقد لم يُفتح مستنده الرسمي بعد؛ الواجهة تعرض عندها بنود DEFAULT_
  // CONTRACT_CLAUSES (src/shared/documentDefaults.ts) كنقطة بداية، ولا
  // تُحفَظ على العقد فعلياً إلا بعد أول تعديل أو حفظ صريح — بعدها تصبح
  // بنود هذا العقد بالذات، مستقلة عن أي عقد آخر أو عن القالب الافتراضي.
  clauses?: ContractClause[];
}

export interface ContractClause {
  id: string;
  title: string;
  body: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  // Optional sub-item under the main category (e.g. category "مركبات",
  // sub_category "بنزين") — names of an ExpenseCategoryItem pair.
  sub_category?: string;
  period_type: 'daily' | 'monthly' | 'annual';
  amount: number;
  tax_amount?: number;
  date: string;
  invoice_number?: string;
  unit_or_vehicle_ref?: string;
  recorded_by: string;
  recorded_by_name?: string;
  supervisor_id?: string;
  supervisor_name?: string;
  // Only set when category === CUSTODY_CATEGORY_NAME: which employee the
  // cash custody/advance was handed to.
  custody_holder_id?: string;
  custody_holder_name?: string;
  payment_method: PaymentMethod;
  notes?: string;
  created_at: string;
}

// A receipt/invoice an employee submits to account for money spent out of
// their custody (عهدة). Each one is a deduction against that employee's
// running custody balance:
//   balance = Σ Expense.amount (category === CUSTODY_CATEGORY_NAME, this holder)
//           − Σ CustodyInvoice.amount (this holder)
export interface CustodyInvoice {
  id: string;
  custody_holder_id: string;
  custody_holder_name?: string;
  title: string;
  amount: number;
  invoice_number?: string;
  date: string;
  notes?: string;
  recorded_by?: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface AppointmentAssignment {
  id: string;
  technician_id: string;
  technician_name?: string;
}

export interface AppointmentPhoto {
  id: string;
  stage: 'before' | 'after';
  data_url: string;
  taken_at: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  recorded_at: string;
  recorded_by?: string;
}

export interface Appointment {
  id: string;
  customer_id: string;
  customer_name_snapshot?: string;
  service_id: string;
  service_name_snapshot: string;
  scheduled_at: string; // ISO date-time
  expected_duration_minutes: number;
  amount: number;
  status: AppointmentStatus;
  supervisor_id?: string;
  address_snapshot: string;
  location_url?: string;
  contract_id?: string;
  contract_number?: string;
  notes?: string;
  total_paid: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  assignments: AppointmentAssignment[];
  photos: AppointmentPhoto[];
  payments: Payment[];
  created_at: string;
  // من أضاف هذا الموعد يدوياً (من "حجز موعد جديد") — يُعرض في تفاصيل
  // الموعد كـ"تم إضافة الموعد بواسطة: ...". غائب على المواعيد المولَّدة
  // تلقائياً من العقود المتكررة (لا "مضيف" واحد لها).
  created_by?: string;
  created_by_name?: string;
}

export const VAT_RATE = 0.15;

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name_snapshot: string;
  appointment_id?: string;
  contract_id?: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  issue_date: string;
  // Precise issue timestamp (ISO 8601) — issue_date is just the display
  // date; this is what the ZATCA QR code's timestamp field uses.
  created_at?: string;
  notes?: string;
}

// مسار العرض — تصنيف/عنوان فقط يظهر على المستند المطبوع، لا يُنشئ عقداً
// دورياً فعلياً (ذلك يبقى إجراءً منفصلاً لاحقاً من "عقد جديد" إن قَبِل
// العميل العرض) — انظر NewQuoteFlow.tsx.
export type QuotePathType = 'single_visit' | 'contract';

export interface QuoteItem {
  service_id: string;
  service_name: string;
  // شامل ضريبة القيمة المضافة — نفس اصطلاح تسعير الخدمات في كل النظام
  // (انظر NewAppointmentModal)، يُفصَل عند الطباعة إلى سعر قبل الضريبة
  // + الضريبة + الإجمالي (نفس منطق الفاتورة).
  price: number;
}

export interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name_snapshot: string;
  customer_phone_snapshot?: string;
  path_type: QuotePathType;
  items: QuoteItem[];
  // مجموع أسعار items شامل الضريبة — محسوب ومخزَّن وقت الإنشاء (وليس
  // مشتقاً كل مرة) حتى يبقى العرض المطبوع ثابتاً حتى لو تغيّر سعر إحدى
  // الخدمات لاحقاً في كتالوج الخدمات.
  total: number;
  // رسالة تعليمات الدفع أسفل العرض — قابلة للتحرير قبل الحفظ، تُحفَظ مع
  // العرض نفسه (وليس كإعداد عام) حتى يمكن تخصيصها لكل عميل عند الحاجة.
  payment_note: string;
  issue_date: string;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
}

// The seller identity ZATCA (Saudi Zakat, Tax and Customs Authority) prints
// on simplified tax invoices and encodes into the compliance QR code.
export const COMPANY_NAME = 'زهى الأعمال';
export const COMPANY_VAT_NUMBER = '314739292200003';
export const COMPANY_PHONE = '0582464181';
// لم يزوّدنا صاحب العمل برقم السجل التجاري بعد — يبقى فارغاً عمداً حتى
// يُضاف هنا لاحقاً، وتُخفي مستندات العقد وعرض السعر هذا السطر تلقائياً
// طالما فارغ (انظر DocumentHeader.tsx) بدل طباعة رقم غير صحيح.
export const COMPANY_CR_NUMBER = '';
