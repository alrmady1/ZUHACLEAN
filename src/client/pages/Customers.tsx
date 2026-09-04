import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { Plus, X, Phone, MapPin, Trash2, Pencil, Eye, Check, Search, ChevronLeft, ChevronDown, Rows3, LayoutGrid, Map as MapIcon, MessageCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Appointment, Rating, Profile, CustomerType, CustomerSource } from '../../shared/types.js';
import { CUSTOMER_TYPE_LABELS_AR, CUSTOMER_SOURCE_LABELS_AR } from '../../shared/types.js';
import { AppointmentStatusBadge, RatingStars, RatingSummaryBadge } from '../components/Badge.js';
import { formatDateAr, formatTimeAr, formatMoney } from '../lib/date.js';
import { waLink } from '../lib/whatsapp.js';
import { useI18n } from '../lib/i18n.js';
import { useAuth } from '../lib/auth.js';
import { phoneMatchesQuery } from '../../shared/phone.js';

// صف زيارة واحدة في سجل العميل — تُستخدم في القائمة والمربعات ونافذة
// تفاصيل العميل الثلاثة، مع عرض تقييمها (نجوم + رأي) أسفلها إن وُجد.
function VisitRow({ visit, rating }: { visit: Appointment; rating?: Rating }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-slate-700">{visit.service_name_snapshot}</div>
          <div className="text-slate-400">
            {formatDateAr(visit.scheduled_at)} · {formatTimeAr(visit.scheduled_at)} · {formatMoney(visit.amount)}
          </div>
        </div>
        <AppointmentStatusBadge status={visit.status} />
      </div>
      {rating && (
        <div className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2">
          <RatingStars value={rating.stars} />
          {rating.comment && <span className="text-slate-500">"{rating.comment}"</span>}
          {!rating.comment && <span className="text-slate-400">{t('بدون تعليق')}</span>}
        </div>
      )}
    </div>
  );
}

export default function Customers() {
  const { t, tt, lang } = useI18n();
  const { user, allProfiles, can } = useAuth();
  const canCreate = can('create_customers');
  const canEdit = can('edit_customers');
  const canDelete = can('delete_customers');
  const [searchParams] = useSearchParams();
  // فتح صفحة العملاء من "تفاصيل الموعد" (النقر على اسم العميل) يمرّر
  // ?customerId=... بدل نص بحث — يعزل هذا العميل تحديداً بمعرّفه الدقيق
  // (لا بحث نصي قد يطابق أكثر من عميل بنفس الاسم) ويفتح سجله تلقائياً.
  const customerIdParam = searchParams.get('customerId');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // مصدر العميل في نموذج "إضافة عميل جديد" — state متحكَّم به (لا
  // defaultValue فقط) لأن ظهور حقل "الموظف الذي أجرى الاتصال" يعتمد عليه
  // مباشرة أثناء الاختيار.
  const [newCustomerSource, setNewCustomerSource] = useState<CustomerSource | ''>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  function refresh() {
    api.get<Customer[]>('/customers').then(setCustomers);
  }

  useEffect(() => {
    refresh();
    api.get<Appointment[]>('/appointments').then(setAppointments);
    api.get<Rating[]>('/ratings').then(setRatings);
  }, []);

  // Support deep-linking a search term from the global top bar (?q=...),
  // even when navigating here while already on this page.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // القادم من تفاصيل موعد بـ ?customerId=... يفتح سجل ذلك العميل تلقائياً
  // موسَّعاً — بحيث يرى كامل تفاصيله وسجل زياراته فور الوصول، دون نقرة
  // إضافية على "عرض السجل".
  useEffect(() => {
    if (customerIdParam) setExpanded((prev) => new Set(prev).add(customerIdParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerIdParam]);

  const visitsByCustomer = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) map.set(a.customer_id, [...(map.get(a.customer_id) ?? []), a]);
    return map;
  }, [appointments]);

  // كل موعد له تقييم واحد على الأكثر (يمنعه الخادم، انظر POST
  // /public/ratings) — تُستخدم لعرض التقييم بجانب الزيارة نفسها في السجل.
  const ratingByAppointment = useMemo(() => {
    const map = new Map<string, Rating>();
    for (const r of ratings) map.set(r.appointment_id, r);
    return map;
  }, [ratings]);

  // متوسط التقييم لكل عميل (customer_id على التقييم يُحفَظ وقت إنشائه —
  // انظر POST /public/ratings) — يُعرض كشارة بجانب شارة "زيارات".
  const ratingSummaryByCustomer = useMemo(() => {
    const map = new Map<string, { avg: number; count: number }>();
    for (const r of ratings) {
      if (!r.customer_id) continue;
      const prev = map.get(r.customer_id) ?? { avg: 0, count: 0 };
      const total = prev.avg * prev.count + r.stars;
      const count = prev.count + 1;
      map.set(r.customer_id, { avg: total / count, count });
    }
    return map;
  }, [ratings]);

  const filtered = useMemo(() => {
    if (customerIdParam) return customers.filter((c) => c.id === customerIdParam);
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        [c.name, c.district, c.address, c.city].filter(Boolean).join(' ').toLowerCase().includes(q) ||
        phoneMatchesQuery(c.phone, q),
    );
  }, [customers, search, customerIdParam]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(c: Customer) {
    if (!window.confirm(tt(`حذف العميل "${c.name}"؟ لا يمكن التراجع عن هذا الإجراء.`, `Delete customer "${c.name}"? This action cannot be undone.`)))
      return;
    await api.del(`/customers/${c.id}`);
    refresh();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const source = (form.get('source') as CustomerSource | '') || undefined;
    const payload = {
      name: form.get('name'),
      phone: form.get('phone'),
      address: form.get('address'),
      district: form.get('district') || undefined,
      city: form.get('city') || undefined,
      location_url: form.get('location_url') || undefined,
      customer_type: (form.get('customer_type') as CustomerType | '') || undefined,
      source,
      source_call_profile_id: source === 'outbound_call' ? (form.get('source_call_profile_id') || undefined) : undefined,
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

  // مخفية عن الفني الميداني — حتى لو دخل الرابط مباشرة (لا يظهر له أصلاً
  // في القائمة الجانبية، انظر Layout.tsx).
  if (user && !can('view_customer_history')) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('سجل العملاء')}</h1>
          <p className="text-sm text-slate-400">{t('إدارة بيانات العملاء، المواقع، وأرقام التواصل وسجل الزيارات السابقة')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={() => {
                setEditing(null);
                setNewCustomerSource('');
                setShowForm(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> {t('إضافة عميل جديد')}
            </button>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('list')}
              title={t('صفوف')}
              className={`rounded-lg p-1.5 ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`}
            >
              <Rows3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              title={t('مربعات')}
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
          placeholder={t('ابحث بالاسم، رقم الجوال، الحي، العنوان...')}
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
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500" dir={lang === 'en' ? 'ltr' : undefined}>
                      {visits.length} {t('زيارات')}
                    </span>
                    <RatingSummaryBadge {...(ratingSummaryByCustomer.get(c.id) ?? { avg: 0, count: 0 })} />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{c.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                        </span>
                        <a
                          href={waLink(c.phone)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={t('تواصل عبر واتساب')}
                          className="flex items-center gap-1 text-emerald-600 hover:underline"
                        >
                          <MessageCircle className="h-3.5 w-3.5 shrink-0" /> {t('واتساب')}
                        </a>
                        {c.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0" /> {c.address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(c)}
                        title={t('حذف')}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setViewingCustomer(c)}
                      title={t('عرض التفاصيل والتعديل')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleExpanded(c.id)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 hover:underline"
                    >
                      {t('عرض السجل')}
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {visits.length === 0 && <div className="text-xs text-slate-400">{t('لا يوجد سجل زيارات بعد')}</div>}
                    {visits
                      .slice()
                      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                      .map((v) => (
                        <VisitRow key={v.id} visit={v} rating={ratingByAppointment.get(v.id)} />
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
              <div className="mb-2 flex flex-wrap items-start gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500" dir={lang === 'en' ? 'ltr' : undefined}>
                  {visits.length} {t('زيارات')}
                </span>
                <RatingSummaryBadge {...(ratingSummaryByCustomer.get(c.id) ?? { avg: 0, count: 0 })} />
              </div>
              <div className="mb-1 text-sm font-semibold text-slate-800">{c.name}</div>
              <div className="mb-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                </span>
                <a
                  href={waLink(c.phone)}
                  target="_blank"
                  rel="noreferrer"
                  title={t('تواصل عبر واتساب')}
                  className="flex items-center gap-1 text-emerald-600 hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" /> {t('واتساب')}
                </a>
              </div>
              {c.address && (
                <div className="flex items-start gap-1.5 text-xs text-slate-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>- {c.address}</span>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1">
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(c)}
                      title={t('حذف')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setViewingCustomer(c)}
                    title={t('عرض التفاصيل والتعديل')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={() => toggleExpanded(c.id)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  {t('عرض السجل')}
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {visits.length === 0 && <div className="text-xs text-slate-400">{t('لا يوجد سجل زيارات بعد')}</div>}
                  {visits
                    .slice()
                    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                    .map((v) => (
                      <VisitRow key={v.id} visit={v} rating={ratingByAppointment.get(v.id)} />
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
          {t('لا يوجد عملاء مطابقون')}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{editing ? tt(`تعديل ${editing.name}`, `Edit ${editing.name}`) : t('إضافة عميل جديد')}</h2>
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
                <span className="mb-1 block font-medium text-slate-600">{t('الاسم')}</span>
                <input name="name" defaultValue={editing?.name} required className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('الجوال')}</span>
                <input name="phone" defaultValue={editing?.phone} required className="input" placeholder="05xxxxxxxx" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('العنوان')}</span>
                <input name="address" defaultValue={editing?.address} required className="input" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الحي')}</span>
                  <input name="district" defaultValue={editing?.district} className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('المدينة')}</span>
                  <input name="city" defaultValue={editing?.city} className="input" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('رابط الموقع (خرائط جوجل)')}</span>
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
                    title={t('فتح خرائط جوجل لتحديد الموقع يدويًا ولصق رابطه هنا')}
                    className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-500 hover:bg-slate-50 hover:text-brand-600"
                  >
                    <MapIcon className="h-4 w-4" />
                  </a>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('نوع العميل')}</span>
                  <div className="relative">
                    <select name="customer_type" defaultValue={editing?.customer_type ?? ''} className="input appearance-none pe-9">
                      <option value="">{t('غير محدد')}</option>
                      {(Object.keys(CUSTOMER_TYPE_LABELS_AR) as CustomerType[]).map((k) => (
                        <option key={k} value={k}>
                          {t(CUSTOMER_TYPE_LABELS_AR[k])}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('المصدر')}</span>
                  <div className="relative">
                    <select
                      name="source"
                      value={newCustomerSource}
                      onChange={(e) => setNewCustomerSource(e.target.value as CustomerSource | '')}
                      className="input appearance-none pe-9"
                    >
                      <option value="">{t('غير محدد')}</option>
                      {(Object.keys(CUSTOMER_SOURCE_LABELS_AR) as CustomerSource[]).map((k) => (
                        <option key={k} value={k}>
                          {t(CUSTOMER_SOURCE_LABELS_AR[k])}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
              </div>
              {newCustomerSource === 'outbound_call' && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الموظف الذي أجرى الاتصال')}</span>
                  <div className="relative">
                    <select name="source_call_profile_id" defaultValue={editing?.source_call_profile_id ?? ''} className="input appearance-none pe-9">
                      <option value="">{t('-- اختر الموظف --')}</option>
                      {allProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? t('جارِ الحفظ…') : editing ? t('حفظ التعديلات') : t('حفظ العميل')}
            </button>
          </form>
        </div>
      )}

      {viewingCustomer && (
        <CustomerDetailModal
          customer={viewingCustomer}
          visits={visitsByCustomer.get(viewingCustomer.id) ?? []}
          ratingByAppointment={ratingByAppointment}
          ratingSummary={ratingSummaryByCustomer.get(viewingCustomer.id) ?? { avg: 0, count: 0 }}
          canEdit={canEdit}
          allProfiles={allProfiles}
          onClose={() => setViewingCustomer(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

// عين بدل قلم على مستوى الصف: تفتح هذه النافذة كل تفاصيل العميل مع
// إمكانية التعديل من داخلها مباشرة (تبديل عرض/تحرير)، بدل فتح نموذج
// تعديل منفصل فوراً — بحيث "الاطلاع" و"التعديل" كلاهما من نفس المكان.
function CustomerDetailModal({
  customer,
  visits,
  ratingByAppointment,
  ratingSummary,
  canEdit,
  allProfiles,
  onClose,
  onSaved,
}: {
  customer: Customer;
  visits: Appointment[];
  ratingByAppointment: Map<string, Rating>;
  ratingSummary: { avg: number; count: number };
  canEdit: boolean;
  allProfiles: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [address, setAddress] = useState(customer.address);
  const [district, setDistrict] = useState(customer.district ?? '');
  const [city, setCity] = useState(customer.city ?? '');
  const [locationUrl, setLocationUrl] = useState(customer.location_url ?? '');
  const [customerType, setCustomerType] = useState<CustomerType | ''>(customer.customer_type ?? '');
  const [source, setSource] = useState<CustomerSource | ''>(customer.source ?? '');
  const [sourceCallProfileId, setSourceCallProfileId] = useState(customer.source_call_profile_id ?? '');

  async function save() {
    setSubmitting(true);
    try {
      await api.patch(`/customers/${customer.id}`, {
        name,
        phone,
        address,
        district: district || undefined,
        city: city || undefined,
        location_url: locationUrl || undefined,
        customer_type: customerType || undefined,
        source: source || undefined,
        source_call_profile_id: source === 'outbound_call' ? sourceCallProfileId || undefined : undefined,
      });
      onSaved();
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  const sortedVisits = [...visits].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">{t('تفاصيل العميل')}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!editing ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-base font-bold text-slate-800">{customer.name}</span>
                {canEdit && (
                  <button
                    onClick={() => {
                      setName(customer.name);
                      setPhone(customer.phone);
                      setAddress(customer.address);
                      setDistrict(customer.district ?? '');
                      setCity(customer.city ?? '');
                      setLocationUrl(customer.location_url ?? '');
                      setCustomerType(customer.customer_type ?? '');
                      setSource(customer.source ?? '');
                      setSourceCallProfileId(customer.source_call_profile_id ?? '');
                      setEditing(true);
                    }}
                    title={t('تعديل بيانات العميل')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5 text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {customer.phone}
                </div>
                {customer.address && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {customer.address}
                      {customer.district ? `، ${customer.district}` : ''}
                      {customer.city ? `، ${customer.city}` : ''}
                    </span>
                  </div>
                )}
              </div>
              {(customer.customer_type || customer.source) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {customer.customer_type && (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {t(CUSTOMER_TYPE_LABELS_AR[customer.customer_type])}
                    </span>
                  )}
                  {customer.source && (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {t(CUSTOMER_SOURCE_LABELS_AR[customer.source])}
                      {customer.source === 'outbound_call' &&
                        customer.source_call_profile_id &&
                        ` — ${allProfiles.find((p) => p.id === customer.source_call_profile_id)?.full_name ?? ''}`}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Phone className="h-3.5 w-3.5" /> {t('اتصال')}
                </a>
                <a
                  href={waLink(customer.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> {t('واتساب')}
                </a>
                {customer.location_url && (
                  <a
                    href={customer.location_url}
                    target="_blank"
                    rel="noreferrer"
                    title={t('فتح موقع العميل في الخريطة')}
                    className="flex items-center justify-center rounded-xl bg-brand-600 p-2 text-white hover:bg-brand-700"
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('الاسم')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('الجوال')}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="05xxxxxxxx" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('العنوان')}</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className="input" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الحي')}</span>
                  <input value={district} onChange={(e) => setDistrict(e.target.value)} className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('المدينة')}</span>
                  <input value={city} onChange={(e) => setCity(e.target.value)} className="input" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('نوع العميل')}</span>
                  <div className="relative">
                    <select
                      value={customerType}
                      onChange={(e) => setCustomerType(e.target.value as CustomerType | '')}
                      className="input appearance-none pe-9"
                    >
                      <option value="">{t('غير محدد')}</option>
                      {(Object.keys(CUSTOMER_TYPE_LABELS_AR) as CustomerType[]).map((k) => (
                        <option key={k} value={k}>
                          {t(CUSTOMER_TYPE_LABELS_AR[k])}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('المصدر')}</span>
                  <div className="relative">
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value as CustomerSource | '')}
                      className="input appearance-none pe-9"
                    >
                      <option value="">{t('غير محدد')}</option>
                      {(Object.keys(CUSTOMER_SOURCE_LABELS_AR) as CustomerSource[]).map((k) => (
                        <option key={k} value={k}>
                          {t(CUSTOMER_SOURCE_LABELS_AR[k])}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
              </div>
              {source === 'outbound_call' && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">{t('الموظف الذي أجرى الاتصال')}</span>
                  <div className="relative">
                    <select
                      value={sourceCallProfileId}
                      onChange={(e) => setSourceCallProfileId(e.target.value)}
                      className="input appearance-none pe-9"
                    >
                      <option value="">{t('-- اختر الموظف --')}</option>
                      {allProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">{t('رابط الموقع (خرائط جوجل)')}</span>
                <div className="flex gap-2">
                  <input
                    value={locationUrl}
                    onChange={(e) => setLocationUrl(e.target.value)}
                    className="input"
                    placeholder="https://maps.google.com/..."
                  />
                  <a
                    href="https://www.google.com/maps"
                    target="_blank"
                    rel="noreferrer"
                    title={t('فتح خرائط جوجل لتحديد الموقع يدويًا ولصق رابطه هنا')}
                    className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-500 hover:bg-slate-50 hover:text-brand-600"
                  >
                    <MapIcon className="h-4 w-4" />
                  </a>
                </div>
              </label>
              <div className="flex items-center gap-2">
                <button
                  disabled={submitting}
                  onClick={save}
                  className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> {submitting ? t('جارِ الحفظ…') : t('حفظ')}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  {t('إلغاء')}
                </button>
              </div>
            </div>
          )}

          {/* مخفي أثناء التعديل — يشتت عن نموذج التعديل بلا فائدة، ويعود
              يظهر بمجرد الحفظ أو الإلغاء والعودة لوضع العرض. */}
          {!editing && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-600">{t('سجل الزيارات')}</span>
                <div className="flex items-center gap-2">
                  <RatingSummaryBadge {...ratingSummary} />
                  <span
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"
                    dir={lang === 'en' ? 'ltr' : undefined}
                  >
                    {visits.length} {t('زيارات')}
                  </span>
                </div>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {sortedVisits.map((v) => (
                  <VisitRow key={v.id} visit={v} rating={ratingByAppointment.get(v.id)} />
                ))}
                {visits.length === 0 && <div className="text-xs text-slate-400">{t('لا يوجد سجل زيارات بعد')}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
