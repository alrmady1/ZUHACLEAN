import { useState, type FormEvent } from 'react';
import { X, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Invoice, PaymentMethodOption } from '../../shared/types.js';
import { VAT_RATE } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import InvoiceDocument from './InvoiceDocument.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';

export default function PayAppointmentModal({
  appointment,
  customer,
  paymentMethods,
  onClose,
  onPaid,
}: {
  appointment: Appointment;
  customer?: Customer;
  paymentMethods: PaymentMethodOption[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const activeMethods = paymentMethods.filter((m) => m.is_active);
  const [amount, setAmount] = useState(appointment.remaining_amount);
  const [method, setMethod] = useState(activeMethods[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [issuedInvoice, setIssuedInvoice] = useState<Invoice | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!method || amount <= 0) return;
    setSubmitting(true);
    try {
      // 1) Record the collection against the appointment itself (drives the
      //    السعر والدفع badge in the schedule table).
      await api.post(`/appointments/${appointment.id}/payments`, { amount, method });
      // 2) Issue a formal VAT invoice for the same amount, so paying from
      //    the schedule always leaves a proper invoice behind. Service
      //    prices are VAT-inclusive, so back out the pre-tax subtotal —
      //    /invoices still expects a pre-tax subtotal and derives vat/total
      //    from it itself.
      const fullySettled = amount >= appointment.remaining_amount;
      const subtotal = Math.round((appointment.amount / (1 + VAT_RATE)) * 100) / 100;
      const invoice = await api.post<Invoice>('/invoices', {
        customer_id: appointment.customer_id,
        appointment_id: appointment.id,
        contract_id: appointment.contract_id,
        subtotal,
        payment_status: fullySettled ? 'paid' : 'partial',
        payment_method: method,
        recorded_by: user?.id,
        recorded_by_name: user?.full_name,
      });
      onPaid();
      // Work is done and paid — show the tax invoice immediately (with its
      // barcode) instead of just closing, so it can be printed/exported now.
      setIssuedInvoice(invoice);
    } finally {
      setSubmitting(false);
    }
  }

  if (issuedInvoice) {
    return (
      <InvoiceDocument
        invoice={issuedInvoice}
        customer={customer}
        appointment={appointment}
        paymentMethods={paymentMethods}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Wallet className="h-5 w-5 text-brand-600" /> {t('تحصيل الدفعة وإصدار الفاتورة')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>{t('إجمالي مبلغ الموعد (شامل الضريبة)')}</span>
            <span className="font-semibold text-slate-800">{formatMoney(appointment.amount)}</span>
          </div>
          {appointment.total_paid > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>{t('مدفوع سابقًا')}</span>
              <span>{formatMoney(appointment.total_paid)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-slate-800">
            <span>{t('المتبقي')}</span>
            <span>{formatMoney(appointment.remaining_amount)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('المبلغ المراد تحصيله (ر.س)')}</span>
            <input
              type="number"
              min={0.01}
              max={appointment.remaining_amount}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('طريقة الدفع')}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} required className="input">
              <option value="">{t('اختر طريقة الدفع')}</option>
              {activeMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || !method || amount <= 0}
          className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ التحصيل…') : t('تأكيد الدفع وإصدار الفاتورة')}
        </button>
      </form>
    </div>
  );
}
