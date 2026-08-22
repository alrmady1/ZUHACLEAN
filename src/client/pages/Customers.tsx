import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, X, Phone, MapPin, Pencil, Search, Trash2, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer } from '../../shared/types.js';
import { AppointmentStatusBadge, PaymentStatusBadge } from '../components/Badge.js';
import { formatDateAr, formatMoney } from '../lib/date.js';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  function refresh() {
    api.get<Customer[]>('/customers').then(setCustomers);
  }

  useEffect(() => {
    refresh();
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }, []);

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

  const visitCountByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) {
      m.set(a.customer_id, (m.get(a.customer_id) ?? 0) + 1);
    }
    return m;
  }, [appointments]);

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

  async function handleDelete(c: Customer) {
    if (!window.confirm(`هل أنت متأكد من حذف العميل "${c.name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setDeletingId(c.id);
    try {
      await api.delete(`/customers/${c.id}`);
      refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">سجل العملاء</h1>
          <p className="text-sm text-slate-400">إدارة بيانات العملاء، المواقع، وأرقام التواصل وسجل الزيارات السابقة</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> إضافة عميل جديد
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم، رقم الجوال، الحي، العنوان..."
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
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                {visitCountByCustomer.get(c.id) ?? 0} زيارات
              </span>
            </div>
            <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Phone className="h-3.5 w-3.5" /> {c.phone}
            </div>
            <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> {c.address}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDelete(c)}
                  disabled={deletingId === c.id}
                  className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                  aria-label="حذف العميل"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openEdit(c)}
                  className="text-slate-400 hover:text-brand-600"
                  aria-label="تعديل بيانات العميل"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => setHistoryCustomer(c)}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
              >
                عرض السجل <ChevronLeft className="h-3.5 w-3.5" />
              </button>
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

      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">سجل زيارات {historyCustomer.name}</h2>
                <p className="text-xs text-slate-400">{historyCustomer.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <CustomerHistory customerId={historyCustomer.id} appointments={appointments} />
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerHistory({ customerId, appointments }: { customerId: string; appointments: Appointment[] }) {
  const items = appointments
    .filter((a) => a.customer_id === customerId)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
        لا توجد زيارات مسجلة لهذا العميل بعد
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-400">
            <th className="py-2 text-start font-medium">التاريخ</th>
            <th className="py-2 text-start font-medium">الخدمة</th>
            <th className="py-2 text-start font-medium">المبلغ</th>
            <th className="py-2 text-start font-medium">الحالة</th>
            <th className="py-2 text-start font-medium">السداد</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-b border-slate-50 last:border-0">
              <td className="py-2.5 text-slate-600">{formatDateAr(a.scheduled_at)}</td>
              <td className="py-2.5 font-medium text-slate-700">{a.service_name_snapshot}</td>
              <td className="py-2.5 text-slate-600">{formatMoney(a.amount)}</td>
              <td className="py-2.5">
                <AppointmentStatusBadge status={a.status} />
              </td>
              <td className="py-2.5">
                <PaymentStatusBadge status={a.payment_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
