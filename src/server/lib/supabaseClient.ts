// Shared Supabase client (service-role — server-only, full access). Used by
// both storage.ts (appointment photos) and backup.ts (daily data.json
// snapshots) so the URL/key validation and client setup happen once.
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY غير مضبوطين. أضِفهما في ملف .env (انظر .env.example).',
  );
}

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
