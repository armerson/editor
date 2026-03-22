import Database from "better-sqlite3"
import path from "node:path"
import fs from "node:fs"
import { logger } from "./logger"

const DB_PATH = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.resolve(process.cwd(), "data", "render-jobs.db")

// Ensure parent directory exists before opening the database.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)

// WAL mode: allows concurrent readers while a writer is active.
db.pragma("journal_mode = WAL")
db.pragma("synchronous = NORMAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS render_jobs (
    id          TEXT PRIMARY KEY NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    progress    REAL NOT NULL DEFAULT 0,
    download_url TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash        TEXT NOT NULL,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    tier                 TEXT NOT NULL DEFAULT 'free',
    renders_this_month   INTEGER NOT NULL DEFAULT 0,
    renders_period_start TEXT NOT NULL DEFAULT (strftime('%Y-%m-01', 'now'))
  )
`)

// Idempotent migrations — add new columns to existing databases.
for (const sql of [
  `ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'`,
  `ALTER TABLE users ADD COLUMN renders_this_month INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN renders_period_start TEXT NOT NULL DEFAULT (strftime('%Y-%m-01', 'now'))`,
]) {
  try { db.exec(sql) } catch { /* column already exists — safe to ignore */ }
}

logger.info({ db: DB_PATH }, "SQLite database ready")

export default db
