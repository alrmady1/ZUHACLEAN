import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { api } from './routes/api.js';
import { initStore } from './store/db.js';

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 3000);

async function createServer() {
  // Load app state from Postgres before accepting any request — every
  // store.* method assumes this has already happened.
  await initStore();

  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '8mb' })); // generous limit: before/after photos are base64

  app.use('/api', api);

  if (!isProd) {
    // Dev mode: let Vite handle the client with full HMR, mounted as
    // Express middleware so the API and the frontend share one origin/port.
    // Passing our own httpServer to hmr lets the HMR websocket upgrade
    // through the same port instead of trying (and failing) to open a
    // second one.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: process.cwd(),
      server: { middlewareMode: true, hmr: { server: httpServer, clientPort: PORT } },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    // Prod mode: serve the pre-built static bundle from `vite build`.
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ zaha-ops server running: http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

createServer();
