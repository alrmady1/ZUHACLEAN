import { Router } from 'express';
import { store } from '../store/db.js';
import type { StoredProfile } from '../store/db.js';
import { hashPassword } from '../lib/password.js';
import type {
  Appointment,
  Contract,
  VisitFrequency,
  Invoice,
  Service,
  PaymentMethodOption,
  CustodyTransaction,
  Customer,
} from '../../shared/types.js';
import { VAT_RATE } from '../../shared/types.js';

export const api = Router();

// Strip the password hash before a profile ever leaves the server.
function toSafeProfile(p: StoredProfile) {
  const { password_hash, ...safe } = p;
  return safe;
}

// ---------------------------------------------------------------------------
// Profiles / users — managed from Settings (add users, edit name/role,
// set username + password). Login itself still uses the simple
// pick-an-account flow (see src/client/lib/auth.tsx); these credentials are
// stored ready for when that's swapped for real sign-in.
// ---------------------------------------------------------------------------
api.get('/profiles', (_req, res) => res.json(store.profiles.list().map(toSafeProfile)));

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
  const patch: Partial<Customer> = {};
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
  if (body.default_price !== undefined) patch.default_price = Number(body.default_price);
  if (body.default_duration_minutes !== undefined) patch.default_duration_minutes = Number(body.default_duration_minutes);
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  const updated = store.services.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
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
    service_name_snapshot: store.services.get(body.service_id)?.name ?? body.service_name_snapshot ?? '',
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

// Technician: attach a before/after photo (base64 data URL)
api.post('/appointments/:id/photos', (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'not found' });
  const { stage, data_url } = req.body ?? {};
  appt.photos.push({ id: store.id(), stage, data_url, taken_at: new Date().toISOString() });
  store.appointments.update(appt.id, { photos: appt.photos });
  res.status(201).json(appt);
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
  const expense = store.expenses.insert({
    id: store.id(),
    title: body.title,
    category: body.category,
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
    payment_method: body.payment_method ?? 'cash',
    notes: body.notes,
    created_at: new Date().toISOString(),
  });
  res.status(201).json(expense);
});

// ---------------------------------------------------------------------------
// Custody ledger (عهد الموظفين) — a debit/credit statement per employee.
// 'receipt' = مدين (custody amount handed to the employee), 'expense' =
// دائن (amount the employee spent against a documented invoice). Balance
// per employee is computed on the client from the full transaction list.
// ---------------------------------------------------------------------------
api.get('/custody-transactions', (req, res) => {
  const { employee_id } = req.query;
  let list = store.custodyTransactions.list();
  if (employee_id && typeof employee_id === 'string') {
    list = list.filter((t) => t.employee_id === employee_id);
  }
  res.json(list);
});

api.post('/custody-transactions', (req, res) => {
  const body = req.body ?? {};
  if (!body.employee_id || !body.type || !body.amount) {
    return res.status(400).json({ error: 'employee_id, type و amount مطلوبة' });
  }
  const transaction: CustodyTransaction = {
    id: store.id(),
    employee_id: body.employee_id,
    employee_name: body.employee_name ?? '',
    type: body.type,
    amount: Number(body.amount),
    date: body.date ?? new Date().toISOString().slice(0, 10),
    invoice_number: body.invoice_number || undefined,
    notes: body.notes || undefined,
    recorded_by: body.recorded_by,
    recorded_by_name: body.recorded_by_name,
    created_at: new Date().toISOString(),
  };
  store.custodyTransactions.insert(transaction);
  res.status(201).json(transaction);
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
api.get('/invoices', (_req, res) => res.json(store.invoices.list()));

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
    notes: body.notes,
  };
  store.invoices.insert(invoice);
  res.status(201).json(invoice);
});
