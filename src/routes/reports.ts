import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ReportInsightsService } from '../services/reportInsightsService.js';
import type { ReportExportService } from '../services/exportService.js';
import { parsePeriod } from '../middleware/auth.js';

type AuthHooks = {
  requireReportsRead: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireOrgId: (req: FastifyRequest, reply: FastifyReply) => string | null;
};

export function registerReportRoutes(
  app: FastifyInstance,
  insights: ReportInsightsService,
  exports: ReportExportService,
  hooks: AuthHooks,
) {
  app.get('/reports/rotation', { preHandler: hooks.requireReportsRead }, async (req, reply) => {
    const orgId = hooks.requireOrgId(req, reply);
    if (!orgId || reply.sent) return;
    const q = req.query as { from?: string; to?: string };
    const { from, to } = parsePeriod(q.from, q.to);
    return insights.rotation(orgId, from, to);
  });

  app.get('/reports/inventory', { preHandler: hooks.requireReportsRead }, async (req, reply) => {
    const orgId = hooks.requireOrgId(req, reply);
    if (!orgId || reply.sent) return;
    return insights.inventoryOverview(orgId);
  });

  app.get('/reports/by-category', { preHandler: hooks.requireReportsRead }, async (req, reply) => {
    const orgId = hooks.requireOrgId(req, reply);
    if (!orgId || reply.sent) return;
    return insights.byCategory(orgId);
  });

  app.get('/reports/by-supplier', { preHandler: hooks.requireReportsRead }, async (req, reply) => {
    const orgId = hooks.requireOrgId(req, reply);
    if (!orgId || reply.sent) return;
    const q = req.query as { from?: string; to?: string };
    const { from, to } = parsePeriod(q.from, q.to);
    return insights.bySupplier(orgId, from, to);
  });

  app.get('/reports/by-channel', { preHandler: hooks.requireReportsRead }, async (req, reply) => {
    const orgId = hooks.requireOrgId(req, reply);
    if (!orgId || reply.sent) return;
    const q = req.query as { from?: string; to?: string };
    const { from, to } = parsePeriod(q.from, q.to);
    return insights.byChannel(orgId, from, to);
  });

  app.get('/reports/history', { preHandler: hooks.requireReportsRead }, async () => {
    return [];
  });

  app.get('/reports/export', { preHandler: hooks.requireReportsRead }, async (req, reply) => {
    const orgId = hooks.requireOrgId(req, reply);
    if (!orgId || reply.sent) return;
    const q = req.query as { from?: string; to?: string; format?: string };
    if (q.format && q.format.toLowerCase() !== 'xlsx') {
      return reply.code(400).send({ error: 'Solo format=xlsx' });
    }
    const { from, to } = parsePeriod(q.from, q.to);
    const buffer = await exports.exportCompleto(orgId, from, to);
    reply.header('Content-Disposition', 'attachment; filename=reporte-inventario.xlsx');
    reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return buffer;
  });
}
