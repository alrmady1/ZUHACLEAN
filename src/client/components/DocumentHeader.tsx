import { COMPANY_NAME, COMPANY_VAT_NUMBER, COMPANY_PHONE, COMPANY_CR_NUMBER } from '../../shared/types.js';
import { useI18n } from '../lib/i18n.js';

// رأس مشترك للمستندات الرسمية المطبوعة (عقد، عرض سعر) — الشعار بالوسط
// وبيانات الشركة حوله، تماماً كما طُلب. رقم السجل التجاري يظهر فقط إن
// أُضيف لاحقاً (انظر COMPANY_CR_NUMBER في src/shared/types.ts) — سطر
// غائب أفضل من رقم غير صحيح على مستند رسمي.
export default function DocumentHeader() {
  const { t } = useI18n();
  return (
    <div className="mb-5 flex flex-col items-center gap-1.5 border-b border-dashed border-slate-200 pb-4 text-center">
      <img src="/icon-512.png" alt={COMPANY_NAME} className="h-16 w-16 rounded-2xl" />
      <div className="text-lg font-bold text-slate-800">{COMPANY_NAME}</div>
      <div className="text-xs text-slate-400">{t('لأعمال الصيانة والتنظيف')}</div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400" dir="ltr">
        <span>{COMPANY_PHONE}</span>
        <span dir="rtl">{t('الرقم الضريبي:')} {COMPANY_VAT_NUMBER}</span>
        {COMPANY_CR_NUMBER && <span dir="rtl">{t('السجل التجاري:')} {COMPANY_CR_NUMBER}</span>}
      </div>
    </div>
  );
}
