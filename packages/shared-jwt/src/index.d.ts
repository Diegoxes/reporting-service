export declare const JWT_EXPIRATION_MS = 86400000;
export interface SessionPrincipal {
    userId: string;
    orgId?: string;
    orgRole?: string;
    platformRole?: string;
}
/** Espejo de JwtService.java — clave HMAC compatible con invcore Java. */
export declare function deriveSigningKey(secret: string): Buffer;
export declare function generateToken(secret: string, userId: string, email: string, platformRole: string | null | undefined, orgId: string | null | undefined, orgRole: string | null | undefined): string;
export declare function parseSession(secret: string, token: string): SessionPrincipal;
export declare function isPlatformOwner(session: SessionPrincipal): boolean;
