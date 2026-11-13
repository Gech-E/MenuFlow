import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import pg from "pg";

function executable(name) {
  const win = process.platform === "win32";
  const fromConfig = spawnSync("pg_config", ["--bindir"], { encoding: "utf8", windowsHide: true });
  const bin = process.env.PG_BINDIR || fromConfig.stdout?.trim() ||
    (win ? "C:\\Program Files\\PostgreSQL\\18\\bin" : "");
  return path.join(bin, name + (win ? ".exe" : ""));
}

function run(name, args) {
  const starting = name === "pg_ctl" && args.includes("start");
  const result = spawnSync(executable(name), args, { encoding: "utf8", windowsHide: true, timeout: 90000,
    stdio: starting ? "ignore" : "pipe" });
  if (result.error || result.status !== 0) throw new Error(name + " failed: " + (result.error?.message || result.stderr || result.stdout));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((ok, fail) => server.once("error", fail).listen(0, "127.0.0.1", ok));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Only disposable clusters created by this process are used. No application DSN is read.
export async function bootDatabase({ beforeUpgrade } = {}) {
  const parent = path.resolve(tmpdir());
  const work = mkdtempSync(path.join(parent, "menuflow-db-test-"));
  const data = path.join(work, "data");
  const password = randomBytes(32).toString("hex");
  const pwfile = path.join(work, "test-password");
  const port = await freePort();
  let pool, started = false;
  async function stop() {
    if (pool) { await pool.end(); pool = undefined; }
    if (started || existsSync(path.join(data,"postmaster.pid"))) { run("pg_ctl", ["-D", data, "-w", "-m", "fast", "stop"]); started = false; }
    if (path.dirname(work) !== parent || !path.basename(work).startsWith("menuflow-db-test-")) throw new Error("Invalid test directory.");
    rmSync(work, { recursive: true, force: true });
  }
  try {
    writeFileSync(pwfile, password + "\n", { mode: 0o600 });
    run("initdb", ["-D", data, "-U", "postgres", "-A", "scram-sha-256", "--pwfile", pwfile, "--no-locale", "--encoding=UTF8"]);
    rmSync(pwfile);
    run("pg_ctl", ["-D", data, "-l", path.join(work, "postgres.log"), "-w", "-o", "-h 127.0.0.1 -p " + port, "start"]);
    started = true;
    pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", password, max: 12 });
    await pool.query(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions;
      create extension pgcrypto with schema extensions;
      create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid
      $$;
    `);
    await pool.query(`
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant usage on schema auth,extensions,public to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    `);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const files = readdirSync(directory).filter(f => f.endsWith(".sql")).sort();
    for (const [i, file] of files.entries()) {
      try { await pool.query(readFileSync(new URL(file, directory), "utf8")); }
      catch (cause) { throw new Error("Migration failed: " + file, { cause }); }
      if (i === 0 && beforeUpgrade) await beforeUpgrade(pool);
    }
    return { pool, stop };
  } catch (error) {
    if (!started && existsSync(path.join(work, "postgres.log"))) {
      console.error(readFileSync(path.join(work, "postgres.log"), "utf8").slice(-800));
    }
    await stop(); throw error;
  }
}

export async function createUser(pool, email) {
  const id = randomUUID();
  await pool.query("insert into auth.users(id,email,email_confirmed_at,confirmed_at) values($1,$2,now(),now())", [id,email]);
  return id;
}

export async function asActor(pool, userId, fn) {
  const email = userId ? (await pool.query("select email from auth.users where id=$1", [userId])).rows[0]?.email : null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(userId ? "set local role authenticated" : "set local role anon");
    await client.query("select set_config('request.jwt.claims',$1,true), set_config('request.jwt.claim.sub',$2,true)",
      [JSON.stringify({ role: userId ? "authenticated" : "anon", sub: userId, email }), userId || ""]);
    const value = await fn(client);
    await client.query("commit");
    return value;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
