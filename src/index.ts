import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createMysqlPool } from './db/analyticsDao.js';
import { AnalyticsDao } from './db/analyticsDao.js';
import { connectMongo } from './db/mongo.js';
import { createAuthHooks } from './middleware/auth.js';
import { ReportInsightsService } from './services/reportInsightsService.js';
import { ReportExportService, WhatsappDownloadService } from './services/exportService.js';
import { ExecutiveService } from './services/executiveService.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerWebhookRoutes } from './routes/webhook.js';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === '') throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

async function main() {
  const port = Number(process.env.PORT ?? 8082);
  const jwtSecret = env('JWT_SECRET', 'local-docker-dev-only-min-32-chars-for-hmac-sha256!!');
  const publicBaseUrl = process.env.APP_PUBLIC_BASE_URL ?? '';

  await connectMongo();
  const pool = createMysqlPool();
  const dao = new AnalyticsDao(pool);
  const insights = new ReportInsightsService(dao);
  const exports = new ReportExportService(dao);
  const downloads = new WhatsappDownloadService(publicBaseUrl);
  const executive = new ExecutiveService(dao);
  const auth = createAuthHooks(jwtSecret);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, credentials: true });

  app.get('/health', async () => ({ status: 'UP' }));

  await app.register(async (api) => {
    api.get('/health', async () => ({ status: 'UP' }));
    registerReportRoutes(api, insights, exports, auth);
    registerDashboardRoutes(api, executive, auth);
    registerInternalRoutes(api, exports, downloads);
    registerWebhookRoutes(api, downloads);
  }, { prefix: '/api' });

  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`reporting-service Node escuchando en :${port}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
