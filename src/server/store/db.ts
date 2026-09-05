// ============================================================================
// طبقة تخزين — PostgreSQL دائم (بدل ملف JSON السابق الذي كان يُفقد عند حذف
// الملف أو إعادة تشغيل بيئات بدون قرص دائم مثل Vercel). كامل حالة التطبيق
// تُحفظ كسجل JSONB واحد في جدول app_state، فتبقى كل دوال list/get/insert/
// update/remove في الأسفل تعمل على نفس الكائن db في الذاكرة تماماً كما كانت
// — التغيير الوحيد هو من أين يُحمَّل db وإلى أين يُحفظ (persist).
// ============================================================================
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../lib/password.js';
import { runBackupIfDue } from '../lib/backup.js';
import type {
  Profile,
  Customer,
  Service,
  Contract,
  Expense,
  Appointment,
  Invoice,
  PaymentMethodOption,
  ServiceCategory,
  ExpenseCategoryItem,
  CustodyInvoice,
  EmployeeDeduction,
  EmployeeViolation,
  PermissionKey,
  UserRole,
  LeaveRecord,
  PushSubscriptionRecord,
  Rating,
  CustomerRating,
  ActivityLogEntry,
  Quote,
  Lead,
  WhatsappThread,
  WhatsappMessage,
  LiveChatThread,
  LiveChatMessage,
  RiyadhZone,
  NeighborhoodZoneAssignment,
  WorkersHousingLocation,
  CompanyBankAccount,
  LandingPageSettings,
  LandingService,
  CommissionConfig,
  CommissionTier,
  CommissionEligibility,
} from '../../shared/types.js';
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_LANDING_SETTINGS,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_WORKERS_HOUSING_LOCATION,
  DEFAULT_COMPANY_BANK_ACCOUNT,
} from '../../shared/types.js';
import { normalizeSaudiPhone } from '../../shared/phone.js';

// Server-only: carries the password hash alongside the public Profile
// fields. Never sent to the client as-is — routes must strip password_hash
// before responding (see src/server/routes/api.ts).
export interface StoredProfile extends Profile {
  password_hash?: string;
}

interface DbShape {
  profiles: StoredProfile[];
  customers: Customer[];
  services: Service[];
  contracts: Contract[];
  expenses: Expense[];
  appointments: Appointment[];
  invoices: Invoice[];
  paymentMethods: PaymentMethodOption[];
  serviceCategories: ServiceCategory[];
  expenseCategories: ExpenseCategoryItem[];
  custodyInvoices: CustodyInvoice[];
  // خصميات ومخالفات الموظفين — كشف حساب الموظف (تبويب داخل صفحة
  // المحاسبة). انظر EmployeeDeduction/EmployeeViolation في
  // src/shared/types.ts.
  employeeDeductions: EmployeeDeduction[];
  employeeViolations: EmployeeViolation[];
  // صفحة الإعدادات ← الصلاحيات — من يملك كل صلاحية من PermissionKey.
  // مفتاح غائب من هذا الكائن (سجل قديم لم يُعدَّل بعد، أو صلاحية جديدة
  // أُضيفت للكود لاحقاً) يعني: استخدم DEFAULT_PERMISSIONS لتلك الصلاحية.
  permissions: Partial<Record<PermissionKey, UserRole[]>>;
  // الترتيب المخصَّص لصفوف جدول الصلاحيات (السحب والإفلات) — قائمة
  // مفاتيح فقط، بترتيب العرض. مفاتيح غائبة عنها (صلاحية جديدة أُضيفت
  // للكود بعد آخر تعديل ترتيب) تُذيَّل تلقائياً في نهاية الجدول — انظر
  // orderedPermissionKeys في api.ts.
  permissionsOrder: string[];
  // إجازات سنوية مسجَّلة (مرضية/اضطرارية/غياب/بدون راتب) لمشرف ميداني أو
  // فني — بخلاف weekly_days_off الثابتة، تُستخدم لمنع إسناد موعد فعلياً
  // خلال فترتها (انظر LeaveRecord في src/shared/types.ts).
  leaves: LeaveRecord[];
  // اشتراكات التنبيهات الفورية (Web Push) لكل جهاز فعّله مستخدم من
  // الإعدادات — انظر PushSubscriptionRecord في src/shared/types.ts.
  pushSubscriptions: PushSubscriptionRecord[];
  // تقييمات العملاء بعد اكتمال الخدمة — انظر Rating في src/shared/types.ts.
  ratings: Rating[];
  // تقييم المشرف للعميل بعد اكتمال الطلب (عكس ratings أعلاه) — انظر
  // CustomerRating في src/shared/types.ts.
  customerRatings: CustomerRating[];
  // سجل العمليات — صفحة الإعدادات ← سجل العمليات. مُقيَّد الحجم في
  // insert أدناه حتى لا يتضخّم مستند JSONB الوحيد الذي يخزّن كامل حالة
  // التطبيق إلى ما لا نهاية.
  activityLog: ActivityLogEntry[];
  // عروض الأسعار — انظر Quote في src/shared/types.ts وتبويب "عرض سعر"
  // داخل صفحة العقود.
  quotes: Quote[];
  // طلبات عملاء واردة من صفحة "اطلب الخدمة" العامة — انظر Lead في
  // src/shared/types.ts.
  leads: Lead[];
  // إعدادات نصوص وألوان صفحة "اطلب الخدمة" العامة — سجل واحد فقط، انظر
  // LandingPageSettings في src/shared/types.ts.
  landingSettings: LandingPageSettings;
  // بطاقات الخدمات التسويقية المعروضة في نفس الصفحة — انظر LandingService
  // في src/shared/types.ts.
  landingServices: LandingService[];
  // محادثات واتساب مع الرد الآلي (WhatsApp Cloud API webhook) — انظر
  // WhatsappThread في src/shared/types.ts وsrc/server/lib/whatsappBot.ts.
  whatsappThreads: WhatsappThread[];
  // محادثات دردشة مباشرة (بشرية، بلا ذكاء اصطناعي) من أيقونة صفحة "اطلب
  // الخدمة" العامة — انظر LiveChatThread في src/shared/types.ts.
  liveChatThreads: LiveChatThread[];
  // تقسيم مدينة الرياض إلى مناطق (شمال/جنوب/شرق/غرب/وسط) + ربط الأحياء
  // بها — انظر RiyadhZone/NeighborhoodZoneAssignment في src/shared/types.ts.
  riyadhZones: RiyadhZone[];
  neighborhoodZoneAssignments: NeighborhoodZoneAssignment[];
  // نقطة انطلاق الفريق الميداني (سكن العمال افتراضياً) على نفس الخريطة —
  // انظر WorkersHousingLocation في src/shared/types.ts.
  workersHousingLocation: WorkersHousingLocation;
  // بيانات الحساب البنكي للشركة (سجل واحد) — تُستخدَم لإنشاء صورة مشاركة
  // عند اختيار "حوالة بنكية" كطريقة دفع. انظر CompanyBankAccount في
  // src/shared/types.ts.
  companyBankAccount: CompanyBankAccount;
  // نظام العمولات — سجل إعدادات واحد (singleton) + شرائح تصاعدية + من
  // يستحق فعلياً. انظر src/shared/types.ts.
  commissionConfig: CommissionConfig;
  commissionTiers: CommissionTier[];
  commissionEligibility: CommissionEligibility[];
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL غير مضبوط. أضِف رابط الاتصال بقاعدة بيانات PostgreSQL في ملف .env (انظر .env.example).',
  );
}

// Tuned for serverless (Vercel): each function instance gets its own pool,
// and Vercel can spin up many instances concurrently, so a large per-pool
// `max` here multiplies into far more Postgres connections than Supabase's
// pooler allows — the actual cause of the "500 Internal Server Error" /
// site-down incident on 2026-08-24. A small max keeps each instance's
// footprint tiny; Supabase's own Transaction Pooler already does the real
// multiplexing across instances.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// node-postgres crashes the whole process if an idle pooled client emits an
// 'error' with no listener attached — a real risk in serverless, where a
// frozen/thawed lambda instance can resume with a socket the DB already
// closed. Without this handler, that one stale connection could take down
// every in-flight request on that warm instance (matching the intermittent,
// instance-specific failures seen in the incident above).
pool.on('error', (err) => {
  console.error('❌ خطأ غير متوقع في اتصال قاعدة البيانات (idle client):', err);
});

// The whole app state lives in one JSONB row — same shape as the old JSON
// file, just durable now. A future step could split this into real
// relational tables, but this already fixes the actual problem (data
// disappearing on restarts / missing files / Vercel cold starts) with
// minimal risk to the extensive list/get/insert/update/remove logic below,
// none of which had to change.
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function seed(): DbShape {
  const now = new Date().toISOString();

  const profiles: StoredProfile[] = [
    {
      id: 'u-gm',
      full_name: 'عبدالله السقاف',
      email: 'abadeee9@gmail.com',
      phone: '0550406688',
      role: 'general_manager',
      // Default bootstrap credentials so the very first login is possible
      // (Settings, where these are normally changed, requires being logged
      // in already). Change these from Settings → المستخدمون after first login.
      username: 'abdullah',
      password_hash: hashPassword('Zaha@2026'),
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'u-mohammed',
      full_name: 'محمد المطري',
      email: '',
      phone: '0538553069',
      role: 'supervisor',
      username: 'mohammed',
      password_hash: hashPassword('54321'),
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  ];

  const services: Service[] = [
    {
      id: 'svc-home',
      name: 'تنظيف شقق وفلل شامل',
      category: 'تنظيف منازل',
      description: 'غسيل وتلميع الأرضيات، تنظيف النوافذ، تعقيم المطابخ والحمامات وإزالة الأتربة',
      default_price: 650,
      default_duration_minutes: 240,
      is_active: true,
    },
    {
      id: 'svc-office',
      name: 'تنظيف مكاتب',
      category: 'تنظيف مكاتب',
      description: 'تنظيف يومي أو دوري لصالات ومكاتب العمل وقاعات الاجتماعات',
      default_price: 400,
      default_duration_minutes: 180,
      is_active: true,
    },
    {
      id: 'svc-deep',
      name: 'تنظيف عميق بعد التشطيب',
      category: 'تنظيف بعد التشطيب',
      description: 'إزالة بقايا الدهان والإسمنت وتلميع السيراميك والرخام لكامل العقار',
      default_price: 1200,
      default_duration_minutes: 360,
      is_active: true,
    },
    {
      id: 'svc-postc',
      name: 'غسيل وتعقيم سجاد وموكيت',
      category: 'تنظيف مفروشات',
      description: 'غسيل سجاد بتقنية الرغوة الجافة والتعقيم الفوري ضد البكتيريا والروائح',
      default_price: 200,
      default_duration_minutes: 90,
      is_active: true,
    },
    {
      id: 'svc-pest',
      name: 'مكافحة حشرات',
      category: 'مكافحة حشرات',
      description: 'رش ومكافحة الحشرات الزاحفة والطائرة بمواد آمنة معتمدة',
      default_price: 300,
      default_duration_minutes: 90,
      is_active: true,
    },
    {
      id: 'svc-upholstery',
      name: 'تنظيف كنب ومجالس بالبخار',
      category: 'تنظيف مفروشات',
      description: 'غسيل عميق للكنب والمجالس بأحدث أجهزة البخار مع إزالة البقع الصعبة والتعطير',
      default_price: 300,
      default_duration_minutes: 120,
      is_active: true,
    },
    {
      id: 'svc-plumbing',
      name: 'صيانة سباكة وكشف تسريبات',
      category: 'سباكة',
      description: 'فحص شبكة المياه، صيانة الخلاطات، ومعالجة التسريبات وانسداد المجاري',
      default_price: 250,
      default_duration_minutes: 90,
      is_active: true,
    },
    {
      id: 'svc-ac',
      name: 'صيانة وتنظيف مكيفات سبليت',
      category: 'صيانة تكييف',
      description: 'تنظيف الوحدة الداخلية والخارجية، فحص الفريون وتنظيف الفلاتر وتطهير مجرى الصرف',
      default_price: 150,
      default_duration_minutes: 60,
      is_active: true,
    },
    {
      id: 'svc-electric',
      name: 'صيانة كهرباء وتأسيس إضاءة',
      category: 'كهرباء',
      description: 'صيانة الأعطال الكهربائية وتمديد نقاط الإضاءة ومتابعة الأحمال والفلطية',
      default_price: 350,
      default_duration_minutes: 120,
      is_active: true,
    },
  ];

  const customers: Customer[] = [
    { id: 'c-1', name: 'عبدالعزيز الغامدي', phone: '0501234567', address: 'حي النرجس، الرياض', district: 'النرجس', city: 'الرياض', created_at: now },
    { id: 'c-2', name: 'شركة النخبة العقارية', phone: '0559876543', address: 'طريق الملك فهد، جدة', district: 'الروضة', city: 'جدة', created_at: now },
    { id: 'c-3', name: 'مطاعم الواحة', phone: '0545551212', address: 'حي العليا، الرياض', district: 'العليا', city: 'الرياض', created_at: now },
  ];

  const contracts: Contract[] = [
    {
      id: 'ct-1',
      contract_number: 'CT-2026-001',
      customer_id: 'c-2',
      service_id: 'svc-office',
      service_name_snapshot: 'تنظيف مكاتب',
      contract_type: 'monthly',
      visit_frequency: 'weekly',
      visit_days_of_week: ['sunday'],
      visit_time: '09:00',
      start_date: '2026-08-01',
      end_date: '2026-10-31',
      total_visits: 12,
      completed_visits: 3,
      total_amount: 4800,
      paid_amount: 1600,
      remaining_amount: 3200,
      payment_status: 'partial',
      assigned_technician_ids: [],
      status: 'active',
      created_at: now,
      updated_at: now,
    },
  ];

  const appointments: Appointment[] = [
    {
      id: 'ap-1',
      customer_id: 'c-1',
      customer_name_snapshot: 'عبدالعزيز الغامدي',
      service_id: 'svc-home',
      service_name_snapshot: 'تنظيف منازل',
      scheduled_at: new Date().toISOString(),
      expected_duration_minutes: 120,
      amount: 250,
      status: 'scheduled',
      address_snapshot: 'حي النرجس، الرياض',
      contract_id: undefined,
      total_paid: 0,
      remaining_amount: 250,
      payment_status: 'unpaid',
      assignments: [],
      photos: [],
      payments: [],
      created_at: now,
    },
  ];

  const invoices: Invoice[] = [];

  const paymentMethods: PaymentMethodOption[] = [
    { id: 'cash', name: 'نقدي', is_active: true },
    { id: 'card', name: 'شبكة', is_active: true },
    { id: 'bank_transfer', name: 'حوالة بنكية', is_active: true },
  ];

  const serviceCategories: ServiceCategory[] = Array.from(new Set(services.map((s) => s.category).filter(Boolean))).map(
    (name) => ({ id: seedCategoryId(name as string), name: name as string }),
  );

  const expenseCategories: ExpenseCategoryItem[] = [
    { id: 'ec-vehicles', name: 'مركبات', is_active: true },
    { id: 'ec-salaries', name: 'رواتب', is_active: true },
    { id: 'ec-custody', name: 'مصاريف عهدة', is_active: true },
    { id: 'ec-advance', name: 'سلفية', is_active: true },
    { id: 'ec-materials', name: 'مواد التشغيل والنظافة', is_active: true },
    { id: 'ec-iqama', name: 'إقامات', is_active: true },
    { id: 'ec-rent', name: 'إيجار', is_active: true },
    { id: 'ec-electricity', name: 'كهرباء', is_active: true },
    { id: 'ec-gas', name: 'غاز', is_active: true },
    { id: 'ec-misc', name: 'مشتريات متفرقة', is_active: true },
    { id: 'ec-setup', name: 'تأسيس', is_active: true },
    { id: 'ec-veh-installment', name: 'قسط', parent_id: 'ec-vehicles', is_active: true },
    { id: 'ec-veh-fuel', name: 'بنزين', parent_id: 'ec-vehicles', is_active: true },
    { id: 'ec-veh-diesel', name: 'ديزل', parent_id: 'ec-vehicles', is_active: true },
    { id: 'ec-veh-oil', name: 'زيت', parent_id: 'ec-vehicles', is_active: true },
    { id: 'ec-veh-tires', name: 'كفرات', parent_id: 'ec-vehicles', is_active: true },
    { id: 'ec-veh-maintenance', name: 'صيانة', parent_id: 'ec-vehicles', is_active: true },
    { id: 'ec-veh-other', name: 'أخرى', parent_id: 'ec-vehicles', is_active: true },
  ];

  return {
    profiles,
    customers,
    services,
    contracts,
    expenses: [],
    appointments,
    invoices,
    paymentMethods,
    serviceCategories,
    expenseCategories,
    custodyInvoices: [],
    employeeDeductions: [],
    employeeViolations: [],
    permissions: {},
    permissionsOrder: [],
    leaves: [],
    pushSubscriptions: [],
    ratings: [],
    customerRatings: [],
    activityLog: [],
    quotes: [],
    leads: [],
    landingSettings: DEFAULT_LANDING_SETTINGS,
    // نقطة بداية معقولة: نفس الخدمات النشطة من دليل الخدمات التشغيلي
    // أعلاه، بلا صور بعد (يُضاف لها لاحقاً من الإعدادات ← الطلبات
    // الخارجية) — أفضل من صفحة فارغة عند أول تشغيل.
    landingServices: services
      .filter((s) => s.is_active)
      .map((s) => ({
        id: `landing-${s.id}`,
        title: s.name,
        description: s.description,
        is_active: true,
        created_at: new Date().toISOString(),
      })),
    whatsappThreads: [],
    liveChatThreads: [],
    riyadhZones: defaultRiyadhZones(now),
    neighborhoodZoneAssignments: defaultNeighborhoodAssignments(),
    workersHousingLocation: { ...DEFAULT_WORKERS_HOUSING_LOCATION, updated_at: now },
    companyBankAccount: { ...DEFAULT_COMPANY_BANK_ACCOUNT, updated_at: now },
    commissionConfig: { ...DEFAULT_COMMISSION_CONFIG, updated_at: new Date().toISOString() },
    // نقطة بداية مقترحة (نسب تصاعدية معقولة، معدَّلة بالكامل لاحقاً من
    // الإعدادات ← العمولات): 20-25 ألف 5%/2%، 25-30 ألف 7%/3%، فوق 30
    // ألف 10%/4% (مسوّق/مشرف على التوالي).
    commissionTiers: [
      { id: 'ct-1', from: 20000, to: 25000, marketer_rate: 0.05, supervisor_rate: 0.02 },
      { id: 'ct-2', from: 25000, to: 30000, marketer_rate: 0.07, supervisor_rate: 0.03 },
      { id: 'ct-3', from: 30000, to: null, marketer_rate: 0.1, supervisor_rate: 0.04 },
    ],
    commissionEligibility: [],
  };
}

// A stable, deterministic id for seed categories (so the same seed data
// produces the same ids across reseeds — real inserts use randomUUID via
// store.id() instead).
function seedCategoryId(name: string): string {
  return `cat-${name.replace(/\s+/g, '-')}`;
}

// نقطة بداية معقولة لتقسيم الرياض إلى 5 مناطق (مستطيلات تقريبية حول وسط
// المدينة تغطي أغلب أحياء الرياض المعروفة، بلا تداخل بينها) — يُعدِّل
// المدير العام حدود كل منطقة لاحقاً بالسحب من الإعدادات ← مناطق الرياض،
// هذه فقط قيمة ابتدائية غير نهائية إطلاقاً.
function defaultRiyadhZones(now: string): RiyadhZone[] {
  const zone = (id: string, name: string, color: string, boundary: [number, number][], preferred_weekdays: string[]): RiyadhZone => ({
    id,
    name,
    color,
    boundary,
    preferred_weekdays,
    created_at: now,
    updated_at: now,
  });
  return [
    zone('zone-north', 'شمال الرياض', '#3B82F6', [[24.85, 46.35], [24.85, 47.05], [25.05, 47.05], [25.05, 46.35]], ['sunday']),
    zone('zone-south', 'جنوب الرياض', '#F59E0B', [[24.45, 46.35], [24.45, 47.05], [24.65, 47.05], [24.65, 46.35]], ['monday']),
    zone('zone-east', 'شرق الرياض', '#10B981', [[24.65, 46.80], [24.65, 47.05], [24.85, 47.05], [24.85, 46.80]], ['tuesday']),
    zone('zone-west', 'غرب الرياض', '#EF4444', [[24.65, 46.35], [24.65, 46.60], [24.85, 46.60], [24.85, 46.35]], ['wednesday']),
    zone('zone-center', 'وسط الرياض', '#8B5CF6', [[24.65, 46.60], [24.65, 46.80], [24.85, 46.80], [24.85, 46.60]], ['thursday']),
  ];
}

// ربط تقريبي لأحياء رياض معروفة بمناطقها — نقطة بداية للمراجعة والتصحيح
// من جدول الأحياء في الإعدادات ← مناطق الرياض، وليس مرجعاً جغرافياً
// دقيقاً. أي حي مطلوب غير موجود هنا يُضاف يدوياً بسهولة من نفس الجدول.
function defaultNeighborhoodAssignments(): NeighborhoodZoneAssignment[] {
  const rows: [string, string][] = [
    ['الملقا', 'zone-north'],
    ['الصحافة', 'zone-north'],
    ['النرجس', 'zone-north'],
    ['حطين', 'zone-north'],
    ['الياسمين', 'zone-north'],
    ['العارض', 'zone-north'],
    ['الوادي', 'zone-north'],
    ['العقيق', 'zone-north'],
    ['النخيل', 'zone-north'],
    ['الغدير', 'zone-north'],
    ['الشفا', 'zone-south'],
    ['العزيزية', 'zone-south'],
    ['منفوحة', 'zone-south'],
    ['السلي', 'zone-south'],
    ['الفيصلية', 'zone-south'],
    ['العريجاء', 'zone-south'],
    ['السويدي', 'zone-south'],
    ['الشميسي', 'zone-south'],
    ['النسيم', 'zone-east'],
    ['الرمال', 'zone-east'],
    ['الروضة', 'zone-east'],
    ['قرطبة', 'zone-east'],
    ['الريان', 'zone-east'],
    ['الجنادرية', 'zone-east'],
    ['المونسية', 'zone-east'],
    ['الخليج', 'zone-east'],
    ['عرقة', 'zone-west'],
    ['ظهرة لبن', 'zone-west'],
    ['الدار البيضاء', 'zone-west'],
    ['نمار', 'zone-west'],
    ['شبرا', 'zone-west'],
    ['الملز', 'zone-center'],
    ['المربع', 'zone-center'],
    ['الديرة', 'zone-center'],
    ['العليا', 'zone-center'],
    ['السليمانية', 'zone-center'],
    ['المعذر', 'zone-center'],
  ];
  return rows.map(([neighborhood, zone_id], i) => ({ id: `nz-${i + 1}`, neighborhood, zone_id }));
}

async function load(): Promise<DbShape> {
  await ensureSchema();
  const { rows } = await pool.query<{ data: DbShape }>('SELECT data FROM app_state WHERE id = $1', ['main']);
  if (rows.length > 0) {
    const parsed = rows[0].data;
    // Migrate rows saved before payment methods / service categories /
    // expense categories / custody invoices existed.
    if (!parsed.paymentMethods) parsed.paymentMethods = seed().paymentMethods;
    if (!parsed.serviceCategories) {
      parsed.serviceCategories = Array.from(new Set(parsed.services.map((s) => s.category).filter(Boolean))).map(
        (name) => ({ id: seedCategoryId(name as string), name: name as string }),
      );
    }
    if (!parsed.expenseCategories) parsed.expenseCategories = seed().expenseCategories;
    // فئة "سلفية" أُضيفت بعد أن كانت قواعد بيانات كثيرة قد زُرعت أصلاً —
    // تُضاف هنا لمن لا يملكها بعد، بدل الاعتماد فقط على seed() أعلاه.
    if (!parsed.expenseCategories.some((c) => !c.parent_id && c.name === 'سلفية')) {
      parsed.expenseCategories.push({ id: 'ec-advance', name: 'سلفية', is_active: true });
    }
    // فئة "تأسيس" أُضيفت بعد أن كانت قواعد بيانات كثيرة قد زُرعت أصلاً —
    // تُضاف هنا لمن لا يملكها بعد، بدل الاعتماد فقط على seed() أعلاه.
    if (!parsed.expenseCategories.some((c) => !c.parent_id && c.name === 'تأسيس')) {
      parsed.expenseCategories.push({ id: 'ec-setup', name: 'تأسيس', is_active: true });
    }
    if (!parsed.custodyInvoices) parsed.custodyInvoices = [];
    if (!parsed.employeeDeductions) parsed.employeeDeductions = [];
    if (!parsed.employeeViolations) parsed.employeeViolations = [];
    if (!parsed.permissions) parsed.permissions = {};
    if (!parsed.permissionsOrder) parsed.permissionsOrder = [];
    if (!parsed.leaves) parsed.leaves = [];
    if (!parsed.pushSubscriptions) parsed.pushSubscriptions = [];
    if (!parsed.ratings) parsed.ratings = [];
    if (!parsed.customerRatings) parsed.customerRatings = [];
    if (!parsed.activityLog) parsed.activityLog = [];
    if (!parsed.quotes) parsed.quotes = [];
    if (!parsed.leads) parsed.leads = [];
    if (!parsed.landingSettings) parsed.landingSettings = DEFAULT_LANDING_SETTINGS;
    if (!parsed.landingServices) {
      parsed.landingServices = parsed.services
        .filter((s) => s.is_active)
        .map((s) => ({
          id: `landing-${s.id}`,
          title: s.name,
          description: s.description,
          is_active: true,
          created_at: new Date().toISOString(),
        }));
    }
    if (!parsed.whatsappThreads) parsed.whatsappThreads = [];
    if (!parsed.liveChatThreads) parsed.liveChatThreads = [];
    if (!parsed.riyadhZones) parsed.riyadhZones = defaultRiyadhZones(new Date().toISOString());
    if (!parsed.neighborhoodZoneAssignments) parsed.neighborhoodZoneAssignments = defaultNeighborhoodAssignments();
    if (!parsed.workersHousingLocation) parsed.workersHousingLocation = { ...DEFAULT_WORKERS_HOUSING_LOCATION, updated_at: new Date().toISOString() };
    if (!parsed.companyBankAccount) parsed.companyBankAccount = { ...DEFAULT_COMPANY_BANK_ACCOUNT, updated_at: new Date().toISOString() };
    if (!parsed.commissionConfig) parsed.commissionConfig = { ...DEFAULT_COMMISSION_CONFIG, updated_at: new Date().toISOString() };
    if (!parsed.commissionTiers) parsed.commissionTiers = seed().commissionTiers;
    if (!parsed.commissionEligibility) parsed.commissionEligibility = [];
    // ترقية سجلات leads القديمة (قبل توسيع الحالات) — "contacted"/"closed"
    // لم تعودا موجودتين في LeadStatus، تُطابَقان لأقرب حالة جديدة مكافئة.
    // (لا حاجة لحفظ فوري هنا — تُكتَب تلقائياً مع أول persist() تالٍ لأي
    // عملية أخرى، كبقية عمليات الترقية أعلاه.)
    parsed.leads = parsed.leads.map((l) => {
      const legacy = l.status as string;
      if (legacy === 'contacted') return { ...l, status: 'replied' as const };
      if (legacy === 'closed') return { ...l, status: 'appointment_booked' as const };
      return l;
    });
    // رمز الدولة 966 لم يعد مطلوباً (كل العملاء داخل المملكة حالياً) —
    // تطبيع أي رقم قديم بصيغة دولية إلى الصيغة المحلية (0...) وحفظه فوراً
    // حتى لا يتكرر التحويل (والكتابة) في كل تحميل تالٍ بلا داعٍ.
    let phonesChanged = false;
    parsed.customers = parsed.customers.map((c) => {
      if (!c.phone) return c;
      const normalized = normalizeSaudiPhone(c.phone);
      if (normalized === c.phone) return c;
      phonesChanged = true;
      return { ...c, phone: normalized };
    });
    parsed.profiles = parsed.profiles.map((p) => {
      if (!p.phone) return p;
      const normalized = normalizeSaudiPhone(p.phone);
      if (normalized === p.phone) return p;
      phonesChanged = true;
      return { ...p, phone: normalized };
    });
    if (phonesChanged) await save(parsed);
    return parsed;
  }
  const initial = seed();
  await save(initial);
  return initial;
}

async function save(data: DbShape) {
  await pool.query(
    `INSERT INTO app_state (id, data, updated_at) VALUES ('main', $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(data)],
  );
}

// Populated by initStore() before the HTTP server starts accepting
// requests (see src/server/index.ts) — the definite-assignment assertion
// is safe under that guarantee, and keeps every store.* method below
// exactly as it was (plain sync access to `db`, no null-checks needed).
let db!: DbShape;

// Call once at startup, before httpServer.listen(). Everything below this
// point in the module (the `store` export) is defined synchronously as
// before — its methods just close over `db`, which becomes valid the
// moment this resolves.
export async function initStore(): Promise<void> {
  db = await load();
}

// Fire-and-forget from every call site: the in-memory `db` mutation already
// happened synchronously before persist() is called, so every store method
// still returns the correct value immediately without needing to become
// async (which would ripple into an `await` at every call site in api.ts).
//
// The writes themselves are chained onto persistTail instead of fired
// independently — a single request handler often mutates `db` and calls
// persist() more than once (e.g. update a record, then logActivity() adds
// a second write). Each save(db) reads the fully current `db` at the moment
// it actually runs, so two independent in-flight network writes could
// finish out of order and the *earlier* (now-stale) one would silently
// overwrite the later, more complete one — this bit real users: an
// activity-log entry from the second write kept vanishing because the
// first write (the primary record) reliably completed after it. Chaining
// guarantees writes commit to Postgres in the same order they were queued.
let persistTail: Promise<void> = Promise.resolve();
function persist() {
  persistTail = persistTail.then(() => save(db)).catch((err) => {
    console.error('❌ فشل حفظ البيانات في قاعدة البيانات:', err);
  });
  runBackupIfDue(db);
}

// على استضافة بلا خادم (Vercel) يُجمَّد تنفيذ الدالة بعد إرسال الاستجابة
// مباشرة — لا يكفي مجرد ترتيب الكتابات (أعلاه)، فقد يُجمَّد التنفيذ قبل
// أن تُكمل أي منها أصلاً. middleware في api.ts يستدعي هذه الدالة لتأخير
// إرسال الاستجابة الفعلية حتى تكتمل كل كتابات persist() التي أطلقها هذا
// الطلب — بلا حاجة لتحويل كل مسار وكل استدعاء store.* إلى async/await.
export function pendingWrites(): Promise<void> {
  return persistTail;
}

export const store = {
  id: () => randomUUID(),

  profiles: {
    list: () => db.profiles,
    get: (id: string) => db.profiles.find((p) => p.id === id),
    insert: (p: StoredProfile) => { db.profiles.push(p); persist(); return p; },
    update: (id: string, patch: Partial<StoredProfile>) => {
      const idx = db.profiles.findIndex((p) => p.id === id);
      if (idx === -1) return undefined;
      db.profiles[idx] = { ...db.profiles[idx], ...patch, updated_at: new Date().toISOString() };
      persist();
      return db.profiles[idx];
    },
    remove: (id: string) => {
      const idx = db.profiles.findIndex((p) => p.id === id);
      if (idx === -1) return false;
      db.profiles.splice(idx, 1);
      persist();
      return true;
    },
  },
  customers: {
    list: () => db.customers,
    get: (id: string) => db.customers.find((c) => c.id === id),
    insert: (c: Customer) => { db.customers.push(c); persist(); return c; },
    update: (id: string, patch: Partial<Customer>) => {
      const idx = db.customers.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      db.customers[idx] = { ...db.customers[idx], ...patch };
      persist();
      return db.customers[idx];
    },
    remove: (id: string) => {
      const idx = db.customers.findIndex((c) => c.id === id);
      if (idx === -1) return false;
      db.customers.splice(idx, 1);
      persist();
      return true;
    },
  },
  services: {
    list: () => db.services,
    get: (id: string) => db.services.find((s) => s.id === id),
    insert: (s: Service) => { db.services.push(s); persist(); return s; },
    update: (id: string, patch: Partial<Service>) => {
      const idx = db.services.findIndex((s) => s.id === id);
      if (idx === -1) return undefined;
      db.services[idx] = { ...db.services[idx], ...patch };
      persist();
      return db.services[idx];
    },
    remove: (id: string) => {
      const idx = db.services.findIndex((s) => s.id === id);
      if (idx === -1) return false;
      db.services.splice(idx, 1);
      persist();
      return true;
    },
  },
  // Categories are just a managed vocabulary of names — Service.category
  // stores the name itself (not this id), so renaming/removing a category
  // here cascades by rewriting that string across every service that used
  // the old name.
  serviceCategories: {
    list: () => db.serviceCategories,
    insert: (c: ServiceCategory) => { db.serviceCategories.push(c); persist(); return c; },
    update: (id: string, patch: Partial<ServiceCategory>) => {
      const idx = db.serviceCategories.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      const oldName = db.serviceCategories[idx].name;
      db.serviceCategories[idx] = { ...db.serviceCategories[idx], ...patch };
      const newName = db.serviceCategories[idx].name;
      if (newName !== oldName) {
        for (const s of db.services) if (s.category === oldName) s.category = newName;
      }
      persist();
      return db.serviceCategories[idx];
    },
    remove: (id: string) => {
      const idx = db.serviceCategories.findIndex((c) => c.id === id);
      if (idx === -1) return false;
      const name = db.serviceCategories[idx].name;
      db.serviceCategories.splice(idx, 1);
      for (const s of db.services) if (s.category === name) s.category = undefined;
      persist();
      return true;
    },
  },
  expenseCategories: {
    list: () => db.expenseCategories,
    insert: (c: ExpenseCategoryItem) => { db.expenseCategories.push(c); persist(); return c; },
    update: (id: string, patch: Partial<ExpenseCategoryItem>) => {
      const idx = db.expenseCategories.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      const item = db.expenseCategories[idx];
      const oldName = item.name;
      db.expenseCategories[idx] = { ...item, ...patch };
      const newName = db.expenseCategories[idx].name;
      if (newName !== oldName) {
        // A top-level group's rename cascades into Expense.category; a
        // sub-item's rename cascades into Expense.sub_category instead.
        if (!item.parent_id) {
          for (const e of db.expenses) if (e.category === oldName) e.category = newName;
        } else {
          for (const e of db.expenses) if (e.sub_category === oldName) e.sub_category = newName;
        }
      }
      persist();
      return db.expenseCategories[idx];
    },
    remove: (id: string) => {
      const idx = db.expenseCategories.findIndex((c) => c.id === id);
      if (idx === -1) return false;
      const item = db.expenseCategories[idx];
      const isMain = !item.parent_id;
      // Deleting a main group cascades to remove its sub-items too, and
      // clears the reference off any expense that used the deleted name(s).
      db.expenseCategories = db.expenseCategories.filter((c) => c.id !== id && c.parent_id !== id);
      for (const e of db.expenses) {
        if (isMain && e.category === item.name) {
          e.category = '';
          e.sub_category = undefined;
        } else if (!isMain && e.sub_category === item.name) {
          e.sub_category = undefined;
        }
      }
      persist();
      return true;
    },
  },
  contracts: {
    list: () => db.contracts,
    get: (id: string) => db.contracts.find((c) => c.id === id),
    insert: (c: Contract) => { db.contracts.push(c); persist(); return c; },
    update: (id: string, patch: Partial<Contract>) => {
      const idx = db.contracts.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      db.contracts[idx] = { ...db.contracts[idx], ...patch, updated_at: new Date().toISOString() };
      persist();
      return db.contracts[idx];
    },
    remove: (id: string) => {
      const idx = db.contracts.findIndex((c) => c.id === id);
      if (idx === -1) return false;
      db.contracts.splice(idx, 1);
      persist();
      return true;
    },
  },
  expenses: {
    list: () => db.expenses,
    get: (id: string) => db.expenses.find((e) => e.id === id),
    insert: (e: Expense) => { db.expenses.push(e); persist(); return e; },
    update: (id: string, patch: Partial<Expense>) => {
      const idx = db.expenses.findIndex((e) => e.id === id);
      if (idx === -1) return undefined;
      db.expenses[idx] = { ...db.expenses[idx], ...patch };
      persist();
      return db.expenses[idx];
    },
    remove: (id: string) => {
      const idx = db.expenses.findIndex((e) => e.id === id);
      if (idx === -1) return false;
      db.expenses.splice(idx, 1);
      persist();
      return true;
    },
  },
  // صلاحية واحدة = مفتاح ← مصفوفة أدوار مسموح لها بها. تُدمَج مع
  // DEFAULT_PERMISSIONS عند القراءة (انظر GET /permissions في api.ts) بحيث
  // أي صلاحية لم تُعدَّل يدوياً بعد تُقرأ بقيمتها الافتراضية تلقائياً.
  permissions: {
    list: () => db.permissions,
    update: (key: PermissionKey, roles: UserRole[]) => {
      db.permissions = { ...db.permissions, [key]: roles };
      persist();
      return db.permissions;
    },
  },
  // ترتيب صفوف جدول الصلاحيات (سحب وإفلات) — قائمة مفاتيح كاملة تُستبدَل
  // دفعة واحدة في كل مرة (وليس عنصراً عنصراً)، لأن كل عملية سحب تنتج
  // ترتيباً جديداً كاملاً من جهة العميل.
  permissionsOrder: {
    list: () => db.permissionsOrder,
    update: (order: string[]) => {
      db.permissionsOrder = order;
      persist();
      return db.permissionsOrder;
    },
  },
  leaves: {
    list: () => db.leaves,
    insert: (l: LeaveRecord) => { db.leaves.push(l); persist(); return l; },
    remove: (id: string) => {
      const idx = db.leaves.findIndex((l) => l.id === id);
      if (idx === -1) return false;
      db.leaves.splice(idx, 1);
      persist();
      return true;
    },
  },
  activityLog: {
    // الأحدث أولاً — أكثر ما يهم قارئ سجل العمليات هو آخر ما حدث.
    list: () => [...db.activityLog].reverse(),
    insert: (e: ActivityLogEntry) => {
      db.activityLog.push(e);
      // يمنع تضخّم مستند JSONB الوحيد الذي يخزّن كامل حالة التطبيق إلى ما
      // لا نهاية — يحتفظ بآخر 2000 عملية فقط (كافية عملياً لأشهر من
      // الاستخدام اليومي لعمل بهذا الحجم).
      if (db.activityLog.length > 2000) db.activityLog.splice(0, db.activityLog.length - 2000);
      persist();
      return e;
    },
    // حذف جماعي (تحديد سطر أو الكل من ActivityLogTab) — يرجع عدد
    // السطور المحذوفة فعلياً (معرّفات غير موجودة تُتجاهل بصمت).
    removeMany: (ids: string[]) => {
      const idSet = new Set(ids);
      const before = db.activityLog.length;
      db.activityLog = db.activityLog.filter((e) => !idSet.has(e.id));
      const removed = before - db.activityLog.length;
      if (removed > 0) persist();
      return removed;
    },
  },
  quotes: {
    list: () => [...db.quotes].reverse(),
    get: (id: string) => db.quotes.find((q) => q.id === id),
    insert: (q: Quote) => { db.quotes.push(q); persist(); return q; },
    remove: (id: string) => {
      const idx = db.quotes.findIndex((q) => q.id === id);
      if (idx === -1) return false;
      db.quotes.splice(idx, 1);
      persist();
      return true;
    },
  },
  leads: {
    // الأحدث أولاً — أكثر ما يهم فريق المتابعة هو آخر طلب وارد.
    list: () => [...db.leads].reverse(),
    get: (id: string) => db.leads.find((l) => l.id === id),
    insert: (l: Lead) => { db.leads.push(l); persist(); return l; },
    update: (id: string, patch: Partial<Lead>) => {
      const idx = db.leads.findIndex((l) => l.id === id);
      if (idx === -1) return undefined;
      db.leads[idx] = { ...db.leads[idx], ...patch };
      persist();
      return db.leads[idx];
    },
    remove: (id: string) => {
      const idx = db.leads.findIndex((l) => l.id === id);
      if (idx === -1) return false;
      db.leads.splice(idx, 1);
      persist();
      return true;
    },
  },
  whatsappThreads: {
    // الأحدث أولاً — نفس ترتيب leads أعلاه.
    list: () => [...db.whatsappThreads].reverse(),
    get: (id: string) => db.whatsappThreads.find((t) => t.id === id),
    getByPhone: (phone: string) => db.whatsappThreads.find((t) => t.phone === phone),
    insert: (t: WhatsappThread) => { db.whatsappThreads.push(t); persist(); return t; },
    update: (id: string, patch: Partial<WhatsappThread>) => {
      const idx = db.whatsappThreads.findIndex((t) => t.id === id);
      if (idx === -1) return undefined;
      db.whatsappThreads[idx] = { ...db.whatsappThreads[idx], ...patch, updated_at: new Date().toISOString() };
      persist();
      return db.whatsappThreads[idx];
    },
    // يُلحق رسالة واحدة (واردة أو صادرة) بمحادثة موجودة — أشيع بكثير من
    // استبدال المصفوفة كاملة عبر update() عند كل رسالة واتساب جديدة.
    appendMessage: (id: string, message: WhatsappMessage) => {
      const thread = db.whatsappThreads.find((t) => t.id === id);
      if (!thread) return undefined;
      thread.messages.push(message);
      thread.updated_at = new Date().toISOString();
      persist();
      return thread;
    },
    remove: (id: string) => {
      const idx = db.whatsappThreads.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      db.whatsappThreads.splice(idx, 1);
      persist();
      return true;
    },
  },
  liveChatThreads: {
    // الأحدث تحديثاً أولاً — الأنسب للوحة "دردشة مباشرة" الإدارية (محادثة
    // فيها رد جديد تصعد للأعلى)، بخلاف whatsappThreads التي تُرتَّب بترتيب
    // الإدراج فقط.
    list: () => [...db.liveChatThreads].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    get: (id: string) => db.liveChatThreads.find((t) => t.id === id),
    insert: (t: LiveChatThread) => { db.liveChatThreads.push(t); persist(); return t; },
    update: (id: string, patch: Partial<LiveChatThread>) => {
      const idx = db.liveChatThreads.findIndex((t) => t.id === id);
      if (idx === -1) return undefined;
      db.liveChatThreads[idx] = { ...db.liveChatThreads[idx], ...patch, updated_at: new Date().toISOString() };
      persist();
      return db.liveChatThreads[idx];
    },
    appendMessage: (id: string, message: LiveChatMessage, opts?: { unread?: boolean }) => {
      const thread = db.liveChatThreads.find((t) => t.id === id);
      if (!thread) return undefined;
      thread.messages.push(message);
      thread.updated_at = new Date().toISOString();
      if (opts?.unread !== undefined) thread.unread = opts.unread;
      persist();
      return thread;
    },
    remove: (id: string) => {
      const idx = db.liveChatThreads.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      db.liveChatThreads.splice(idx, 1);
      persist();
      return true;
    },
  },
  riyadhZones: {
    list: () => db.riyadhZones,
    get: (id: string) => db.riyadhZones.find((z) => z.id === id),
    insert: (z: RiyadhZone) => { db.riyadhZones.push(z); persist(); return z; },
    update: (id: string, patch: Partial<RiyadhZone>) => {
      const idx = db.riyadhZones.findIndex((z) => z.id === id);
      if (idx === -1) return undefined;
      db.riyadhZones[idx] = { ...db.riyadhZones[idx], ...patch, updated_at: new Date().toISOString() };
      persist();
      return db.riyadhZones[idx];
    },
    remove: (id: string) => {
      const idx = db.riyadhZones.findIndex((z) => z.id === id);
      if (idx === -1) return false;
      db.riyadhZones.splice(idx, 1);
      // حذف منطقة يترك أي حي كان مربوطاً بها بلا منطقة (بلا اقتراح يوم عند
      // الحجز) بدل الإشارة لمنطقة لم تعد موجودة — يُصحَّح لاحقاً بإعادة
      // ربطه من جدول الأحياء إن رغب المدير.
      db.neighborhoodZoneAssignments = db.neighborhoodZoneAssignments.filter((n) => n.zone_id !== id);
      persist();
      return true;
    },
  },
  neighborhoodZoneAssignments: {
    list: () => db.neighborhoodZoneAssignments,
    insert: (n: NeighborhoodZoneAssignment) => { db.neighborhoodZoneAssignments.push(n); persist(); return n; },
    update: (id: string, patch: Partial<NeighborhoodZoneAssignment>) => {
      const idx = db.neighborhoodZoneAssignments.findIndex((n) => n.id === id);
      if (idx === -1) return undefined;
      db.neighborhoodZoneAssignments[idx] = { ...db.neighborhoodZoneAssignments[idx], ...patch };
      persist();
      return db.neighborhoodZoneAssignments[idx];
    },
    remove: (id: string) => {
      const idx = db.neighborhoodZoneAssignments.findIndex((n) => n.id === id);
      if (idx === -1) return false;
      db.neighborhoodZoneAssignments.splice(idx, 1);
      persist();
      return true;
    },
  },
  workersHousingLocation: {
    get: () => db.workersHousingLocation,
    set: (next: Partial<WorkersHousingLocation>) => {
      db.workersHousingLocation = { ...db.workersHousingLocation, ...next, updated_at: new Date().toISOString() };
      persist();
      return db.workersHousingLocation;
    },
  },
  companyBankAccount: {
    get: () => db.companyBankAccount,
    set: (next: Partial<CompanyBankAccount>) => {
      db.companyBankAccount = { ...db.companyBankAccount, ...next, updated_at: new Date().toISOString() };
      persist();
      return db.companyBankAccount;
    },
  },
  landingSettings: {
    get: () => db.landingSettings,
    set: (next: LandingPageSettings) => { db.landingSettings = next; persist(); return next; },
  },
  landingServices: {
    // ترتيب العرض الفعلي في الصفحة العامة — نفس ترتيب المصفوفة المخزَّنة
    // (وليس الأحدث أولاً)، قابل لإعادة الترتيب عبر reorder أدناه.
    list: () => db.landingServices,
    get: (id: string) => db.landingServices.find((s) => s.id === id),
    insert: (s: LandingService) => { db.landingServices.push(s); persist(); return s; },
    update: (id: string, patch: Partial<LandingService>) => {
      const idx = db.landingServices.findIndex((s) => s.id === id);
      if (idx === -1) return undefined;
      db.landingServices[idx] = { ...db.landingServices[idx], ...patch };
      persist();
      return db.landingServices[idx];
    },
    remove: (id: string) => {
      const idx = db.landingServices.findIndex((s) => s.id === id);
      if (idx === -1) return false;
      db.landingServices.splice(idx, 1);
      persist();
      return true;
    },
    // إعادة ترتيب من صفحة الإعدادات (أزرار تحريك لأعلى/لأسفل) — order هي
    // كامل قائمة المعرّفات بالترتيب الجديد. أي معرّف غائب عنها (حالة سباق
    // نادرة: أُضيف عنصر جديد أثناء إعادة الترتيب) يُذيَّل تلقائياً بدل أن يُفقَد.
    reorder: (order: string[]) => {
      const byId = new Map(db.landingServices.map((s) => [s.id, s]));
      const next = order.map((id) => byId.get(id)).filter((s): s is LandingService => !!s);
      for (const s of db.landingServices) if (!order.includes(s.id)) next.push(s);
      db.landingServices = next;
      persist();
      return next;
    },
  },
  customerRatings: {
    list: () => db.customerRatings,
    getByAppointment: (appointmentId: string) => db.customerRatings.find((r) => r.appointment_id === appointmentId),
    // موعد واحد = تقييم عميل واحد فقط — يستبدل السجل القائم عند إعادة
    // التقييم بدل منعه (خلافاً لـ ratings.insert أعلاه)، لأن هذا تقييم
    // داخلي من الموظف نفسه ومن الطبيعي أن يُعدِّله.
    upsert: (r: CustomerRating) => {
      const idx = db.customerRatings.findIndex((x) => x.appointment_id === r.appointment_id);
      if (idx === -1) db.customerRatings.push(r);
      else db.customerRatings[idx] = r;
      persist();
      return r;
    },
    remove: (id: string) => {
      const idx = db.customerRatings.findIndex((r) => r.id === id);
      if (idx === -1) return false;
      db.customerRatings.splice(idx, 1);
      persist();
      return true;
    },
  },
  ratings: {
    list: () => db.ratings,
    getByAppointment: (appointmentId: string) => db.ratings.find((r) => r.appointment_id === appointmentId),
    insert: (r: Rating) => { db.ratings.push(r); persist(); return r; },
    remove: (id: string) => {
      const idx = db.ratings.findIndex((r) => r.id === id);
      if (idx === -1) return false;
      db.ratings.splice(idx, 1);
      persist();
      return true;
    },
  },
  pushSubscriptions: {
    list: () => db.pushSubscriptions,
    // نفس endpoint قد يُعاد الاشتراك به (مثلاً بعد مسح بيانات المتصفح) —
    // يستبدل السجل القديم بدل تكديس نسخ مكررة لنفس الجهاز.
    insert: (s: PushSubscriptionRecord) => {
      db.pushSubscriptions = db.pushSubscriptions.filter((x) => x.endpoint !== s.endpoint);
      db.pushSubscriptions.push(s);
      persist();
      return s;
    },
    removeByEndpoint: (endpoint: string) => {
      const before = db.pushSubscriptions.length;
      db.pushSubscriptions = db.pushSubscriptions.filter((x) => x.endpoint !== endpoint);
      persist();
      return db.pushSubscriptions.length !== before;
    },
  },
  custodyInvoices: {
    list: () => db.custodyInvoices,
    insert: (i: CustodyInvoice) => { db.custodyInvoices.push(i); persist(); return i; },
    remove: (id: string) => {
      const idx = db.custodyInvoices.findIndex((i) => i.id === id);
      if (idx === -1) return false;
      db.custodyInvoices.splice(idx, 1);
      persist();
      return true;
    },
  },
  employeeDeductions: {
    list: () => db.employeeDeductions,
    insert: (d: EmployeeDeduction) => { db.employeeDeductions.push(d); persist(); return d; },
    remove: (id: string) => {
      const idx = db.employeeDeductions.findIndex((d) => d.id === id);
      if (idx === -1) return false;
      db.employeeDeductions.splice(idx, 1);
      persist();
      return true;
    },
  },
  employeeViolations: {
    list: () => db.employeeViolations,
    insert: (v: EmployeeViolation) => { db.employeeViolations.push(v); persist(); return v; },
    remove: (id: string) => {
      const idx = db.employeeViolations.findIndex((v) => v.id === id);
      if (idx === -1) return false;
      db.employeeViolations.splice(idx, 1);
      persist();
      return true;
    },
  },
  appointments: {
    list: () => db.appointments,
    get: (id: string) => db.appointments.find((a) => a.id === id),
    insert: (a: Appointment) => { db.appointments.push(a); persist(); return a; },
    insertMany: (items: Appointment[]) => { db.appointments.push(...items); persist(); return items; },
    update: (id: string, patch: Partial<Appointment>) => {
      const idx = db.appointments.findIndex((a) => a.id === id);
      if (idx === -1) return undefined;
      db.appointments[idx] = { ...db.appointments[idx], ...patch };
      persist();
      return db.appointments[idx];
    },
    remove: (id: string) => {
      const idx = db.appointments.findIndex((a) => a.id === id);
      if (idx === -1) return false;
      db.appointments.splice(idx, 1);
      persist();
      return true;
    },
  },
  invoices: {
    list: () => db.invoices,
    insert: (i: Invoice) => { db.invoices.push(i); persist(); return i; },
    // الفواتير أصلاً بلا حذف (سجل مالي دائم، انظر POST /invoices) — remove
    // مضافة فقط لدعم مسح بيانات تجريبية كاملة قبل الانطلاق الفعلي (بطلب
    // صريح من المدير)، وليست جزءاً من تدفق الاستخدام العادي.
    remove: (id: string) => {
      const idx = db.invoices.findIndex((i) => i.id === id);
      if (idx === -1) return false;
      db.invoices.splice(idx, 1);
      persist();
      return true;
    },
  },
  paymentMethods: {
    list: () => db.paymentMethods,
    get: (id: string) => db.paymentMethods.find((m) => m.id === id),
    insert: (m: PaymentMethodOption) => { db.paymentMethods.push(m); persist(); return m; },
    update: (id: string, patch: Partial<PaymentMethodOption>) => {
      const idx = db.paymentMethods.findIndex((m) => m.id === id);
      if (idx === -1) return undefined;
      db.paymentMethods[idx] = { ...db.paymentMethods[idx], ...patch };
      persist();
      return db.paymentMethods[idx];
    },
  },
  commissionConfig: {
    get: () => db.commissionConfig,
    set: (next: CommissionConfig) => { db.commissionConfig = next; persist(); return next; },
  },
  commissionTiers: {
    // مرتَّبة بحسب from تصاعدياً عند كل قراءة — حساب العمولة والواجهة
    // كلاهما يعتمدان على ترتيب الشرائح، أضمن من الاعتماد على ترتيب
    // الإدخال/التعديل.
    list: () => [...db.commissionTiers].sort((a, b) => a.from - b.from),
    insert: (t: CommissionTier) => { db.commissionTiers.push(t); persist(); return t; },
    update: (id: string, patch: Partial<CommissionTier>) => {
      const idx = db.commissionTiers.findIndex((t) => t.id === id);
      if (idx === -1) return undefined;
      db.commissionTiers[idx] = { ...db.commissionTiers[idx], ...patch };
      persist();
      return db.commissionTiers[idx];
    },
    remove: (id: string) => {
      const idx = db.commissionTiers.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      db.commissionTiers.splice(idx, 1);
      persist();
      return true;
    },
  },
  commissionEligibility: {
    list: () => db.commissionEligibility,
    insert: (e: CommissionEligibility) => { db.commissionEligibility.push(e); persist(); return e; },
    update: (id: string, patch: Partial<CommissionEligibility>) => {
      const idx = db.commissionEligibility.findIndex((e) => e.id === id);
      if (idx === -1) return undefined;
      db.commissionEligibility[idx] = { ...db.commissionEligibility[idx], ...patch };
      persist();
      return db.commissionEligibility[idx];
    },
    remove: (id: string) => {
      const idx = db.commissionEligibility.findIndex((e) => e.id === id);
      if (idx === -1) return false;
      db.commissionEligibility.splice(idx, 1);
      persist();
      return true;
    },
  },
};
