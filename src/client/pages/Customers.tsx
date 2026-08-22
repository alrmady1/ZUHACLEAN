import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Phone, MapPin, Trash2, Pencil, Search, ChevronLeft, ChevronDown, Rows3, LayoutGrid, Map as MapIcon } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Appointment } from '../../shared/types.js';
import { AppointmentStatusBadge } from '../components/Badge.js';
import { formatDateAr, formatTimeAr, formatMoney } from '../lib/date.js';

export default function Customers() {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'list' | 'grid'>('list');

  function refresh() {
    api.get<Customer[]>('/customers').then(setCustomers);
  }

  useEffect(() => {
    refresh();
    api.get<Appointment[]>('/appointments').then(setAppointments);
  }, []);

  // Support deep-linking a search term from the global top bar (?q=...),
  // even when navigating here while already on this page.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const visitsByCustomer = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) map.set(a.customer_id, [...(map.get(a.customer_id) ?? []), a]);
    return map;
  }, [appointments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.phone, c.district, c.address, c.city].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [customers, search]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(c: Customer) {
    if (!window.confirm(`حذف العميل "${c.name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    await api.del(`/customers/${c.id}`);
    refresh();
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
    };
    try {
      if (editing) {
        await api.patch(`/customers/${editing.id}`, payload);
      } else {
        await api.post('/customers', payload);
      }
      setShowForm(false);
      setEditing(null);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">سجل العملاء</h1>
          <p className="text-sm text-slate-400">إدارة بيانات العملاء، المواقع، وأرقام التواصل وسجل الزيارات السابقة</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> إضافة عميل جديد
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('list')}
              title="صفوف"
              className={`rounded-lg p-1.5 ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <Rows3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              title="مربعات"
              className={`rounded-lg p-1.5 ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم، رقم الجوال، الحي، العنوان..."
          className="input ps-9"
        />
      </div>

      {view === 'list' && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {filtered.map((c) => {
            const visits = visitsByCustomer.get(c.id) ?? [];
            const isOpen = expanded.has(c.id);
            return (
              <div key={c.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                      {visits.length} زيارات
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{c.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                        </span>
                        {c.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0" /> {c.address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleDelete(c)}
                      title="حذف"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(c);
                        setShowForm(true);
                      }}
                      title="تعديل"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleExpanded(c.id)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 hover:underline"
                    >
                      عرض السجل
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {visits.length === 0 && <div className="text-xs text-slate-400">لا يوجد سجل زيارات بعد</div>}
                    {visits
                      .slice()
                      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                      .map((v) => (
                        <div key={v.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                          <div>
                            <div className="font-medium text-slate-700">{v.service_name_snapshot}</div>
                            <div className="text-slate-400">
                              {formatDateAr(v.scheduled_at)} · {formatTimeAr(v.scheduled_at)} · {formatMoney(v.amount)}
                            </div>
                          </div>
                          <AppointmentStatusBadge status={v.status} />
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'grid' && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {filtered.map((c) => {
          const visits = visitsByCustomer.get(c.id) ?? [];
          const isOpen = expanded.has(c.id);
          return (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                  {visits.length} زيارات
                </span>
              </div>
              <div className="mb-1 text-sm font-semibold text-slate-800">{c.name}</div>
              <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
              </div>
              {c.address && (
                <div className="flex items-start gap-1.5 text-xs text-slate-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>- {c.address}</span>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDelete(c)}
                    title="حذف"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(c);
                      setShowForm(true);
                    }}
                    title="تعديل"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={() => toggleExpanded(c.id)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  عرض السجل
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {visits.length === 0 && <div className="text-xs text-slate-400">لا يوجد سجل زيارات بعد</div>}
                  {visits
                    .slice()
                    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                    .map((v) => (
                      <div key={v.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                        <div>
                          <div className="font-medium text-slate-700">{v.service_name_snapshot}</div>
                          <div className="text-slate-400">
                            {formatDateAr(v.scheduled_at)} · {formatTimeAr(v.scheduled_at)} · {formatMoney(v.amount)}
                          </div>
                        </div>
                        <AppointmentStatusBadge status={v.status} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          لا يوجد عملاء مطابقون
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{editing ? `تعديل ${editing.name}` : 'إضافة عميل جديد'}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">الاسم</span>
                <input name="name" defaultValue={editing?.name} required className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">الجوال</span>
                <input name="phone" defaultValue={editing?.phone} required className="input" placeholder="9665xxxxxxxx" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">العنوان</span>
                <input name="address" defaultValue={editing?.address} required className="input" />
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
                <div className="flex gap-2">
                  <input
                    name="location_url"
                    defaultValue={editing?.location_url}
                    className="input"
                    placeholder="https://maps.google.com/..."
                  />
                  <a
                    href="https://www.google.com/maps"
                    target="_blank"
                    rel="noreferrer"
                    title="فتح خرائط جوجل لتحديد الموقع يدويًا ولصق رابطه هنا"
                    className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-500 hover:bg-slate-50 hover:text-brand-600"
                  >
                    <MapIcon className="h-4 w-4" />
                  </a>
                </div>
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
