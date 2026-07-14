import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
const MIN_KEY_BYTES = 32;
export const JWT_EXPIRATION_MS = 86400000;
/** Espejo de JwtService.java — clave HMAC compatible con invcore Java. */
export function deriveSigningKey(secret) {
    if (!secret?.trim()) {
        throw new Error('jwt.secret no puede estar vacío; define JWT_SECRET en el entorno.');
    }
    let bytes = Buffer.from(secret, 'utf8');
    if (bytes.length < MIN_KEY_BYTES) {
        bytes = crypto.createHash('sha256').update(bytes).digest();
    }
    return bytes;
}
export function generateToken(secret, userId, email, platformRole, orgId, orgRole) {
    const payload = { email };
    if (platformRole)
        payload.platformRole = platformRole;
    if (orgId)
        payload.orgId = orgId;
    if (orgRole)
        payload.orgRole = orgRole;
    return jwt.sign(payload, deriveSigningKey(secret), {
        subject: userId,
        algorithm: 'HS256',
        expiresIn: JWT_EXPIRATION_MS / 1000,
    });
}
export function parseSession(secret, token) {
    const decoded = jwt.verify(token, deriveSigningKey(secret), {
        algorithms: ['HS256'],
    });
    if (!decoded.sub) {
        throw new Error('Token sin subject');
    }
    return {
        userId: decoded.sub,
        orgId: decoded.orgId,
        orgRole: decoded.orgRole,
        platformRole: decoded.platformRole,
    };
}
export function isPlatformOwner(session) {
    return session.platformRole === 'PLATFORM_OWNER';
}
