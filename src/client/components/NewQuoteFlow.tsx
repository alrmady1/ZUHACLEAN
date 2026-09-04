import { useRef, useState, useEffect } from 'react';
import { X, Plus, ChevronDown, Check, Sparkles, User, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Service, Quote, QuotePathType } from '../../shared/types.js';
import { DEFAULT_QUOTE_PAYMENT_NOTE } from '../../shared/documentDefaults.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { phoneMatchesQuery } from '../../shared/phone.js';

interface QuoteLineItem {
  service_id: string;
  service_name: string;
  price: number;
}

// نافذة إنشاء عرض سعر — عميل (موجود أو جديد) ← مسار (زيارة واحدة أو
// عقد متعدد الزيارات، تصنيف على المستند فقط) ← خدمات متعددة من قائمة
// منسدلة مع سعر يُملأ تلقائياً وقابل للتعديل لكل خدمة ← رسالة الدفع
// القابلة للتحرير ← حفظ، ثم يُعرَض المستند النهائي القابل للطباعة.
export default function NewQuoteFlow({
  customers,
  services,
  initialQuote,
  onClose,
  onCreated,
  onCustomerCreated,
}: {
  customers: Customer[];
  services: Service[];
  // عند تمريره: نسخ عرض سعر قائم — نفس العميل/المسار/الخدمات/الأسعار/رسالة
  // الدفع مبدئياً، لكن قابلة للتعديل بالكامل قبل الحفظ. الحفظ (submit
  // أدناه) يمر عبر POST /quotes العادي دائماً، فيحصل تلقائياً على id
  // ورقم عرض (quote_number) وتاريخ إصدار جديدَين — لا حاجة لأي منطق
  // مختلف على الخادم.
  initialQuote?: Quote;
  onClose: () => void;
  onCreated: (quote: Quote) => void;
  onCustomerCreated?: (customer: Customer) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();

  const [allCustomers, setAllCustomers] = useState(customers);
  useEffect(() => setAllCustomers(customers), [customers]);

  const [customerId, setCustomerId] = useState(initialQuote?.customer_id ?? '');
  const [customerSearch, setCustomerSearch] = useState(initialQuote?.customer_name_snapshot ?? '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(customers.length === 0 && !initialQuote);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const customerBoxRef = useRef<HTMLDivElement>(null);
  const newCustomerBoxRef = useRef<HTMLDivElement>(null);

  const [pathType, setPathType] = useState<QuotePathType>(initialQuote?.path_type ?? 'single_visit');

  const [items, setItems] = useState<QuoteLineItem[]>(
    initialQuote ? initialQuote.items.map((it) => ({ service_id: it.service_id, service_name: it.service_name, price: it.price })) : [],
  );
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const serviceBoxRef = useRef<HTMLDivElement>(null);

  const [paymentNote, setPaymentNote] = useState(initialQuote?.payment_note || DEFAULT_QUOTE_PAYMENT_NOTE);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (serviceBoxRef.current && !serviceBoxRef.current.contains(e.target as Node)) setShowServiceDropdown(false);
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const q = customerSearch.trim().toLowerCase();
  const filteredCustomers = !q
    ? allCustomers
    : allCustomers.filter(
        (c) =>
          c.id === customerId ||
          c.name.toLowerCase().includes(q) ||
          phoneMatchesQuery(c.phone, q) ||
          (c.district ?? '').toLowerCase().includes(q) ||
          (c.city ?? '').toLowerCase().includes(q),
      );
  const selectedCustomer = allCustomers.find((c) => c.id === customerId);

  function toggleService(id: string) {
    setItems((prev) => {
      const exists = prev.some((it) => it.service_id === id);
      if (exists) return prev.filter((it) => it.service_id !== id);
      const service = services.find((s) => s.id === id);
      if (!service) return prev;
      return [...prev, { service_id: service.id, service_name: service.name, price: service.default_price }];
    });
  }

  function updatePrice(id: string, price: number) {
    setItems((prev) => prev.map((it) => (it.service_id === id ? { ...it, price } : it)));
  }

  const total = Math.round(items.reduce((sum, it) => sum + it.price, 0) * 100) / 100;

  async function createNewCustomer() {
    const container = newCustomerBoxRef.current;
    if (!container) return;
    const get = (n: string) => (container.querySelector(`[name="${n}"]`) as HTMLInputElement)?.value;
    const name = get('new_customer_name');
    const phone = get('new_customer_phone');
    const address = get('new_customer_address');
    if (!name || !phone || !address) return;
    setAddingCustomer(true);
    try {
      const created = await api.post<Customer>('/customers', {
        name,
        phone,
        address,
        district: get('new_customer_district') || undefined,
        city: get('new_customer_city') || undefined,
      });
      setAllCustomers((prev) => [...prev, created]);
      setCustomerId(created.id);
      setCustomerSearch(created.name);
      setShowAddCustomer(false);
      onCustomerCreated?.(created);
    } finally {
      setAddingCustomer(false);
    }
  }

  async function submit() {
    if (!customerId || items.length === 0) return;
    setSubmitting(true);
    try {
      const quote = await api.post<Quote>('/quotes', {
        customer_id: customerId,
        path_type: pathType,
        items,
        payment_note: paymentNote.trim() || undefined,
        created_by: user?.id,
      });
      onCreated(quote);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{initialQuote ? t('نسخ عرض سعر كعرض جديد') : t('إنشاء عرض سعر')}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {initialQuote
                ? t(`نسخة معبَّأة من عرض ${initialQuote.quote_number} — عدّل ما تحتاج ثم احفظ برقم عرض وتاريخ جديدَين`)
                : t('اختر العميل والمسار والخدمات، ثم راجع السعر قبل الحفظ')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* العميل */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                {t('العميل *')} <User className="h-3.5 w-3.5 text-brand-500" />
              </span>
              <button
                type="button"
                onClick={() => setShowAddCustomer((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> {t('إنشاء عميل جديد')}
              </button>
            </div>

            {!showAddCustomer && (
              <div ref={customerBoxRef} className="relative">
                <input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder={t('ابحث بالاسم، الجوال، الحي، أو المدينة...')}
                  className="input"
                />
                {showSuggestions && (
                  <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerSearch(c.name);
                          setShowSuggestions(false);
                        }}
                        className={`flex w-full flex-col gap-0.5 px-3 py-2 text-start text-sm hover:bg-slate-50 ${c.id === customerId ? 'bg-brand-50' : ''}`}
                      >
                        <span className="font-medium text-slate-700">{c.name}</span>
                        <span dir="ltr" className="text-end text-xs text-slate-400">{c.phone}</span>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400">{t('لا يوجد عميل مطابق لبحثك')}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {showAddCustomer && (
              <div ref={newCustomerBoxRef} className="space-y-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input name="new_customer_name" placeholder={t('الاسم')} className="input" />
                  <input name="new_customer_phone" placeholder="05xxxxxxxx" className="input" />
                </div>
                <input name="new_customer_address" placeholder={t('العنوان')} className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <input name="new_customer_district" placeholder={t('الحي (اختياري)')} className="input" />
                  <input name="new_customer_city" placeholder={t('المدينة (اختياري)')} className="input" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={addingCustomer}
                    onClick={createNewCustomer}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {addingCustomer ? t('جارِ الحفظ…') : t('حفظ العميل')}
                  </button>
                  {allCustomers.length > 0 && (
                    <button type="button" onClick={() => setShowAddCustomer(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500">
                      {t('إلغاء')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* المسار */}
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <span className="text-sm font-semibold text-slate-700">{t('مسار العرض *')}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPathType('single_visit')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${pathType === 'single_visit' ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                {t('زيارة مرة واحدة')}
              </button>
              <button
                type="button"
                onClick={() => setPathType('contract')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${pathType === 'contract' ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                {t('عقد متعدد الزيارات')}
              </button>
            </div>
          </div>

          {/* الخدمات */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              {t('الخدمات *')} <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            </span>
            <div ref={serviceBoxRef} className="relative">
              <button
                type="button"
                onClick={() => setShowServiceDropdown((v) => !v)}
                className="input flex items-center justify-between gap-2 text-start"
              >
                <span className={`truncate ${items.length ? 'text-slate-700' : 'text-slate-400'}`}>
                  {items.length > 0 ? items.map((it) => it.service_name).join('، ') : t('-- اختر نوعاً أو أكثر من الخدمة --')}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              {showServiceDropdown && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {services.map((s) => {
                    const checked = items.some((it) => it.service_id === s.id);
                    return (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <input type="checkbox" checked={checked} onChange={() => toggleService(s.id)} className="hidden" />
                        <span className="flex-1 text-slate-700">{s.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">{formatMoney(s.default_price)}</span>
                      </label>
                    );
                  })}
                  {services.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">{t('لا توجد خدمات بعد')}</div>}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.service_id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm text-slate-700">{it.service_name}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.price}
                      onChange={(e) => updatePrice(it.service_id, Number(e.target.value) || 0)}
                      className="input w-28 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleService(it.service_id)}
                      title={t('إزالة')}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-800">
                  <span>{t('الإجمالي (شامل الضريبة)')}</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>
            )}
          </div>

          {/* رسالة الدفع */}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('رسالة تعليمات الدفع (تظهر أسفل العرض، قابلة للتحرير)')}</span>
            <textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} rows={2} className="input resize-none" />
          </label>
        </div>

        <button
          type="button"
          disabled={submitting || !customerId || items.length === 0}
          onClick={submit}
          className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ الإنشاء…') : t('إنشاء عرض السعر')}
        </button>
      </div>
    </div>
  );
}
