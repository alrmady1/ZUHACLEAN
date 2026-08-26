// كل عملاء الشركة حالياً داخل المملكة، فرمز الدولة السعودي (966) لم يعد
// مطلوباً عند إدخال رقم الجوال. أي رقم يُدخَل بصيغة دولية (966XXXXXXXXX
// أو +966XXXXXXXXX) يُطبَّع تلقائياً إلى الصيغة المحلية (0XXXXXXXXX) عند
// الحفظ (انظر مواضع الاستخدام في src/server/routes/api.ts)، ودوال البحث
// تتجاهل رمز الدولة والرموز غير الرقمية حتى يعمل البحث بأي صيغة يكتبها
// المستخدم (05...، 5...، أو حتى 966...).
export function normalizeSaudiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('966') && digits.length === 12) return `0${digits.slice(3)}`;
  return phone.trim();
}

// نسخة "أرقام فقط، بصيغة محلية موحَّدة" — للمقارنة عند البحث فقط، لا
// تُستخدم كقيمة تُخزَّن أو تُعرَض.
function digitsLocal(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('966') ? `0${digits.slice(3)}` : digits;
}

// هل يطابق هذا الرقم استعلام بحث جزئي (بأي صيغة: محلية أو دولية)؟ يرجع
// false لو لم يحتوِ الاستعلام على أي رقم أصلاً (حتى لا يُطابق كل شيء عند
// البحث بنص غير رقمي كالاسم ضمن بحث مركّب اسم+هاتف).
export function phoneMatchesQuery(storedPhone: string, query: string): boolean {
  const q = digitsLocal(query);
  if (!q) return false;
  return digitsLocal(storedPhone).includes(q);
}
