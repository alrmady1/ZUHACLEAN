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
// (unlike src/server/index.ts) — so make sure it has resolved before the
// first request reaches a route, then reuse the same resolved init on every
// later request this instance handles (Postgres connection stays warm).
let initPromise: Promise<void> | null = null;
app.use((_req, res, next) => {
  if (!initPromise) initPromise = initStore();
  initPromise.then(() => next()).catch(next);
});

app.use('/api', api);

export default app;
