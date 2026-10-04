// ============================================================================
// attendance-reminders — Supabase Edge Function
//
// Sends a teacher a phone notification when their class starts: "Time to
// take attendance", with a tap-through link straight into that day's
// attendance page. Runs every minute (scheduled by
// supabase/reminders-schedule.sql). Each class day is reminded at most once,
// and only if attendance hasn't already been taken.
//
// Three ways it's called:
//   (no query)   — the every-minute run: send any reminders that are due
//   ?setup=1     — make the site's push keys if they don't exist yet
//                  (the website calls this the first time someone turns
//                  reminders on; harmless to call again)
//   ?test=1      — send a test notification to the signed-in person's own
//                  devices (the website's "Send a test" button)
//
// Uses only the database connection Supabase gives every function
// (SUPABASE_DB_URL) and the browser-standard Web Crypto API — no other
// keys or settings to configure. Deploy with "Verify JWT" turned OFF.
// ============================================================================
import postgres from "npm:postgres@3.4.5";

const SITE = "https://tnbbibleinstitute.com";
const CONTACT = "mailto:truenorthbaptist1@gmail.com";
const CORS = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// VAPID keys: made once, kept in the database (never readable by the site).
// ---------------------------------------------------------------------------
type Keys = { publicKey: string; privateJwk: JsonWebKey };

export async function makeVapidKeys(): Promise<Keys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64url(raw), privateJwk };
}

async function vapidHeader(endpoint: string, keys: Keys): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT })));
  const signingKey = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------------------
// Message encryption (RFC 8291, "aes128gcm"), as every push service requires.
// ---------------------------------------------------------------------------
export async function encryptPayload(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(enc.encode(payload), new Uint8Array([2])); // 2 = last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

// Returns the push service's HTTP status (201 = delivered to the service).
export async function sendPush(sub: Sub, message: object, keys: Keys, fetchImpl = fetch): Promise<number> {
  const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "7200",
      Urgency: "high",
    },
    body,
  });
  try { await res.arrayBuffer(); } catch (_) { /* ignore body */ }
  return res.status;
}

// ---------------------------------------------------------------------------
// The work
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type Sql = any;

async function getKeys(sql: Sql, create: boolean): Promise<Keys | null> {
  const rows = await sql`select public_key, private_jwk from public.push_keys where id = 1`;
  if (rows.length) return { publicKey: rows[0].public_key, privateJwk: rows[0].private_jwk };
  if (!create) return null;
  const k = await makeVapidKeys();
  await sql`insert into public.push_keys (id, public_key, private_jwk) values (1, ${k.publicKey}, ${sql.json(k.privateJwk)}) on conflict (id) do nothing`;
  return getKeys(sql, false);
}

async function sendToUser(sql: Sql, userId: string, message: object, keys: Keys, fetchImpl = fetch) {
  const subs: Sub[] = await sql`select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = ${userId}`;
  let delivered = 0;
  for (const s of subs) {
    try {
      const status = await sendPush(s, message, keys, fetchImpl);
      if (status === 404 || status === 410) {
        // The phone turned notifications off or the app was removed.
        await sql`delete from public.push_subscriptions where id = ${s.id}`;
      } else if (status >= 200 && status < 300) {
        delivered++;
      } else {
        console.warn("push service answered", status, "for", new URL(s.endpoint).host);
      }
    } catch (e) {
      console.warn("push failed:", e);
    }
  }
  return { devices: subs.length, delivered };
}

function prettyTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
}

export async function runReminders(sql: Sql, fetchImpl = fetch) {
  const due = await sql`select * from public.claim_attendance_reminders()`;
  if (!due.length) return { sent: 0 };
  const keys = await getKeys(sql, true);
  let sent = 0;
  for (const r of due) {
    const date = r.class_date instanceof Date ? r.class_date.toISOString().slice(0, 10) : String(r.class_date).slice(0, 10);
    const msg = {
      title: "Time to take attendance",
      body: `${r.course_title} started at ${prettyTime(r.class_time)}. Tap to mark who's here.`,
      url: `${SITE}/?attendance=${encodeURIComponent(r.course_id)}&date=${date}`,
      tag: `attendance-${r.course_id}-${date}`,
    };
    const res = await sendToUser(sql, r.teacher_id, msg, keys, fetchImpl);
    sent += res.delivered;
  }
  return { sent, classes: due.length };
}

// Who is calling? (Only for ?test=1.) Asks Supabase Auth to vouch for the
// sign-in token the website sent.
async function callerId(req: Request, fetchImpl = fetch): Promise<string | null> {
  const authz = req.headers.get("authorization") || "";
  const apikey = req.headers.get("apikey") || "";
  const base = Deno.env.get("SUPABASE_URL");
  if (!authz.startsWith("Bearer ") || !apikey || !base) return null;
  const res = await fetchImpl(`${base}/auth/v1/user`, { headers: { Authorization: authz, apikey } });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? u.id : null;
}

export async function handler(req: Request, sql: Sql, fetchImpl = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  try {
    if (url.searchParams.has("setup")) {
      const keys = await getKeys(sql, true);
      return json({ publicKey: keys && keys.publicKey });
    }
    if (url.searchParams.has("test")) {
      const uid = await callerId(req, fetchImpl);
      if (!uid) return json({ error: "Please sign in again." }, 401);
      const keys = await getKeys(sql, true);
      const res = await sendToUser(sql, uid, {
        title: "Reminders are working",
        body: "You'll get a note like this when each of your classes starts.",
        url: `${SITE}/`,
        tag: "tnbbi-test",
      }, keys!, fetchImpl);
      return json(res);
    }
    return json(await runReminders(sql, fetchImpl));
  } catch (e) {
    console.error(e);
    return json({ error: String(e && (e as Error).message || e) }, 500);
  }
}

// Supabase runs this; tests import handler() directly instead.
if (typeof Deno !== "undefined" && Deno.env.get("SUPABASE_DB_URL")) {
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
  Deno.serve((req: Request) => handler(req, sql));
}
