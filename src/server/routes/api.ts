import { Router } from 'express';
import { store } from '../store/db.js';
import type { Appointment, Contract, VisitFrequency, Invoice } from '../../shared/types.js';
import { VAT_RATE } from '../../shared/types.js';

export const api = Router();

// ---------------------------------------------------------------------------
// Profiles (read-only demo directory — real auth/permissions can replace this)
// ---------------------------------------------------------------------------
api.get('/profiles', (_req, res) => res.json(store.profiles.list()));

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

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
api.get('/services', (_req, res) => res.json(store.services.list()));

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
    issue_date: body.issue_date ?? new Date().toISOString().slice(0, 10),
    notes: body.notes,
  };
  store.invoices.insert(invoice);
  res.status(201).json(invoice);
});
