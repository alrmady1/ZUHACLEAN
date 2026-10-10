import type { Invoice } from './types.js';
import { SARV_DEFAULT_COMMISSION_PERCENT } from './types.js';

// عمولة سيرف تُحتسَب على المبلغ قبل الضريبة (subtotal، بعد أي خصم) — وليس
// على الإجمالي شامل الضريبة. تُشتقّ هنا دائماً من subtotal بدل قراءة
// platform_commission_amount المخزَّن، فتصحّ أيضاً للفواتير القديمة التي
// خُزِّنت عمولتها على الإجمالي شاملاً الضريبة.
export function sarvCommissionAmount(invoice: Invoice): number {
  const rate = invoice.platform_commission_rate ?? SARV_DEFAULT_COMMISSION_PERCENT;
  return Math.round(invoice.subtotal * (rate / 100) * 100) / 100;
}
