import ExcelJS from 'exceljs';
import { AnalyticsDao, ProductRow } from '../db/analyticsDao.js';
import { ReportInsightsService } from './reportInsightsService.js';
import { randomUUID } from 'node:crypto';
import { whatsappDownloads } from '../db/mongo.js';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ReportExportService {
  private readonly insights: ReportInsightsService;

  constructor(private readonly dao: AnalyticsDao) {
    this.insights = new ReportInsightsService(dao);
  }

  async exportInventario(orgId: string): Promise<Buffer> {
    const inventory = await this.insights.inventoryOverview(orgId);
    const products = await this.dao.findProducts(orgId);
    const wb = new ExcelJS.Workbook();
    writeResumenSheet(wb, inventory);
    writeProductosSheet(wb, products);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async exportRotacion(orgId: string, from?: Date, to?: Date): Promise<Buffer> {
    const rotation = await this.insights.rotation(orgId, from, to);
    const wb = new ExcelJS.Workbook();
    writeRotacionSheet(wb, rotation);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async exportCompleto(orgId: string, from?: Date, to?: Date): Promise<Buffer> {
    const inventory = await this.insights.inventoryOverview(orgId);
    const rotation = await this.insights.rotation(orgId, from, to);
    const products = await this.dao.findProducts(orgId);
    const wb = new ExcelJS.Workbook();
    writeResumenSheet(wb, inventory);
    writeProductosSheet(wb, products);
    writeRotacionSheet(wb, rotation);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async exportByType(orgId: string, type: string, from?: Date, to?: Date): Promise<{ buffer: Buffer; fileName: string }> {
    const today = new Date().toISOString().slice(0, 10);
    const t = type.trim().toLowerCase();
    if (t === 'inventario' || t === 'stock') {
      return { buffer: await this.exportInventario(orgId), fileName: `reporte-inventario-${today}.xlsx` };
    }
    if (t === 'rotacion' || t === 'rotación') {
      return { buffer: await this.exportRotacion(orgId, from, to), fileName: `reporte-rotacion-${today}.xlsx` };
    }
    if (t === 'completo' || t === 'general') {
      return { buffer: await this.exportCompleto(orgId, from, to), fileName: `reporte-completo-${today}.xlsx` };
    }
    throw new Error(`Tipo de reporte no reconocido: ${type}`);
  }
}

export class WhatsappDownloadService {
  constructor(private readonly publicBaseUrl: string) {}

  isConfigured(): boolean {
    return Boolean(this.publicBaseUrl?.trim());
  }

  async store(orgId: string, fileName: string, data: Buffer): Promise<{ token: string; downloadUrl: string } | null> {
    if (!this.isConfigured()) return null;
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await whatsappDownloads().insertOne({
      token,
      organizationId: orgId,
      fileName,
      contentType: XLSX_CONTENT_TYPE,
      data,
      expiresAt,
      createdAt: new Date(),
    });
    const base = this.publicBaseUrl.replace(/\/+$/, '');
    return { token, downloadUrl: `${base}/api/webhook/reports/${token}` };
  }

  async load(token: string) {
    const doc = await whatsappDownloads().findOne({ token, expiresAt: { $gt: new Date() } });
    return doc;
  }
}

function writeResumenSheet(wb: ExcelJS.Workbook, inventory: Awaited<ReturnType<ReportInsightsService['inventoryOverview']>>) {
  const sheet = wb.addWorksheet('Resumen');
  sheet.addRow(['Metrica', 'Valor']);
  sheet.addRow(['Total SKU', inventory.totalSku]);
  sheet.addRow(['Valor estimado', inventory.totalEstimatedValue]);
  sheet.addRow([]);
  sheet.addRow(['Categoria', 'SKU', 'Cantidad total', 'Gasto estimado']);
  for (const cat of inventory.byCategory) {
    sheet.addRow([cat.category, cat.skuCount, cat.quantitySum, cat.estimatedSpend]);
  }
}

function writeProductosSheet(wb: ExcelJS.Workbook, products: ProductRow[]) {
  const sheet = wb.addWorksheet('Productos');
  sheet.addRow(['Nombre', 'SKU', 'Cantidad', 'Unidad', 'Minimo', 'Categoria', 'Stock bajo']);
  for (const p of products) {
    const low = p.quantity <= p.minQuantity;
    sheet.addRow([
      p.name,
      p.sku ?? '',
      p.quantity,
      (p.unit ?? 'unit').toLowerCase(),
      p.minQuantity,
      p.category?.trim() || 'Sin categoría',
      low ? 'Si' : 'No',
    ]);
  }
}

function writeRotacionSheet(wb: ExcelJS.Workbook, rotation: Awaited<ReturnType<ReportInsightsService['rotation']>>) {
  const sheet = wb.addWorksheet('Rotacion');
  sheet.addRow(['Producto', 'Categoria', 'Consumido', 'Promedio diario', 'Dias restantes est.', 'Velocidad']);
  for (const row of rotation.rows) {
    sheet.addRow([
      row.productName,
      row.category,
      row.unitsConsumed,
      row.avgDailyConsumption ?? '',
      row.estimatedDaysRemaining ?? '',
      row.velocity,
    ]);
  }
}
