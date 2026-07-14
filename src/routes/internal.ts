import type { FastifyInstance } from 'fastify';
import type { ReportExportService, WhatsappDownloadService } from '../services/exportService.js';
import { requireInternalToken } from '../middleware/auth.js';

export function registerInternalRoutes(
  app: FastifyInstance,
  exports: ReportExportService,
  downloads: WhatsappDownloadService,
) {
  app.post('/internal/reports/export', async (req, reply) => {
    if (!requireInternalToken(req, reply)) return;
    const q = req.query as { orgId?: string };
    if (!q.orgId) return reply.code(400).send({ error: 'orgId requerido' });
    const body = (req.body ?? {}) as { type?: string };
    try {
      const { buffer, fileName } = await exports.exportByType(q.orgId, body.type ?? '');
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return buffer;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error exportando';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post('/internal/reports/downloads', async (req, reply) => {
    if (!requireInternalToken(req, reply)) return;
    const body = req.body as {
      organizationId?: string;
      fileName?: string;
      contentType?: string;
      dataBase64?: string;
    };
    if (!body.organizationId || !body.fileName || !body.dataBase64) {
      return reply.code(400).send({ error: 'Campos requeridos: organizationId, fileName, dataBase64' });
    }
    const data = Buffer.from(body.dataBase64, 'base64');
    const stored = await downloads.store(body.organizationId, body.fileName, data);
    if (!stored) {
      return reply.code(500).send({ error: 'No se pudo almacenar el reporte (APP_PUBLIC_BASE_URL?)' });
    }
    return { token: stored.token, downloadUrl: stored.downloadUrl };
  });
}
