import type {
  AppointmentStatus,
  PaymentStatus,
  ContractStatus,
} from '../../shared/types.js';

const APPT_STATUS_STYLE: Record<AppointmentStatus, { label: string; className: string }> = {
  scheduled: { label: 'مجدولة', className: 'bg-slate-100 text-slate-700' },
  on_the_way: { label: 'في الطريق', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'جارية', className: 'bg-amber-100 text-amber-700' },
  completed: { label: 'مكتملة', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'ملغاة', className: 'bg-red-100 text-red-700' },
};

const PAYMENT_STYLE: Record<PaymentStatus, { label: string; className: string }> = {
  paid: { label: 'مسدد بالكامل', className: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'مسدد جزئياً', className: 'bg-amber-100 text-amber-700' },
  unpaid: { label: 'غير مسدد', className: 'bg-red-100 text-red-700' },
};

const CONTRACT_STYLE: Record<ContractStatus, { label: string; className: string }> = {
  active: { label: 'ساري', className: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'مكتمل', className: 'bg-slate-100 text-slate-700' },
  cancelled: { label: 'ملغى', className: 'bg-red-100 text-red-700' },
  expired: { label: 'منتهي', className: 'bg-slate-200 text-slate-600' },
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

export const AppointmentStatusBadge = ({ status }: { status: AppointmentStatus }) => (
  <Pill {...APPT_STATUS_STYLE[status]} />
);
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Pill {...PAYMENT_STYLE[status]} />
);
export const ContractStatusBadge = ({ status }: { status: ContractStatus }) => (
  <Pill {...CONTRACT_STYLE[status]} />
);
