// مشتركة بين لوحة التحكم (Dashboard.tsx) وبوابة الفني (TechnicianPortal.tsx)
// — كانت معرَّفة محلياً داخل Dashboard.tsx فقط قبل أن تحتاجها بوابة الفني
// أيضاً لعرض إحصائيات اليوم الخاصة بالفني نفسه أعلى صفحته.
import type { ComponentType } from 'react';

export default function StatCard({
  icon: Icon,
  iconTint,
  label,
  value,
  valueTint,
  sub,
  subTint,
}: {
  icon: ComponentType<{ className?: string }>;
  iconTint: string;
  label: string;
  value: string;
  valueTint: string;
  sub: string;
  subTint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`shrink-0 rounded-xl p-2.5 ${iconTint}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`text-[28px] font-bold leading-none ${valueTint}`}>{value}</div>
      <div className={`mt-2 text-xs ${subTint}`}>{sub}</div>
    </div>
  );
}
