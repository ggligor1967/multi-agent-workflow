import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: MySql2Database | null = null;
let _pool: mysql.Pool | null = null;

// =============================================================================
// DATABASE CONNECTION POOLING
// =============================================================================
// Connection pool configuration for better performance
const POOL_CONFIG = {
  connectionLimit: 10,        // Maximum number of connections
  queueLimit: 0,              // Unlimited queue
  waitForConnections: true,   // Wait for available connection
  enableKeepAlive: true,      // Keep connections alive
  keepAliveInitialDelay: 10000, // 10 seconds
};

async function ensureDatabaseConnection(): Promise<void> {
  if (_db || _pool || !ENV.databaseUrl) {
    return;
  }

  try {
    _pool = mysql.createPool({
      uri: ENV.databaseUrl,
      ...POOL_CONFIG,
    });
    _db = drizzle(_pool);
    console.log("[Database] Connection pool initialized");
  } catch (error) {
    console.warn("[Database] Failed to connect:", error);
    _db = null;
    _pool = null;
  }
}

// Lazily create the drizzle instance with connection pooling
export async function getDb(): Promise<MySql2Database | null> {
  await ensureDatabaseConnection();
  return _db;
}

export async function getDbPool(): Promise<mysql.Pool | null> {
  await ensureDatabaseConnection();
  return _pool;
}

/** Close the database connection pool (for graceful shutdown) */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    console.log("[Database] Connection pool closed");
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
