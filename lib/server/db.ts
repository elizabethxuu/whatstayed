/**
 * The database. In production this is Postgres (Neon, via DATABASE_URL).
 * Locally, with no DATABASE_URL, it runs a real Postgres engine in-process (PGlite)
 * and keeps its files in .data/, so development and tests use the same SQL.
 */
import type { Pool } from 'pg';

export class ConfigError extends Error {}

type Row = Record<string, unknown>;
export type Query = <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>;

const SCHEMA = `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  pass_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user on sessions(user_id);
create table if not exists conversations (
  user_id uuid primary key references users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists memories (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  place text not null,
  when_text text,
  moment text not null,
  feeling text not null,
  weight text not null,
  echoes text,
  because text,
  origin text not null default 'you',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists entries (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  body text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);
create table if not exists locations (
  user_id uuid not null,
  memory_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, memory_id),
  foreign key (user_id, memory_id) references memories(user_id, id) on delete cascade
);
create table if not exists threads (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  a text not null,
  b text not null,
  note text,
  origin text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists dismissed (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  primary key (user_id, key)
);
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  owner_type text not null,
  owner_id text not null,
  kind text not null,
  mime text not null,
  size integer not null,
  duration_ms integer,
  bytes bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists media_owner on media(user_id, owner_type, owner_id);
`;

type G = typeof globalThis & { __wsdb?: Promise<Query> };
const g = globalThis as G;

async function connect(): Promise<Query> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let q: Query;
  if (url) {
    const { Pool } = await import('pg');
    const pool: Pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
    q = async (text, params) => (await pool.query(text, params as unknown[])).rows;
  } else {
    if (process.env.VERCEL) {
      throw new ConfigError('No database is connected. Add Neon in Vercel → Storage, then redeploy.');
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || '.data/pglite';
    const lite = new PGlite(dir === 'memory' ? undefined : dir);
    q = async (text, params) => (await lite.query(text, params as unknown[])).rows as never;
  }
  // PGlite can't run several statements with params; run the schema as plain statements.
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await q(stmt);
  return q;
}

export function db(): Promise<Query> {
  if (!g.__wsdb) {
    g.__wsdb = connect().catch((e) => {
      g.__wsdb = undefined;
      throw e;
    });
  }
  return g.__wsdb;
}

/** Timestamps as milliseconds, for the client. */
export const ms = (col: string) => `(extract(epoch from ${col}) * 1000)::float8`;
