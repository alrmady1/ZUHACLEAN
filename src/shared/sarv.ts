import type { Invoice } from './types.js';
import { SARV_DEFAULT_COMMISSION_PERCENT } from './types.js';

// القيمة الافتراضية لعمولة سيرف: النسبة (20٪ ما لم تُعدَّل عند الإصدار) من
// إجمالي مبلغ الفاتورة (total، شامل الضريبة وبعد أي خصم). تُشتقّ دائماً من
// total بدل قراءة platform_commission_amount المخزَّن.
export function sarvDefaultCommission(invoice: Invoice): number {
  const rate = invoice.platform_commission_rate ?? SARV_DEFAULT_COMMISSION_PERCENT;
  return Math.round(invoice.total * (rate / 100) * 100) / 100;
}

export function sarvIsManualCommission(invoice: Invoice): boolean {
  return invoice.platform_commission_manual_amount !== undefined && invoice.platform_commission_manual_amount !== null;
}

// العمولة الفعلية: القيمة المعدَّلة يدوياً إن وُجدت، وإلا الحساب الافتراضي.
// كل الشاشات (المحاسبة، الإعدادات، سداد المنصة، الفاتورة المطبوعة) تقرأ منها.
export function sarvCommissionAmount(invoice: Invoice): number {
  return sarvIsManualCommission(invoice) ? invoice.platform_commission_manual_amount! : sarvDefaultCommission(invoice);
}
