import { useState } from 'react';
import { Receipt as SalesIcon, Wallet as ExpensesIcon } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import Sales from './Sales.js';
import Expenses from './Expenses.js';

// صفحة "المحاسبة" — تجمع "المبيعات والفواتير" و"المصروفات" (كانتا
// صفحتين مستقلتين في القائمة الجانبية) تحت تبويبين هنا، دون تعديل أي
// من الصفحتين نفسيهما — تُستدعَيان كما هما بكامل منطقهما الداخلي (تقارير
// المبيعات، الفواتير، العهد، المصروفات العامة). من يملك صلاحية واحدة
// فقط من الاثنتين يرى تبويبها مباشرة بلا مبدّل تبويبات أصلاً.
export default function Accounting() {
  const { t } = useI18n();
  const { can } = useAuth();
  const canSales = can('view_sales_invoices');
  const canExpenses = can('view_expenses_page');
  const [tab, setTab] = useState<'sales' | 'expenses'>(canSales ? 'sales' : 'expenses');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('المحاسبة')}</h1>
        <p className="text-sm text-slate-400">{t('المبيعات والفواتير والمصروفات في مكان واحد')}</p>
      </div>

      {canSales && canExpenses && (
        <div className="flex w-fit flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
          <button
            onClick={() => setTab('sales')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'sales' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <SalesIcon className="h-4 w-4" /> {t('المبيعات')}
          </button>
          <button
            onClick={() => setTab('expenses')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'expenses' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
          >
            <ExpensesIcon className="h-4 w-4" /> {t('المصروفات')}
          </button>
        </div>
      )}

      {tab === 'sales' && canSales && <Sales />}
      {tab === 'expenses' && canExpenses && <Expenses />}
    </div>
  );
}
