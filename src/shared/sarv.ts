import type { Invoice } from './types.js';
import { SARV_DEFAULT_COMMISSION_PERCENT } from './types.js';

// عمولة سيرف تُحتسَب من إجمالي مبلغ الفاتورة (total، شامل الضريبة وبعد أي
// خصم). تُشتقّ هنا دائماً من total بدل قراءة platform_commission_amount
// المخزَّن، فتبقى كل الشاشات (المحاسبة، الإعدادات، الفاتورة المطبوعة)
// متسقة حتى للفواتير التي خُزِّنت عمولتها بأساس حساب سابق.
export function sarvCommissionAmount(invoice: Invoice): number {
  const rate = invoice.platform_commission_rate ?? SARV_DEFAULT_COMMISSION_PERCENT;
  return Math.round(invoice.total * (rate / 100) * 100) / 100;
}
