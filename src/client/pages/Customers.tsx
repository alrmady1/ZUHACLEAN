import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, X, Phone, MapPin, Pencil, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer } from '../../shared/types.js';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.get<Customer[]>('/customers').then(setCustomers);
  }

  useEffect(refresh, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return customers;
    const qDigits = q.replace(/\D/g, '');
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q.toLowerCase())) return true;
      if (qDigits && c.phone.replace(/\D/g, '').includes(qDigits)) return true;
      return false;
    });
  }, [customers, search]);

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name'),
      phone: form.get('phone'),
      address: form.get('address'),
      district: form.get('district') || undefined,
      city: form.get('city') || undefined,
      location_url: form.get('location_url') || undefined,
      notes: form.get('notes') || undefined,
    };
    try {
      if (editing) {
        await api.patch(`/customers/${editing.id}`, payload);
      } else {
        await api.post('/customers', payload);
      }
      closeForm();
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
          <p className="text-sm text-slate-400">
            {search ? `${filtered.length} من ${customers.length} عميل` : `${customers.length} عميل`}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> عميل جديد
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو رقم الجوال…"
          className="input pe-9"
        />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          {search ? 'لا يوجد عملاء مطابقون للبحث' : 'لا يوجد عملاء بعد'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">{c.name}</div>
              <button
                onClick={() => openEdit(c)}
                className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-600"
              >
                <Pencil className="h-3.5 w-3.5" /> تعديل
              </button>
            </div>
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
            key={editing?.id ?? 'new'}
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{editing ? 'تعديل بيانات العميل' : 'عميل جديد'}</h2>
              <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">الاسم</span>
                <input name="name" required defaultValue={editing?.name} className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">الجوال</span>
                <input name="phone" required defaultValue={editing?.phone} className="input" placeholder="9665xxxxxxxx" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">العنوان</span>
                <input name="address" required defaultValue={editing?.address} className="input" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">الحي</span>
                  <input name="district" defaultValue={editing?.district} className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المدينة</span>
                  <input name="city" defaultValue={editing?.city} className="input" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">رابط الموقع (خرائط جوجل)</span>
                <input
                  name="location_url"
                  defaultValue={editing?.location_url}
                  className="input"
                  placeholder="https://maps.google.com/..."
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">ملاحظات</span>
                <textarea name="notes" rows={2} defaultValue={editing?.notes} className="input" />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ العميل'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
