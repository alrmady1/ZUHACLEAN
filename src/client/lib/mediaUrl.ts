// رابط Supabase الموقَّع لصورة ← مسار /api/media/img المخزَّن مؤقتاً على شبكة
// Vercel (انظر server/routes/media.ts). الصور ثابتة لا تتغيّر، فتُجلب من
// Supabase مرة واحدة فقط ثم تُخدَّم من التخزين المؤقت — وهذا ما يوفّر حصة
// النقل (egress) التي تُستهلك مع كل عرض لصور المواعيد. أي رابط آخر يعود كما هو.
export function cdnImageUrl(url: string): string {
  const m = /\/storage\/v1\/object\/sign\/appointment-photos\/([^?]+)/.exec(url);
  return m ? `/api/media/img?p=${encodeURIComponent(decodeURIComponent(m[1]))}` : url;
}
