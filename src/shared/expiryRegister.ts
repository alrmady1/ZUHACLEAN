import type { Vehicle, Profile, CompanyDocumentExpiry } from './types.js';

// سجل تواريخ انتهاء موحَّد — نفس الفكرة المطبَّقة في تطبيقَي المقاولات
// (نهوض نجد وزهى الأعمال): جدول واحد مرتَّب حسب الأقرب انتهاءً، يجمع
// كل ما له "تاريخ صلاحية" في الشركة. الفرق هنا: أغلب البنود (أوراق
// المركبات وهويات/عقود الموظفين) موجودة أصلاً في النظام (Vehicle،
// Profile)، فتُقرأ منها مباشرة بدل إدخالها يدوياً من جديد — البيانات
// الجديدة فعلياً هي فقط "مستندات الشركة" الحرة (سجل تجاري، تأمينات...)
// المخزَّنة في CompanyDocumentExpiry أدناه. انظر src/server/lib/
// expiryNotifications.ts لاستخدام نفس buildExpiryRegister في التنبيهات.

export const DOCUMENT_EXPIRY_NEAR_DAYS = 60;

export type ExpiryStatusKey = 'expired' | 'near' | 'ok' | 'unknown';

export interface ExpiryStatus {
  key: ExpiryStatusKey;
  label: string;
}

// الأيام المتبقية حتى تاريخ الانتهاء (سالبة إن انتهى بالفعل)؛ null بلا
// تاريخ. today قابل للتمرير للاختبار، افتراضياً الآن.
export function expiryDaysRemaining(dateStr: string | undefined, today: Date = new Date()): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const exp = new Date(y, m - 1, d);
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - start.getTime()) / 86_400_000);
}

export function expiryStatus(days: number | null): ExpiryStatus {
  if (days === null) return { key: 'unknown', label: 'بدون تاريخ' };
  if (days < 0) return { key: 'expired', label: 'منتهية' };
  if (days <= DOCUMENT_EXPIRY_NEAR_DAYS) return { key: 'near', label: 'تقترب من الانتهاء' };
  return { key: 'ok', label: 'سارية' };
}

// مصدر البند: مستند حر (قابل للتعديل/الحذف من هذا الجدول مباشرة)، أو
// مشتقّ من مركبة/موظف مسجَّل (للعرض فقط هنا — يُعدَّل من صفحته الأصلية:
// الإعدادات ← المركبات، أو صفحة الموظف).
export type ExpirySource = 'company' | 'vehicle' | 'employee';

export interface ExpiryRow {
  // مفتاح ثابت (وليس معرّف عشوائي) — يُستخدَم لتتبّع "هل أُرسل تنبيه لهذا
  // البند من قبل" (انظر expiryNotifications.ts)، فيبقى نفسه طالما لم يتغيّر
  // مصدر البند نفسه.
  row_key: string;
  source: ExpirySource;
  category: string;
  name: string;
  expiry_date?: string;
  cost?: number;
  notes?: string;
  attachment_url?: string;
  vehicle_id?: string;
  profile_id?: string;
  // فقط بنود 'company' قابلة للتعديل/الحذف من هذا الجدول — بنود المركبات
  // والموظفين تُعدَّل من صفحتها الأصلية حتى لا يوجد مصدران للحقيقة لنفس
  // التاريخ.
  editable: boolean;
}

function vehicleLabel(v: Vehicle): string {
  return v.type || [v.manufacturer, v.model_trim].filter(Boolean).join(' ') || 'مركبة';
}

export function buildExpiryRegister(companyDocs: CompanyDocumentExpiry[], vehicles: Vehicle[], profiles: Profile[]): ExpiryRow[] {
  const rows: ExpiryRow[] = [];

  for (const d of companyDocs) {
    rows.push({
      row_key: `company:${d.id}`,
      source: 'company',
      category: d.category || 'سجلات المنشأة',
      name: d.name,
      expiry_date: d.expiry_date,
      cost: d.cost,
      notes: d.notes,
      attachment_url: d.attachment_url,
      editable: true,
    });
  }

  for (const v of vehicles) {
    const label = vehicleLabel(v);
    if (v.registration_expiry) {
      rows.push({ row_key: `vehicle:${v.id}:registration`, source: 'vehicle', category: 'أوراق المركبات', name: `استمارة — ${label}`, expiry_date: v.registration_expiry, vehicle_id: v.id, editable: false });
    }
    if (v.inspection_expiry) {
      rows.push({ row_key: `vehicle:${v.id}:inspection`, source: 'vehicle', category: 'أوراق المركبات', name: `الفحص الدوري — ${label}`, expiry_date: v.inspection_expiry, vehicle_id: v.id, editable: false });
    }
    if (v.insurance_expiry) {
      rows.push({ row_key: `vehicle:${v.id}:insurance`, source: 'vehicle', category: 'أوراق المركبات', name: `التأمين — ${label}`, expiry_date: v.insurance_expiry, vehicle_id: v.id, editable: false });
    }
    if (v.ownership_type === 'rented' && v.rental_contract_end_date) {
      rows.push({ row_key: `vehicle:${v.id}:rental`, source: 'vehicle', category: 'أوراق المركبات', name: `عقد إيجار المركبة — ${label}`, expiry_date: v.rental_contract_end_date, vehicle_id: v.id, editable: false });
    }
  }

  // موظف منتهي الخدمة لا داعي لتذكير بشأن هويته أو عقده.
  for (const p of profiles.filter((p) => p.is_active)) {
    if (p.national_id_expiry) {
      rows.push({ row_key: `employee:${p.id}:national_id`, source: 'employee', category: 'هويات وإقامات الموظفين', name: `${p.full_name} — الهوية/الإقامة`, expiry_date: p.national_id_expiry, profile_id: p.id, editable: false });
    }
    if (p.contract_end_date) {
      rows.push({ row_key: `employee:${p.id}:contract`, source: 'employee', category: 'عقود الموظفين', name: `${p.full_name} — نهاية العقد`, expiry_date: p.contract_end_date, profile_id: p.id, editable: false });
    }
  }

  return rows.sort((a, b) => (a.expiry_date ?? '9999-99-99').localeCompare(b.expiry_date ?? '9999-99-99'));
}
