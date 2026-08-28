import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Eye, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, Service, Quote } from '../../shared/types.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import NewQuoteFlow from '../components/NewQuoteFlow.js';
import QuoteDocument from '../components/QuoteDocument.js';

// صفحة مستقلة (كانت تبويباً داخل صفحة العقود) — إنشاء عرض سعر لعميل
// موجود أو جديد قبل الالتزام بموعد أو عقد فعلي. عروض الأسعار مستقلة
// تماماً عن العقود والمواعيد، مجرد اقتراح سعر قابل للطباعة والإرسال.
export default function Quotes() {
  const { user, can } = useAuth();
  const { t, tt } = useI18n();
  const canCreateQuote = can('create_quotes');
  const canViewPrintQuote = can('view_print_quotes');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [viewingQuote, setViewingQuote] = useState<Quote | null>(null);

  function refreshQuotes() {
    api.get<Quote[]>('/quotes').then(setQuotes);
  }

  useEffect(() => {
    refreshQuotes();
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<Service[]>('/services').then(setServices);
  }, []);

  async function deleteQuote(q: Quote) {
    if (!window.confirm(tt(`حذف عرض السعر ${q.quote_number} نهائياً؟`, `Delete quote ${q.quote_number} permanently?`))) return;
    await api.del(`/quotes/${q.id}`);
    refreshQuotes();
  }

  // مخفية عن أي دور لا يملك هذه الصلاحية — حتى لو دخل الرابط مباشرة.
  if (user && !can('view_quotes_page')) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('عروض الأسعار')}</h1>
          <p className="text-sm text-slate-400">{t('إنشاء عرض سعر لعميل قبل الالتزام بموعد أو عقد')}</p>
        </div>
        {canCreateQuote && (
          <button
            onClick={() => setShowNewQuote(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('إنشاء عرض سعر')}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">{t('رقم العرض')}</th>
              <th className="p-3 text-start font-medium">{t('العميل')}</th>
              <th className="p-3 text-start font-medium">{t('المسار')}</th>
              <th className="p-3 text-start font-medium">{t('التاريخ')}</th>
              <th className="p-3 text-start font-medium">{t('القيمة')}</th>
              <th className="p-3 text-start font-medium">{t('إجراء')}</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr
                key={q.id}
                onClick={() => canViewPrintQuote && setViewingQuote(q)}
                className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 ${canViewPrintQuote ? 'cursor-pointer' : ''}`}
              >
                <td className="p-3 font-medium text-slate-700">{q.quote_number}</td>
                <td className="p-3 text-slate-600">{q.customer_name_snapshot}</td>
                <td className="p-3 text-slate-600">{q.path_type === 'contract' ? t('عقد متعدد الزيارات') : t('زيارة مرة واحدة')}</td>
                <td className="p-3 text-slate-600" dir="ltr">{formatDateAr(q.issue_date)}</td>
                <td className="p-3 text-slate-600">{formatMoney(q.total)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    {canViewPrintQuote && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingQuote(q);
                        }}
                        title={t('عرض / طباعة')}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteQuote(q);
                      }}
                      title={t('حذف عرض السعر')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  {t('لا توجد عروض أسعار بعد')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canCreateQuote && showNewQuote && (
        <NewQuoteFlow
          customers={customers}
          services={services}
          onClose={() => setShowNewQuote(false)}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onCreated={(quote) => {
            setShowNewQuote(false);
            refreshQuotes();
            setViewingQuote(quote);
          }}
        />
      )}

      {/* لا تُقيَّد بـ view_print_quotes عمداً — من أنشأ عرضاً للتو (بصلاحية
          create_quotes) يجب أن يرى مستنده فوراً للطباعة/الإرسال، حتى لو لم
          يملك صلاحية استعراض عروض الآخرين القائمة في الجدول (المقيَّدة
          أعلاه بزر العين والنقر على الصف). */}
      {viewingQuote && <QuoteDocument quote={viewingQuote} onClose={() => setViewingQuote(null)} />}
    </div>
  );
}
