import { useEffect, useState, type FormEvent } from 'react';
import { X, Wallet, Share2, Landmark, Link2, Copy, Check, MessageCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Appointment, Customer, Invoice, PaymentMethodOption, CompanyBankAccount } from '../../shared/types.js';
import { VAT_RATE, COMPANY_LEGAL_NAME } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import InvoiceDocument from './InvoiceDocument.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { generateBankAccountImage, shareOrDownloadImage } from '../lib/bankAccountShare.js';
import { waLink } from '../lib/whatsapp.js';

// تسمية عرض مختصرة لكل حالة تمارا — TAMARA_STATUS_LABELS[undefined] غير
// مستخدَم عمداً (لا قسم تمارا يظهر أصلاً بلا tamara_status، انظر الأسفل).
const TAMARA_STATUS_LABELS: Record<NonNullable<Appointment['tamara_status']>, string> = {
  created: 'بانتظار العميل',
  approved: 'وافقت تمارا — بانتظار التحصيل النهائي',
  paid: 'تم الدفع عبر تمارا',
  declined: 'رفضت تمارا الطلب',
  expired: 'انتهت صلاحية رابط الدفع',
  canceled: 'أُلغي الطلب',
};

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
  const [bankAccount, setBankAccount] = useState<CompanyBankAccount | null>(null);
  const [sharingBankAccount, setSharingBankAccount] = useState(false);

  // حالة طلب الدفع عبر تمارا — تبدأ من قيم الموعد نفسه (طلب سابق قد يكون
  // قائماً بالفعل من فتحة سابقة لهذه النافذة)، وتُحدَّث محلياً فور إنشاء
  // طلب جديد بدون حاجة لإغلاق النافذة أو إعادة تحميل الصفحة.
  const [tamaraStatus, setTamaraStatus] = useState(appointment.tamara_status);
  const [tamaraUrl, setTamaraUrl] = useState(appointment.tamara_checkout_url);
  const [tamaraSending, setTamaraSending] = useState(false);
  const [tamaraError, setTamaraError] = useState('');
  const [tamaraCopied, setTamaraCopied] = useState(false);
  // قبل إنشاء أي طلب: نسأل دائماً هل نُكمل برقم العميل المسجَّل أم برقم
  // آخر (بعض العملاء يحجزون برقم ويفضّلون استلام رابط الدفع على رقم
  // آخر) — 'ask' يعرض الخيارين، 'custom-phone' يعرض حقل إدخال الرقم
  // البديل. بلا رقم مسجَّل أصلاً نقفز لـ'custom-phone' مباشرة، إذ لا معنى
  // لخيار "استكمال بهذا الرقم" عندها.
  const [tamaraStep, setTamaraStep] = useState<'idle' | 'ask' | 'custom-phone'>('idle');
  const [tamaraCustomPhone, setTamaraCustomPhone] = useState('');

  function startTamaraFlow() {
    setTamaraError('');
    setTamaraStep(customer?.phone ? 'ask' : 'custom-phone');
  }

  async function handleTamaraRequest(phone: string) {
    if (!phone.trim()) return;
    setTamaraSending(true);
    setTamaraError('');
    try {
      const updated = await api.post<Appointment>(`/appointments/${appointment.id}/tamara-request`, { phone: phone.trim() });
      setTamaraStatus(updated.tamara_status);
      setTamaraUrl(updated.tamara_checkout_url);
      setTamaraStep('idle');
    } catch (err) {
      setTamaraError(err instanceof Error ? err.message : 'تعذّر إنشاء طلب الدفع عبر تمارا');
    } finally {
      setTamaraSending(false);
    }
  }

  async function handleCopyTamaraLink() {
    if (!tamaraUrl) return;
    try {
      await navigator.clipboard.writeText(tamaraUrl);
      setTamaraCopied(true);
      setTimeout(() => setTamaraCopied(false), 2000);
    } catch {
      /* المتصفح يمنع الوصول للحافظة (نادر) — الرابط يبقى ظاهراً للنسخ يدوياً */
    }
  }

  // تُجلَب بيانات الحساب البنكي فقط عند اختيار "حوالة بنكية" — لا داعي
  // لطلبها إن لم يحتَجها المستخدم إطلاقاً.
  useEffect(() => {
    if (method !== 'bank_transfer' || bankAccount) return;
    api.get<CompanyBankAccount>('/company-bank-account').then(setBankAccount);
  }, [method, bankAccount]);

  async function handleShareBankAccount() {
    if (!bankAccount) return;
    setSharingBankAccount(true);
    try {
      const blob = await generateBankAccountImage(bankAccount, COMPANY_LEGAL_NAME);
      await shareOrDownloadImage(
        blob,
        'بيانات-الحساب-البنكي.png',
        t('بيانات الحساب البنكي'),
        t('بيانات الحساب البنكي لإتمام الحوالة'),
      );
    } finally {
      setSharingBankAccount(false);
    }
  }

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

          {method === 'bank_transfer' && (
            <div className="rounded-xl bg-slate-50 p-3">
              {!bankAccount ? (
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Landmark className="h-3.5 w-3.5" /> {t('جارِ التحميل…')}
                </p>
              ) : !bankAccount.iban ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-600">
                  <Landmark className="h-3.5 w-3.5 shrink-0" />
                  {t('لم يتم إدخال بيانات الحساب البنكي بعد — أضفها من الإعدادات ← طرق الدفع')}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleShareBankAccount}
                  disabled={sharingBankAccount}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  {sharingBankAccount ? t('جارِ التجهيز…') : t('مشاركة بيانات الحساب البنكي')}
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !method || amount <= 0}
          className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ التحصيل…') : t('تأكيد الدفع وإصدار الفاتورة')}
        </button>

        {/* =================== طلب دفع عبر تمارا (تقسيط) ===================
            مسار منفصل تماماً عن زر "تأكيد الدفع" أعلاه: لا يُحصِّل شيئاً
            الآن، فقط ينشئ رابط دفع يُرسَل للعميل — التحصيل الفعلي وإصدار
            الفاتورة يحدثان تلقائياً لاحقاً عند وصول تأكيد تمارا (ويب هوك)،
            فتظهر الدفعة حينها في سجل هذا الموعد بطريقة الدفع "تمارا" تماماً
            كأي دفعة أخرى. */}
        {appointment.remaining_amount > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-center text-xs text-slate-400">{t('أو')}</p>
            {(!tamaraUrl || tamaraStatus === 'declined' || tamaraStatus === 'expired' || tamaraStatus === 'canceled') &&
            tamaraStep === 'idle' ? (
              <button
                type="button"
                onClick={startTamaraFlow}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Link2 className="h-3.5 w-3.5" style={{ color: '#5433a7' }} />
                {tamaraStatus ? t('إنشاء طلب دفع جديد عبر تمارا') : t('أرسل طلب دفع عبر تمارا (تقسيط)')}
              </button>
            ) : tamaraStep === 'ask' ? (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs font-semibold text-slate-600">
                  {t('إرسال رابط الدفع لرقم العميل المسجَّل')} <span dir="ltr">({customer!.phone})</span>؟
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleTamaraRequest(customer!.phone)}
                    disabled={tamaraSending}
                    className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {tamaraSending ? t('جارِ الإرسال…') : t('استكمال بهذا الرقم')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTamaraStep('custom-phone')}
                    disabled={tamaraSending}
                    className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {t('إضافة رقم آخر')}
                  </button>
                </div>
              </div>
            ) : tamaraStep === 'custom-phone' ? (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-slate-600">{t('رقم الجوال لإرسال رابط الدفع إليه')}</span>
                  <input
                    value={tamaraCustomPhone}
                    onChange={(e) => setTamaraCustomPhone(e.target.value)}
                    dir="ltr"
                    placeholder="05XXXXXXXX"
                    autoFocus
                    className="input text-xs"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleTamaraRequest(tamaraCustomPhone)}
                    disabled={!tamaraCustomPhone.trim() || tamaraSending}
                    className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {tamaraSending ? t('جارِ الإرسال…') : t('إرسال لهذا الرقم')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTamaraStep(customer?.phone ? 'ask' : 'idle')}
                    disabled={tamaraSending}
                    className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {t('رجوع')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">
                  {tamaraStatus ? TAMARA_STATUS_LABELS[tamaraStatus] : ''}
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    dir="ltr"
                    value={tamaraUrl}
                    onClick={(e) => e.currentTarget.select()}
                    className="input flex-1 text-[11px] text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleCopyTamaraLink}
                    title={t('نسخ الرابط')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                  >
                    {tamaraCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {customer?.phone && (
                  <a
                    href={waLink(
                      customer.phone,
                      `مرحباً ${customer.name}، تقدر تكمل دفع مبلغ ${formatMoney(appointment.remaining_amount)} عبر تمارا (تقسيط) من الرابط:\n${tamaraUrl}`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {t('إرسال الرابط عبر واتساب')}
                  </a>
                )}
              </div>
            )}
            {tamaraError && <p className="mt-2 text-center text-xs text-red-600">{tamaraError}</p>}
          </div>
        )}
      </form>
    </div>
  );
}
