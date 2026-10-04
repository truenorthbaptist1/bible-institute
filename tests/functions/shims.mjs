// Lets the Supabase (Deno) functions run under Node for testing:
// a Deno global, a psql-backed stand-in for the `postgres` library, and a
// TLS connector for the fake mail server.
import { execFileSync } from "node:child_process";
import tls from "node:tls";

export const PSQL = ["-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", process.env.TESTDB || "t", "-At", "-v", "ON_ERROR_STOP=1", "-q"];

export function psql(query) {
  return execFileSync("psql", PSQL, { input: query, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
}

function lit(v) {
  if (v === null || v === undefined) return "null";
  if (v && v.__json) return `'${JSON.stringify(v.value).replace(/'/g, "''")}'::jsonb`;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'::timestamptz`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function makeSql() {
  const sql = (strings, ...vals) => {
    let q = strings[0];
    vals.forEach((v, i) => { q += lit(v) + strings[i + 1]; });
    const trimmed = q.trim();
    const isSelect = /^select\b/i.test(trimmed);
    const out = isSelect ? psql(`select coalesce(json_agg(t), '[]') from (${trimmed}) t`) : (psql(trimmed), "[]");
    return Promise.resolve(JSON.parse(out || "[]"));
  };
  sql.json = (value) => ({ __json: true, value });
  return sql;
}

const env = { ...process.env };
globalThis.Deno = { env: { get: (k) => env[k] } };
export function setEnv(k, v) { if (v === undefined) delete env[k]; else env[k] = v; }

export function nodeTlsWire(port) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: "127.0.0.1", port, rejectUnauthorized: false }, () => {
      const queue = []; let waiting = null; let ended = false;
      sock.on("data", (d) => { if (waiting) { const w = waiting; waiting = null; w(d); } else queue.push(d); });
      sock.on("end", () => { ended = true; if (waiting) { const w = waiting; waiting = null; w(null); } });
      resolve({
        async read(buf) {
          const d = queue.length ? queue.shift() : ended ? null : await new Promise((r) => (waiting = r));
          if (!d) return null;
          const n = Math.min(d.length, buf.length);
          buf.set(d.subarray(0, n));
          if (n < d.length) queue.unshift(d.subarray(n));
          return n;
        },
        async write(b) { await new Promise((r) => sock.write(b, r)); return b.length; },
        close() { sock.end(); },
      });
    });
    sock.on("error", reject);
  });
}
