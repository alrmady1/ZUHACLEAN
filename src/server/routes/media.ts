// صور الصفحة العامة (/order) تُخدَّم من نطاقنا بترويسات تخزين مؤقت طويلة، بدل
// أن يحمّلها كل زائر مباشرة من Supabase: شبكة Vercel تخزّن الرد (s-maxage)
// فلا يخرج من Supabase إلا نسخة واحدة لكل صورة (ثم يتكرر عند الانتهاء/المسح
// فقط)، وتخزّنه المتصفحات أيضاً. هذا ما يمنع تكرار تجاوز حصة النقل (egress)
// مع إعلانات تُرسل زيارات كثيرة.
//
// لأنه مسار عام بلا تسجيل دخول ويقرأ من حاوية فيها مستندات حسّاسة (إيصالات،
// هويات، فواتير)، يقبل فقط مسارين من نمطين صارمين: صور landing/ (هيرو،
// إعلان، خدمات) وصور قبل/بعد المواعيد (للمعرض "آخر أعمالنا") — صور فقط،
// بلا فيديو ولا أي مجلد آخر ولا مسارات مركّبة.
import type { Request, Response } from 'express';
import { downloadStorageObject } from '../lib/storage.js';

const IMG_EXT = '(?:jpe?g|png|webp|gif)';
const LANDING_RE = new RegExp(`^landing/[A-Za-z0-9._-]+\\.${IMG_EXT}$`, 'i');
const APPT_PHOTO_RE = new RegExp(`^[0-9a-f]{8}-[0-9a-f-]{27}/(?:before|after)-\\d+-[0-9a-f-]{36}\\.${IMG_EXT}$`, 'i');
const PROXY_PATH = '/api/media/img';

export function isAllowedMediaPath(path: string): boolean {
  return LANDING_RE.test(path) || APPT_PHOTO_RE.test(path);
}

// رابط Supabase الموقَّع ← رابط الوسيط، أو الرابط نفسه إن لم يكن صورة مسموحة.
export function toCdnUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const m = /\/storage\/v1\/object\/sign\/appointment-photos\/([^?]+)/.exec(url);
  if (!m) return url;
  const path = decodeURIComponent(m[1]);
  return isAllowedMediaPath(path) ? `${PROXY_PATH}?p=${encodeURIComponent(path)}` : url;
}

// يُركَّب قبل أي وسيط يحمّل قاعدة البيانات (انظر api/index.ts وserver/index.ts):
// المسار لا يحتاج DB أصلاً.
export async function mediaImageHandler(req: Request, res: Response): Promise<void> {
  const p = typeof req.query.p === 'string' ? req.query.p : '';
  if (!isAllowedMediaPath(p)) {
    res.status(400).set('Cache-Control', 'no-store').json({ error: 'مسار غير مسموح' });
    return;
  }
  try {
    const file = await downloadStorageObject(p);
    if (!file || !file.contentType.startsWith('image/')) {
      res.status(404).set('Cache-Control', 'no-store').end();
      return;
    }
    // المسار فريد لكل رفع (طابع زمني + UUID) فلا تتغيّر محتوياته أبداً.
    res
      .status(200)
      .set({
        'Content-Type': file.contentType,
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .end(file.buffer);
  } catch (err) {
    console.error('❌ فشل تقديم صورة عامة:', err);
    res.status(502).set('Cache-Control', 'no-store').end();
  }
}
