import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import type { CustodyTransaction } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';

export default function Custody() {
  const { allProfiles } = useAuth();
  const [transactions, setTransactions] = useState<CustodyTransaction[]>([]);

  useEffect(() => {
    api.get<CustodyTransaction[]>('/custody-transactions').then(setTransactions);
  }, []);

  const employees = allProfiles.filter((p) => p.is_active);

  const balances = useMemo(() => {
    const m = new Map<string, { received: number; spent: number }>();
    for (const t of transactions) {
      const entry = m.get(t.employee_id) ?? { received: 0, spent: 0 };
      if (t.type === 'receipt') entry.received += t.amount;
      else entry.spent += t.amount;
      m.set(t.employee_id, entry);
    }
    return m;
  }, [transactions]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">عُهد الموظفين</h1>
        <p className="text-sm text-slate-400">
          كشف حساب مدين/دائن لكل موظف — مدين: مبالغ عهدة مستلمة، دائن: مبالغ مصروفة بموجب فواتير
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-3 text-start font-medium">الموظف</th>
              <th className="p-3 text-start font-medium">إجمالي المستلم (مدين)</th>
              <th className="p-3 text-start font-medium">إجمالي المصروف (دائن)</th>
              <th className="p-3 text-start font-medium">المتبقي من العهدة</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((p) => {
              const { received, spent } = balances.get(p.id) ?? { received: 0, spent: 0 };
              const remaining = received - spent;
              return (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="p-3 font-medium text-slate-700">{p.full_name}</td>
                  <td className="p-3 text-slate-600">{formatMoney(received)}</td>
                  <td className="p-3 text-slate-600">{formatMoney(spent)}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        remaining > 0
                          ? 'bg-amber-100 text-amber-700'
                          : remaining < 0
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {formatMoney(remaining)}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link
                      to={`/custody/${p.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                    >
                      كشف الحساب <ChevronLeft className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  لا يوجد موظفون نشطون
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
