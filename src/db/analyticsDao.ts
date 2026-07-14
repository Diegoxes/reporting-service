import mysql from 'mysql2/promise';

export type MysqlPool = mysql.Pool;

export function createMysqlPool(): MysqlPool {
  const host = process.env.MARIADB_HOST ?? 'localhost';
  const port = Number(process.env.MARIADB_PORT ?? 3306);
  const user = process.env.MARIADB_USER ?? 'root';
  const password = process.env.MARIADB_PASSWORD ?? '';
  const database = process.env.MARIADB_DB ?? 'smarthome_core';
  return mysql.createPool({ host, port, user, password, database, connectionLimit: 10 });
}

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  quantity: number;
  minQuantity: number;
  unit: string;
  avgCost: number | null;
  lastCost: number | null;
  expiryDate: string | null;
}

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

export class AnalyticsDao {
  constructor(private readonly pool: MysqlPool) {}

  async findProducts(orgId: string): Promise<ProductRow[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, name, category, sku, quantity, min_quantity, unit, avg_cost, last_cost, expiry_date
       FROM products WHERE organization_id = ?`,
      [orgId],
    );
    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      category: r.category != null ? String(r.category) : null,
      sku: r.sku != null ? String(r.sku) : null,
      quantity: num(r.quantity),
      minQuantity: num(r.min_quantity),
      unit: String(r.unit ?? 'UNIT'),
      avgCost: r.avg_cost != null ? Number(r.avg_cost) : null,
      lastCost: r.last_cost != null ? Number(r.last_cost) : null,
      expiryDate: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
    }));
  }

  async aggregatedConsumed(orgId: string, from: Date, to: Date): Promise<Map<string, number>> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT p.id, COALESCE(SUM(ABS(c.quantity_change)), 0) AS qty
       FROM consumption_logs c
       JOIN products p ON p.id = c.product_id
       WHERE p.organization_id = ? AND c.action_type = 'CONSUMED'
         AND c.created_at >= ? AND c.created_at <= ?
       GROUP BY p.id`,
      [orgId, from, to],
    );
    const map = new Map<string, number>();
    for (const r of rows) map.set(String(r.id), num(r.qty));
    return map;
  }

  async avgDailyConsumption(productId: string, since: Date, days: number): Promise<number> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT COALESCE(ABS(SUM(quantity_change)) / ?, 0) AS avg
       FROM consumption_logs
       WHERE product_id = ? AND action_type = 'CONSUMED' AND created_at >= ?`,
      [days, productId, since],
    );
    return num(rows[0]?.avg);
  }

  async consumedProductIdsSince(orgId: string, since: Date): Promise<Set<string>> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT p.id FROM consumption_logs c
       JOIN products p ON p.id = c.product_id
       WHERE p.organization_id = ? AND c.created_at >= ? AND c.action_type = 'CONSUMED'`,
      [orgId, since],
    );
    return new Set(rows.map(r => String(r.id)));
  }

  async sumBySupplier(orgId: string, from: Date, to: Date) {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT pu.supplier_id, s.name, COALESCE(SUM(pu.total_amount), 0) AS total
       FROM purchases pu
       JOIN products p ON p.id = pu.product_id
       LEFT JOIN suppliers s ON s.id = pu.supplier_id
       WHERE p.organization_id = ? AND pu.purchased_at >= ? AND pu.purchased_at <= ?
       GROUP BY pu.supplier_id, s.name`,
      [orgId, from, to],
    );
    return rows.map(r => ({
      supplierId: r.supplier_id != null ? String(r.supplier_id) : null,
      supplierName: r.name != null ? String(r.name) : 'Sin proveedor',
      totalSpend: num(r.total),
    }));
  }

  async sumByChannel(orgId: string, from: Date, to: Date) {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT c.source, COALESCE(ABS(SUM(c.quantity_change)), 0) AS qty
       FROM consumption_logs c
       JOIN products p ON p.id = c.product_id
       WHERE p.organization_id = ? AND c.action_type = 'CONSUMED'
         AND c.created_at >= ? AND c.created_at <= ?
       GROUP BY c.source`,
      [orgId, from, to],
    );
    return rows.map(r => ({ channel: String(r.source ?? 'UNKNOWN'), unitsConsumed: num(r.qty) }));
  }

  async findLatestUnitPrice(productId: string): Promise<number | null> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT unit_price FROM purchases WHERE product_id = ? ORDER BY purchased_at DESC LIMIT 1`,
      [productId],
    );
    return rows[0]?.unit_price != null ? Number(rows[0].unit_price) : null;
  }

  async predictionHorizonDays(orgId: string): Promise<number> {
    return this.intSetting(orgId, 'prediction_horizon_days', 30);
  }

  async expiryAlertDays(orgId: string): Promise<number> {
    return this.intSetting(orgId, 'expiry_alert_days', 7);
  }

  async sumPurchases(orgId: string, from: Date, to: Date): Promise<number> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT COALESCE(SUM(pu.total_amount), 0) AS total
       FROM purchases pu JOIN products p ON p.id = pu.product_id
       WHERE p.organization_id = ? AND pu.purchased_at >= ? AND pu.purchased_at <= ?`,
      [orgId, from, to],
    );
    return num(rows[0]?.total);
  }

  async findOrganizationStatus(orgId: string): Promise<string | null> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT status FROM organizations WHERE id = ?`,
      [orgId],
    );
    return rows[0]?.status != null ? String(rows[0].status) : null;
  }

  async findProductByIdAndOrg(productId: string, orgId: string): Promise<ProductRow | null> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, name, category, sku, quantity, min_quantity, unit, avg_cost, last_cost, expiry_date
       FROM products WHERE id = ? AND organization_id = ?`,
      [productId, orgId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      name: String(r.name ?? ''),
      category: r.category != null ? String(r.category) : null,
      sku: r.sku != null ? String(r.sku) : null,
      quantity: num(r.quantity),
      minQuantity: num(r.min_quantity),
      unit: String(r.unit ?? 'UNIT'),
      avgCost: r.avg_cost != null ? Number(r.avg_cost) : null,
      lastCost: r.last_cost != null ? Number(r.last_cost) : null,
      expiryDate: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
    };
  }

  private async intSetting(orgId: string, column: string, def: number): Promise<number> {
    const allowed = new Set(['prediction_horizon_days', 'expiry_alert_days']);
    if (!allowed.has(column)) return def;
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT ${column} AS v FROM organization_settings WHERE organization_id = ?`,
      [orgId],
    );
    return rows[0]?.v != null ? Number(rows[0].v) : def;
  }
}
