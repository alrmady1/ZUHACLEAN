// Uploads appointment before/after photos to Supabase Storage instead of
// embedding base64 image data directly inside the app_state JSONB blob
// (which would bloat the database and slow down every read/write).
//
// The bucket is private; we return a very long-lived signed URL (10 years)
// at upload time and store that URL directly on the photo record. This
// avoids re-signing URLs on every read while keeping the objects
// unlistable/unguessable to anyone without the link.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'appointment-photos';
const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY غير مضبوطين. أضِفهما في ملف .env (انظر .env.example).',
  );
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let bucketReady: Promise<void> | null = null;

// Creates the storage bucket on first use if it doesn't already exist yet
// (idempotent — safe to call on every server start).
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) throw listError;
      if (!buckets?.some((b) => b.name === BUCKET)) {
        const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
        // Ignore a race where another instance created it in between.
        if (createError && !/already exists/i.test(createError.message)) throw createError;
      }
    })();
  }
  return bucketReady;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('صيغة الصورة غير صالحة');
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = contentType.split('/')[1]?.split('+')[0] || 'jpg';
  return { buffer, contentType, ext };
}

// Uploads a base64 data URL to Supabase Storage and returns a long-lived
// signed URL pointing at it.
export async function uploadAppointmentPhoto(
  appointmentId: string,
  stage: string,
  dataUrl: string,
): Promise<string> {
  await ensureBucket();
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const path = `${appointmentId}/${stage}-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signError) throw signError;

  return data.signedUrl;
}
