// ============================================================================
// نظام إدارة خدمات النظافة والتشغيل والصيانة - النماذج المشتركة
// Shared TypeScript models used by both the client and the server.
// ============================================================================

export type UserRole =
  | 'general_manager'
  | 'admin'
  | 'admin_supervisor'
  | 'supervisor'
  | 'technician';

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  general_manager: 'المدير العام',
  admin: 'مدير النظام',
  admin_supervisor: 'مشرف إداري',
  supervisor: 'مشرف ميداني',
  technician: 'فني ميداني',
};

export const ROLE_LABELS_EN: Record<UserRole, string> = {
  general_manager: 'General Manager',
  admin: 'Admin',
  admin_supervisor: 'Admin Supervisor',
  supervisor: 'Supervisor',
  technician: 'Technician',
};

export type AppointmentStatus =
  | 'scheduled'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
// A free-form key referencing a PaymentMethodOption.id below — kept as
// `string` (not a fixed union) so admins can add methods beyond the
// built-in cash/card/bank_transfer from Settings without a code change.
export type PaymentMethod = string;
export type ContractType = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export type ContractStatus = 'active' | 'completed' | 'cancelled' | 'expired';
export type VisitFrequency = 'weekly' | 'bi_weekly' | 'monthly';

export type ExpenseCategory =
  | 'custody'
  | 'transport'
  | 'fuel'
  | 'cleaning_materials'
  | 'salaries'
  | 'iqama_and_visas'
  | 'vehicle_maintenance'
  | 'other';

export const EXPENSE_CATEGORY_LABELS_AR: Record<ExpenseCategory, string> = {
  custody: 'عهد مالية',
  transport: 'أجور نقل',
  fuel: 'بنزين ووقود',
  cleaning_materials: 'مواد تنظيف',
  salaries: 'رواتب ومكافآت',
  iqama_and_visas: 'إقامات وتأشيرات',
  vehicle_maintenance: 'صيانة سيارات',
  other: 'أخرى',
};

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  supervisor_id?: string;
  username?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  district?: string;
  city?: string;
  location_url?: string;
  notes?: string;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  default_price: number;
  default_duration_minutes: number;
  is_active: boolean;
}

export interface PaymentMethodOption {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Contract {
  id: string;
  contract_number: string;
  customer_id: string;
  service_id: string;
  service_name_snapshot: string;
  contract_type: ContractType;
  visit_frequency: VisitFrequency;
  visit_day_of_week?: string;
  visit_time?: string;
  start_date: string;
  end_date: string;
  total_visits: number;
  completed_visits: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  supervisor_id?: string;
  assigned_technician_ids?: string[];
  status: ContractStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  period_type: 'daily' | 'monthly' | 'annual';
  amount: number;
  tax_amount?: number;
  date: string;
  invoice_number?: string;
  unit_or_vehicle_ref?: string;
  recorded_by: string;
  recorded_by_name?: string;
  supervisor_id?: string;
  supervisor_name?: string;
  // Only set when category === 'custody': which employee the cash
  // custody/advance was handed to.
  custody_holder_id?: string;
  custody_holder_name?: string;
  payment_method: PaymentMethod;
  notes?: string;
  created_at: string;
}

export interface AppointmentAssignment {
  id: string;
  technician_id: string;
  technician_name?: string;
}

export interface AppointmentPhoto {
  id: string;
  stage: 'before' | 'after';
  data_url: string;
  taken_at: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  recorded_at: string;
  recorded_by?: string;
}

export interface Appointment {
  id: string;
  customer_id: string;
  customer_name_snapshot?: string;
  service_id: string;
  service_name_snapshot: string;
  scheduled_at: string; // ISO date-time
  expected_duration_minutes: number;
  amount: number;
  status: AppointmentStatus;
  supervisor_id?: string;
  address_snapshot: string;
  location_url?: string;
  contract_id?: string;
  contract_number?: string;
  notes?: string;
  total_paid: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  assignments: AppointmentAssignment[];
  photos: AppointmentPhoto[];
  payments: Payment[];
  created_at: string;
}

export const VAT_RATE = 0.15;

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name_snapshot: string;
  appointment_id?: string;
  contract_id?: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  issue_date: string;
  notes?: string;
}
