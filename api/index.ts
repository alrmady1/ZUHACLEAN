// Vercel serverless entry point. Vercel's Node.js runtime auto-detects any
// file under /api that default-exports an Express app and wraps it as a
// function — no app.listen() needed here (unlike src/server/index.ts, which
// is the long-running entry point used for local dev / Docker).
import express from 'express';
import { api } from '../src/server/routes/api.js';
import { initStore } from '../src/server/store/db.js';

const app = express();
app.use(express.json({ limit: '8mb' }));

// Serverless has no long-running startup phase to await initStore() in
// (unlike src/server/index.ts), and — unlike that single long-running
// process — Vercel may run several separate instances of this function at
// once. Each instance keeps its own private copy of `db` in memory; if we
// only loaded it once per instance (like the old version of this file did),
// two instances could each mutate their own stale snapshot and the one that
// persists last would silently overwrite the other's change (a real lost
// update: this is exactly what dropped one of the test photos uploaded
// during the Vercel migration). Reloading fresh from Postgres at the start
// of every single request shrinks that unsafe window from "however long an
// instance stays warm" down to "the few milliseconds of this one request",
// at the cost of one extra fast read per request — the right trade for a
// business app several people use concurrently. (Local dev / Docker, via
// src/server/index.ts, still loads once at startup — safe there since it's
// always a single process.)
app.use((_req, res, next) => {
  initStore().then(() => next()).catch(next);
});

app.use('/api', api);

// Fallback error handler: without this, an uncaught error (e.g. a DB
// connection failure) falls through to Express's default handler, which
// renders a plain HTML "Internal Server Error" page — the client's fetch
// then fails trying to parse that as JSON, masking the real cause. This at
// least returns JSON and logs the actual error to Vercel's runtime logs.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ خطأ في الخادم:', err);
  // TEMPORARY (incident diagnosis, 2026-08-24): expose the error's
  // code/name only — never the full message, which for pg errors can echo
  // back connection details — so the outage can be diagnosed from the
  // browser without needing Vercel log access. Revert once root-caused.
  const e = err as { code?: string; name?: string } | undefined;
  res.status(500).json({ error: 'حدث خطأ في الخادم، حاول مرة أخرى', debug_code: e?.code, debug_name: e?.name });
});

export default app;
