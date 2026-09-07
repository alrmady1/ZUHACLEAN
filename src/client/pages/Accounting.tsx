import { useState } from 'react';
import {
  Receipt as SalesIcon,
  Wallet as ExpensesIcon,
  Users as EmployeesIcon,
  Percent as CommissionsIcon,
  Landmark as TaxIcon,
  FileSignature as ContractsIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import Sales from './Sales.js';
import Expenses from './Expenses.js';
import { EmployeeAccountsTab } from './EmployeeAccounts.js';
import { CommissionsDashboardTab } from './Commissions.js';
import { TaxTab } from './Tax.js';
import Contracts from './Contracts.js';

type Tab = 'sales' | 'expenses' | 'employees' | 'commissions' | 'tax' | 'contracts';

// صفحة "المحاسبة" — تجمع "المبيعات والفواتير" و"المصروفات" (كانتا
// صفحتين مستقلتين في القائمة الجانبية) وتبويبي "كشف حساب الموظفين"
// و"العمولات" و"العقود" (لا تزال أيضاً رابطاً مستقلاً في القائمة الجانبية،
// خلافاً للأربعة الأولى — أُضيفت هنا إضافة لمكانها الأصلي وليس بدلاً عنه)
// تحت التبويبات هنا، دون تعديل الصفحات الفرعية نفسها — تُستدعَى كل واحدة
// كما هي بكامل منطقها الداخلي. من يملك صلاحية واحدة فقط يرى تبويبها
// مباشرة بلا مبدّل تبويبات أصلاً.
export default function Accounting() {
  const { t } = useI18n();
  const { can } = useAuth();
  const canSales = can('view_sales_invoices');
  const canExpenses = can('view_expenses_page');
  const canEmployees = can('view_employee_accounts');
  const canCommissions = can('view_commissions');
  const canTax = can('view_tax_page');
  const canContracts = can('view_contracts_page');
  const availableCount = [canSales, canExpenses, canEmployees, canCommissions, canTax, canContracts].filter(Boolean).length;
  const [tab, setTab] = useState<Tab>(
    canSales
      ? 'sales'
      : canExpenses
        ? 'expenses'
        : canEmployees
          ? 'employees'
          : canCommissions
            ? 'commissions'
            : canTax
              ? 'tax'
              : 'contracts',
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('المحاسبة')}</h1>
        <p className="text-sm text-slate-400">{t('المبيعات والفواتير والمصروفات وكشف حساب الموظفين والعمولات والضريبة والعقود في مكان واحد')}</p>
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
          {canTax && (
            <button
              onClick={() => setTab('tax')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'tax' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <TaxIcon className="h-4 w-4" /> {t('الضريبة')}
            </button>
          )}
          {canContracts && (
            <button
              onClick={() => setTab('contracts')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'contracts' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <ContractsIcon className="h-4 w-4" /> {t('العقود')}
            </button>
          )}
        </div>
      )}

      {tab === 'sales' && canSales && <Sales />}
      {tab === 'expenses' && canExpenses && <Expenses />}
      {tab === 'employees' && canEmployees && <EmployeeAccountsTab />}
      {tab === 'commissions' && canCommissions && <CommissionsDashboardTab />}
      {tab === 'tax' && canTax && <TaxTab />}
      {tab === 'contracts' && canContracts && <Contracts allowCreate={false} />}
    </div>
  );
}
