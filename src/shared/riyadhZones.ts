// مطابقة اسم حيّ (كما يُكتب في Customer.district) بمنطقته من تقسيم الرياض
// — مطابقة نصية مباشرة (تجاهل الفراغات الزائدة فقط)، ليست جغرافية. يستخدمها
// كل من العميل (اقتراح يوم عند حجز موعد جديد، انظر NewAppointmentModal.tsx)
// والخادم لاحقاً إن احتاج نفس المنطق — لذا في src/shared بلا أي اعتماد على
// المتصفح، مطابقةً لنمط findDayOffConflicts في weekdays.ts.
import type { RiyadhZone, NeighborhoodZoneAssignment } from './types.js';

export function findZoneForNeighborhood(
  neighborhood: string | undefined,
  zones: RiyadhZone[],
  assignments: NeighborhoodZoneAssignment[],
): RiyadhZone | undefined {
  const cleaned = neighborhood?.trim();
  if (!cleaned) return undefined;
  const match = assignments.find((a) => a.neighborhood.trim() === cleaned);
  if (!match) return undefined;
  return zones.find((z) => z.id === match.zone_id);
}
