import { FastifyRequest, FastifyReply } from 'fastify';
import { parseSession, type SessionPrincipal } from '@smarthome/shared-jwt';

declare module 'fastify' {
  interface FastifyRequest {
    session?: SessionPrincipal;
  }
}

const REPORTS_ROLES = new Set(['MANAGER', 'MEMBER', 'VIEWER']);

export function createAuthHooks(jwtSecret: string) {
  async function requireReportsRead(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'No autenticado' });
      return;
    }
    try {
      req.session = parseSession(jwtSecret, header.slice(7));
    } catch {
      reply.code(401).send({ error: 'Token inválido' });
      return;
    }
    const s = req.session;
    if (s.platformRole === 'PLATFORM_OWNER') return;
    if (!s.orgId || !s.orgRole || !REPORTS_ROLES.has(s.orgRole)) {
      reply.code(403).send({ error: 'Forbidden' });
    }
  }

  function requireOrgId(req: FastifyRequest, reply: FastifyReply): string | null {
    const s = req.session!;
    if (s.orgId) return s.orgId;
    reply.code(403).send({ error: 'Organización requerida' });
    return null;
  }

  return { requireReportsRead, requireOrgId };
}

export function requireInternalToken(req: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.APP_INTERNAL_TOKEN ?? '';
  const got = req.headers['x-internal-token'];
  if (!expected || got !== expected) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function parseDateParam(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parsePeriod(fromStr?: string, toStr?: string, defaultDays = 30) {
  const to = parseDateParam(toStr) ?? new Date();
  const from = parseDateParam(fromStr) ?? new Date(to.getTime() - defaultDays * 86400000);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
