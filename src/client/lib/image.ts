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
