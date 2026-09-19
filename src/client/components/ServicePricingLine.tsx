import { Trash2 } from 'lucide-react';
import type { Service, ServicePricingModel, ServicePricingTier } from '../../shared/types.js';
import { SERVICE_PRICING_UNIT_LABELS_AR } from '../../shared/types.js';
import { formatMoney } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

// طريقة التسعير المختارة يدوياً لخدمة عند إنشاء عرض سعر أو حجز موعد —
// تتجاوز طريقة الخدمة الافتراضية المُعدَّة في الإعدادات ← الخدمات (ثابت/
// بالمتر/بالمقعد)، فيمكن مثلاً تسعير خدمة كنب بالمتر لعميل وبالمقطوعية
// لآخر. 'fixed' هنا = "مقطوعية": مبلغ إجمالي واحد بلا كمية.
export const PRICING_METHOD_LABELS_AR: Record<ServicePricingModel, string> = {
  fixed: 'مقطوعية',
  per_sqm: 'بالمتر',
  per_seat: 'بالمقعد',
};
const PRICING_METHODS: ServicePricingModel[] = ['fixed', 'per_sqm', 'per_seat'];

export interface PricingOverride {
  method: ServicePricingModel;
  // سعر الوحدة (للمتر أو المقعد) وسعر المقطوعية — القيمة المستخدَمة
  // منهما تحددها method.
  unitPrice: number;
  lumpPrice: number;
}

export function catalogPricingMethod(s: Service): ServicePricingModel {
  return s.pricing_model ?? 'fixed';
}

// الخدمة كما ستُسعَّر فعلياً في هذا المستند: إن وُجد تجاوز يدوي يحلّ محل
// نموذج/أسعار الخدمة الافتراضية، وبعدها تعمل كل دوال الحساب الموجودة
// (computeServicesAmount وغيرها) على الخدمة المعدَّلة بلا أي تغيير.
export function applyPricingOverride(s: Service, o: PricingOverride | undefined): Service {
  if (!o) return s;
  return {
    ...s,
    pricing_model: o.method,
    unit_price: o.unitPrice,
    default_price: o.lumpPrice,
    // مستويات التسعير مرتبطة بأسعار الخدمة الافتراضية فقط — تسقط مع أي تجاوز.
    pricing_tiers: undefined,
    // مدة الوحدة صحيحة فقط لنفس وحدة القياس الأصلية للخدمة.
    unit_duration_seconds: o.method === catalogPricingMethod(s) ? s.unit_duration_seconds : undefined,
  };
}

// تجاوز جديد عند تغيير طريقة التسعير — undefined حين تعود الطريقة إلى
// الافتراضية للخدمة (فيرجع سعرها ومستوياتها الأصلية كما هي).
export function makeOverrideForMethod(s: Service, method: ServicePricingModel, currentLineTotal: number): PricingOverride | undefined {
  if (method === catalogPricingMethod(s)) return undefined;
  return {
    method,
    unitPrice: 0,
    // الانتقال إلى المقطوعية يبدأ من السعر الحالي للبند ليعدّله الموظف بدل
    // البدء من صفر.
    lumpPrice: method === 'fixed' ? Math.round(currentLineTotal * 100) / 100 : s.default_price,
  };
}

// تجاوز يحمل تعديل سعر الوحدة/المقطوعية دون تغيير الطريقة (يبدأ من قيم
// الخدمة الافتراضية إن لم يوجد تجاوز سابق).
export function baseOverride(s: Service, existing: PricingOverride | undefined): PricingOverride {
  return existing ?? { method: catalogPricingMethod(s), unitPrice: s.unit_price ?? 0, lumpPrice: s.default_price };
}

// بند خدمة واحد مع اختيار طريقة التسعير — مشترك بين نافذة إنشاء عرض السعر
// ونافذة حجز موعد جديد. مكوّن عرض فقط: كل القيم والتعديلات تأتي من المُستدعي
// لأن حالة كل نافذة وطريقة حفظها تختلف.
export default function ServicePricingLine({
  name,
  method,
  onMethodChange,
  lumpPrice,
  onLumpPriceChange,
  quantity,
  onQuantityChange,
  unitPrice,
  onUnitPriceChange,
  tiers,
  tierKey,
  onTierChange,
  total,
  onRemove,
}: {
  name: string;
  method: ServicePricingModel;
  onMethodChange: (method: ServicePricingModel) => void;
  lumpPrice: number;
  onLumpPriceChange: (price: number) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  unitPrice: number;
  // يُستدعى فقط بلا مستويات تسعير — مع المستويات يأتي سعر الوحدة من المستوى.
  onUnitPriceChange: (price: number) => void;
  tiers?: ServicePricingTier[];
  tierKey?: string;
  onTierChange?: (tierKey: string) => void;
  total: number;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const isUnitPriced = method !== 'fixed';
  const hasTiers = isUnitPriced && !!tiers && tiers.length > 0;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-slate-700">{name}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title={t('إزالة')}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label={t('طريقة التسعير')}>
        {PRICING_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMethodChange(m)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
              method === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(PRICING_METHOD_LABELS_AR[m])}
          </button>
        ))}
      </div>

      {hasTiers && (
        <div className="flex flex-wrap gap-1.5">
          {tiers!.map((tier) => {
            const active = (tierKey ?? tiers![0].key) === tier.key;
            return (
              <button
                key={tier.key}
                type="button"
                onClick={() => onTierChange?.(tier.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tier.label} · {formatMoney(tier.unit_price)}
              </button>
            );
          })}
        </div>
      )}

      {isUnitPriced ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs text-slate-400">{t(SERVICE_PRICING_UNIT_LABELS_AR[method as Exclude<ServicePricingModel, 'fixed'>])}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={quantity}
            onChange={(e) => onQuantityChange(e.target.value === '' ? 0 : Number(e.target.value))}
            className="input w-20 shrink-0 py-1 text-center text-sm"
          />
          <span className="shrink-0 text-xs text-slate-400">×</span>
          {hasTiers ? (
            <span className="shrink-0 text-xs text-slate-500">{formatMoney(unitPrice)}</span>
          ) : (
            <input
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => onUnitPriceChange(e.target.value === '' ? 0 : Number(e.target.value))}
              title={t('سعر الوحدة (شامل الضريبة)')}
              className="input w-24 shrink-0 py-1 text-center text-sm"
            />
          )}
          <span className="ms-auto shrink-0 text-xs font-semibold text-slate-600">= {formatMoney(total)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-slate-400">{t('السعر المقطوع (شامل الضريبة)')}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={lumpPrice}
            onChange={(e) => onLumpPriceChange(e.target.value === '' ? 0 : Number(e.target.value))}
            className="input w-28 shrink-0 text-sm"
          />
        </div>
      )}
    </div>
  );
}
