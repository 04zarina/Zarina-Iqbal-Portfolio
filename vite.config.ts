import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'path';

/**
 * Local /api for `npm run dev`: runs the same Vercel handlers (chat, tts, contact) inside
 * the dev server, so the chatbot, voice and contact form work without `vercel dev`.
 * Keys come from a local .env file (never committed).
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      for (const [k, v] of Object.entries(loadEnv('development', process.cwd(), ''))) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/(chat|contact|tts)(\?.*)?$/.exec(req.url || '');
        if (!m) return next();
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        let body: unknown = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch {
          /* empty body */
        }
        const out: any = {
          status(code: number) {
            res.statusCode = code;
            return out;
          },
          json(data: unknown) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          }
        };
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          await mod.default({ method: req.method, body, headers: req.headers, socket: req.socket }, out);
        } catch (e) {
          console.error('[dev-api]', e);
          out.status(500).json({ error: 'Dev API error' });
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [devApi()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        classic: resolve(__dirname, 'classic/index.html')
      }
    }
  },
  server: {
    port: 3000,
    open: false
  }
});
