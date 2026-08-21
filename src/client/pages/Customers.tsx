import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X, Phone, MapPin } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer } from '../../shared/types.js';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.get<Customer[]>('/customers').then(setCustomers);
  }

  useEffect(refresh, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/customers', {
        name: form.get('name'),
        phone: form.get('phone'),
        address: form.get('address'),
        district: form.get('district') || undefined,
        city: form.get('city') || undefined,
        location_url: form.get('location_url') || undefined,
      });
      setShowForm(false);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">العملاء</h1>
          <p className="text-sm text-slate-400">{customers.length} عميل</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> عميل جديد
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-sm font-semibold text-slate-800">{c.name}</div>
            <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Phone className="h-3.5 w-3.5" /> {c.phone}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> {c.address}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">عميل جديد</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">الاسم</span>
                <input name="name" required className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">الجوال</span>
                <input name="phone" required className="input" placeholder="9665xxxxxxxx" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">العنوان</span>
                <input name="address" required className="input" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">الحي</span>
                  <input name="district" className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المدينة</span>
                  <input name="city" className="input" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">رابط الموقع (خرائط جوجل)</span>
                <input name="location_url" className="input" placeholder="https://maps.google.com/..." />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : 'حفظ العميل'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
