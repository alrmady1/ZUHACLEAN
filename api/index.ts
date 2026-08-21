// Vercel serverless entry point. Vercel's Node.js runtime auto-detects any
// file under /api that default-exports an Express app and wraps it as a
// function — no app.listen() needed here (unlike src/server/index.ts, which
// is the long-running entry point used for local dev / Docker).
import express from 'express';
import { api } from '../src/server/routes/api.js';

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use('/api', api);

export default app;
