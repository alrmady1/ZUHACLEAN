import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { X, Plus, Wallet, Receipt, FileText, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Expense, CustodyInvoice, Profile, PaymentMethodOption } from '../../shared/types.js';
import { CUSTODY_CATEGORY_NAME, ROLE_LABELS_AR } from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

interface HolderSummary {
  holderId: string;
  name: string;
  profile?: Profile;
  given: number;
  spent: number;
  remaining: number;
  grants: Expense[];
  invoices: CustodyInvoice[];
}

// Rendered as a tab inside the Expenses page (src/client/pages/Expenses.tsx)
// — a per-employee custody ledger on a debit/credit (مدين/دائن) basis:
// custody handed to them is a debit, invoices they submit against it are a
// credit, and the remaining balance is debit − credit.
//
// Custody is granted from here (new grant, or topping up an existing
// employee's balance) — not from the general expenses form — even though
// both end up stored the same way (an Expense with category ===
// CUSTODY_CATEGORY_NAME), so all the existing totals/reports keep working.
export function CustodyTab() {
  const { user, allProfiles } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invoices, setInvoices] = useState<CustodyInvoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [openHolderId, setOpenHolderId] = useState<string | null>(null);
  const [showNewGrant, setShowNewGrant] = useState(false);

  function refresh() {
    api.get<Expense[]>('/expenses').then(setExpenses);
    api.get<CustodyInvoice[]>('/custody-invoices').then(setInvoices);
  }

  useEffect(() => {
    refresh();
    api.get<PaymentMethodOption[]>('/payment-methods').then(setPaymentMethods);
  }, []);

  const holders = useMemo(() => {
    const map = new Map<string, HolderSummary>();
    for (const e of expenses) {
      if (e.category !== CUSTODY_CATEGORY_NAME || !e.custody_holder_id) continue;
      const id = e.custody_holder_id;
      const existing = map.get(id) ?? {
        holderId: id,
        name: e.custody_holder_name ?? 'موظف',
        profile: allProfiles.find((p) => p.id === id),
        given: 0,
        spent: 0,
        remaining: 0,
        grants: [],
        invoices: [],
      };
      existing.given += e.amount;
      existing.grants.push(e);
      map.set(id, existing);
    }
    for (const inv of invoices) {
      const existing = map.get(inv.custody_holder_id);
      if (!existing) continue; // an invoice without a matching custody grant shouldn't happen, skip defensively
      existing.spent += inv.amount;
      existing.invoices.push(inv);
    }
    for (const h of map.values()) h.remaining = h.given - h.spent;
    return Array.from(map.values()).sort((a, b) => b.remaining - a.remaining);
  }, [expenses, invoices, allProfiles]);

  const openHolder = holders.find((h) => h.holderId === openHolderId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">العهد</h2>
          <p className="text-sm text-slate-400">
            عهدة كل موظف على أساس مدين ودائن: العهدة المستلمة مدين، والفواتير المدخلة دائن، والفرق بينهما هو الرصيد المتبقي
          </p>
        </div>
        <button
          onClick={() => setShowNewGrant(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> عهدة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {holders.map((h) => (
          <button
            key={h.holderId}
            onClick={() => setOpenHolderId(h.holderId)}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-start transition hover:border-brand-300 hover:shadow-sm"
          >
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {h.name.trim().charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">{h.name}</div>
                {h.profile && <div className="text-xs text-slate-400">{ROLE_LABELS_AR[h.profile.role]}</div>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 px-2 py-2">
                <div className="text-[11px] text-slate-400">مدين</div>
                <div className="text-sm font-semibold text-slate-700">{formatMoney(h.given)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-2 py-2">
                <div className="text-[11px] text-slate-400">دائن</div>
                <div className="text-sm font-semibold text-slate-700">{formatMoney(h.spent)}</div>
              </div>
              <div className={`rounded-xl px-2 py-2 ${h.remaining >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="text-[11px] text-slate-400">المتبقي</div>
                <div className={`text-sm font-semibold ${h.remaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMoney(h.remaining)}
                </div>
              </div>
            </div>
          </button>
        ))}
        {holders.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            لا توجد عهد مسجّلة بعد — اضغط "عهدة جديدة" أعلاه لبدء عهدة موظف
          </div>
        )}
      </div>

      {openHolder && (
        <HolderDetail
          holder={openHolder}
          allProfiles={allProfiles}
          paymentMethods={paymentMethods}
          recordedById={user?.id}
          recordedByName={user?.full_name}
          onClose={() => setOpenHolderId(null)}
          onChanged={refresh}
        />
      )}

      {showNewGrant && (
        <GrantForm
          profiles={allProfiles}
          paymentMethods={paymentMethods}
          recordedById={user?.id}
          recordedByName={user?.full_name}
          onClose={() => setShowNewGrant(false)}
          onSaved={() => {
            setShowNewGrant(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function HolderDetail({
  holder,
  allProfiles,
  paymentMethods,
  recordedById,
  recordedByName,
  onClose,
  onChanged,
}: {
  holder: HolderSummary;
  allProfiles: Profile[];
  paymentMethods: PaymentMethodOption[];
  recordedById?: string;
  recordedByName?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/custody-invoices', {
        custody_holder_id: holder.holderId,
        title: form.get('title'),
        amount: Number(form.get('amount')),
        invoice_number: form.get('invoice_number') || undefined,
        date: form.get('date'),
        notes: form.get('notes') || undefined,
        recorded_by: recordedById,
        recorded_by_name: recordedByName,
      });
      setShowInvoiceForm(false);
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  const timeline = [
    ...holder.grants.map((g) => ({ kind: 'grant' as const, date: g.date, title: g.title, amount: g.amount, ref: undefined as string | undefined })),
    ...holder.invoices.map((i) => ({ kind: 'invoice' as const, date: i.date, title: i.title, amount: i.amount, ref: i.invoice_number })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {holder.name.trim().charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{holder.name}</h2>
              {holder.profile && <p className="text-xs text-slate-400">{ROLE_LABELS_AR[holder.profile.role]}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-[11px] text-slate-400">
              <Wallet className="h-3 w-3" /> مدين (عهدة مستلمة)
            </div>
            <div className="text-base font-bold text-slate-800">{formatMoney(holder.given)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-[11px] text-slate-400">
              <Receipt className="h-3 w-3" /> دائن (فواتير مخصومة)
            </div>
            <div className="text-base font-bold text-slate-800">{formatMoney(holder.spent)}</div>
          </div>
          <div className={`rounded-xl p-3 text-center ${holder.remaining >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <div className="mb-1 text-[11px] text-slate-400">الرصيد المتبقي</div>
            <div className={`text-base font-bold ${holder.remaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {formatMoney(holder.remaining)}
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">سجل الحركات</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              <TrendingUp className="h-3.5 w-3.5" /> زيادة العهدة
            </button>
            <button
              onClick={() => setShowInvoiceForm(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> إضافة فاتورة لخصمها من العهدة
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
                <th className="p-3 text-start font-medium">التاريخ</th>
                <th className="p-3 text-start font-medium">البيان</th>
                <th className="p-3 text-start font-medium">رقم الفاتورة</th>
                <th className="p-3 text-start font-medium">النوع</th>
                <th className="p-3 text-start font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t, idx) => (
                <tr key={idx} className="border-b border-slate-50 last:border-0">
                  <td className="p-3 text-slate-600">{formatDateAr(t.date)}</td>
                  <td className="p-3 font-medium text-slate-700">{t.title}</td>
                  <td className="p-3 text-slate-500">{t.ref ?? '—'}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.kind === 'grant' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}
                    >
                      {t.kind === 'grant' ? 'مدين' : 'دائن'}
                    </span>
                  </td>
                  <td className={`p-3 font-semibold ${t.kind === 'grant' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {t.kind === 'grant' ? '+' : '-'}
                    {formatMoney(t.amount)}
                  </td>
                </tr>
              ))}
              {timeline.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    لا توجد حركات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvoiceForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">فاتورة جديدة — خصم من عهدة {holder.name}</h2>
              <button type="button" onClick={() => setShowInvoiceForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1.5 font-medium text-slate-600">
                  البيان <FileText className="h-3.5 w-3.5 text-brand-500" />
                </span>
                <input name="title" required className="input" placeholder="مثال: فاتورة قطع غيار سيارة" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">المبلغ (ر.س)</span>
                  <input type="number" name="amount" min={0} step="0.01" required className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-600">التاريخ</span>
                  <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">رقم الفاتورة (اختياري)</span>
                <input name="invoice_number" className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">ملاحظات (اختياري)</span>
                <textarea name="notes" rows={2} className="input resize-none" />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'جارِ الحفظ…' : 'حفظ الفاتورة وخصمها من العهدة'}
            </button>
          </form>
        </div>
      )}

      {showTopUp && (
        <GrantForm
          holderId={holder.holderId}
          holderName={holder.name}
          profiles={allProfiles}
          paymentMethods={paymentMethods}
          recordedById={recordedById}
          recordedByName={recordedByName}
          zIndexTop
          onClose={() => setShowTopUp(false)}
          onSaved={() => {
            setShowTopUp(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// Grants custody — either a brand-new grant (pick an employee) or a top-up
// for a known employee (holderId/holderName pre-filled, no picker shown).
// Both are stored the same way: an Expense with category ===
// CUSTODY_CATEGORY_NAME, so they show up as "مدين" entries either way.
function GrantForm({
  holderId,
  holderName,
  profiles,
  paymentMethods,
  recordedById,
  recordedByName,
  zIndexTop,
  onClose,
  onSaved,
}: {
  holderId?: string;
  holderName?: string;
  profiles: Profile[];
  paymentMethods: PaymentMethodOption[];
  recordedById?: string;
  recordedByName?: string;
  zIndexTop?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const isTopUp = Boolean(holderId);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const targetId = holderId || String(form.get('custody_holder_id'));
    const targetProfile = profiles.find((p) => p.id === targetId);
    try {
      await api.post('/expenses', {
        title: form.get('title') || (isTopUp ? `زيادة عهدة ${holderName}` : 'عهدة جديدة'),
        category: CUSTODY_CATEGORY_NAME,
        amount: Number(form.get('amount')),
        date: form.get('date'),
        payment_method: form.get('payment_method'),
        custody_holder_id: targetId,
        custody_holder_name: holderName ?? targetProfile?.full_name,
        recorded_by: recordedById,
        recorded_by_name: recordedByName,
        notes: form.get('notes') || undefined,
      });
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4 ${zIndexTop ? 'z-[60]' : 'z-50'}`}>
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{isTopUp ? `زيادة عهدة ${holderName}` : 'عهدة جديدة'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          {!isTopUp && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">الموظف</span>
              <select name="custody_holder_id" required className="input">
                <option value="">اختر موظف</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} — {ROLE_LABELS_AR[p.role]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">البيان (اختياري)</span>
            <input name="title" className="input" placeholder={isTopUp ? `مثال: زيادة عهدة ${holderName}` : 'مثال: عهدة شهر أغسطس'} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">المبلغ (ر.س)</span>
              <input type="number" name="amount" min={0} step="0.01" required className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">التاريخ</span>
              <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">طريقة الدفع</span>
            <select name="payment_method" required className="input">
              {paymentMethods
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">ملاحظات (اختياري)</span>
            <textarea name="notes" rows={2} className="input resize-none" />
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'جارِ الحفظ…' : isTopUp ? 'حفظ الزيادة' : 'حفظ العهدة الجديدة'}
        </button>
      </form>
    </div>
  );
}
