import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ExecutiveService } from '../services/executiveService.js';

type AuthHooks = {
  requireReportsRead: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireOrgId: (req: FastifyRequest, reply: FastifyReply) => string | null;
};

export function registerDashboardRoutes(
  app: FastifyInstance,
  executive: ExecutiveService,
  hooks: AuthHooks,
) {
  app.get('/dashboard/executive', { preHandler: hooks.requireReportsRead }, async (req, reply) => {
    const orgId = hooks.requireOrgId(req, reply);
    if (!orgId || reply.sent) return;
    return executive.executive(orgId);
  });
}
