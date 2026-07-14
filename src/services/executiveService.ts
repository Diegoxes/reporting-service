import { AnalyticsDao } from '../db/analyticsDao.js';
import { ReportInsightsService } from './reportInsightsService.js';

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function isLowStock(p: { quantity: number; minQuantity: number }): boolean {
  return p.quantity <= p.minQuantity;
}

function isExpiringSoon(expiryDate: string | null, alertDays: number): boolean {
  if (!expiryDate) return false;
  const exp = new Date(expiryDate);
  const limit = new Date();
  limit.setDate(limit.getDate() + alertDays);
  return exp <= limit;
}

export class ExecutiveService {
  private readonly insights: ReportInsightsService;

  constructor(private readonly dao: AnalyticsDao) {
    this.insights = new ReportInsightsService(dao);
  }

  async executive(orgId: string) {
    const alertDays = await this.dao.expiryAlertDays(orgId);
    const products = await this.dao.findProducts(orgId);

    let totalValue = 0;
    for (const p of products) {
      const cost = p.avgCost ?? p.lastCost ?? 0;
      totalValue += cost * p.quantity;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now);
    monthEnd.setHours(23, 59, 59, 999);
    const monthSpend = await this.dao.sumPurchases(orgId, monthStart, monthEnd);

    const low = products.filter(isLowStock).length;
    const expiring = products.filter(p => isExpiringSoon(p.expiryDate, alertDays)).length;
    const inv = await this.insights.inventoryOverview(orgId);

    return {
      totalStockValue: round2(totalValue),
      monthPurchaseSpend: round2(monthSpend),
      lowStockCount: low,
      expiringCount: expiring,
      topRotation: inv.topConsumed30d,
      stagnantProductIds: inv.stagnantProductIds,
    };
  }
}
