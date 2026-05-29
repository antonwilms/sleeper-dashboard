import { openDB } from 'idb';

const DB_NAME = 'sleeper-dashboard';
const STORE = 'cache';
const DEFAULT_TTL = 60;
const PLAYERS_TTL = 1440;

let dbPromise;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function getCache(key) {
  const db = await getDB();
  const record = await db.get(STORE, key);
  if (!record) {
    console.log('[cache miss]', key);
    return null;
  }
  if (Date.now() > record.expiresAt) {
    await db.delete(STORE, key);
    console.log('[cache miss]', key, '(expired)');
    return null;
  }
  console.log('[cache hit]', key);
  return record.data;
}

export async function setCache(key, value, ttlMinutes) {
  const ttl = ttlMinutes ?? (key.includes('players') ? PLAYERS_TTL : DEFAULT_TTL);
  const expiresAt = Date.now() + ttl * 60 * 1000;
  const db = await getDB();
  await db.put(STORE, { key, data: value, expiresAt });
}

export async function getCacheRecord(key) {
  const db = await getDB();
  const record = await db.get(STORE, key);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    await db.delete(STORE, key);
    return null;
  }
  return {
    data: record.data,
    expiresAt: record.expiresAt,
    sourceLastModified: record.sourceLastModified ?? null,
    sourceSchemaVersion: record.sourceSchemaVersion ?? null,
  };
}

export async function setCacheWithMeta(key, value, ttlMinutes, meta = {}) {
  const ttl = ttlMinutes ?? (key.includes('players') ? PLAYERS_TTL : DEFAULT_TTL);
  const expiresAt = Date.now() + ttl * 60 * 1000;
  const db = await getDB();
  await db.put(STORE, {
    key,
    data: value,
    expiresAt,
    sourceLastModified: meta.sourceLastModified ?? null,
    sourceSchemaVersion: meta.sourceSchemaVersion ?? null,
  });
}

export async function clearCache(prefix) {
  const db = await getDB();
  if (!prefix) {
    await db.clear(STORE);
    return;
  }
  // Walk the store and delete only keys that match the prefix
  const tx = db.transaction(STORE, 'readwrite');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (String(cursor.key).startsWith(prefix)) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
