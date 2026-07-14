import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const MIN_KEY_BYTES = 32;
export const JWT_EXPIRATION_MS = 86400000;

export interface SessionPrincipal {
  userId: string;
  orgId?: string;
  orgRole?: string;
  platformRole?: string;
}

/** Espejo de JwtService.java — clave HMAC compatible con invcore Java. */
export function deriveSigningKey(secret: string): Buffer {
  if (!secret?.trim()) {
    throw new Error('jwt.secret no puede estar vacío; define JWT_SECRET en el entorno.');
  }
  let bytes = Buffer.from(secret, 'utf8');
  if (bytes.length < MIN_KEY_BYTES) {
    bytes = crypto.createHash('sha256').update(bytes).digest();
  }
  return bytes;
}

export function generateToken(
  secret: string,
  userId: string,
  email: string,
  platformRole: string | null | undefined,
  orgId: string | null | undefined,
  orgRole: string | null | undefined,
): string {
  const payload: Record<string, string> = { email };
  if (platformRole) payload.platformRole = platformRole;
  if (orgId) payload.orgId = orgId;
  if (orgRole) payload.orgRole = orgRole;

  return jwt.sign(payload, deriveSigningKey(secret), {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRATION_MS / 1000,
  });
}

export function parseSession(secret: string, token: string): SessionPrincipal {
  const decoded = jwt.verify(token, deriveSigningKey(secret), {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

  if (!decoded.sub) {
    throw new Error('Token sin subject');
  }

  return {
    userId: decoded.sub,
    orgId: decoded.orgId as string | undefined,
    orgRole: decoded.orgRole as string | undefined,
    platformRole: decoded.platformRole as string | undefined,
  };
}

export function isPlatformOwner(session: SessionPrincipal): boolean {
  return session.platformRole === 'PLATFORM_OWNER';
}
