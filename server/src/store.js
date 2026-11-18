import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const MONGO_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGODB_DB || 'coupleorder';

const DEFAULT_DATA = () => ({ users: [], pairs: [], menuItems: [], orders: [], seq: { user: 0, pair: 0, menuItem: 0, order: 0 } });

function loadFileData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) return DEFAULT_DATA();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const base = DEFAULT_DATA();
    return { ...base, ...parsed, seq: { ...base.seq, ...(parsed.seq || {}) } };
  } catch (err) {
    console.error('[store] data.json 读取失败，使用空数据:', err.message);
    return DEFAULT_DATA();
  }
}

export const db = loadFileData();
let database = null;
let mongoClient = null;
let usingFileFallback = true;

export async function connectStore() {
  if (!MONGO_URI) {
    if (process.env.NODE_ENV === 'production') throw new Error('缺少 MONGODB_URI');
    console.warn('[store] 未配置 MongoDB，本地开发使用 data.json 回退');
    return;
  }
  try {
    mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2500 });
    await mongoClient.connect();
    database = mongoClient.db(MONGO_DB);
    await Promise.all([
      database.collection('users').createIndex({ email: 1 }, { unique: true }),
      database.collection('users').createIndex({ pairCode: 1 }, { unique: true, sparse: true }),
      database.collection('pairs').createIndex({ userA: 1, userB: 1 }, { unique: true }),
      database.collection('menuItems').createIndex({ pairId: 1, id: 1 }),
      database.collection('orders').createIndex({ pairId: 1, createdAt: -1 }),
      database.collection('auditLogs').createIndex({ createdAt: -1 }),
    ]);
    for (const name of ['users', 'pairs', 'menuItems', 'orders']) {
      db[name].length = 0;
      db[name].push(...await database.collection(name).find({}, { projection: { _id: 0 } }).toArray());
    }
    const counters = await database.collection('counters').find().toArray();
    for (const counter of counters) db.seq[counter._id] = counter.value;
    usingFileFallback = false;
    console.log(`[store] MongoDB 已连接: ${MONGO_DB}`);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    database = null;
    usingFileFallback = true;
    console.warn('[store] MongoDB 不可用，本地开发回退 data.json:', err.message);
    if (mongoClient) await mongoClient.close().catch(() => {});
  }
}

export async function save() {
  if (usingFileFallback || !database) {
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    return;
  }
  for (const name of ['users', 'pairs', 'menuItems', 'orders']) {
    const col = database.collection(name);
    await col.deleteMany({});
    if (db[name].length) await col.insertMany(db[name].map((item) => ({ ...item })));
  }
  await database.collection('counters').bulkWrite(
    Object.entries(db.seq).map(([key, value]) => ({ updateOne: { filter: { _id: key }, update: { $set: { value } }, upsert: true } })),
  );
}

export function auditLog(action, userId, result, details = '') {
  const log = { action, userId: userId || null, result, details: String(details).slice(0, 500), createdAt: new Date().toISOString() };
  if (database) database.collection('auditLogs').insertOne(log).catch((err) => console.error('[audit]', err.message));
  else console.info(`[audit] ${action} user=${userId || '-'} result=${result}`);
}

export function nextId(collectionName) {
  const key = collectionName.replace(/s$/, '');
  db.seq[key] = (db.seq[key] || 0) + 1;
  return db.seq[key];
}

export function getPairId(user) {
  if (!user || !user.partnerId) return null;
  return [user.id, user.partnerId].sort((a, b) => a - b).join('-');
}
