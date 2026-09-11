// حساب إهلاك الأصول الثابتة بطريقة القسط الثابت (Straight-Line
// Depreciation) — دالة نقية مشتركة بين الخادم (POST /assets/:id/scrap
// يحتاج القيمة الدفترية اللحظية) والعميل (عرض بطاقات المؤشرات وجدول
// الأصول في Inventory.tsx)، حتى يبقى الرقمان متطابقين دوماً. لا شيء
// مخزَّن مسبقاً — كل استدعاء يُعيد احتساب كل شيء من الحقول الخام على
// Asset، فتبقى صحيحة تلقائياً مع مرور الوقت بلا أي مهمة مجدولة.
export interface DepreciationResult {
  annual_depreciation: number;
  monthly_depreciation: number;
  months_elapsed: number;
  accumulated_depreciation: number;
  book_value: number;
}

// asOfDate: التاريخ المرجعي للاحتساب — "الآن" افتراضياً؛ مرِّر
// scrapped_at كسقف عند احتساب الإهلاك لأصل مشطوب (تجميد الإهلاك فور
// الشطب، انظر Asset.scrapped_at في shared/types.ts).
export function computeAssetDepreciation(
  purchasePrice: number,
  purchaseDate: string,
  usefulLifeYears: number,
  salvageValue: number,
  asOfDate: Date = new Date(),
): DepreciationResult {
  const depreciableBase = Math.max(purchasePrice - salvageValue, 0);
  const totalMonths = Math.max(Math.round(usefulLifeYears * 12), 1);
  const annual = usefulLifeYears > 0 ? depreciableBase / usefulLifeYears : 0;
  const monthly = annual / 12;

  const purchase = new Date(purchaseDate);
  let monthsElapsed = 0;
  if (!isNaN(purchase.getTime())) {
    monthsElapsed = (asOfDate.getFullYear() - purchase.getFullYear()) * 12 + (asOfDate.getMonth() - purchase.getMonth());
    // الشهر الحالي لم يكتمل بعد إن لم يصل يوم الشراء نفسه.
    if (asOfDate.getDate() < purchase.getDate()) monthsElapsed -= 1;
    monthsElapsed = Math.min(Math.max(monthsElapsed, 0), totalMonths);
  }

  const accumulated = Math.round(monthly * monthsElapsed * 100) / 100;
  const bookValue = Math.max(Math.round((purchasePrice - accumulated) * 100) / 100, salvageValue);

  return {
    annual_depreciation: Math.round(annual * 100) / 100,
    monthly_depreciation: Math.round(monthly * 100) / 100,
    months_elapsed: monthsElapsed,
    accumulated_depreciation: accumulated,
    book_value: bookValue,
  };
}
