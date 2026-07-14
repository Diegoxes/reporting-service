# reporting-service

Reportes analíticos, dashboard ejecutivo y exportación XLSX para SmartHome Shopper.

- **Stack:** Node.js 20+, Fastify, MongoDB, MariaDB (lectura)
- **Puerto:** 8082
- **Contexto API:** `/api`

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto HTTP (default 8082) |
| `MONGODB_URI` | MongoDB |
| `MARIADB_*` | Lectura analítica del inventario |
| `JWT_SECRET` | Validación JWT |
| `APP_INTERNAL_TOKEN` | APIs internas |
| `APP_PUBLIC_BASE_URL` | URL pública del gateway (descargas WhatsApp) |

## Desarrollo

```bash
npm install
npm run build
npm run dev
```
