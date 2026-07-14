import { MongoClient, Db, Collection } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export interface ReportSnapshotDoc {
  _id?: string;
  organizationId: string;
  type: string;
  periodStart: Date;
  periodEnd: Date;
  payload: unknown;
  createdAt: Date;
}

export interface WhatsappDownloadDoc {
  _id?: string;
  token: string;
  organizationId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
  expiresAt: Date;
  createdAt: Date;
}

export async function connectMongo(): Promise<Db> {
  if (db) return db;
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/smarthome_reports';
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  await db.collection('report_snapshots').createIndex({ organizationId: 1, createdAt: -1 });
  await db.collection('whatsapp_downloads').createIndex({ token: 1 }, { unique: true });
  await db.collection('whatsapp_downloads').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return db;
}

export function snapshots(): Collection<ReportSnapshotDoc> {
  if (!db) throw new Error('MongoDB not connected');
  return db.collection<ReportSnapshotDoc>('report_snapshots');
}

export function whatsappDownloads(): Collection<WhatsappDownloadDoc> {
  if (!db) throw new Error('MongoDB not connected');
  return db.collection<WhatsappDownloadDoc>('whatsapp_downloads');
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
