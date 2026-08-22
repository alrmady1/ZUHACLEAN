// ============================================================================
// طبقة تخزين بسيطة (JSON على القرص) — بديل مؤقت لقاعدة بيانات حقيقية.
// يمكن استبدالها لاحقاً بـ Postgres / Supabase دون تغيير واجهة الراوترات،
// طالما أن الدوال هنا (list/get/insert/update) تبقى بنفس التوقيع.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../lib/password.js';
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
} from '../../shared/types.js';

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
}

// Lives outside `src/` on purpose: production containers only ship `dist/`,
// so the JSON store must resolve to a path that exists in both dev and prod.
//
// On Vercel the deployment bundle is read-only and `process.cwd()` isn't
// writable, so we fall back to /tmp there. Fine for a demo — NOTE this
// means data does NOT persist across cold starts or separate function
// instances on Vercel. Swap this whole file for a real database
// (Postgres/Supabase/etc.) before relying on this for real data.
const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'zaha-ops-data')
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

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
    { id: 'c-1', name: 'عبدالعزيز الغامدي', phone: '966501234567', address: 'حي النرجس، الرياض', district: 'النرجس', city: 'الرياض', created_at: now },
    { id: 'c-2', name: 'شركة النخبة العقارية', phone: '966559876543', address: 'طريق الملك فهد، جدة', district: 'الروضة', city: 'جدة', created_at: now },
    { id: 'c-3', name: 'مطاعم الواحة', phone: '966545551212', address: 'حي العليا، الرياض', district: 'العليا', city: 'الرياض', created_at: now },
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
      visit_day_of_week: 'sunday',
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
  };
}

// A stable, deterministic id for seed categories (so the same seed data
// produces the same ids across reseeds — real inserts use randomUUID via
// store.id() instead).
function seedCategoryId(name: string): string {
  return `cat-${name.replace(/\s+/g, '-')}`;
}

function load(): DbShape {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as DbShape;
      // Migrate data files saved before payment methods / service
      // categories existed.
      if (!parsed.paymentMethods) parsed.paymentMethods = seed().paymentMethods;
      if (!parsed.serviceCategories) {
        parsed.serviceCategories = Array.from(new Set(parsed.services.map((s) => s.category).filter(Boolean))).map(
          (name) => ({ id: seedCategoryId(name as string), name: name as string }),
        );
      }
      if (!parsed.expenseCategories) parsed.expenseCategories = seed().expenseCategories;
      if (!parsed.custodyInvoices) parsed.custodyInvoices = [];
      return parsed;
    } catch {
      // fall through to reseed on corrupt file
    }
  }
  const initial = seed();
  save(initial);
  return initial;
}

function save(data: DbShape) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

const db = load();

function persist() {
  save(db);
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
  },
  expenses: {
    list: () => db.expenses,
    insert: (e: Expense) => { db.expenses.push(e); persist(); return e; },
  },
  custodyInvoices: {
    list: () => db.custodyInvoices,
    insert: (i: CustodyInvoice) => { db.custodyInvoices.push(i); persist(); return i; },
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
  },
  invoices: {
    list: () => db.invoices,
    insert: (i: Invoice) => { db.invoices.push(i); persist(); return i; },
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
};
