import { useState } from 'react';
import { Receipt as SalesIcon, Wallet as ExpensesIcon, Users as EmployeesIcon, Percent as CommissionsIcon } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import Sales from './Sales.js';
import Expenses from './Expenses.js';
import { EmployeeAccountsTab } from './EmployeeAccounts.js';
import { CommissionsDashboardTab } from './Commissions.js';

type Tab = 'sales' | 'expenses' | 'employees' | 'commissions';

// صفحة "المحاسبة" — تجمع "المبيعات والفواتير" و"المصروفات" (كانتا
// صفحتين مستقلتين في القائمة الجانبية) وتبويبي "كشف حساب الموظفين"
// و"العمولات" تحت أربعة تبويبات هنا، دون تعديل الصفحات الفرعية نفسها —
// تُستدعَى كل واحدة كما هي بكامل منطقها الداخلي. من يملك صلاحية واحدة
// فقط من الأربع يرى تبويبها مباشرة بلا مبدّل تبويبات أصلاً.
export default function Accounting() {
  const { t } = useI18n();
  const { can } = useAuth();
  const canSales = can('view_sales_invoices');
  const canExpenses = can('view_expenses_page');
  const canEmployees = can('view_employee_accounts');
  const canCommissions = can('view_commissions');
  const availableCount = [canSales, canExpenses, canEmployees, canCommissions].filter(Boolean).length;
  const [tab, setTab] = useState<Tab>(canSales ? 'sales' : canExpenses ? 'expenses' : canEmployees ? 'employees' : 'commissions');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('المحاسبة')}</h1>
        <p className="text-sm text-slate-400">{t('المبيعات والفواتير والمصروفات وكشف حساب الموظفين والعمولات في مكان واحد')}</p>
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
          {canCommissions && (
            <button
              onClick={() => setTab('commissions')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'commissions' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <CommissionsIcon className="h-4 w-4" /> {t('العمولات')}
            </button>
          )}
        </div>
      )}

      {tab === 'sales' && canSales && <Sales />}
      {tab === 'expenses' && canExpenses && <Expenses />}
      {tab === 'employees' && canEmployees && <EmployeeAccountsTab />}
      {tab === 'commissions' && canCommissions && <CommissionsDashboardTab />}
    </div>
  );
}
