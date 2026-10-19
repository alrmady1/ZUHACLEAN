// مصدر واحد لأسعار خدمات صفحة /order وأسمائها المختصرة في الروابط.
// يستخدمه tiktokPixel.ts (قيمة أحداث TikTok) وOrderPage.tsx (سطر "يبدأ من"
// وروابط ?service=) — تعديل السعر هنا ينعكس في المكانين.

// السعر التقديري/"يبدأ من" لكل خدمة بالريال — المفاتيح هي عناوين الخدمات
// كما تظهر في صفحة /order (landing services). خدمة غير موجودة هنا = 0 في
// أحداث TikTok، ولا يظهر لها سعر خاص في سطر "يبدأ من" (يظهر السطر العام).
export const SERVICE_VALUES: Record<string, number> = {
  'تنظيف شقق وفلل شامل': 300,
  'تنظيف مكاتب': 250,
  'تنظيف عميق بعد التشطيب': 500,
  'غسيل وتعقيم سجاد وموكيت': 150,
  'مكافحة حشرات': 200,
  'تنظيف كنب ومجالس بالبخار': 200,
  'تنظيف مكيفات سبليت': 100,
};

// الأسماء المختصرة لروابط الإعلانات: /order?service=sofa يفتح الصفحة على
// الخدمة مباشرة. title = عنوان الخدمة كما في /order حرفياً، label = الاسم
// القصير في سطر "يبدأ من" (مثال: "تنظيف الكنب يبدأ من …").
export const ORDER_SERVICE_SLUGS: Record<string, { title: string; label: string }> = {
  sofa: { title: 'تنظيف كنب ومجالس بالبخار', label: 'تنظيف الكنب' },
  apartment: { title: 'تنظيف شقق وفلل شامل', label: 'تنظيف الشقق والفلل' },
  office: { title: 'تنظيف مكاتب', label: 'تنظيف المكاتب' },
  deep: { title: 'تنظيف عميق بعد التشطيب', label: 'التنظيف العميق' },
  carpet: { title: 'غسيل وتعقيم سجاد وموكيت', label: 'غسيل السجاد' },
  pest: { title: 'مكافحة حشرات', label: 'مكافحة الحشرات' },
  ac: { title: 'تنظيف مكيفات سبليت', label: 'تنظيف المكيفات' },
};

// عنوان الخدمة من قيمة ?service= (بلا حساسية لحالة الأحرف)، أو null لو
// الاسم غير معروف.
export function serviceTitleFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return ORDER_SERVICE_SLUGS[slug.trim().toLowerCase()]?.title ?? null;
}

// الاسم القصير للخدمة في سطر "يبدأ من" (العنوان الكامل لو لم يُعرَّف لها اسم قصير).
export function serviceShortLabel(title: string): string {
  return Object.values(ORDER_SERVICE_SLUGS).find((s) => s.title === title)?.label ?? title;
}

// أقل سعر بين كل الخدمات — للسطر العام "أسعار تبدأ من …" قبل اختيار خدمة.
export const MIN_SERVICE_PRICE = Math.min(...Object.values(SERVICE_VALUES));
