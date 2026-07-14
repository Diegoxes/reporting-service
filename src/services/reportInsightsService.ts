import { AnalyticsDao, ProductRow } from '../db/analyticsDao.js';

export interface RotationReportRow {
  productId: string;
  productName: string;
  category: string;
  unitsConsumed: number;
  avgDailyConsumption?: number;
  estimatedDaysRemaining?: number;
  velocity: string;
}

export interface RotationReport {
  fromInclusive: string;
  toInclusive: string;
  rows: RotationReportRow[];
}

export interface CategoryBreakdown {
  category: string;
  skuCount: number;
  quantitySum: number;
  estimatedSpend: number;
}

export interface InventoryReport {
  totalSku: number;
  totalEstimatedValue: number;
  byCategory: CategoryBreakdown[];
  topConsumed30d: RotationReportRow[];
  stagnantProductIds: string[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function velocityLabel(avgDaily: number | null): string {
  if (avgDaily == null || avgDaily <= 0.000001) return 'UNKNOWN';
  if (avgDaily >= 1) return 'FAST';
  if (avgDaily >= 0.25) return 'NORMAL';
  return 'SLOW';
}

function estimateDaysRemaining(p: ProductRow, avgDaily: number | null): number | null {
  if (avgDaily == null || avgDaily <= 0.000001) return null;
  return round2(p.quantity / avgDaily);
}

export class ReportInsightsService {
  constructor(private readonly dao: AnalyticsDao) {}

  async rotation(orgId: string, from?: Date, to?: Date): Promise<RotationReport> {
    const end = to ?? new Date();
    const horizon = await this.dao.predictionHorizonDays(orgId);
    const start = from ?? new Date(end.getTime() - horizon * 86400000);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const daysParam = Math.max(1, Math.min(periodDays, 90));

    const products = await this.dao.findProducts(orgId);
    const consumed = await this.dao.aggregatedConsumed(orgId, start, end);

    const rows: RotationReportRow[] = [];
    for (const p of products) {
      const units = consumed.get(p.id) ?? 0;
      const avgRaw = await this.dao.avgDailyConsumption(p.id, start, daysParam);
      const avgDaily = round4(avgRaw);
      rows.push({
        productId: p.id,
        productName: p.name,
        category: p.category?.trim() || 'Sin categoría',
        unitsConsumed: round2(units),
        avgDailyConsumption: avgDaily > 0 ? avgDaily : undefined,
        estimatedDaysRemaining: estimateDaysRemaining(p, avgDaily > 0 ? avgDaily : null) ?? undefined,
        velocity: velocityLabel(avgDaily > 0 ? avgDaily : null),
      });
    }
    rows.sort((a, b) => b.unitsConsumed - a.unitsConsumed);

    return {
      fromInclusive: start.toISOString().slice(0, 10),
      toInclusive: end.toISOString().slice(0, 10),
      rows,
    };
  }

  async inventoryOverview(orgId: string): Promise<InventoryReport> {
    const all = await this.dao.findProducts(orgId);
    const today = new Date();
    const last30start = new Date(today);
    last30start.setDate(last30start.getDate() - 30);
    last30start.setHours(0, 0, 0, 0);
    const last30end = new Date(today);
    last30end.setHours(23, 59, 59, 999);

    const topMap = await this.dao.aggregatedConsumed(orgId, last30start, last30end);
    const byCat = new Map<string, { sku: number; quantitySum: number; spend: number }>();
    let valuation = 0;

    for (const p of all) {
      const catKey = p.category?.trim() || 'Sin categoría';
      const g = byCat.get(catKey) ?? { sku: 0, quantitySum: 0, spend: 0 };
      const unitCost = p.avgCost ?? (await this.dao.findLatestUnitPrice(p.id)) ?? 0;
      const lineVal = unitCost * p.quantity;
      valuation += lineVal;
      g.sku += 1;
      g.quantitySum += p.quantity;
      g.spend += lineVal;
      byCat.set(catKey, g);
    }

    const catRows: CategoryBreakdown[] = [...byCat.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, g]) => ({
        category,
        skuCount: g.sku,
        quantitySum: round2(g.quantitySum),
        estimatedSpend: round2(g.spend),
      }));

    const sinceStagnant = new Date(today);
    sinceStagnant.setDate(sinceStagnant.getDate() - 60);
    const active = await this.dao.consumedProductIdsSince(orgId, sinceStagnant);
    const stagnant = all.filter(p => !active.has(p.id)).map(p => p.id);

    const top10: RotationReportRow[] = [];
    for (const [productId, qty] of [...topMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      const p = await this.dao.findProductByIdAndOrg(productId, orgId);
      if (!p) continue;
      top10.push({
        productId: p.id,
        productName: p.name,
        category: p.category?.trim() || 'Sin categoría',
        unitsConsumed: round2(qty),
        velocity: 'UNKNOWN',
      });
    }

    return {
      totalSku: all.length,
      totalEstimatedValue: round2(valuation),
      byCategory: catRows,
      topConsumed30d: top10,
      stagnantProductIds: stagnant,
    };
  }

  async byCategory(orgId: string): Promise<CategoryBreakdown[]> {
    return (await this.inventoryOverview(orgId)).byCategory;
  }

  async bySupplier(orgId: string, from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 86400000);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const rows = await this.dao.sumBySupplier(orgId, start, end);
    return rows.map(r => ({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      totalSpend: round2(r.totalSpend),
    }));
  }

  async byChannel(orgId: string, from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 86400000);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const rows = await this.dao.sumByChannel(orgId, start, end);
    return rows.map(r => ({ channel: r.channel, unitsConsumed: round2(r.unitsConsumed) }));
  }
}
