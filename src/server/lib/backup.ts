// Extra safety net on top of Supabase's own database, independent of
// whichever Supabase plan is active: every day, save a full snapshot of the
// app_state row (all customers, appointments, invoices, etc.) as a plain
// JSON file in a separate, private Storage bucket. This protects against
// application-level mistakes (a bad write overwrites the single app_state
// row) and gives an off-band copy that isn't touched by normal app traffic.
//
// Runs automatically from db.ts's persist() — no manual step, no OS-level
// scheduler needed. Throttled so it doesn't re-upload on every single save.
import { supabase } from './supabaseClient.js';

const BUCKET = 'backups';
const KEEP_LAST = 30; // ~a month of daily snapshots
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000; // retry sooner if it failed
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let bucketReady: Promise<void> | null = null;
let nextBackupAt = 0; // 0 → first save after process start always backs up

async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) throw listError;
      if (!buckets?.some((b) => b.name === BUCKET)) {
        const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
        if (createError && !/already exists/i.test(createError.message)) throw createError;
      }
    })();
  }
  return bucketReady;
}

// Deletes snapshots beyond the newest KEEP_LAST (filenames are
// date-prefixed, e.g. app-state-2026-08-23.json, so plain string sort ==
// chronological order).
async function pruneOldBackups(): Promise<void> {
  const { data: files, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  if (error) throw error;
  const sorted = (files ?? []).map((f) => f.name).sort();
  const toDelete = sorted.slice(0, Math.max(0, sorted.length - KEEP_LAST));
  if (toDelete.length > 0) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(toDelete);
    if (removeError) throw removeError;
  }
}

// Fire-and-forget from persist() — throttled internally, safe to call on
// every save without flooding Supabase Storage with requests.
export function runBackupIfDue(data: unknown): void {
  const now = Date.now();
  if (now < nextBackupAt) return;
  nextBackupAt = now + BACKUP_INTERVAL_MS; // claim the slot before awaiting

  (async () => {
    await ensureBucket();
    const filename = `app-state-${new Date().toISOString().slice(0, 10)}.json`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, Buffer.from(JSON.stringify(data, null, 2)), {
        contentType: 'application/json',
        upsert: true, // same-day re-runs just overwrite today's snapshot
      });
    if (uploadError) throw uploadError;
    await pruneOldBackups();
  })().catch((err) => {
    nextBackupAt = now + RETRY_AFTER_FAILURE_MS;
    console.error('❌ فشلت نسخة القاعدة الاحتياطية اليومية:', err);
  });
}
