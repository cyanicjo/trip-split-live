import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import net from 'node:net';

export async function startDatabase() {
  const dir = await mkdtemp(join(tmpdir(), 'trip-security-'));
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  const db = new EmbeddedPostgres({ databaseDir: join(dir, 'db'), user: 'postgres', password: randomBytes(24).toString('hex'),
    port, persistent: false, createPostgresUser: false, postgresFlags: ['-h', '127.0.0.1', '-k', dir, '-c', 'wal_level=logical'],
    onLog: () => {}, onError: () => {} });
  try {
    await db.initialise();
    await db.start();
    const client = db.getPgClient();
    await client.connect();
    await client.query(`create role anon; create role authenticated; create publication supabase_realtime;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.identities(user_id uuid references auth.users, provider text);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth to anon, authenticated;`);
    return { client, db, async close() { await client.end(); await db.stop(); await rm(dir, { recursive: true, force: true }); } };
  } catch (error) { await db.stop().catch(() => {}); await rm(dir, { recursive: true, force: true }); throw error; }
}

export async function asRole(client, role, sql, params = []) {
  if (!['anon', 'authenticated'].includes(role)) throw new Error('Test role not allowed');
  await client.query('begin');
  try { await client.query(`set local role ${role}`); const r = await client.query(sql, params); await client.query('commit'); return r; }
  catch (error) { await client.query('rollback'); throw error; }
}
