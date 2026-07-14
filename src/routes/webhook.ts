import type { FastifyInstance } from 'fastify';
import type { WhatsappDownloadService } from '../services/exportService.js';

export function registerWebhookRoutes(app: FastifyInstance, downloads: WhatsappDownloadService) {
  app.get('/webhook/reports/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const doc = await downloads.load(token);
    if (!doc) return reply.code(404).send();
    reply.header('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    reply.type(doc.contentType);
    return doc.data;
  });
}
