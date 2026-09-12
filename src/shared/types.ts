// ============================================================================
// نظام إدارة خدمات النظافة والتشغيل والصيانة - النماذج المشتركة
// Shared TypeScript models used by both the client and the server.
// ============================================================================

export type UserRole =
  | 'general_manager'
  | 'admin'
  | 'admin_supervisor'
  | 'supervisor'
  | 'technician'
  | 'marketer'
  | 'accountant';

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  general_manager: 'المدير العام',
  admin: 'مدير النظام',
  admin_supervisor: 'مشرف إداري',
  supervisor: 'مشرف ميداني',
  technician: 'فني ميداني',
  marketer: 'مسوّق',
  accountant: 'محاسب',
};

export const ROLE_LABELS_EN: Record<UserRole, string> = {
  general_manager: 'General Manager',
  admin: 'Admin',
  admin_supervisor: 'Admin Supervisor',
  supervisor: 'Supervisor',
  technician: 'Technician',
  marketer: 'Marketer',
  accountant: 'Accountant',
};

// للغة البنغالية (خيار واجهة يظهر للفنيين الميدانيين تحديداً — انظر
// TopBar.tsx وuseI18n().roleLabel() في lib/i18n.tsx).
export const ROLE_LABELS_BN: Record<UserRole, string> = {
  general_manager: 'জেনারেল ম্যানেজার',
  admin: 'অ্যাডমিন',
  admin_supervisor: 'অ্যাডমিন সুপারভাইজার',
  supervisor: 'সুপারভাইজার',
  technician: 'টেকনিশিয়ান',
  marketer: 'মার্কেটার',
  accountant: 'অ্যাকাউন্টেন্ট',
};

// للغة الأردية (خيار واجهة يظهر للفنيين الميدانيين تحديداً، مثل البنغالية
// — انظر TopBar.tsx وuseI18n().roleLabel() في lib/i18n.tsx).
export const ROLE_LABELS_UR: Record<UserRole, string> = {
  general_manager: 'جنرل مینیجر',
  admin: 'ایڈمن',
  admin_supervisor: 'ایڈمن سپروائزر',
  supervisor: 'سپروائزر',
  technician: 'ٹیکنیشن',
  marketer: 'مارکیٹر',
  accountant: 'اکاؤنٹنٹ',
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
// استيراد العملاء بالجملة من ملف إكسل — المدير العام، مدير النظام،
// والمشرف الإداري فقط (ثابتة عمداً كسابقاتها أعلاه، بلا تحكّم ديناميكي).
export const CUSTOMER_IMPORT_ROLES: UserRole[] = ['general_manager', 'admin', 'admin_supervisor'];

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
  | 'view_completed_tasks_page'
  | 'view_quotes_page'
  | 'create_quotes'
  | 'view_print_quotes'
  | 'view_leads_page'
  | 'edit_landing_page'
  | 'view_activity_log'
  | 'create_customer_visits'
  | 'view_employee_tracking'
  | 'view_employee_accounts'
  | 'view_commissions'
  | 'manage_commissions'
  | 'edit_delete_expenses'
  | 'view_tax_page'
  | 'view_live_chat'
  | 'manage_riyadh_zones'
  | 'manage_sales_discount'
  | 'view_inventory_page'
  | 'manage_inventory'
  | 'view_employee_contract';

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
  view_quotes_page: 'الاطلاع على صفحة عروض الأسعار',
  create_quotes: 'عمل عرض سعر جديد',
  view_print_quotes: 'استعراض وطباعة عرض سعر',
  view_leads_page: 'الاطلاع على طلبات العملاء الواردة',
  edit_landing_page: 'التحكم بصفحة الطلبات الخارجية',
  view_activity_log: 'الاطلاع على سجل العمليات',
  create_customer_visits: 'إضافة زيارة للعميل',
  view_employee_tracking: 'تتبع مواقع الموظفين',
  view_employee_accounts: 'الاطلاع على كشف حساب الموظفين (المحاسبة)',
  view_commissions: 'الاطلاع على تبويب العمولات (المحاسبة)',
  manage_commissions: 'تعديل إعدادات العمولات (النسب، المستهدفات، المستحقين)',
  edit_delete_expenses: 'الاطلاع على تفاصيل المصروفات وتعديلها وحذفها',
  view_tax_page: 'الاطلاع على تبويب الضريبة (المحاسبة)',
  // تتحكم فقط بظهور أيقونة "الدردشة المباشرة" العائمة في كل صفحات النظام
  // (AdminLiveChatWidget.tsx) — لا تخفي قسمها داخل الإعدادات ← الطلبات
  // الخارجية، ذاك يبقى تابعاً لصلاحية edit_landing_page كالمعتاد.
  view_live_chat: 'إظهار أيقونة الدردشة المباشرة العائمة',
  manage_riyadh_zones: 'التحكم بتقسيم مناطق الرياض والأحياء التابعة لها',
  // تعديل خصم المناسبات (اسمه ونسبته وتفعيله/إيقافه) من صفحة المبيعات —
  // لا تمنح وحدها صلاحية إصدار الفواتير أو الاطلاع على التقارير المالية
  // الكاملة (تبقيان تحت issue_invoices/view_sales_invoices كسابقاً)، فقط
  // تفتح بطاقة إعداد الخصم داخل نفس الصفحة. انظر SalesDiscountSettings.
  manage_sales_discount: 'تعديل خصم المناسبات في المبيعات',
  view_inventory_page: 'الاطلاع على تبويب الجرد والأصول الثابتة (المحاسبة)',
  manage_inventory: 'إدارة الأصول الثابتة (إضافة/تعديل/شطب) وتنفيذ الجرد الدوري',
  view_employee_contract: 'الاطلاع على بيانات عقد الموظف (تاريخ العقد وملفه)',
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
  // نفس افتراضي "الاطلاع على صفحة العقود" — كانت عروض الأسعار تبويباً
  // داخل تلك الصفحة قبل أن تصير صفحة مستقلة (Quotes.tsx).
  view_quotes_page: GM_ADMIN_ADMINSUP,
  create_quotes: GM_ADMIN_ADMINSUP,
  view_print_quotes: GM_ADMIN_ADMINSUP,
  // طلبات واردة من صفحة "اطلب الخدمة" العامة (غير المسجَّلة دخولها) —
  // نفس فئة من يتابع المواعيد والعملاء يومياً.
  view_leads_page: NOT_TECHNICIAN,
  // محتوى وتصميم صفحة "اطلب الخدمة" العامة (الألوان، النصوص، الخدمات
  // المعروضة وصورها) — نفس فئة من يتحكم بدليل الخدمات وأسعارها
  // (edit_services)، وليس أي مشرف.
  edit_landing_page: GM_ADMIN,
  // كانت مقيَّدة بثابت غير قابل للتعديل (ACTIVITY_LOG_ACCESS_ROLES)
  // يشمل المدير العام ومدير النظام معاً — صارت صلاحية ديناميكية، لكن
  // افتراضها الآن المدير العام فقط بطلب صريح؛ يمكن منحها لمدير النظام
  // أو غيره لاحقاً من هذه الصفحة نفسها متى رغب المدير العام في ذلك.
  view_activity_log: ['general_manager'],
  // نفس فئة إضافة موعد عادي (create_appointments) — يشمل المشرف عمداً،
  // فالمقصود أن يستطيع إضافة زيارة معاينة لعميله بنفسه دون حاجة لإداري.
  create_customer_visits: NOT_TECHNICIAN,
  // "في حساب المدير" بطلب صريح — المدير العام فقط افتراضياً، قابلة
  // للتوسيع لاحقاً (لمدير النظام مثلاً) من صفحة الصلاحيات نفسها.
  view_employee_tracking: ['general_manager'],
  // يعرض راتب الموظف وعهدته ومخالفاته وخصمياته مجتمعةً — نفس فئة "الاطلاع
  // على المبيعات والفواتير" الحسّاسة (GM_ADMIN)، قابلة للتوسيع لاحقاً من
  // صفحة الصلاحيات نفسها. إضافة/حذف قيود الخصميات والمخالفات تبقى مقيَّدة
  // بصلاحية edit_custody_expenses الحالية، لا صلاحية جديدة مستقلة.
  view_employee_accounts: GM_ADMIN,
  // نظام العمولات — حسّاس مالياً بطبيعته (نسب، مستهدفات، من يستحق كم)،
  // المدير العام ومدير النظام فقط افتراضياً، قابلة للتوسيع لاحقاً من
  // صفحة الصلاحيات نفسها.
  view_commissions: GM_ADMIN,
  manage_commissions: GM_ADMIN,
  // الاطلاع على تفاصيل مصروف معيَّن وتعديله/حذفه — بطلب صريح، المدير
  // العام ومدير النظام فقط افتراضياً (لا المشرف الإداري رغم امتلاكه
  // edit_custody_expenses الذي يتحكم فقط بإضافة مصروف جديد).
  edit_delete_expenses: GM_ADMIN,
  view_tax_page: GM_ADMIN,
  view_live_chat: GM_ADMIN_ADMINSUP,
  manage_riyadh_zones: GM_ADMIN,
  // بطلب صريح: المدير العام والمشرفَين (الإداري والميداني) معاً — وليس
  // بالضرورة من يصدر الفواتير فعلياً؛ الفكرة أن يضبط أي منهم خصم مناسبة
  // (اليوم الوطني، يوم التأسيس...) ليستخدمه لاحقاً من يملك issue_invoices.
  manage_sales_discount: NOT_TECHNICIAN,
  // جديدة تماماً — الجرد والأصول الثابتة حسّاسة مالياً (تأسيسي/إهلاك)
  // بنفس درجة الضريبة، المدير العام ومدير النظام فقط افتراضياً.
  view_inventory_page: GM_ADMIN,
  manage_inventory: GM_ADMIN,
  // بيانات عقد الموظف (تاريخا البداية والنهاية وملف العقد) — بطلب صريح،
  // المدير العام ومدير النظام فقط افتراضياً، قابلة للتوسيع لاحقاً من صفحة
  // الصلاحيات نفسها.
  view_employee_contract: GM_ADMIN,
};

// من يملك حق فتح صفحة "الصلاحيات" نفسها وتعديل الجدول أعلاه — المدير
// العام ومدير النظام فقط، بلا استثناء (ثابتة عمداً، غير قابلة للتعديل من
// نفس الصفحة حتى لا يستطيع أحد إقصاء نفسه أو غيره من الوصول إليها).
export const PERMISSIONS_ACCESS_ROLES: UserRole[] = ['general_manager', 'admin'];

export type AppointmentStatus =
  // موعد أنشأه الرد الآلي على واتساب تلقائياً — بانتظار مراجعة موظف قبل أن
  // يُعامَل كموعد فعلي مؤكَّد (انظر WhatsappThread وقسم البانر في
  // AppointmentDetailModal.tsx). لا يُنشئه أي مسار آخر في التطبيق.
  | 'pending_review'
  | 'scheduled'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'cancelled';

// "زيارة عميل" — معاينة أولية قبل حجز خدمة فعلية، وليست خدمة بحد ذاتها:
// لا سعر أو نوع خدمة محدد عند الحجز، فقط عميل + موعد معاينة يشغل جدول
// المشرف كأي موعد عادي (بنفس فحص التعارض والتوفر). كِلا النوعين
// appointment/kind يتشاركان نفس سجل Appointment وجدول المواعيد نفسه —
// visit فقط تحمل حقولاً إضافية تُعبَّأ بعد انتهاء المعاينة (انظر أدناه).
export type AppointmentKind = 'service' | 'visit';

// نتيجة زيارة العميل بعد رفع المشرف لنوع التنظيف المطلوب والسعر — انظر
// visit_outcome في Appointment أدناه وقسم "نتيجة الزيارة" في
// AppointmentDetailModal.tsx.
export type VisitOutcome = 'price_given' | 'approved_pending_schedule';

export const VISIT_OUTCOME_LABELS_AR: Record<VisitOutcome, string> = {
  price_given: 'تم إعطاء السعر للعميل',
  approved_pending_schedule: 'تمت الموافقة، بانتظار الجدولة',
};

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
// اسم فئة مصروفات "سلفية" — مطابق تماماً لـ CUSTODY_CATEGORY_NAME أعلاه:
// يُطابَق بالاسم (نفس نمط الأصناف المُدارة الأخرى)، ويُظهر نفس منتقي
// "الموظف" في نموذج إضافة مصروف عام (انظر Expenses.tsx) — لكن بخلاف
// العهدة، تبقى السلفية ضمن قائمة المصروفات الرئيسية العامة بلا تبويب أو
// تسوية رصيد منفصلة (لا يوجد "سداد سلفية" مقابلها حالياً).
export const ADVANCE_CATEGORY_NAME = 'سلفية';
// اسم فئة مصروفات "رواتب" — نفس مطابقة الاسم أيضاً، ويُظهر نفس منتقي
// "الموظف" في نموذج إضافة مصروف عام (كالعهدة والسلفية)، حتى يمكن ربط كل
// راتب بموظف بعينه وعرضه لاحقاً في كشف حسابه (انظر EmployeeAccounts.tsx).
// مصروفات "رواتب" مُسجَّلة قبل هذا التعديل بلا موظف محدَّد لن تظهر تحت أي
// كشف حساب (لا يمكن ربطها بأثر رجعي).
export const SALARY_CATEGORY_NAME = 'رواتب';
// اسم فئة مصروفات "مركبات" — نفس مطابقة الاسم أيضاً، ويُظهر منتقي
// "المركبة" (بدل الموظف) في نموذج إضافة مصروف عام، فيربط كل مصروف
// (بنزين، صيانة...) بمركبة بعينها من صفحة الإعدادات ← المركبات — انظر
// Expense.vehicle_id أدناه وVehiclesTab في Settings.tsx.
export const VEHICLE_CATEGORY_NAME = 'مركبات';
// ثلاث فئات مصروفات موظفين إضافية — نفس مطابقة الاسم، وتُظهر منتقي
// "الموظف" أيضاً (كالسلفية والراتب) لربط كل مصروف بموظف بعينه: تذاكر سفر،
// بدل سكن، بدل مواصلات. التصنيف المحاسبي المقترح افتراضياً لها جميعاً
// "أجور ومنافع الموظفين (OpEx)" — انظر DEFAULT_ACCOUNTING_CLASSIFICATION_
// BY_CATEGORY أدناه.
export const TRAVEL_TICKET_CATEGORY_NAME = 'تذاكر سفر';
export const HOUSING_ALLOWANCE_CATEGORY_NAME = 'بدل سكن';
export const TRANSPORT_ALLOWANCE_CATEGORY_NAME = 'بدل مواصلات';

// لغة الواجهة الافتراضية عند تسجيل الدخول — نفس قيم Lang في
// src/client/lib/date.ts حرفياً (لا يمكن استيراد ذاك النوع هنا، ملف خادم
// أيضاً)، تُطبَّق مرة واحدة فقط عند كل تسجيل دخول جديد (انظر
// src/client/lib/auth.tsx)، ثم يبقى المستخدم حراً بتغييرها من مبدِّل
// اللغة المعتاد كما هو الحال دائماً — لا تُفرَض على جلسة قائمة بالفعل.
export type UserLanguage = 'ar' | 'en' | 'bn' | 'ur';

export const USER_LANGUAGE_LABELS_AR: Record<UserLanguage, string> = {
  ar: 'العربية',
  en: 'الإنجليزية',
  bn: 'البنغالية',
  ur: 'الأردية',
};

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  supervisor_id?: string;
  // أيام الإجازة الأسبوعية الثابتة (لمشرف ميداني أو فني) — مفاتيح أيام
  // الأسبوع (sunday..saturday، انظر src/shared/weekdays.ts). لا تمنع
  // إسناد موعد في هذا اليوم، فقط تُظهر تنبيهاً تأكيدياً قبل الحفظ (انظر
  // findDayOffConflicts وموضعي استخدامها: NewAppointmentModal،
  // AppointmentDetailModal).
  weekly_days_off?: string[];
  username?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // تتبع الموقع — تفعيل بمبادرة الموظف نفسه فقط (زر "مشاركة موقعي" في
  // القائمة الجانبية، انظر Layout.tsx)، أبداً بلا علمه أو من جهة الإدارة.
  // غائب/false = لا مشاركة إطلاقاً، ولا يُقرأ last_location في هذه الحالة.
  location_sharing_enabled?: boolean;
  // وقت آخر قرار (سماح أو رفض) — يُستخدَم لإعادة عرض طلب المشاركة دورياً
  // لمن رفض سابقاً (بعد LOCATION_SHARING_REPROMPT_DAYS يوماً، انظر
  // Layout.tsx) بدل أن يبقى الرفض نهائياً للأبد؛ من وافق لا يُعاد سؤاله
  // إطلاقاً طالما لم يُوقف المشاركة بنفسه.
  location_sharing_decision_at?: string;
  // آخر موقع مُبلَّغ عنه — يُحدَّث دورياً من جهاز الموظف نفسه طالما
  // location_sharing_enabled فعّال (انظر PATCH /profiles/:id/location في
  // api.ts). يبقى القديم ظاهراً بعد إيقاف المشاركة (بدل حذفه) مع توضيح
  // "توقفت المشاركة" في صفحة التتبع، حتى تُعرف آخر نقطة معروفة.
  last_location?: EmployeeLocation;
  // الراتب الشهري الثابت — يُدار من صفحة "الموظفين" (كانت "كشف حساب
  // الموظفين") بدل تسجيل كل راتب كمصروف عام منفصل. غائب لمن لم يُضبط
  // راتبه بعد (يُعرض عندها "لم يُحدَّد" بدل رقم). انظر EmployeeDeduction
  // أدناه لآلية الخصم النسبي الشهري منه.
  monthly_salary?: number;
  // يوم استحقاق الراتب من كل شهر (١-٢٨، لتفادي مشاكل الأشهر القصيرة) —
  // يُستخدم فقط لعرض "تاريخ الاستحقاق القادم" في صفحة الموظفين، لا يُنشئ
  // أي شيء تلقائياً بنفسه.
  salary_due_day?: number;
  // بيانات شخصية — تُدار من صفحة "الموظفين"، تُعرض هناك فقط (ليست جزءاً
  // من نموذج تسجيل الدخول أو الصلاحيات). العمر يُحتسَب دائماً من
  // date_of_birth بدل تخزينه كرقم ثابت يصبح خاطئاً مع الوقت.
  date_of_birth?: string;
  // رقم الهوية (وطنية للسعوديين، إقامة للمقيمين) — نفس الحقل لكليهما.
  national_id?: string;
  national_id_expiry?: string;
  // تاريخ بداية العمل الفعلي — أساس احتساب "مدة الخدمة" عند إنهاء العقد
  // (انظر computeEndOfServiceGratuity في server/routes/api.ts)، منفصل
  // عمداً عن created_at (تاريخ إنشاء حساب النظام فقط، قد يكون لاحقاً
  // لتاريخ التعيين الفعلي لموظف انضم قبل استخدام النظام).
  hire_date?: string;
  // إنهاء الخدمة — تُضبَط دفعة واحدة عبر POST /employees/:id/terminate
  // (تُحسِب مكافأة نهاية الخدمة تلقائياً وتُسجِّلها كمصروف، ثم تُعطِّل
  // الحساب). end_of_service_amount هو المبلغ المحتسَب وقت الإنهاء تحديداً
  // — يبقى ثابتاً كسجل تاريخي حتى لو تغيّر الراتب لاحقاً (لا ينطبق أصلاً
  // بعد التعطيل، لكن للتوثيق).
  termination_date?: string;
  termination_reason?: TerminationReason;
  end_of_service_amount?: number;
  // الاسم الكامل كما يظهر رسمياً على الهوية/الإقامة — منفصل عمداً عن
  // full_name (اسم العرض/الدخول، قد يكون مختصراً أو غير مطابق حرفياً).
  legal_full_name?: string;
  // المسمى الوظيفي الفعلي (نص حر، مثال: "فني تكييف أول") — منفصل عن role
  // (الدور البرمجي الذي يتحكم بالصلاحيات، مجموعة قيم ثابتة محدودة).
  job_title?: string;
  // صورة الهوية/الإقامة — رابط موقَّع طويل الأمد (10 سنوات) على Supabase
  // Storage، نفس نمط باقي صور النظام (انظر uploadEmployeeIdPhoto).
  id_photo_url?: string;
  // بيانات العقد — نسخة الملف (صورة أو PDF) وتاريخا البداية والنهاية.
  // حسّاسة مالياً/قانونياً بطلب صريح، تُعرض فقط لمن يملك صلاحية
  // view_employee_contract (افتراضياً المدير العام ومدير النظام فقط —
  // انظر PermissionKey أدناه)، بخلاف بقية "البيانات الشخصية" التي تخضع
  // لقيد restrictedPersonalInfo المحلي في EmployeeAccounts.tsx فقط.
  // contract_end_date يُضبَط دائماً صراحةً (سواء اختار المستخدم "تاريخ
  // محدَّد" من التقويم مباشرة، أو "عدد أيام" فتُحتسَب منه تلقائياً في
  // الواجهة قبل الإرسال) — لا تُخزَّن مدة العقد كرقم أيام منفصل، تُشتَق
  // دائماً من الفرق بين التاريخين عند العرض لتفادي تعارض مصدرين للحقيقة.
  contract_file_url?: string;
  contract_file_name?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  // الجنسية — نص حر (لا قائمة ثابتة، تجنّباً لحصر الجنسيات الممكنة).
  nationality?: string;
  // لغة الواجهة الافتراضية عند تسجيل الدخول — انظر UserLanguage أعلاه.
  default_lang?: UserLanguage;
}

// سبب انتهاء العقد — يُحدِّد نسبة الاستحقاق من مكافأة نهاية الخدمة وفق
// المادتين ٨٤ و٨٥ من نظام العمل السعودي: استقالة قبل عامين = بلا مكافأة،
// من عامين إلى ٥ = الثلث، من ٥ إلى ١٠ = الثلثان، ١٠ فأكثر = كامل المكافأة.
// إنهاء من صاحب العمل أو انتهاء مدة العقد = كامل المكافأة بصرف النظر عن
// المدة (لا خصم تناسبي، ذلك محصور بحالة الاستقالة فقط).
export type TerminationReason = 'resignation' | 'employer_termination' | 'contract_expiry';

export const TERMINATION_REASON_LABELS_AR: Record<TerminationReason, string> = {
  resignation: 'استقالة',
  employer_termination: 'إنهاء من صاحب العمل',
  contract_expiry: 'انتهاء مدة العقد',
};

export interface EmployeeLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  updated_at: string;
}

// "paid" هي مفتاح الإجازة السنوية تاريخياً (اسم الحقل بقي كما هو تفادياً
// لأي هجرة بيانات على السجلات القديمة — انظر isEligibleForPaidLeave في
// Settings.tsx وPOST /leaves في api.ts، كلاهما كان يطبِّق منطق الإجازة
// السنوية على هذا المفتاح أصلاً)، بقية الأنواع أُضيفت بموجب نظام العمل
// السعودي (مواد ١٠٩، ١١٧، ١١٣، ١١٤، ١٦٠) — انظر LEAVE_TYPE_FIXED_DAYS
// وLEAVE_TYPE_ONCE_PER_SERVICE وOFFICIAL_HOLIDAYS أدناه لتفاصيل كل نوع.
export type LeaveType =
  | 'paid'
  | 'sick'
  | 'emergency'
  | 'marriage'
  | 'bereavement'
  | 'paternity'
  | 'iddah'
  | 'hajj'
  | 'official_holiday'
  | 'absence'
  | 'unpaid'
  | 'other';

export const LEAVE_TYPE_LABELS_AR: Record<LeaveType, string> = {
  paid: 'الإجازة السنوية',
  sick: 'إجازة مرضية',
  emergency: 'اضطرارية',
  marriage: 'إجازة زواج',
  bereavement: 'إجازة وفاة',
  paternity: 'إجازة مولود جديد (للأب)',
  iddah: 'عدة الوفاة (للمرأة المسلمة)',
  hajj: 'إجازة الحج',
  official_holiday: 'عطلة رسمية',
  absence: 'غياب',
  unpaid: 'بدون راتب',
  other: 'أخرى',
};

// رصيد الإجازة السنوية الأساسي لكل موظف (مشرف ميداني أو فني)، ٢١ يوماً —
// بموجب نظام العمل السعودي (المادة ١٠٩)، تصبح ٣٠ يوماً بعد إتمام ٥ سنوات
// خدمة متصلة — انظر annualLeaveEntitlementDays في src/shared/leaves.ts
// (الدالة الفعلية المعتمَدة في كل حساب رصيد، هذا الثابت هو القيمة
// الأساسية/الافتراضية فقط قبل استيفاء الخدمة الطويلة أو حين لا يوجد
// تاريخ تعيين مسجَّل). يُستهلَك من إجازات LeaveRecord الموسومة
// deduct_from_annual_balance فقط — انظر التعليق على ذلك الحقل أدناه.
export const ANNUAL_LEAVE_BALANCE_DAYS = 21;
// رصيد الإجازة السنوية بعد إتمام ٥ سنوات خدمة متصلة (المادة ١٠٩).
export const ANNUAL_LEAVE_BALANCE_DAYS_AFTER_5_YEARS = 30;

// مدة افتراضية ثابتة بالأيام لأنواع إجازات محددة المدة قانوناً — تُقترَح
// تلقائياً (تاريخ النهاية = تاريخ البداية + المدة - يوم واحد) فور اختيار
// النوع وتاريخ البداية في نموذج إضافة إجازة (DaysOffTab في Settings.tsx)،
// وتبقى قابلة للتعديل اليدوي دائماً بعدها. عدة الوفاة تقريبية (٤ أشهر
// و١٠ أيام هجرية ≈ ١٣٠ يوماً ميلادياً، المادة ١٦٠) — يُنصح بمراجعتها
// يدوياً لكل حالة. إجازة الحج بلا افتراض عمداً (١٠-١٥ يوماً حسب الحالة،
// المادة ١١٤).
export const LEAVE_TYPE_FIXED_DAYS: Partial<Record<LeaveType, number>> = {
  marriage: 5,
  bereavement: 5,
  paternity: 3,
  iddah: 130,
};

// أنواع إجازات "مرة واحدة طوال فترة الخدمة" (المادة ١١٤) — يُظهر النموذج
// تنبيهاً غير مانع لو وُجد سجل سابق من نفس النوع لهذا الموظف (لا يمكن
// التحقق مما إذا أدّى الحج قبل الانضمام للشركة، فالتنبيه استرشادي فقط).
export const LEAVE_TYPE_ONCE_PER_SERVICE: LeaveType[] = ['hajj'];

// العطل الرسمية المعتمَدة عبر منصة قوى — تُستخدَم في نموذج "إضافة عطلة
// رسمية لجميع الموظفين دفعة واحدة" (DaysOffTab في Settings.tsx). التواريخ
// الفعلية تتغيّر كل عام (تقويم هجري لعيدي الفطر والأضحى تحديداً)، فتبقى
// مُدخَلة يدوياً من المدير عند كل عطلة؛ هذه القائمة توفر فقط الاسم وعدد
// الأيام الرسمي المعتمَد.
export type OfficialHolidayKey = 'eid_fitr' | 'eid_adha' | 'national_day' | 'founding_day';

export const OFFICIAL_HOLIDAYS: Record<OfficialHolidayKey, { label: string; days: number }> = {
  eid_fitr: { label: 'عيد الفطر', days: 4 },
  eid_adha: { label: 'عيد الأضحى', days: 4 },
  national_day: { label: 'اليوم الوطني', days: 1 },
  founding_day: { label: 'يوم التأسيس', days: 1 },
};

// إجازة سنوية مسجَّلة لمشرف ميداني أو فني — بخلاف weekly_days_off (إجازة
// أسبوعية ثابتة متكررة، تُنبِّه فقط)، هذه فترة محددة بتاريخين لا يمكن خلالها
// إسناد موعد جديد لهذا الشخص إطلاقاً (منع فعلي، انظر findLeaveConflicts في
// src/shared/leaves.ts وموضعي استخدامها: NewAppointmentModal،
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
  // هل تُخصَم أيام هذه الإجازة من رصيد الإجازة السنوية (ANNUAL_LEAVE_
  // BALANCE_DAYS، ٢١ يوماً)؟ اختيار صريح عند تسجيل كل إجازة — بلا افتراض
  // ذكي حسب النوع (مرضية/اضطرارية/أخرى قد تُخصَم أو لا حسب سياسة الشركة
  // في كل حالة). غياب القيمة (سجلات قديمة قبل هذا الحقل) يُعامَل كـ false.
  deduct_from_annual_balance?: boolean;
  // صحيح فقط حين تُنشَأ هذه الإجازة وتتجاوز الرصيد السنوي المتبقي — بانتظار
  // اعتماد المدير العام (PATCH /leaves/:id). لا علاقة لها بمنع إسناد
  // المواعيد (findLeaveConflicts يبقى يعمل بصرف النظر عن هذه العلامة).
  pending_gm_approval?: boolean;
  created_at: string;
}

// تعويض "أوفر تايم" لموظف عمل فعلياً (مُسنَد لموعد/مهمة) في يوم عطلة
// رسمية مسجَّلة له (LeaveRecord بنوع official_holiday) — المادة ١٠٧ من
// نظام العمل السعودي تُلزم بتعويض العمل في العطل الرسمية بأجر إضافي
// (١٥٠٪ من الأجر اليومي على الأقل) بدل منع العمل فيها؛ لذلك استُثنيت
// العطلة الرسمية تحديداً من findLeaveConflicts (لا تمنع الحجز، بخلاف كل
// أنواع الإجازات الأخرى). يُنشأ ويُحدَّث تلقائياً بالكامل عبر
// reconcileHolidayOvertimeForAppointment في src/server/lib/overtime.ts —
// عند كل إنشاء/تعديل/إلغاء/حذف موعد (المسار اليدوي وحجز الرد الآلي على
// واتساب كلاهما). لا نقطة نهاية لإنشائه يدوياً عمداً — الإنشاء آلي بالكامل
// ليطابق الواقع الفعلي للموعد دائماً؛ التعديل اليدوي (تسوية المبلغ أو
// إلغاؤه) فقط عبر PATCH /employee-overtime/:id.
export type EmployeeOvertimeStatus = 'pending' | 'paid' | 'dismissed';

export interface EmployeeOvertimeRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  // الموعد الذي أدى للتعويض — يبقى مرتبطاً به حتى لو حُذف الموعد لاحقاً
  // (السجل نفسه لا يُحذَف تلقائياً، فقط يُعلَّم "أُلغي" عبر reconcile).
  appointment_id: string;
  // اسم العطلة كما كُتب عند تسجيلها (مثال: "عيد الفطر") — من ملاحظات
  // LeaveRecord الأصلية إن وُجدت، وإلا يُستخدَم التصنيف العام "عطلة رسمية".
  holiday_label: string;
  // تاريخ العمل الفعلي (تاريخ الموعد نفسه داخل فترة العطلة).
  work_date: string;
  // أجر اليوم الأساسي وقت الإنشاء/آخر تسوية (الراتب الشهري ÷ ٣٠) — لقطة
  // ثابتة، صفر إن لم يكن الراتب الشهري مضبوطاً بعد (يُنبَّه في الواجهة).
  daily_wage_snapshot: number;
  // نسبة التعويض المطبَّقة — HOLIDAY_OVERTIME_MULTIPLIER افتراضياً (١٥٠٪،
  // الحد الأدنى القانوني وفق المادة ١٠٧)، قابلة للتعديل يدوياً لكل سجل.
  multiplier: number;
  // daily_wage_snapshot × multiplier، مقرَّب — قابل للتعديل اليدوي المباشر
  // أيضاً (مثال: تعويض بيوم بديل بدل المال، يُصفَّر هنا مع توضيح بالملاحظات).
  amount: number;
  status: EmployeeOvertimeStatus;
  notes?: string;
  // مصروف الراتب الذي أُضيف إليه هذا المبلغ، إن دُفع فعلياً عبر تسجيل
  // راتب شهري (POST /employees/:id/pay-salary) — status يصبح 'paid' عندها.
  settled_expense_id?: string;
  created_at: string;
  updated_at: string;
}

export const EMPLOYEE_OVERTIME_STATUS_LABELS_AR: Record<EmployeeOvertimeStatus, string> = {
  pending: 'بانتظار الدفع',
  paid: 'مدفوع',
  dismissed: 'أُلغي',
};

// نسبة تعويض العمل في العطلة الرسمية الافتراضية (١٥٠٪ من الأجر اليومي) —
// المادة ١٠٧ من نظام العمل السعودي، الحد الأدنى القانوني.
export const HOLIDAY_OVERTIME_MULTIPLIER = 1.5;

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

// سجل عملية واحدة — صفحة الإعدادات ← سجل العمليات (خلف صلاحية ديناميكية
// view_activity_log، انظر PermissionKey أدناه). actor_id/actor_name
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

// من يملك حق حذف سطور من سجل العمليات (تحديد سطر أو الكل ثم زر حذف،
// انظر ActivityLogTab في Settings.tsx) — المدير العام فقط، ثابتة عمداً
// وغير قابلة للتعديل من صفحة الصلاحيات (بخلاف الاطلاع على السجل نفسه،
// الذي صار صلاحية ديناميكية view_activity_log) — حذف سجل تدقيق فعلي
// أخطر من مجرد الاطلاع عليه، فيبقى محصوراً بأعلى مستوى إدارة دون استثناء.
export const ACTIVITY_LOG_DELETE_ROLES: UserRole[] = ['general_manager'];

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

// طلب وارد من صفحة "اطلب الخدمة" العامة (src/client/pages/OrderPage.tsx) —
// عميل محتمل لم يتحوّل بعد إلى عميل مسجَّل أو موعد فعلي، يملأ استمارة
// سريعة من الموقع الخارجي بلا تسجيل دخول (انظر POST /public/leads في
// src/server/routes/api.ts). يظهر لفريق العمل في صفحة "طلبات جديدة"
// (Leads.tsx) ليتابعوه، ويمكنه تحويله مباشرة إلى موعد فعلي بنفس نافذة حجز
// الموعد المعتادة (NewAppointmentModal) — عندها تتحدَّث حالته تلقائياً إلى
// appointment_booked وتُربَط بمعرّف الموعد الناتج (linked_appointment_id).
export type LeadStatus = 'new' | 'replied' | 'quote_sent' | 'appointment_booked';

export const LEAD_STATUS_LABELS_AR: Record<LeadStatus, string> = {
  new: 'طلب جديد',
  replied: 'تم الرد',
  quote_sent: 'تم إرسال عرض سعر',
  appointment_booked: 'تم عمل موعد',
};

// وقت مفضَّل تقريبي (لا موعد دقيق فعلي — يبقى القرار النهائي للفريق عند
// التواصل) يختاره العميل في الخطوة الرابعة من "اطلب خدمتك الآن"
// (BookingWizardPage.tsx). نفس القيم تُستخدَم لاقتراح وقت مبدئي عند تحويل
// الطلب إلى موعد فعلي (انظر PREFERRED_TIME_OF_DAY_DEFAULT_HOUR في
// NewAppointmentModal.tsx).
export type PreferredTimeOfDay = 'morning' | 'afternoon' | 'evening';

export const PREFERRED_TIME_OF_DAY_LABELS_AR: Record<PreferredTimeOfDay, string> = {
  morning: 'صباحاً (٩ص - ١٢م)',
  afternoon: 'ظهراً (١٢م - ٤م)',
  evening: 'مساءً (٤م - ٨م)',
};

export interface Lead {
  id: string;
  name: string;
  phone: string;
  area?: string;
  service_name?: string;
  message?: string;
  status: LeadStatus;
  // مُعبَّأ تلقائياً عند تحويل الطلب إلى موعد فعلي من صفحة "طلبات جديدة"
  // (زر "تحديد موعد") — رابط مرجعي فقط، لا يمنع حذف الموعد لاحقاً.
  linked_appointment_id?: string;
  created_at: string;
  // الحقول الأربعة التالية تُملأ فقط من مسار "اطلب خدمتك الآن" متعدد
  // الخطوات (BookingWizardPage.tsx) — غائبة تماماً على أي طلب من الاستمارة
  // السريعة القديمة في OrderPage.tsx (area يحمل هناك نص المنطقة الحر فقط،
  // بلا إحداثيات). lat/lng من تحديد الموقع على الخريطة (اختياري — العميل
  // قد يكتفي بكتابة العنوان يدوياً بلا تحديد نقطة). preferred_date/
  // preferred_time تقريبيان دائماً، لا يُنشئان موعداً فعلياً بأنفسهما.
  lat?: number;
  lng?: number;
  preferred_date?: string;
  preferred_time?: PreferredTimeOfDay;
}

// محادثة واتساب واحدة مع رقم عميل واحد — يُنشئها ويُحدِّثها الرد الآلي
// (src/server/lib/whatsappBot.ts) عند كل رسالة واردة عبر ويب هوك WhatsApp
// Cloud API. تُبنى الرسائل تدريجياً عبر أحداث ويب هوك منفصلة (لا توجد جلسة
// حية)، فتُخزَّن هنا لتُعطي الذكاء الاصطناعي "ذاكرة" المحادثة بين رسالة
// وأخرى. 'booked' تعني أن محادثة أنتجت موعداً (pending_review) بالفعل —
// لا تُعاد معالجة المزيد من الرسائل لإنشاء موعد آخر لنفس المحادثة.
export type WhatsappThreadStatus = 'active' | 'booked' | 'closed';

export interface WhatsappMessage {
  id: string;
  direction: 'in' | 'out';
  text: string;
  created_at: string;
  // معرّف رسالة واتساب (wamid) — للرسائل الواردة فقط، يمنع إعادة معالجة
  // نفس الرسالة لو أعاد Meta إرسال نفس حدث الويب هوك (retry معروف الحدوث).
  wa_message_id?: string;
}

export interface WhatsappThread {
  id: string;
  // مطبَّع محلياً عبر normalizeSaudiPhone — نفس صيغة Customer.phone.
  phone: string;
  // اسم الملف الشخصي في واتساب كما وصل أول رسالة — لقطة فقط، لا تتحدَّث.
  contact_name?: string;
  messages: WhatsappMessage[];
  status: WhatsappThreadStatus;
  // مُعبَّأ تلقائياً عند إنشاء موعد pending_review من هذه المحادثة.
  linked_appointment_id?: string;
  created_at: string;
  updated_at: string;
}

// دردشة مباشرة (بشرية بالكامل، بلا ذكاء اصطناعي عمداً) من أيقونة عائمة في
// صفحة "اطلب الخدمة" العامة (OrderPage.tsx) — بديل/تكملة لواتساب يبقى تحت
// سيطرة الموظف الكاملة: كل رسالة عميل تُنبِّه الإدارة (leadNotifyProfileIds
// في server/lib/push.ts)، والرد يكتبه موظف يدوياً من الإعدادات ← الطلبات
// الخارجية (خلف نفس صلاحية edit_landing_page)، وليس أي رد آلي.
export interface LiveChatMessage {
  id: string;
  direction: 'in' | 'out';
  text: string;
  created_at: string;
  // اسم الموظف الذي أرسل الرد — direction: 'out' فقط.
  sender_name?: string;
}

export type LiveChatThreadStatus = 'open' | 'closed';

export interface LiveChatThread {
  id: string;
  // يُعبَّآن اختيارياً من العميل عند أول رسالة، إن رغب.
  customer_name?: string;
  customer_phone?: string;
  messages: LiveChatMessage[];
  status: LiveChatThreadStatus;
  // true إذا وصلت رسالة عميل لم يطّلع عليها موظف بعد (تُصفَّر عند فتح
  // الموظف للمحادثة من لوحة الإدارة) — تُستخدم لعرض شارة "جديد".
  unread: boolean;
  created_at: string;
  updated_at: string;
}

// تقسيم مدينة الرياض إلى مناطق جغرافية (شمال/جنوب/شرق/غرب/وسط افتراضياً)
// — يُدار من الإعدادات ← مناطق الرياض عبر خريطة تفاعلية (OpenStreetMap)،
// ويُستخدم عند حجز موعد جديد لاقتراح أفضل أيام الأسبوع لعميل حسب حيّه
// (تجميع عملاء المنطقة الواحدة في نفس اليوم/الأيام يقلل تنقّل الفريق
// الميداني). حدود المنطقة (boundary) للعرض/التعديل على الخريطة فقط —
// ربط حيّ بعينه بمنطقة يتم يدوياً عبر NeighborhoodZoneAssignment أدناه،
// وليس حسابياً من الإحداثيات، لتفادي الحاجة لخدمة جيوكودينغ دقيقة لكل حي.
export interface RiyadhZone {
  id: string;
  name: string;
  // لون تمييز المنطقة على الخريطة وفي شارات الأحياء التابعة لها.
  color: string;
  // مضلع حدود المنطقة على الخريطة — مصفوفة نقاط [خط العرض، خط الطول]،
  // معدَّلة بالسحب من الإعدادات ← مناطق الرياض. اختياري: منطقة جديدة قد
  // تُنشأ بلا حدود مرسومة بعد.
  boundary?: [number, number][];
  // مفاتيح أيام الأسبوع المفضَّلة لجدولة عملاء هذه المنطقة — نفس مفاتيح
  // WEEKDAYS في shared/weekdays.ts (مثال: ['sunday', 'tuesday']).
  preferred_weekdays: string[];
  created_at: string;
  updated_at: string;
}

// ربط اسم حيّ واحد (كما يُكتب حرفياً في Customer.district) بمنطقة —
// قائمة يدوية صريحة بدل حساب جغرافي، فتبقى دقيقة حتى بلا إحداثيات مضبوطة
// لكل حي على حدة. عدة أسماء قد تُربط بنفس المنطقة؛ اسم واحد لا يظهر هنا
// يبقى بلا منطقة مقترَحة (لا خطأ، فقط لا اقتراح يوم عند الحجز).
export interface NeighborhoodZoneAssignment {
  id: string;
  neighborhood: string;
  zone_id: string;
}

// موقع جغرافي (خط عرض/طول) لاسم حيّ واحد، مُحلَّل مرة واحدة فقط عبر بحث
// Nominatim المجاني (نفس ما يستخدمه تبويب "مناطق الرياض" لبحث الأحياء
// يدوياً) — يُحفَظ هنا كذاكرة تخزين مؤقت مشتركة بين كل من يفتح "الخريطة
// الحرارية" في صفحة العملاء (Customers.tsx)، حتى لا يُعاد البحث عن نفس
// الحيّ في كل مرة تُفتَح فيها الصفحة (احتراماً لحدود استخدام Nominatim
// المجانية: طلب واحد بالثانية كحد أقصى). district هو نص الحيّ كما كُتب
// حرفياً في Customer.district بعد trim فقط (دون أي تطبيع آخر) — فريد بين
// كل السجلات (upsert عند إعادة تحليل نفس الاسم).
export interface DistrictGeocode {
  district: string;
  lat: number;
  lng: number;
  resolved_at: string;
}

// نقطة بداية الفريق الميداني على خريطة مناطق الرياض (الإعدادات ← مناطق
// الرياض) — سجل واحد (singleton) بنفس نمط LandingPageSettings/
// CommissionConfig أدناه، وليس قائمة: نقطة انطلاق واحدة فقط (سكن العمال
// افتراضياً)، قابلة للسحب وإعادة التموضع مباشرة على الخريطة.
export interface WorkersHousingLocation {
  lat: number;
  lng: number;
  label: string;
  updated_at: string;
}

export const DEFAULT_WORKERS_HOUSING_LOCATION: WorkersHousingLocation = {
  lat: 24.821917,
  lng: 46.850056,
  label: 'سكن العمال',
  updated_at: new Date(0).toISOString(),
};

// ألوان الهوية البصرية المعتمدة لصفحة "اطلب الخدمة" العامة — قابلة للتعديل
// من الإعدادات ← الطلبات الخارجية (خلف صلاحية edit_landing_page).
export interface LandingColors {
  primary: string;
  secondary: string;
  background: string;
  accent: string;
}

export const DEFAULT_LANDING_COLORS: LandingColors = {
  primary: '#0F2A3D',
  secondary: '#E6DCCB',
  background: '#F5F3EF',
  accent: '#A4BE7A',
};

// إعدادات نصوص وألوان صفحة "اطلب الخدمة" العامة — سجل واحد فقط (وليس
// قائمة)، يُقرأ عبر GET /landing-settings العامة (بلا تسجيل دخول، تستخدمه
// الصفحة نفسها) ويُعدَّل عبر PATCH /landing-settings خلف edit_landing_page.
export interface LandingPageSettings {
  colors: LandingColors;
  hero_title: string;
  hero_subtitle: string;
  tagline: string;
  // إظهار/إخفاء شريط "لا تشيل هم الدفع! يمكنك التقسيط عن طريق تابي
  // وتمارا" أسفل قسم الهيرو في صفحة "اطلب الخدمة" العامة — افتراضياً
  // ظاهر (true) حتى لا تختفي من الحسابات القديمة التي أُنشئت قبل إضافة
  // هذا الخيار (سجلّها المحفوظ لا يحتوي هذا الحقل إطلاقاً).
  show_installments_banner?: boolean;
  // صورة إعلانية منبثقة (Popup) تظهر في وسط صفحة "اطلب الخدمة" العامة عند
  // فتحها — مُفعَّلة/مُعطَّلة والصورة نفسها يُتحكَّم بهما من الإعدادات ←
  // الطلبات الخارجية. الزائر يغلقها بعلامة X ويكمل تصفّح الصفحة بلا أي
  // منع — إعلان بحت، لا تسجيل دخول ولا نموذج داخله.
  popup_ad_enabled?: boolean;
  popup_ad_image_url?: string;
}

export const DEFAULT_LANDING_SETTINGS: LandingPageSettings = {
  colors: DEFAULT_LANDING_COLORS,
  hero_title: 'نظافة تستحق الثقة',
  hero_subtitle:
    'حلول تنظيف وصيانة شاملة للمنازل والمكاتب والمرافق التجارية، بفريق مدرّب وأدوات ومواد معتمدة — نصل إليك بموعد محدد ونلتزم به.',
  tagline: 'نظافة تستحق الثقة',
  show_installments_banner: true,
  popup_ad_enabled: false,
};

// إعدادات نصوص وبانر تطبيق الجوال (زهى — React Native، مشروع zaha-mobile
// المنفصل) — سجل واحد فقط (singleton)، نفس نمط LandingPageSettings تماماً
// بالضبط، يُقرأ عبر GET /mobile-app-settings العامة (بلا تسجيل دخول —
// يستهلكها التطبيق مباشرة) ويُعدَّل عبر PATCH /mobile-app-settings خلف
// نفس صلاحية edit_landing_page (لا صلاحية مستقلة، هذا امتداد لنفس فكرة
// "التحكم بمحتوى الواجهات العامة"). قائمة الخدمات وصورها/أوصافها في
// التطبيق لا تُدار من هنا إطلاقاً — يقرأها التطبيق من نفس
// LandingService/landing-services المستخدَمة في صفحة "اطلب الخدمة" مباشرة.
export interface MobileAppSettings {
  // بانر ترحيبي أعلى الشاشة الرئيسية في التطبيق — أي حقل فارغ/غائب يُخفي
  // البانر بالكامل بدل عرضه فارغاً.
  home_banner_image_url?: string;
  home_banner_title?: string;
  home_banner_subtitle?: string;
  // نصوص شاشة تسجيل الدخول (العنوان والوصف تحته) — التطبيق يستخدم نصاً
  // افتراضياً معقولاً إن كانت هذه الحقول فارغة.
  login_title?: string;
  login_subtitle?: string;
  updated_at: string;
}

export const DEFAULT_MOBILE_APP_SETTINGS: MobileAppSettings = {
  updated_at: new Date(0).toISOString(),
};

// بطاقة خدمة تسويقية معروضة في صفحة "اطلب الخدمة" العامة — منفصلة عمداً عن
// دليل الخدمات التشغيلي (Service، المستخدَم في التسعير والمواعيد والعقود)،
// حتى يمكن التحكم بمحتوى الصفحة التسويقية (صورة ونص كل خدمة، وأيها معروض)
// دون التأثير على أسعار أو مدد الخدمات الفعلية. تُدار من الإعدادات ←
// الطلبات الخارجية.
export interface LandingService {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
}

// نوع العميل — فرد أو شركة. اختياري (عملاء قدامى بلا قيمة يبقون كما هم).
export type CustomerType = 'individual' | 'company';

export const CUSTOMER_TYPE_LABELS_AR: Record<CustomerType, string> = {
  individual: 'فرد',
  company: 'شركة',
};

// مصدر العميل — من أين وصلنا هذا العميل أول مرة. اختياري لنفس سبب
// customer_type أعلاه.
export type CustomerSource = 'whatsapp' | 'external_orders_page' | 'outbound_call' | 'inbound_call' | 'social_media';

export const CUSTOMER_SOURCE_LABELS_AR: Record<CustomerSource, string> = {
  whatsapp: 'واتساب',
  external_orders_page: 'صفحة الطلبات الخارجية',
  outbound_call: 'اتصال صادر',
  inbound_call: 'اتصال وارد',
  social_media: 'وسائل التواصل الاجتماعي',
};

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  district?: string;
  city?: string;
  location_url?: string;
  notes?: string;
  customer_type?: CustomerType;
  source?: CustomerSource;
  // فقط عندما source === 'outbound_call' — معرّف الموظف الذي أجرى الاتصال
  // الصادر الذي جلب هذا العميل (من allProfiles)، وليس بالضرورة الموظف
  // الذي أنشأ سجل العميل في النظام.
  source_call_profile_id?: string;
  // الحقول الثلاثة التالية خاصة بعملاء الشركات فقط — تظهر في الواجهة
  // فقط عندما customer_type === 'company'، وتبقى undefined لعملاء الأفراد.
  tax_number?: string;
  national_address?: string;
  commercial_registration_number?: string;
  // الموظف "المسوّق" الذي جلب هذا العميل — يُستخدَم فقط لتوزيع عمولة
  // المسوّق نسبياً حسب إيراد كل مسوّق فعلياً (انظر نظام العمولات أدناه).
  // اختياري تماماً، وغير مرتبط بـ source_call_profile_id أعلاه (ذلك خاص
  // بمصدر "اتصال صادر" تحديداً، وهذا تعيين ملكية العميل التجارية).
  marketer_id?: string;
  created_at: string;
}

// نموذج تسعير الخدمة — غائب/'fixed' = سعر ثابت (default_price)، كما كانت
// كل الخدمات سابقاً. 'per_sqm'/'per_seat': السعر النهائي = الكمية التي
// تُدخَل عند الحجز (عدد الأمتار أو المقاعد) × unit_price (سعر الوحدة
// الافتراضي المُعدّ من الإعدادات ← الخدمات) — قابل للتعديل كأي سعر آخر.
export type ServicePricingModel = 'fixed' | 'per_sqm' | 'per_seat';

export const SERVICE_PRICING_MODEL_LABELS_AR: Record<ServicePricingModel, string> = {
  fixed: 'سعر ثابت',
  per_sqm: 'بالمتر المربع',
  per_seat: 'بالمقعد',
};

// وحدة القياس المعروضة بجانب حقل الكمية عند الحجز (مقابلة لكل نموذج غير
// ثابت) — 'fixed' لا تستخدمها إطلاقاً.
export const SERVICE_PRICING_UNIT_LABELS_AR: Record<Exclude<ServicePricingModel, 'fixed'>, string> = {
  per_sqm: 'عدد الأمتار (م²)',
  per_seat: 'عدد المقاعد',
};

export interface Service {
  id: string;
  name: string;
  description?: string;
  category?: string;
  default_price: number;
  default_duration_minutes: number;
  is_active: boolean;
  pricing_model?: ServicePricingModel;
  // سعر الوحدة الافتراضي (للمتر أو للمقعد) — يُستخدَم فقط عندما
  // pricing_model ليست 'fixed'.
  unit_price?: number;
  // مدة الوحدة الواحدة (بالثواني — للمتر أو للمقعد) — اختياري، يُستخدَم
  // فقط عندما pricing_model ليست 'fixed'. عند تحديدها، مدة الخدمة الكلية
  // = الكمية المُدخَلة عند الحجز × هذه القيمة (بدل default_duration_minutes
  // الثابتة). غائبة = تبقى المدة الكلية ثابتة (default_duration_minutes)
  // بصرف النظر عن الكمية، كما كانت كل خدمات per_sqm/per_seat سابقاً.
  unit_duration_seconds?: number;
  // مستويات تسعير اختيارية (مثال: تنظيف سطحي/عميق للكنب) — كل مستوى له
  // سعر ومدة خاصة به للوحدة الواحدة، بدل unit_price/unit_duration_seconds
  // العامَّين أعلاه. عند وجودها (مصفوفة غير فارغة)، يُطلَب عند الحجز اختيار
  // مستوى واحد بالإضافة إلى الكمية، ويُحتسَب السعر والمدة من المستوى
  // المختار تحديداً. غائبة/فارغة = تستمر الخدمة بسعر/مدة الوحدة العامَّين
  // كالمعتاد (بلا مستويات).
  pricing_tiers?: ServicePricingTier[];
}

export interface ServicePricingTier {
  // معرّف مستقر للمستوى (يُنشأ عشوائياً عند الإضافة) — يُستخدَم لربط
  // اختيار العميل بالمستوى الصحيح، مستقل عن ترتيب أو نص التسمية.
  key: string;
  // اسم المستوى المعروض عند الحجز (مثال: "تنظيف سطحي"، "تنظيف عميق").
  label: string;
  unit_price: number;
  unit_duration_seconds?: number;
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
  // وقت مختلف لكل يوم من أيام الزيارة الأسبوعية — نفس فكرة day_supervisors
  // بالضبط (مفتاح اليوم ← قيمة خاصة به)، يوم بلا مفتاح هنا يستخدم visit_time
  // كافتراضي. مثال: السبت ٠٩:٠٠ والثلاثاء ١٦:٠٠ لعقد بزيارتين أسبوعياً.
  visit_day_times?: Record<string, string>;
  start_date: string;
  end_date: string;
  total_visits: number;
  completed_visits: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  // طريقة التحصيل المتفَق عليها لهذا العقد ككل (كاش/تحويل/شبكة — نفس
  // PaymentMethodOption المستخدَم في كل مكان آخر بالنظام). كل دفعة فعلية في
  // payments أدناه تحمل طريقتها الخاصة أيضاً (قد تختلف دفعة عن أخرى)، وهذا
  // الحقل هو مجرد الطريقة الافتراضية/المتوقَّعة المعروضة في قائمة العقود.
  payment_method?: PaymentMethod;
  // تاريخ استحقاق الدفعة القادمة — منفصل عمداً عن end_date (تاريخ انتهاء
  // مدة العقد نفسها)، لأن عقداً سنوياً مثلاً قد يُحصَّل على دفعات متعددة
  // خلال مدته، كل دفعة باستحقاق مختلف عن نهاية العقد.
  due_date?: string;
  // سجل الدفعات الفعلية المسجَّلة على هذا العقد — نفس منطق Payment[] على
  // Appointment بالضبط (انظر POST /contracts/:id/payments)، تُحدِّث
  // paid_amount/remaining_amount/payment_status تلقائياً عند كل دفعة.
  payments: Payment[];
  // خطة تقسيط اختيارية للقيمة الإجمالية — بنود بنسب/مبالغ وتواريخ استحقاق
  // محدَّدة (بدل تاريخ استحقاق واحد فقط في due_date أعلاه). كل بند يتراكم
  // عليه paid_amount مستقلاً عن الآخر — انظر ContractScheduleItem.
  payment_schedule?: ContractScheduleItem[];
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

// إيراد (وارد مالي خارج تحصيل المواعيد/الفواتير العادي) — نفس سجل Expense،
// فقط بعلامة entry_type مختلفة، حتى يُشارك كامل النموذج (تصنيف، فاتورة،
// ملف مرفق) دون تكرار. مبلغ الإيراد (amount) يبقى موجباً دوماً في التخزين،
// ويُطرَح (لا يُجمَع) من كل إجماليات المصروفات في الواجهة (Expenses.tsx) —
// راجع تعليق amount أدناه. نوعان فرعيان (income_type): "مرتجع" (استرداد
// من مورد لبضاعة/مواد مرتجعة) أو "رأس مال إضافي" (ضخ مالي من المالك).
export type ExpenseEntryType = 'expense' | 'income';
// "دفعة من عقد" — تسجيل دفعة واردة فعلياً مقابل بند من جدول دفعات عقد
// (Contract.payment_schedule)، من نفس نموذج "إضافة إيراد" العام. عند
// اختياره يُطلَب اختيار العقد ثم البند المستحق، ويُنشئ Expense.contract_id/
// schedule_item_id مصروفاً مرآتياً بنفس نمط paid_via_custody — انظر POST
// /contracts/:id/payments.
export type ExpenseIncomeType = 'return' | 'additional_capital' | 'contract_payment';

export const EXPENSE_INCOME_TYPE_LABELS_AR: Record<ExpenseIncomeType, string> = {
  return: 'مرتجع',
  additional_capital: 'رأس مال إضافي',
  contract_payment: 'دفعة من عقد',
};

// كيف تُستقطَع سلفية (Expense بفئة ADVANCE_CATEGORY_NAME) من راتب صاحبها —
// انظر Expense.advance_deduction_mode أعلاه.
export type AdvanceDeductionMode = 'none' | 'full_next' | 'installments' | 'period';

export const ADVANCE_DEDUCTION_MODE_LABELS_AR: Record<AdvanceDeductionMode, string> = {
  none: 'بلا استقطاع تلقائي',
  full_next: 'خصمها كاملة من الراتب القادم',
  installments: 'تقسيطها على عدة رواتب',
  period: 'خصمها بين فترتين محدَّدتين',
};

// التصنيف المحاسبي لعملية مصروف — Expense.accounting_classification
// أدناه. مستقل تماماً عن category (فئة "مركبات" العملياتية مثلاً قد تصنَّف
// محاسبياً "مصاريف تشغيلية")؛ اختياري يدوي بالكامل — انظر
// DEFAULT_ACCOUNTING_CLASSIFICATION_BY_CATEGORY أدناه للاقتراح التلقائي
// المبدئي فقط عند اختيار الفئة أول مرة في نموذج إضافة مصروف (Expenses.tsx).
export type ExpenseAccountingClassification =
  | 'fixed_assets'
  | 'setup_short_lived_assets'
  | 'general_admin'
  | 'operating'
  | 'utilities'
  | 'raw_materials'
  | 'employee_wages'
  | 'current_assets_advances';

export const EXPENSE_ACCOUNTING_CLASSIFICATION_LABELS_AR: Record<ExpenseAccountingClassification, string> = {
  fixed_assets: 'أصول ثابتة',
  setup_short_lived_assets: 'مصاريف تأسيس / أصول قصيرة',
  general_admin: 'مصاريف عمومية وإدارية',
  operating: 'مصاريف تشغيلية',
  utilities: 'منافع ومرافق',
  raw_materials: 'مواد خامات ومستهلكات',
  employee_wages: 'أجور ومنافع الموظفين',
  current_assets_advances: 'أصول متداولة (ذمم سلف)',
};

// نوع التكلفة — مشتق حصراً من التصنيف المحاسبي (ليس حقلاً مستقلاً على
// Expense)، انظر EXPENSE_ACCOUNTING_CLASSIFICATION_COST_TYPE أدناه.
export type ExpenseCostType = 'capex' | 'opex' | 'balance_sheet';
export const EXPENSE_COST_TYPE_LABELS_AR: Record<ExpenseCostType, string> = {
  capex: 'تأسيسي (CapEx)',
  opex: 'تشغيلي (OpEx)',
  balance_sheet: 'ميزانية عمومية',
};

export const EXPENSE_ACCOUNTING_CLASSIFICATION_COST_TYPE: Record<ExpenseAccountingClassification, ExpenseCostType> = {
  fixed_assets: 'capex',
  setup_short_lived_assets: 'capex',
  general_admin: 'opex',
  operating: 'opex',
  utilities: 'opex',
  raw_materials: 'opex',
  employee_wages: 'opex',
  current_assets_advances: 'balance_sheet',
};

export interface Expense {
  id: string;
  title: string;
  category: string;
  // مصروف عادي أو إيراد — غير موجود (undefined) يعني "مصروف" لكل السجلات
  // القديمة قبل إضافة هذا الحقل. انظر ExpenseEntryType أعلاه.
  entry_type?: ExpenseEntryType;
  // نوع الإيراد الفرعي — مطلوب فقط عندما entry_type === 'income'.
  income_type?: ExpenseIncomeType;
  // Optional sub-item under the main category (e.g. category "مركبات",
  // sub_category "بنزين") — names of an ExpenseCategoryItem pair.
  sub_category?: string;
  // التصنيف المحاسبي (اختياري) — أصول ثابتة/متداولة، مصاريف تشغيلية أو
  // عمومية وإدارية، إلخ. مستقل عن category تماماً، انظر التعليق أعلاه.
  accounting_classification?: ExpenseAccountingClassification;
  period_type: 'daily' | 'monthly' | 'annual';
  amount: number;
  // هل فاتورة هذا المصروف "فاتورة ضريبية" (صادرة من مورد مسجَّل في ضريبة
  // القيمة المضافة)؟ عند تفعيلها يُحتسَب tax_amount تلقائياً من amount
  // (بافتراض أن amount شامل الضريبة — نفس اصطلاح كل تسعير في هذا النظام،
  // انظر VAT_RATE)، ليدخل ضمن ملخص "ضريبة القيمة المضافة على المشتريات"
  // في نظرة عامة المصروفات (Expenses.tsx).
  is_tax_invoice?: boolean;
  tax_amount?: number;
  date: string;
  invoice_number?: string;
  unit_or_vehicle_ref?: string;
  recorded_by: string;
  recorded_by_name?: string;
  supervisor_id?: string;
  supervisor_name?: string;
  // Set when category === CUSTODY_CATEGORY_NAME (عهدة), ADVANCE_CATEGORY_NAME
  // (سلفية), or SALARY_CATEGORY_NAME (رواتب): which employee the cash was
  // handed to (or, for رواتب, whose salary this is). The name
  // "custody_holder" predates both the سلفية and رواتب reuse — kept as-is
  // to avoid a schema migration.
  custody_holder_id?: string;
  custody_holder_name?: string;
  // Set when category === VEHICLE_CATEGORY_NAME (مركبات): which registered
  // vehicle (Settings ← المركبات) this expense belongs to — لعرضها لاحقاً
  // مجمَّعة في صفحة تفاصيل تلك المركبة. vehicle_label هو لقطة عرض جاهزة
  // (النوع — رقم اللوحة) وقت التسجيل، بنفس نمط custody_holder_name.
  vehicle_id?: string;
  vehicle_label?: string;
  // Set when category === FACILITY_CATEGORY_NAME (إيجار مبنى): أي مرفق
  // مسجَّل (Settings ← المرافق) هذا المصروف مقابل إيجاره، وأي بند من جدول
  // دفعاته (Facility.payment_schedule) — نفس نمط contract_id/schedule_item_id
  // أدناه بالضبط، لكن للمرافق لا العقود. facility_label لقطة عرض جاهزة
  // (الاسم) وقت التسجيل، بنفس نمط vehicle_label. facility_schedule_item_id
  // إما معرّف بند حقيقي من payment_schedule، أو إحدى القيم الخاصة
  // 'office_fee'/'water'/'electricity' للمبالغ الإضافية الثلاثة على
  // Facility (كل منها بند مستحق/مسدَّد واحد مستقل — انظر التعليق عليها).
  facility_id?: string;
  facility_label?: string;
  facility_schedule_item_id?: string;
  vendor_name?: string; // اسم التاجر — مصدره غالباً فاتورة عهدة، انظر paid_via_custody
  // صحيح فقط لمصروف وُلِد تلقائياً من فاتورة عهدة (POST /custody-invoices
  // ← linked_expense_id): custody_holder_id هنا يعني "مَن دفعها من عهدته
  // الشخصية" — عكس معناه المعتاد أعلاه (عهدة/سلفية/رواتب، حيث يعني "مَن
  // استلم المبلغ"). يُستخدَم لعرض "مدفوعة من عهدة فلان" في قائمة
  // المصروفات العامة بدل نقداً/شبكة.
  paid_via_custody?: boolean;
  // مصروف (إيراد) وُلِد تلقائياً من تسجيل "دفعة من عقد" — العقد والبند
  // المحدَّد من جدول دفعاته الذي سُجِّلت هذه الدفعة مقابله. انظر
  // ExpenseIncomeType.contract_payment وPOST /contracts/:id/payments.
  contract_id?: string;
  contract_number_snapshot?: string;
  schedule_item_id?: string;
  // جدولة استقطاع السلفية من الراتب — ذات معنى فقط عندما
  // category === ADVANCE_CATEGORY_NAME، تُضبَط عند تسجيل السلفية نفسها
  // (أو لاحقاً بالتعديل). 'none' (الافتراضي) يعني بلا استقطاع تلقائي
  // إطلاقاً — لا شيء مفعّل إلا بالاختيار الصريح. يُحتسَب فعلياً في POST
  // /employees/:id/pay-salary بنفس منطق قسط EmployeeDeduction الشهري
  // تماماً (انظر computeAdvanceInstallment هناك).
  advance_deduction_mode?: AdvanceDeductionMode;
  // لوضع 'installments': عدد الأشهر لتقسيط amount عليها بالتساوي، بدءاً
  // من الراتب القادم مباشرة (1 يكافئ 'full_next').
  advance_installment_months?: number;
  // لوضع 'period': نطاق الأشهر (YYYY-MM شاملة الطرفين) التي يُستقطَع
  // amount مقسَّماً بالتساوي عليها — لا استقطاع قبل advance_period_start
  // ولا بعد advance_period_end حتى لو بقي رصيد.
  advance_period_start?: string;
  advance_period_end?: string;
  // المبلغ المُستقطَع فعلياً حتى الآن عبر الرواتب الشهرية — الفرق
  // (amount - advance_settled_amount) هو "المتبقي".
  advance_settled_amount?: number;
  payment_method: PaymentMethod;
  notes?: string;
  // صورة أو ملف PDF لسند/فاتورة المصروف — يُرفع كـ base64 data URL من
  // العميل، ويُخزَّن في Supabase Storage (انظر uploadExpenseInvoice في
  // server/lib/storage.ts)؛ هذا الحقل يحمل الرابط الموقَّع فقط، أبداً لا
  // يُخزَّن الملف الخام هنا.
  invoice_file_url?: string;
  invoice_file_name?: string;
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
  vendor_name?: string; // اسم التاجر
  // تصنيف المصروف (نفس تصنيفات صفحة المصروفات العامة، مثال "مركبات") —
  // مطلوب حتى يُسجَّل هذا كمصروف عادي أيضاً (انظر linked_expense_id أدناه).
  category?: string;
  sub_category?: string;
  // مصروف تصنيف "مركبات" تحديداً يربط بمركبة مسجَّلة (Settings ← المركبات)
  // بدل بند فرعي حر — نفس Expense.vehicle_id/vehicle_label بالضبط.
  vehicle_id?: string;
  vehicle_label?: string;
  is_tax_invoice?: boolean;
  tax_amount?: number;
  invoice_file_url?: string;
  invoice_file_name?: string;
  // معرّف المصروف المرآتي (Expense) الذي أُنشئ تلقائياً مع هذه الفاتورة —
  // نفس القيد يظهر أيضاً ضمن المصروفات العامة الشهرية، موسوماً
  // paid_via_custody ليتضح أنه مدفوع من عهدة الموظف لا نقداً من الصندوق.
  // يُحذَف معه تلقائياً عند حذف هذه الفاتورة (انظر DELETE
  // /custody-invoices/:id في api.ts).
  linked_expense_id?: string;
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
  // 'site' = صور الموقع الحالي — تُستخدم فقط لمواعيد "زيارة عميل"
  // (kind: 'visit')، بديلاً عن قبل/بعد التي لا معنى لها قبل تنفيذ خدمة
  // فعلية أصلاً.
  stage: 'before' | 'after' | 'site';
  data_url: string;
  taken_at: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  recorded_at: string;
  recorded_by?: string;
  // دفعة سُجِّلت مقابل بند محدَّد من جدول دفعات العقد (Contract.
  // payment_schedule) — فقط لدفعات العقود (Contract.payments)، لا معنى
  // لها لدفعات المواعيد. انظر ContractScheduleItem أدناه.
  schedule_item_id?: string;
}

// بند واحد من جدول دفعات العقد (خطة أقساط مبنية على نسب من القيمة
// الإجمالية، بتاريخ استحقاق لكل بند) — Contract.payment_schedule. يُبنى
// عند إنشاء العقد (أو تعديله)، ويتراكم عليه paid_amount مع كل دفعة فعلية
// تُسجَّل مرتبطة به (Payment.schedule_item_id)، سواء من داخل تفاصيل العقد
// أو من صفحة المصروفات ← إضافة إيراد ← دفعة من عقد.
export interface ContractScheduleItem {
  id: string;
  // نسبة هذا البند من القيمة الإجمالية للعقد (٪) — اختيارية، للعرض
  // والحساب المبدئي فقط؛ amount هو المصدر الفعلي المعتمد دائماً.
  percent?: number;
  amount: number;
  due_date: string;
  label?: string;
  paid_amount: number;
  status: PaymentStatus;
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
  // غائب = 'service' (موعد خدمة عادي، كل السجلات القديمة). 'visit' =
  // زيارة معاينة عميل قبل تحديد الخدمة والسعر — انظر AppointmentKind.
  kind?: AppointmentKind;
  // نوع التنظيف/الصيانة المطلوب كما حدَّده المشرف بعد المعاينة الميدانية
  // (نص حر، وليس اختياراً من دليل الخدمات — القرار النهائي على الخدمة
  // الفعلية يُتَّخذ لاحقاً عند تحويل الزيارة إلى عرض سعر أو موعد فعلي).
  visit_service_type?: string;
  visit_outcome?: VisitOutcome;
  visit_outcome_at?: string;
  // معرّف محادثة WhatsappThread التي أنشأت هذا الموعد تلقائياً (status
  // البدئية 'pending_review') — غائب على كل المواعيد الأخرى المُنشأة
  // يدوياً أو من عقد متكرر.
  whatsapp_thread_id?: string;
  // كود خصم مسوّق (CommissionEligibility.discount_code) طُبِّق عند حجز
  // هذا الموعد — يُخزَّن كما أُدخِل حرفياً للعرض فقط. marketer_id هو
  // معرّف المسوّق الفعلي الذي حُلَّ منه (على الخادم، وقت الحجز)، وهو ما
  // يُستخدَم مباشرة في احتساب العمولات (يتفوّق على customer.marketer_id
  // لهذا الموعد تحديداً بصرف النظر عمّن يكون مسوّق العميل الثابت).
  // marketer_discount_amount هو القيمة المخصومة فعلياً بالريال بسبب هذا
  // الكود — amount أعلاه يعكسها مسبقاً (بعد الخصم)، هذا الحقل للعرض/
  // الطباعة فقط ولا يدخل في أي حساب لاحق. كل الحقول غائبة يعني: لا كود
  // استُخدم لهذا الموعد.
  marketer_code?: string;
  marketer_id?: string;
  marketer_discount_amount?: number;
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
  // الموظف الذي أصدر/حصَّل هذه الفاتورة (المستخدم المسجِّل دخوله وقت
  // الإصدار — من تحصيل دفعة موعد أو من نموذج فاتورة يدوية في المبيعات).
  // غائب على أي فاتورة صدرت قبل إضافة هذا الحقل. يُستخدم في كشف حساب
  // الموظف (انظر EmployeeAccounts.tsx) لعرض "الفواتير المدفوعة عن طريقه".
  recorded_by?: string;
  recorded_by_name?: string;
  // خصم اختياري طُبِّق على هذه الفاتورة (خصم مناسبة مفعَّل من صفحة
  // المبيعات، أو خصم مفتوح — نسبة أو مبلغ ثابت لا يتجاوزان ما يعادل
  // OPEN_DISCOUNT_MAX_PERCENT) — كل الحقول غائبة يعني بلا خصم. subtotal
  // أعلاه هو المبلغ بعد الخصم (نفس ما تُحتسَب عليه الضريبة كما كان دائماً)؛
  // pre_discount_subtotal يحفظ القيمة قبل الخصم للعرض والطباعة فقط، ولا
  // يدخل في أي حساب آخر. discount_percent غائب لخصم بمبلغ ثابت (discount_kind
  // === 'fixed') — discount_amount وحده هو المصدر الموثوق للقيمة المخصومة
  // فعلياً في الحالتين.
  discount_label?: string;
  discount_kind?: SalesDiscountKind;
  discount_percent?: number;
  discount_amount?: number;
  pre_discount_subtotal?: number;
}

// نوع الخصم: نسبة مئوية من المبلغ قبل الضريبة، أو مبلغ ثابت بالريال.
export type SalesDiscountKind = 'percent' | 'fixed';

// خصم مناسبة قابل للتفعيل (اليوم الوطني، يوم التأسيس...) يُعدِّله المدير
// العام أو أحد المشرفَين من بطاقة "خصم المناسبة" في صفحة المبيعات (انظر
// صلاحية manage_sales_discount)، ثم يُطبَّق اختيارياً عند إصدار أي فاتورة
// من نفس الصفحة طالما ظل مفعَّلاً — سجل واحد فقط (singleton)، لا سجل
// تاريخي لكل مناسبة سابقة. منفصل تماماً عن "الخصم المفتوح" الذي يُدخِله
// من يُصدر الفاتورة نفسها (نسبة أو مبلغ ثابت لا يتجاوزان ما يعادل
// OPEN_DISCOUNT_MAX_PERCENT — لا يُحفَظ كإعداد، فقط يُطبَّق على تلك الفاتورة).
export interface SalesDiscountSettings {
  named_discount_enabled: boolean;
  named_discount_label?: string;
  // 'percent' (افتراضي عند الغياب — يطابق سلوك كل سجل محفوظ قبل إضافة
  // المبلغ الثابت) أو 'fixed'. الحقل المقابل فقط هو المُعتَد به.
  named_discount_kind?: SalesDiscountKind;
  // نسبة مئوية (0-100) — تُستخدَم عندما named_discount_kind === 'percent'.
  // بلا سقف صارم كسقف الخصم المفتوح أدناه، فالمدير العام يملك مطلق
  // الصلاحية في ضبط خصومات المناسبات كما يشاء.
  named_discount_percent?: number;
  // مبلغ ثابت بالريال — يُستخدَم عندما named_discount_kind === 'fixed'.
  // يُقيَّد عند إصدار الفاتورة نفسها بألا يتجاوز المبلغ قبل الخصم (لا يمكن
  // أن يصبح الإجمالي سالباً)، بلا سقف آخر — نفس منطق النسبة أعلاه.
  named_discount_amount?: number;
  updated_at: string;
}

export const DEFAULT_SALES_DISCOUNT_SETTINGS: SalesDiscountSettings = {
  named_discount_enabled: false,
  updated_at: new Date(0).toISOString(),
};

// السقف الأعلى لنسبة "الخصم المفتوح" الذي يُدخِله من يُصدر الفاتورة يدوياً
// (بلا اسم مناسبة) — مفروض في الواجهة وأيضاً على الخادم (انظر POST
// /invoices في api.ts) حتى لا يُتجاوَز بطلب مباشر للـ API.
export const OPEN_DISCOUNT_MAX_PERCENT = 5;

// خصم مالي على موظف (غير سلفية أو عهدة) — مخالفة، تأخير، تلفية، أو أي خصم
// إداري آخر. يُعرَض في صفحة الموظفين فقط، ولا يؤثر على أي رصيد عهدة أو
// سلفية قائم.
//
// آلية التقسيط الشهري (installment_months): مبلغ الخصم amount يُقسَّط
// بالتساوي على عدد الأشهر المحدَّد (مثال: 1000 ر.س على 4 أشهر = 250 ر.س
// شهرياً). في كل مرة يُسجَّل فيها راتب الموظف (POST /employees/:id/pay-salary)
// يُحتسَب قسط هذا الشهر = min(amount / installment_months, amount -
// settled_amount المتبقي فعلياً — يغطي تقريب الكسور في آخر قسط)، يُضاف
// إلى settled_amount ويُخصَم من صافي الراتب المسجَّل لذلك الشهر تلقائياً،
// والباقي يترحّل للأشهر القادمة حتى يكتمل amount بالكامل (settled_amount
// === amount)، عندها يُعتبر الخصم "مسدَّداً" ولا يُحتسَب في أي راتب لاحق.
// installment_months = 1 (الافتراضي) يعني خصمه بالكامل من راتب هذا الشهر.
export type EmployeeDeductionCategory = 'violation' | 'lateness' | 'damage' | 'other';

export interface EmployeeDeduction {
  id: string;
  employee_id: string;
  employee_name?: string;
  title: string;
  category?: EmployeeDeductionCategory;
  amount: number;
  // المبلغ المُستقطَع فعلياً حتى الآن عبر الرواتب الشهرية — الفرق
  // (amount - settled_amount) هو "المتبقي" المعروض في صفحة الموظفين.
  settled_amount?: number;
  // عدد الأشهر لتقسيط amount عليها بالتساوي (1 = خصمه بالكامل من هذا
  // الشهر). غائب/1 كلاهما يعني بلا تقسيط.
  installment_months?: number;
  date: string;
  notes?: string;
  recorded_by?: string;
  recorded_by_name?: string;
  created_at: string;
}

export const DEDUCTION_CATEGORY_LABELS_AR: Record<EmployeeDeductionCategory, string> = {
  violation: 'مخالفة',
  lateness: 'تأخير',
  damage: 'تلفية',
  other: 'أخرى',
};

// مخالفة إدارية على موظف — قد تحمل غرامة مالية (amount) أو تكون إنذاراً
// بلا غرامة (amount غائب/صفر). مستقلة تماماً عن EmployeeDeduction رغم
// تشابه الشكل، حتى يبقى لكل منهما سجل وتبويب خاص في كشف حساب الموظف.
export interface EmployeeViolation {
  id: string;
  employee_id: string;
  employee_name?: string;
  title: string;
  amount?: number;
  date: string;
  notes?: string;
  recorded_by?: string;
  recorded_by_name?: string;
  created_at: string;
}

// درجة الإنذار الوظيفي — أربع مراحل تصعيدية شائعة في لوائح تنظيم العمل
// السعودية (لا يفرضها نظام العمل نصاً بعدد ثابت، لكنها الممارسة المعتمَدة
// غالباً قبل الفصل أو الإجراء التأديبي الأشد، وفق اللائحة الخاصة بكل
// منشأة). اختياري (warning_type? على EmployeeWarning) — سجلات قديمة قبل
// هذا الحقل تبقى بلا درجة محدَّدة، تُعرَض بلا وسم درجة بدل خطأ.
export type EmployeeWarningType = 'verbal' | 'written_first' | 'written_second' | 'final';

export const EMPLOYEE_WARNING_TYPE_LABELS_AR: Record<EmployeeWarningType, string> = {
  verbal: 'إنذار شفهي',
  written_first: 'إنذار كتابي أول',
  written_second: 'إنذار كتابي ثاني',
  final: 'إنذار نهائي (أخير)',
};

// إنذار رسمي لموظف بسبب تجاوز أو مخالفة لأنظمة/متطلبات العمل — كيان مستقل
// عن EmployeeViolation (تلك تحمل غرامة مالية اختيارية؛ هذا مجرَّد إشعار
// كتابي رسمي بلا أي بعد مالي)، له قسم وزر إضافة خاصان في كشف حساب
// الموظف (EmployeeAccounts.tsx).
export interface EmployeeWarning {
  id: string;
  employee_id: string;
  employee_name?: string;
  title: string;
  // درجة الإنذار — انظر EmployeeWarningType أعلاه.
  warning_type?: EmployeeWarningType;
  date: string;
  notes?: string;
  recorded_by?: string;
  recorded_by_name?: string;
  created_at: string;
}

// ============================================================================
// نظام العمولات (تبويب "العمولات" داخل المحاسبة + صفحة إعداداته في
// الإعدادات) — عمولات المسوّق والمشرف الميداني تُحتسَب فقط على الإيراد
// المحصَّل الفعلي (paid) الذي يتجاوز نقطة تعادل الشركة الشهرية، بنِسَب
// تصاعدية حسب إجمالي إيراد الشركة الشهري (ليست حسب إيراد كل شخص وحده)،
// ثم تُوزَّع نسبياً على كل شخص مستحق حسب حصته الفعلية من الإيراد. كل
// الأرقام أدناه (نقطة التعادل، المستهدفات، النسب، حد الشكاوى) قابلة
// للتعديل الكامل من الإعدادات ← العمولات — القيم هنا مجرد نقطة بداية.
// ============================================================================

// إعدادات عامة واحدة فقط (سجل singleton، بنفس نمط LandingPageSettings) —
// نقطة التعادل الشهرية، أيام العمل الفعّالة، المستهدفات الثلاثة، وحدّا
// الأمان (نسبة الشكاوى القصوى للمشرف، وأدنى حصة صافية تبقى للشركة).
export interface CommissionConfig {
  // إجمالي المصاريف التشغيلية والإهلاك الشهرية الثابتة (SAR) — نقطة
  // التعادل الشهرية مباشرة. لا عمولات إطلاقاً قبل تغطيتها.
  monthly_fixed_expenses: number;
  // عدد أيام العمل الفعلية بالشهر — يُستخدَم فقط لعرض "نقطة تعادل يومية"
  // إرشادية (monthly_fixed_expenses ÷ هذا الرقم)، لا يدخل في حساب
  // العمولة نفسها.
  effective_work_days: number;
  // عتبة بداية احتساب العمولات (SAR/شهرياً) — المستوى الأول "تغطية
  // التكاليف"، نسبة عمولة 0% دونه مهما كان الإيراد.
  base_target: number;
  // عتبتا "نمو" و"تجاوز" — للعرض في شريط التقدم فقط (معالم تحفيزية)،
  // الشرائح الفعلية للعمولة في commission_tiers أدناه مستقلة عنهما ولا
  // يلزم أن تطابقهما بالضبط.
  growth_target: number;
  stretch_target: number;
  // أقصى نسبة شكاوى (تقييمات ١-٢ نجوم ÷ إجمالي تقييمات مواعيده) مسموحة
  // للمشرف الميداني خلال الشهر حتى يستحق عمولته ذلك الشهر — كسر عشري
  // (0.02 = 2%). تجاوزها يُسقِط عمولة ذلك المشرف فقط لذلك الشهر، لا يوقف
  // عمولة المسوّقين ولا حصة الشركة.
  supervisor_max_complaint_rate: number;
  // أدنى حصة يجب أن تبقى للشركة من الفائض (كسر عشري، 0.93 = 93%) — شرط
  // أمان: مجموع نسب العمولة (لكل من يستحق فعلياً ذلك الشهر) في أي شريحة
  // لا يتجاوز (1 - هذا الرقم)؛ لو تجاوزته الشرائح المُعدَّة يدوياً، تُخفَّض
  // كل النسب المستحقة فعلياً في تلك الشريحة تناسبياً عند الاحتساب حتى
  // يتحقق الشرط، بدل رفض الحفظ في الإعدادات نفسها.
  min_company_share: number;
  updated_at: string;
}

export const DEFAULT_COMMISSION_CONFIG: CommissionConfig = {
  monthly_fixed_expenses: 20340,
  effective_work_days: 26,
  base_target: 20000,
  growth_target: 25000,
  stretch_target: 30000,
  supervisor_max_complaint_rate: 0.02,
  min_company_share: 0.93,
  updated_at: new Date(0).toISOString(),
};

// شريحة تصاعدية من شرائح احتساب العمولة — مفتاحة بإجمالي إيراد الشركة
// المحصَّل الشهري (لا بإيراد كل شخص وحده). from/to شاملان، to=null يعني
// "بلا حد أعلى". الشرائح تُطبَّق على المبلغ الواقع داخل حدودها فقط (كنظام
// الضريبة التصاعدية)، لا على كامل الإيراد بمجرد دخول شريحة أعلى.
export interface CommissionTier {
  id: string;
  from: number;
  to: number | null;
  // كسور عشرية (0.05 = 5%) — نسبة كل من المسوّق والمشرف من الجزء الواقع
  // داخل هذي الشريحة تحديداً.
  marketer_rate: number;
  supervisor_rate: number;
}

// من يستحق عمولة "مسوّق" أو "مشرف" فعلياً هذا الشهر — تعيين يدوي مستقل
// عن دور الحساب الفعلي في النظام (UserRole)، فقد يكون "المسوّق" حساب
// مشرف إداري أو أي دور آخر فعلياً. active=false يوقف الاستحقاق فوراً
// دون حذف السجل (يحافظ على تاريخ من استحق ومتى).
export interface CommissionEligibility {
  id: string;
  profile_id: string;
  profile_name?: string;
  role: 'marketer' | 'supervisor';
  active: boolean;
  created_at: string;
  // كود خصم خاص بهذا المسوّق فقط (role === 'marketer' — يبقى بلا معنى
  // لمشرف) يُدخِله من يحجز موعداً جديداً (NewAppointmentModal): يمنح
  // خصماً حقيقياً على سعر الخدمة، ويربط إيراد ذلك الموعد تحديداً بهذا
  // المسوّق عند احتساب العمولات (Appointment.marketer_id أدناه) — بدل
  // الاعتماد فقط على customer.marketer_id الثابت على العميل نفسه. فريد
  // بين كل سجلات المسوّقين النشطين (يتحقق منه الخادم عند الحفظ)، غير
  // حسّاس لحالة الأحرف. غياب الحقل يعني: لا كود لهذا المسوّق بعد.
  discount_code?: string;
  // 'percent' (افتراضي عند الغياب) أو 'fixed' — نفس النمط المُعاد
  // استخدامه من SalesDiscountKind (خصم المبيعات)، بلا سقف صارم هنا (على
  // عكس "الخصم المفتوح" في المبيعات) — المدير العام يملك مطلق الصلاحية
  // في ضبط نسبة/مبلغ كود كل مسوّق كما يشاء.
  discount_kind?: SalesDiscountKind;
  discount_percent?: number;
  discount_amount?: number;
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

// الاسم التجاري المختصر — يظهر في هوية التطبيق نفسه وصفحة "اطلب الخدمة"
// العامة (branding خفيف، غير رسمي).
export const COMPANY_NAME = 'زهى';
// الاسم القانوني الكامل للشركة — هو من يظهر في رأس المستندات الرسمية
// (الفاتورة الضريبية، العقد، عرض السعر) وهو "seller identity" الذي
// تطبعه/تُشفّره هيئة الزكاة والضريبة والجمارك (ZATCA) في رمز الاستجابة
// السريعة على الفاتورة الضريبية المبسَّطة — يجب أن يطابق الاسم المسجَّل
// رسمياً، وليس الاسم التجاري المختصر أعلاه.
export const COMPANY_LEGAL_NAME = 'شركة زهى الاعمال';
export const COMPANY_VAT_NUMBER = '314739292200003';
export const COMPANY_PHONE = '0582464181';
// لم يزوّدنا صاحب العمل برقم السجل التجاري بعد — يبقى فارغاً عمداً حتى
// يُضاف هنا لاحقاً، وتُخفي مستندات العقد وعرض السعر هذا السطر تلقائياً
// طالما فارغ (انظر DocumentHeader.tsx) بدل طباعة رقم غير صحيح.
export const COMPANY_CR_NUMBER = '';

// بيانات الحساب البنكي للشركة — سجل واحد فقط (وليس قائمة)، يُقرأ/يُعدَّل عبر
// GET/PATCH /company-bank-account. تُدخَل من الإعدادات ← طرق الدفع (خلف
// صلاحية edit_payment_methods) بدل تثبيتها كنص برمجي، لأنها بيانات حساسة
// لا ينبغي حفظها داخل الكود المصدري المنشور علناً على GitHub، وحتى تُعدَّل
// دون الحاجة لنشر نسخة جديدة من التطبيق. تُستخدَم لإنشاء صورة قابلة
// للمشاركة (واتساب/إيميل) عند اختيار "حوالة بنكية" كطريقة دفع.
export interface CompanyBankAccount {
  account_holder_name: string;
  bank_name: string;
  iban: string;
  account_number: string;
  swift_code: string;
  updated_at: string;
}

export const DEFAULT_COMPANY_BANK_ACCOUNT: CompanyBankAccount = {
  account_holder_name: COMPANY_LEGAL_NAME,
  bank_name: '',
  iban: '',
  account_number: '',
  swift_code: '',
  updated_at: new Date(0).toISOString(),
};

// نوع تملّك المركبة — صفحة الإعدادات ← المركبات.
export type VehicleOwnershipType = 'company' | 'installments' | 'rented';
export const VEHICLE_OWNERSHIP_TYPE_LABELS_AR: Record<VehicleOwnershipType, string> = {
  company: 'ملكية الشركة',
  installments: 'أقساط',
  rented: 'مستأجرة',
};

// دورية مبلغ الإيجار للمركبة المستأجرة — Vehicle.rental_amount_frequency.
export type VehicleRentalFrequency = 'daily' | 'monthly';
export const VEHICLE_RENTAL_FREQUENCY_LABELS_AR: Record<VehicleRentalFrequency, string> = {
  daily: 'يومياً',
  monthly: 'شهرياً',
};

// مركبات الشركة — صفحة الإعدادات ← المركبات (VehiclesTab في Settings.tsx).
// سجل بيانات لكل مركبة (لا علاقة له بجدولة المواعيد أو تتبّع الموقع) —
// فقط معلومات ثابتة/شبه ثابتة يحتاجها صاحب العمل: الاستمارة، اللوحة،
// التأمين، الفحص الدوري، من يقودها، ومن هي تابعة له. assigned_profile_id
// يربط بأي موظف (فني، مشرف ميداني، أو أي دور آخر) — تُعرَض تلقائياً في
// تبويب "المعلومات الشخصية" الخاص بذلك الموظف (انظر PersonalInfoTab.tsx).
export interface Vehicle {
  id: string;
  type: string; // النوع (مثال: تويوتا هايلكس ٢٠٢٣)
  // تفصيل اختياري لمكوّنات "النوع" في خانات منفصلة — لا يُشتَق منها type
  // تلقائياً ولا يستبدلها، فقط بيانات إضافية أدق يملؤها من يريد.
  manufacturer?: string; // شركة الصنع (مثال: تويوتا)
  model_trim?: string; // طراز المركبة (مثال: هايلكس)
  model_year?: string; // موديل (سنة الصنع، مثال: ٢٠٢٣)
  vehicle_class?: string; // فئة المركبة (مثال: بيك أب، دفع رباعي، سيدان)
  registration_number?: string; // رقم الاستمارة
  // صورة استمارة المركبة — تُرفع كـ base64 data URL من العميل وتُخزَّن في
  // Supabase Storage (انظر uploadVehicleRegistrationPhoto في
  // server/lib/storage.ts)؛ هذا الحقل يحمل الرابط الموقَّع فقط، نفس نمط
  // Expense.invoice_file_url بالضبط.
  registration_photo_url?: string;
  owner?: string; // المالك (اسم صاحب الاستمارة — قد يكون الشركة نفسها أو فرداً)
  plate_number: string; // رقم اللوحة
  serial_number?: string; // الرقم التسلسلي (VIN)
  registration_expiry?: string; // تاريخ انتهاء الاستمارة
  inspection_expiry?: string; // تاريخ انتهاء الفحص الدوري
  insurance_expiry?: string; // تاريخ انتهاء التأمين
  authorized_driver?: string; // الشخص المفوض بالقيادة
  assigned_profile_id?: string; // تابعة لـ — يربط بأي Profile
  ownership_type?: VehicleOwnershipType; // نوع التملك
  // حقول إضافية حسب نوع التملك — 'company' لا يحتاج أياً منها (owner
  // يُضبَط تلقائياً على COMPANY_LEGAL_NAME من الواجهة نفسها، انظر
  // VehiclesTab في Settings.tsx).
  // 'rented' فقط:
  rental_company_name?: string; // اسم الشركة المؤجرة
  rental_contract_duration?: string; // مدة العقد (نص حر، مثال: "سنة واحدة")
  rental_contract_value?: number; // قيمة العقد
  rental_contract_start_date?: string; // تاريخ بداية العقد
  rental_contract_end_date?: string; // تاريخ نهاية العقد
  rental_amount?: number; // مبلغ الإيجار (دوري — انظر rental_amount_frequency)
  rental_amount_frequency?: VehicleRentalFrequency; // يومي أو شهري
  // 'installments' فقط:
  finance_provider?: string; // الجهة التمويلية (بنك/شركة تمويل)
  installment_duration?: string; // مدة الأقساط (نص حر)
  installment_count?: number; // عدد الأقساط الكلي
  installment_monthly_amount?: number; // قيمة القسط الشهري
  installments_remaining_count?: number; // عدد الأقساط المتبقية
  installments_remaining_amount?: number; // إجمالي المبلغ المتبقي
  final_payment_amount?: number; // قيمة الدفعة الأخيرة (التجميعية)
  last_oil_change?: string; // تاريخ آخر تغيير زيت
  last_oil_change_odometer?: number; // قراءة العداد وقت آخر تغيير زيت
  created_at: string;
  updated_at: string;
}

// نوع المرفق — Facility.type أدناه.
export type FacilityType = 'housing' | 'warehouse' | 'apartment' | 'office' | 'shop' | 'other';
export const FACILITY_TYPE_LABELS_AR: Record<FacilityType, string> = {
  housing: 'مبنى سكن',
  warehouse: 'مستودع',
  apartment: 'شقة',
  office: 'مكتب',
  shop: 'محل',
  other: 'أخرى',
};

// دورية مبلغ إيجار المرفق — Facility.rental_amount_frequency (وصفية فقط،
// الاستحقاق الفعلي يُبنى صراحةً في payment_schedule أدناه).
export type FacilityRentFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export const FACILITY_RENT_FREQUENCY_LABELS_AR: Record<FacilityRentFrequency, string> = {
  monthly: 'شهرياً',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوياً',
};

// اسم فئة مصروفات "إيجار مبنى" — نفس مطابقة الاسم المُستخدَمة في
// VEHICLE_CATEGORY_NAME أعلاه: تُظهر منتقي "المرفق" (بدل المركبة/الموظف)
// في نموذج إضافة مصروف عام، ليُربَط كل مصروف إيجار ببند محدَّد من جدول
// دفعات ذلك المرفق (Facility.payment_schedule بالضبط كما تفعل "دفعة من
// عقد" مع Contract.payment_schedule) — انظر Expense.facility_id أدناه
// وFacilitiesTab في Settings.tsx.
export const FACILITY_CATEGORY_NAME = 'إيجار مبنى';
// فئة "كهرباء" العامة (مصروف/فاتورة كهرباء لا علاقة له بإيجار مبنى بالضرورة)
// تُظهر نفس منتقي "المرفق" أعلاه أيضاً — فقط لربط الفاتورة بمرفق مسجَّل،
// لا لتسوية بند جدول دفعات (Expense.facility_schedule_item_id يبقى
// اختيارياً بحتاً هنا، بخلاف فئة FACILITY_CATEGORY_NAME حيث هو المسار
// المعتاد). انظر ELECTRICITY_CATEGORY_NAME أدناه.
export const ELECTRICITY_CATEGORY_NAME = 'كهرباء';

// تصنيف محاسبي افتراضي مقترح تلقائياً حسب فئة المصروف الرئيسية — يُطبَّق
// فقط عند اختيار الفئة لأول مرة في نموذج إضافة مصروف (Expenses.tsx)؛
// Expense.accounting_classification يبقى حقلاً مستقلاً قابلاً للتعديل
// اليدوي دائماً بعد ذلك. فئات غير مذكورة هنا (مشتريات متفرقة، مصاريف
// عهدة...) تبقى بلا اقتراح — يختارها المستخدم يدوياً.
export const DEFAULT_ACCOUNTING_CLASSIFICATION_BY_CATEGORY: Partial<Record<string, ExpenseAccountingClassification>> = {
  [VEHICLE_CATEGORY_NAME]: 'operating',
  [SALARY_CATEGORY_NAME]: 'employee_wages',
  [TRAVEL_TICKET_CATEGORY_NAME]: 'employee_wages',
  [HOUSING_ALLOWANCE_CATEGORY_NAME]: 'employee_wages',
  [TRANSPORT_ALLOWANCE_CATEGORY_NAME]: 'employee_wages',
  [ADVANCE_CATEGORY_NAME]: 'current_assets_advances',
  [ELECTRICITY_CATEGORY_NAME]: 'utilities',
  [FACILITY_CATEGORY_NAME]: 'general_admin',
  'مواد التشغيل والنظافة': 'raw_materials',
  'إقامات': 'general_admin',
  'إيجار': 'general_admin',
  'غاز': 'utilities',
  'تأسيس': 'setup_short_lived_assets',
};

// مرافق الشركة (مباني سكن، مستودعات، وخلافه) — صفحة الإعدادات ← المرافق
// (FacilitiesTab في Settings.tsx). كل مرفق يحمل تفاصيل عقد إيجاره وجدول
// دفعاته (payment_schedule — نفس بنية ContractScheduleItem المُستخدَمة في
// عقود العملاء تماماً)، فتتّضح الدفعات المستحقة والمستلمة والمتبقية بمرور
// الوقت؛ كل دفعة فعلية تُسجَّل من صفحة المصروفات العامة (فئة
// FACILITY_CATEGORY_NAME) وتُحدَّث مقابل بند من هذا الجدول — انظر POST
// /expenses وExpense.facility_schedule_item_id.
export interface Facility {
  id: string;
  name: string; // اسم/عنوان المرفق (مثال: "مبنى سكن العمال — حي الشفا")
  type: FacilityType;
  address?: string;
  // رابط موقع (خرائط جوجل) — نفس نمط Customer.location_url/Appointment.
  // location_url تماماً: نص حر يُلصَق من خرائط جوجل. رابط كامل (يحمل
  // إحداثيات ظاهرة في الرابط نفسه، مثال ".../@24.77,46.73,15z") يُعرَض
  // كخريطة مصغَّرة قابلة للتوسعة (انظر FacilityLocationMap في
  // Settings.tsx)؛ رابط مختصر (goo.gl/maps) يُعرَض كرابط عادي فقط.
  location_url?: string;
  notes?: string;
  is_active: boolean;
  // تفاصيل عقد الإيجار — كلها اختيارية (قد يكون المرفق مملوكاً للشركة بلا إيجار).
  landlord_name?: string; // اسم المؤجر/المالك
  rental_contract_number?: string;
  rental_contract_start_date?: string;
  rental_contract_end_date?: string;
  rental_amount?: number; // قيمة الإيجار الدورية (وصفية — انظر التعليق أعلاه)
  rental_amount_frequency?: FacilityRentFrequency;
  payment_schedule?: ContractScheduleItem[]; // جدول دفعات الإيجار
  // رسوم إضافية على عقد الإيجار — كلٌّ منها مبلغ مستقل بتتبّع مستحق/مسدَّد
  // خاص به (paid_amount/status، بنفس منطق ContractScheduleItem تماماً لكن
  // بلا due_date ولا جدول متعدد البنود؛ بند واحد لكل نوع). تعديل amount من
  // نموذج الإعدادات لا يمسّ paid_amount المتراكم أصلاً — فقط status يُعاد
  // احتسابه من جديد؛ لتسجيل فاتورة دورية جديدة (ماء/كهرباء) يرفع صاحب
  // النظام amount إلى القيمة الإجمالية المستحقة الجديدة يدوياً. تُسدَّد هذه
  // البنود من صفحة المصروفات ← إيجار مبنى تماماً كبنود payment_schedule —
  // انظر Expense.facility_schedule_item_id (القيم الخاصة 'office_fee'/
  // 'water'/'electricity') وPOST /expenses.
  office_fee_amount?: number; // رسوم المكتب/الوساطة — عادة تُدفع مرة واحدة عند التعاقد
  office_fee_paid_amount?: number;
  office_fee_status?: PaymentStatus;
  water_included?: boolean; // الماء مشمول ضمن الإيجار؟
  water_amount?: number; // إن لم يكن مشمولاً — المبلغ المستحق حالياً لفاتورة الماء
  water_amount_frequency?: FacilityRentFrequency;
  water_paid_amount?: number;
  water_status?: PaymentStatus;
  electricity_included?: boolean; // الكهرباء مشمولة ضمن الإيجار؟
  electricity_amount?: number; // إن لم تكن مشمولة — المبلغ المستحق حالياً لفاتورة الكهرباء
  electricity_amount_frequency?: FacilityRentFrequency;
  electricity_paid_amount?: number;
  electricity_status?: PaymentStatus;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// الجرد والأصول الثابتة (Inventory & Assets) — تبويب مستقل داخل صفحة
// "المحاسبة" (InventoryTab في Inventory.tsx)، خلف صلاحيتي
// view_inventory_page/manage_inventory. أربعة كيانات: Asset (سجل كل أصل
// ثابت وبيانات إهلاكه)، AuditCycle (جلسة جرد دوري)، AuditItem (بند مقارنة
// فعلي/متوقَّع ضمن جلسة جرد لأصل بعينه)، AssetScrappageLog (سجل شطب أصل
// وخسارته الدفترية). حساب الإهلاك نفسه (مجمع الإهلاك/القيمة الدفترية)
// ليس حقلاً مخزَّناً على Asset — يُحتسَب دائماً حيّاً من purchase_price/
// purchase_date/useful_life_years/salvage_value (ولـ status === 'scrapped'
// من scrapped_at كسقف بدل التاريخ الحالي) عبر computeAssetDepreciation في
// src/shared/depreciation.ts، فيبقى صحيحاً تلقائياً شهراً بعد شهر بلا أي
// مهمة مجدولة تُحدِّثه.
// ============================================================================

export type AssetCategory = 'cleaning_equipment' | 'cleaning_supplies' | 'housing_furniture' | 'hand_tools' | 'uniforms_gear';
export const ASSET_CATEGORY_LABELS_AR: Record<AssetCategory, string> = {
  cleaning_equipment: 'معدات نظافة',
  cleaning_supplies: 'مواد نظافة',
  housing_furniture: 'أثاث سكن',
  hand_tools: 'أدوات يدوية',
  uniforms_gear: 'ملابس وتجهيزات',
};

export type AssetCondition = 'excellent' | 'working' | 'needs_maintenance' | 'damaged';
export const ASSET_CONDITION_LABELS_AR: Record<AssetCondition, string> = {
  excellent: 'ممتاز',
  working: 'يعمل',
  needs_maintenance: 'يحتاج صيانة',
  damaged: 'تالف',
};

export type AssetStatus = 'active' | 'maintenance' | 'scrapped';
export const ASSET_STATUS_LABELS_AR: Record<AssetStatus, string> = {
  active: 'نشط',
  maintenance: 'صيانة',
  scrapped: 'مشطوب',
};

// سجل أصل ثابت واحد — صفحة المحاسبة ← الجرد والأصول الثابتة. asset_code
// فريد يُدخله المستخدم يدوياً (مثال: EQ-001) — لا يُشتَق تلقائياً، النظام
// يرفض تكراره فقط (انظر POST /assets في api.ts).
export interface Asset {
  id: string;
  asset_code: string;
  name: string;
  category: AssetCategory;
  purchase_price: number;
  // هل purchase_price شامل ضريبة القيمة المضافة؟ نفس اصطلاح Expense.
  // is_tax_invoice/tax_amount بالضبط — افتراضي true (كل تسعير في هذا
  // النظام شامل الضريبة ما لم يُنصَّ خلاف ذلك، انظر VAT_RATE)؛
  // purchase_price_vat_amount مبلغ الضريبة المُحتسَب (استخراج من مبلغ شامل
  // الضريبة إن كانت الحالة true، أو 15% إضافية فوق السعر إن كانت false)،
  // إعلامي بحت — لا يُغيِّر purchase_price نفسه ولا أساس احتساب الإهلاك
  // (computeAssetDepreciation يستخدم purchase_price كما هو دائماً).
  purchase_price_includes_vat?: boolean;
  purchase_price_vat_amount?: number;
  // فاتورة الشراء — صورة أو PDF، تُرفع كـ base64 data URL من العميل
  // وتُخزَّن في Supabase Storage (انظر uploadAssetPurchaseInvoice في
  // server/lib/storage.ts)؛ هذا الحقل يحمل الرابط الموقَّع فقط، نفس نمط
  // Expense.invoice_file_url بالضبط.
  purchase_invoice_file_url?: string;
  purchase_invoice_file_name?: string;
  purchase_date: string;
  useful_life_years: number;
  salvage_value: number;
  current_condition: AssetCondition;
  status: AssetStatus;
  location?: string;
  notes?: string;
  // مضبوطة فقط عندما status === 'scrapped' — تاريخ اعتماد الشطب، وتُستخدَم
  // كسقف زمني لحساب الإهلاك بدل التاريخ الحالي (تجميد الإهلاك فور الشطب،
  // انظر computeAssetDepreciation).
  scrapped_at?: string;
  created_at: string;
  updated_at: string;
}

export type AuditPeriodType = 'quarterly' | 'semi_annual' | 'annual';
export const AUDIT_PERIOD_TYPE_LABELS_AR: Record<AuditPeriodType, string> = {
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
};

export type AuditCycleStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';
export const AUDIT_CYCLE_STATUS_LABELS_AR: Record<AuditCycleStatus, string> = {
  draft: 'مسودة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغاة',
};

// جلسة جرد دوري واحدة — تُنشأ بحالة 'draft' فارغة، ثم "بدء الجرد"
// (POST /audit-cycles/:id/start) يولِّد AuditItem واحداً لكل أصل نشط حالياً
// (status === 'active') تلقائياً ويحوّل الحالة إلى 'in_progress'. إكمالها
// (POST /audit-cycles/:id/complete) يحوّلها 'completed' — لا يمنع هذا
// تعديل بنودها لاحقاً من الخادم (نفس نمط كل قيد آخر في هذا التطبيق)، فقط
// إشارة حالة تعرضها الواجهة. إلغاؤها وهي 'in_progress' (POST
// /audit-cycles/:id/cancel) يحوّلها 'cancelled' — بنودها تبقى كما هي
// (سجل تاريخي)، لا تُحذَف ولا يمكن استكمالها بعد الإلغاء.
export interface AuditCycle {
  id: string;
  audit_code: string;
  audit_date: string;
  period_type: AuditPeriodType;
  status: AuditCycleStatus;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

// بند جرد واحد — أصل بعينه ضمن جلسة جرد بعينها. expected_qty يُضبَط دائماً
// على 1 عند التوليد التلقائي (كل Asset سجل تتبّع فردي بكوده الخاص، لا كمية
// إجمالية) — actual_qty/condition_at_audit/notes يملؤها المشرف ميدانياً
// (PATCH /audit-items/:id)، وvariance = actual_qty - expected_qty يُعاد
// احتسابه على الخادم في كل تحديث.
export interface AuditItem {
  id: string;
  audit_id: string;
  asset_id: string;
  asset_name_snapshot?: string;
  asset_code_snapshot?: string;
  expected_qty: number;
  actual_qty?: number;
  variance?: number;
  condition_at_audit?: AssetCondition;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// سجل شطب/إتلاف أصل — يُنشأ عند POST /assets/:id/scrap، الذي أيضاً يضبط
// Asset.status على 'scrapped' وscrapped_at على وقت الشطب في نفس الطلب.
// book_value_at_scrappage القيمة الدفترية المتبقية وقت الشطب بالضبط
// (محسوبة من computeAssetDepreciation قبل ضبط scrapped_at) — تُقيَّد خسارة
// إتلاف أصول ضمن المصاريف التشغيلية للفترة (عرضاً فقط في نظرة عامة الجرد،
// دون إنشاء قيد Expense تلقائي مقابل — انظر ملاحظة عدم الربط أدناه).
export interface AssetScrappageLog {
  id: string;
  asset_id: string;
  asset_name_snapshot?: string;
  audit_id?: string;
  scrapped_date: string;
  book_value_at_scrappage: number;
  reason: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

// نظام إدارة الترجمة — صفحة الإعدادات ← الترجمة (TranslationsTab في
// Settings.tsx). القائمة الكاملة بالكلمات العربية القابلة للترجمة تبقى
// مُشتقّة آلياً من قواميس translations.ts الثابتة (AR_TO_EN بصفتها الأشمل)
// — لا حاجة لتكرارها هنا. هذا الكيان يخزّن فقط التعديلات/الإضافات التي
// يجريها صاحب النظام من الواجهة، وتطغى على القيم الثابتة عند القراءة
// الحية في useI18n() (انظر src/client/lib/i18n.tsx وGET/PATCH
// /translations في api.ts).
export interface TranslationOverride {
  id: string;
  ar: string;
  // كود اللغة (en/bn/ur، ولاحقاً أي كود جديد يُضاف من نفس الصفحة) → النص
  // المترجَم. حقل حر (Record) بدل حقول en?/bn?/ur? صريحة خصيصاً حتى تُضاف
  // لغة جديدة كاملة مستقبلاً من واجهة الإعدادات وحدها، دون أي تعديل على
  // شكل البيانات المخزَّنة نفسه.
  values: Record<string, string>;
  updated_at: string;
}

// لغات إضافية أضافها صاحب النظام من نفس صفحة الترجمة، بعد الأربع الأساسية
// (عربي/إنجليزي/بنغالي/أردو) المدمجة في الكود. إضافة لغة هنا تُظهر عموداً
// جديداً في الجدول للبدء بترجمة الكلمات إليها فوراً — تفعيلها الفعلي في
// مُبدِّل اللغة نفسه (TopBar.tsx/Login.tsx) يبقى خطوة برمجية صغيرة منفصلة.
export interface TranslationLanguage {
  code: string;
  label: string;
}
