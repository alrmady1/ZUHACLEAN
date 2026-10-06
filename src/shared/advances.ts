import type { Expense } from './types.js';

export function advanceRemaining(advance: Expense): number {
  return advance.amount - (advance.advance_settled_amount ?? 0);
}

// مسدَّدة بالكامل. سلفية بلا جدولة استقطاع (advance_settled_amount = 0)
// تبقى غير مسدَّدة حتى يُصحَّح سدادها يدوياً — فتظل ظاهرة كمرحَّلة.
export function isAdvanceSettled(advance: Expense): boolean {
  return advanceRemaining(advance) <= 0.005;
}

// ما يظهر في حسابات الموظف/الراتب: سلفيات هذا الشهر (حتى لو سُدِّدت)
// والمرحَّلة من أشهر سابقة غير المسدَّدة بعد. المسدَّدة من أشهر سابقة
// تنتقل لسجل السلفيات المسدَّدة. month بصيغة YYYY-MM.
export function isAdvanceCurrent(advance: Expense, month: string): boolean {
  return !isAdvanceSettled(advance) || advance.date.startsWith(month);
}
