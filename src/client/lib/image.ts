// Compresses a before/after job photo in the browser before it's uploaded.
// Raw phone-camera photos can be 4–10MB; that resolution is far more than
// documentation needs, and it costs upload time on a technician's weak
// field connection plus Supabase Storage quota over time. Falls back to the
// original file's untouched data URL on any failure (unsupported format,
// canvas restrictions, etc.) so a photo never fails to upload just because
// compression didn't work.
const MAX_DIMENSION = 1600; // px, longest side
const JPEG_QUALITY = 0.82;
const SKIP_BELOW_BYTES = 300 * 1024; // already small enough — not worth the CPU cost

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size <= SKIP_BELOW_BYTES) {
    return fileToDataUrl(file);
  }
  try {
    const original = await fileToDataUrl(file);
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    // Guard against the rare case where re-encoding came out bigger (can
    // happen with already-compressed, low-entropy source images).
    return compressed.length < original.length ? compressed : original;
  } catch {
    return fileToDataUrl(file);
  }
}

const THUMB_MAX_DIMENSION = 480;
const THUMB_QUALITY = 0.7;

function canvasToThumbDataUrl(source: CanvasImageSource, width: number, height: number): string | null {
  const scale = Math.min(1, THUMB_MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', THUMB_QUALITY);
}

// مصغّرة صغيرة (≈480px، عشرات الكيلوبايتات) لصورة تُعرَض في الشبكات بدل
// الصورة الكاملة (≈170KB) — تقلّل نقل البيانات من التخزين نحو 85٪ عند تصفّح
// صور الموعد. null عند أي فشل (لا تمنع رفع الصورة نفسها).
export async function makeThumbDataUrl(file: File): Promise<string | null> {
  try {
    const img = await loadImage(await fileToDataUrl(file));
    return canvasToThumbDataUrl(img, img.width, img.height);
  } catch {
    return null;
  }
}

// لقطة عرض (poster) من أول لحظات فيديو — تُعرَض في الشبكة بدل تحميل الفيديو
// نفسه. null لو تعذّر فك ترميز الفيديو في هذا المتصفح (مثلاً بعض صيغ iPhone
// على غير سفاري)، وعندها تُعرَض بطاقة تشغيل عامة بلا أي تنزيل.
export function makeVideoPosterDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 8000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };
    video.onseeked = () => {
      window.clearTimeout(timer);
      try {
        done(video.videoWidth ? canvasToThumbDataUrl(video, video.videoWidth, video.videoHeight) : null);
      } catch {
        done(null);
      }
    };
    video.src = url;
  });
}
