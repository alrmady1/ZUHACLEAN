import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Service, Profile } from '../../shared/types.js';

export default function NewAppointmentModal({
  customers,
  services,
  supervisors,
  technicians,
  onClose,
  onCreated,
}: {
  customers: Customer[];
  services: Service[];
  supervisors: Profile[];
  technicians: Profile[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const customerId = String(form.get('customer_id'));
    const serviceId = String(form.get('service_id'));
    const customer = customers.find((c) => c.id === customerId);
    const service = services.find((s) => s.id === serviceId);
    const technicianId = form.get('technician_id');
    try {
      await api.post('/appointments', {
        customer_id: customerId,
        service_id: serviceId,
        service_name_snapshot: service?.name,
        scheduled_at: form.get('scheduled_at'),
        expected_duration_minutes: service?.default_duration_minutes ?? 120,
        amount: Number(form.get('amount')),
        supervisor_id: form.get('supervisor_id') || undefined,
        address_snapshot: customer?.address ?? '',
        location_url: customer?.location_url,
        assignments: technicianId
          ? [{ id: crypto.randomUUID(), technician_id: technicianId, technician_name: technicians.find((t) => t.id === technicianId)?.full_name }]
          : [],
      });
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">حجز موعد جديد</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">العميل</span>
            <select name="customer_id" required className="input">
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">الخدمة</span>
            <select
              name="service_id"
              required
              className="input"
              onChange={(e) => {
                const form = e.currentTarget.form;
                const svc = services.find((s) => s.id === e.currentTarget.value);
                if (form && svc) (form.elements.namedItem('amount') as HTMLInputElement).value = String(svc.default_price);
              }}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">التاريخ والوقت</span>
              <input type="datetime-local" name="scheduled_at" required className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">المبلغ (ر.س)</span>
              <input type="number" name="amount" min={0} step="0.01" defaultValue={services[0]?.default_price} required className="input" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">المشرف المسؤول</span>
              <select name="supervisor_id" className="input">
                <option value="">بدون تحديد</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">الفني المسند (اختياري)</span>
              <select name="technician_id" className="input">
                <option value="">بدون تحديد</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'جارِ الحفظ…' : 'حفظ الموعد'}
        </button>
      </form>
    </div>
  );
}
