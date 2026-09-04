import { useState } from 'react';
import { Receipt as SalesIcon, Wallet as ExpensesIcon, Users as EmployeesIcon } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import Sales from './Sales.js';
import Expenses from './Expenses.js';
import { EmployeeAccountsTab } from './EmployeeAccounts.js';

type Tab = 'sales' | 'expenses' | 'employees';

// صفحة "المحاسبة" — تجمع "المبيعات والفواتير" و"المصروفات" (كانتا
// صفحتين مستقلتين في القائمة الجانبية) وتبويب "كشف حساب الموظفين" تحت
// ثلاثة تبويبات هنا، دون تعديل المبيعات/المصروفات نفسيهما — تُستدعَيان
// كما هما بكامل منطقهما الداخلي (تقارير المبيعات، الفواتير، العهد،
// المصروفات العامة). من يملك صلاحية واحدة فقط من الثلاث يرى تبويبها
// مباشرة بلا مبدّل تبويبات أصلاً.
export default function Accounting() {
  const { t } = useI18n();
  const { can } = useAuth();
  const canSales = can('view_sales_invoices');
  const canExpenses = can('view_expenses_page');
  const canEmployees = can('view_employee_accounts');
  const availableCount = [canSales, canExpenses, canEmployees].filter(Boolean).length;
  const [tab, setTab] = useState<Tab>(canSales ? 'sales' : canExpenses ? 'expenses' : 'employees');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('المحاسبة')}</h1>
        <p className="text-sm text-slate-400">{t('المبيعات والفواتير والمصروفات وكشف حساب الموظفين في مكان واحد')}</p>
      </div>

      {availableCount > 1 && (
        <div className="flex w-fit flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
          {canSales && (
            <button
              onClick={() => setTab('sales')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'sales' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <SalesIcon className="h-4 w-4" /> {t('المبيعات')}
            </button>
          )}
          {canExpenses && (
            <button
              onClick={() => setTab('expenses')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'expenses' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <ExpensesIcon className="h-4 w-4" /> {t('المصروفات')}
            </button>
          )}
          {canEmployees && (
            <button
              onClick={() => setTab('employees')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'employees' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <EmployeesIcon className="h-4 w-4" /> {t('كشف حساب الموظفين')}
            </button>
          )}
        </div>
      )}

      {tab === 'sales' && canSales && <Sales />}
      {tab === 'expenses' && canExpenses && <Expenses />}
      {tab === 'employees' && canEmployees && <EmployeeAccountsTab />}
    </div>
  );
}
