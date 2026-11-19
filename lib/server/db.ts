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
alter table memories add column if not exists happened_on date;
alter table entries add column if not exists location jsonb;
create table if not exists people (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  name text not null,
  relation text,
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists links (
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  a text not null,
  b text not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, a, b)
);
create index if not exists links_b on links(user_id, kind, b);
create table if not exists collections (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  name text not null,
  description text,
  cover text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists collection_items (
  user_id uuid not null references users(id) on delete cascade,
  collection_id text not null,
  kind text not null,
  item_id text not null,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (user_id, collection_id, kind, item_id)
);
create table if not exists letters (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  body text not null,
  open_on date not null,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists milestones (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  title text not null,
  on_date date not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table memories add column if not exists extra jsonb;
create table if not exists talks (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  title text not null default '',
  mode text not null default 'free',
  trip jsonb,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists drafts (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  talk_id text not null,
  data jsonb not null,
  status text not null default 'draft',
  memory_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists drafts_talk on drafts(user_id, talk_id);
create table if not exists rate_hits (
  key text not null,
  bucket bigint not null,
  count integer not null default 0,
  primary key (key, bucket)
);
insert into talks (user_id, id, title, messages, created_at, updated_at)
  select user_id, 'talk-first', 'Earlier conversation', messages, updated_at, updated_at from conversations
  where jsonb_array_length(messages) > 0
  on conflict do nothing;
update conversations set messages = '[]'::jsonb where jsonb_array_length(messages) > 0;
create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table entries add column if not exists meta jsonb;
create table if not exists resets (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false
)
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
