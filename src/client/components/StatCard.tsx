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
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <span className={`rounded-lg p-1.5 ${iconTint}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`text-3xl font-bold ${valueTint}`}>{value}</div>
      <div className={`mt-1 text-xs ${subTint}`}>{sub}</div>
    </div>
  );
}
