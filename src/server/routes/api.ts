import { Router } from 'express';
import { store } from '../store/db.js';
import type { StoredProfile } from '../store/db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { uploadAppointmentPhoto } from '../lib/storage.js';
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
} from '../../shared/types.js';
import { VAT_RATE, CUSTODY_CATEGORY_NAME } from '../../shared/types.js';

export const api = Router();

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
    phone: body.phone || undefined,
    role: body.role,
    supervisor_id: body.supervisor_id || undefined,
    username: body.username || undefined,
    password_hash: body.password ? hashPassword(body.password) : undefined,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  res.status(201).json(toSafeProfile(profile));
});

api.patch('/profiles/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<StoredProfile> = {};
  if (body.full_name !== undefined) patch.full_name = body.full_name;
  if (body.email !== undefined) patch.email = body.email;
  if (body.phone !== undefined) patch.phone = body.phone || undefined;
  if (body.role !== undefined) patch.role = body.role;
  if (body.supervisor_id !== undefined) patch.supervisor_id = body.supervisor_id || undefined;
  if (body.username !== undefined) patch.username = body.username || undefined;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.password) patch.password_hash = hashPassword(body.password);

  const updated = store.profiles.update(req.params.id, patch);
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
    phone,
    address,
    district,
    city,
    location_url,
    notes,
    created_at: new Date().toISOString(),
  });
  res.status(201).json(customer);
});

api.patch('/customers/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<{ name: string; phone: string; address: string; district?: string; city?: string; location_url?: string; notes?: string }> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.address !== undefined) patch.address = body.address;
  if (body.district !== undefined) patch.district = body.district || undefined;
  if (body.city !== undefined) patch.city = body.city || undefined;
  if (body.location_url !== undefined) patch.location_url = body.location_url || undefined;
  if (body.notes !== undefined) patch.notes = body.notes || undefined;

  const updated = store.customers.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

api.delete('/customers/:id', (req, res) => {
  const removed = store.customers.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
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
  res.json(updated);
});

api.delete('/services/:id', (req, res) => {
  const removed = store.services.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
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
  res.status(201).json(category);
});

api.patch('/service-categories/:id', (req, res) => {
  const body = req.body ?? {};
  if (!body.name) return res.status(400).json({ error: 'name مطلوب' });
  const updated = store.serviceCategories.update(req.params.id, { name: body.name });
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

api.delete('/service-categories/:id', (req, res) => {
  const removed = store.serviceCategories.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
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
  };
  store.appointments.insert(appointment);
  res.status(201).json(appointment);
});

api.patch('/appointments/:id', (req, res) => {
  const updated = store.appointments.update(req.params.id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
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

function generateAppointmentsForContract(contract: Contract): Appointment[] {
  const customer = store.customers.get(contract.customer_id);
  const service = store.services.get(contract.service_id);
  const start = new Date(`${contract.start_date}T${contract.visit_time ?? '09:00'}:00`);
  const end = new Date(contract.end_date);

  // Pass 1: walk the frequency to find every visit date, so we know the
  // real visit count before splitting total_amount across visits (the
  // contract form doesn't ask the user for total_visits directly).
  const dates: Date[] = [];
  let cursor = start;
  while (cursor <= end && dates.length < 200) {
    dates.push(new Date(cursor));
    cursor = addFrequency(cursor, contract.visit_frequency);
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
    supervisor_id: contract.supervisor_id,
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
    visit_day_of_week: body.visit_day_of_week,
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

  res.status(201).json({ contract: store.contracts.get(contract.id), generated_appointments: generated.length });
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
api.get('/expenses', (_req, res) => res.json(store.expenses.list()));

api.post('/expenses', (req, res) => {
  const body = req.body ?? {};
  const isCustody = body.category === CUSTODY_CATEGORY_NAME;
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
    custody_holder_id: isCustody ? body.custody_holder_id || undefined : undefined,
    custody_holder_name: isCustody && body.custody_holder_id ? store.profiles.get(body.custody_holder_id)?.full_name : undefined,
    payment_method: body.payment_method ?? 'cash',
    notes: body.notes,
    created_at: new Date().toISOString(),
  });
  res.status(201).json(expense);
});

// Deleting an expense (used for custody grants — see CAN_DELETE_CUSTODY_ROLES,
// المدير العام only) is unrestricted server-side like the rest of this app.
api.delete('/expenses/:id', (req, res) => {
  const removed = store.expenses.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
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
  res.status(201).json(item);
});

api.patch('/expense-categories/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<ExpenseCategoryItem> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  const updated = store.expenseCategories.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

api.delete('/expense-categories/:id', (req, res) => {
  const removed = store.expenseCategories.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
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
  res.status(201).json(invoice);
});

// Deleting custody entries (grants or the invoices submitted against them)
// is gated client-side to المدير العام only (see CAN_DELETE_CUSTODY_ROLES).
api.delete('/custody-invoices/:id', (req, res) => {
  const removed = store.custodyInvoices.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
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
  res.status(201).json(method);
});

api.patch('/payment-methods/:id', (req, res) => {
  const body = req.body ?? {};
  const patch: Partial<PaymentMethodOption> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  const updated = store.paymentMethods.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
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
  res.status(201).json(invoice);
});
