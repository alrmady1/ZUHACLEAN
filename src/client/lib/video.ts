import { api } from './api.js';
import { compressImageToDataUrl } from './image.js';
import { APPOINTMENT_VIDEO_MAX_BYTES } from '../../shared/types.js';

// الفيديو أكبر من أن يمر عبر دالة Vercel (حد الطلب ~4.5MB)، فيُرفع مباشرة من
// المتصفح إلى Supabase عبر رابط رفع موقَّع يصدره الخادم، ثم يُسجَّل على الموعد.
async function uploadAppointmentVideo(appointmentId: string, stage: 'before' | 'after', file: File): Promise<void> {
  if (file.size > APPOINTMENT_VIDEO_MAX_BYTES) {
    throw new Error(`حجم الفيديو ${Math.round(file.size / 1024 / 1024)} ميجابايت — الحد الأقصى ${APPOINTMENT_VIDEO_MAX_BYTES / 1024 / 1024} ميجابايت`);
  }
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(
    `/appointments/${appointmentId}/video-upload-url`,
    { stage, file_name: file.name },
  );
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'video/mp4', 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
    body: file,
  });
  if (!res.ok) throw new Error('فشل رفع الفيديو — تحقق من الاتصال أو من حجم الملف');
  await api.post(`/appointments/${appointmentId}/videos`, { stage, path });
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
}

// يرفع خليطاً من الصور والفيديو بالتتابع (الصور تُضغط أولاً)، ولا يوقف
// الباقي عند فشل ملف واحد — يُعيد رسائل أخطاء الملفات الفاشلة فقط.
export async function uploadAppointmentMedia(appointmentId: string, stage: 'before' | 'after', files: File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    try {
      if (isVideoFile(file)) {
        await uploadAppointmentVideo(appointmentId, stage, file);
      } else {
        const data_url = await compressImageToDataUrl(file);
        await api.post(`/appointments/${appointmentId}/photos`, { stage, data_url });
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'فشل رفع الملف');
    }
  }
  return errors;
}
