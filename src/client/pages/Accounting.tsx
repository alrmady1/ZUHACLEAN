import { useState } from 'react';
import {
  Receipt as SalesIcon,
  Wallet as ExpensesIcon,
  Users as EmployeesIcon,
  Percent as CommissionsIcon,
  Landmark as TaxIcon,
  FileSignature as ContractsIcon,
  Boxes as InventoryIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import Sales from './Sales.js';
import Expenses from './Expenses.js';
import { EmployeeAccountsTab } from './EmployeeAccounts.js';
import { CommissionsDashboardTab } from './Commissions.js';
import { TaxTab } from './Tax.js';
import Contracts from './Contracts.js';
import { InventoryTab } from './Inventory.js';

type Tab = 'sales' | 'expenses' | 'employees' | 'commissions' | 'tax' | 'contracts' | 'inventory';

// صفحة "المحاسبة" — تجمع "المبيعات والفواتير" و"المصروفات" (كانتا
// صفحتين مستقلتين في القائمة الجانبية) وتبويبي "الموظفين" (كانت "كشف حساب
// الموظفين") و"العمولات" و"العقود" (لا تزال أيضاً رابطاً مستقلاً في القائمة
// الجانبية، خلافاً للأربعة الأولى — أُضيفت هنا إضافة لمكانها الأصلي وليس
// بدلاً عنه) تحت التبويبات هنا، دون تعديل الصفحات الفرعية نفسها — تُستدعَى
// كل واحدة كما هي بكامل منطقها الداخلي. من يملك صلاحية واحدة فقط يرى
// تبويبها مباشرة بلا مبدّل تبويبات أصلاً.
export default function Accounting() {
  const { t } = useI18n();
  const { can } = useAuth();
  const canSales = can('view_sales_invoices');
  // لا تمنح وحدها رؤية التقارير المالية/سجل الفواتير الكامل — فقط تفتح
  // تبويب "المبيعات" ليصل صاحبها لبطاقة "خصم المناسبة" داخل Sales.tsx
  // (التي تتولى هي نفسها إخفاء بقية الصفحة عمن لا يملك canSales).
  const canManageDiscount = can('manage_sales_discount');
  const canExpenses = can('view_expenses_page');
  const canEmployees = can('view_employee_accounts');
  const canCommissions = can('view_commissions');
  const canTax = can('view_tax_page');
  const canContracts = can('view_contracts_page');
  const canInventory = can('view_inventory_page');
  const canSalesTab = canSales || canManageDiscount;
  const availableCount = [canSalesTab, canExpenses, canEmployees, canCommissions, canTax, canContracts, canInventory].filter(Boolean).length;
  const [tab, setTab] = useState<Tab>(
    canSalesTab
      ? 'sales'
      : canExpenses
        ? 'expenses'
        : canEmployees
          ? 'employees'
          : canCommissions
            ? 'commissions'
            : canTax
              ? 'tax'
              : canContracts
                ? 'contracts'
                : 'inventory',
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('المحاسبة')}</h1>
        <p className="text-sm text-slate-400">{t('المبيعات والفواتير والمصروفات والموظفين والعمولات والضريبة والعقود في مكان واحد')}</p>
      </div>

      {availableCount > 1 && (
        <div className="flex w-fit flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
          {canSalesTab && (
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
              <EmployeesIcon className="h-4 w-4" /> {t('الموظفين')}
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
          {canInventory && (
            <button
              onClick={() => setTab('inventory')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'inventory' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}
            >
              <InventoryIcon className="h-4 w-4" /> {t('الجرد والأصول الثابتة')}
            </button>
          )}
        </div>
      )}

      {tab === 'sales' && canSalesTab && <Sales />}
      {tab === 'expenses' && canExpenses && <Expenses />}
      {tab === 'employees' && canEmployees && <EmployeeAccountsTab />}
      {tab === 'commissions' && canCommissions && <CommissionsDashboardTab />}
      {tab === 'tax' && canTax && <TaxTab />}
      {tab === 'contracts' && canContracts && <Contracts allowCreate={false} />}
      {tab === 'inventory' && canInventory && <InventoryTab />}
    </div>
  );
}
