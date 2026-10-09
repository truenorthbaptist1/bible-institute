// ============================================================================
// attendance-reminders — Supabase Edge Function
//
// The Institute's behind-the-scenes service. Runs every minute (scheduled
// by supabase/reminders-schedule.sql) and:
//   • reminds teachers to take attendance 5 minutes before their class starts
//   • turns assignment due dates into reminders for students (6 PM the
//     evening before and/or 8 AM the day it's due — their choice)
//   • delivers every bell notification to people's phones (Web Push) and
//     by email (right away, as a morning summary, or not at all — their
//     choice), so nobody has to sign in to find out what's new
//   • reads each course's YouTube playlist (every 30 minutes; every 2
//     minutes around class time, to catch the live stream) and posts new
//     lectures to the course — needs the secret YOUTUBE_API_KEY
//   • fills in online students' attendance from what they watched
//   • takes a nightly backup of the database (2 AM Alaska time) and emails
//     a copy to the church's Gmail once a week (Sunday morning)
// Email needs the GMAIL_APP_PASSWORD secret (see SETUP.md); everything
// else works without it.
//
// Ways it's called:
//   (no query)   — the every-minute run: send any reminders that are due
//   ?setup=1     — make the site's push keys if they don't exist yet
//                  (the website calls this the first time someone turns
//                  reminders on; harmless to call again)
//   ?testemail=1 — send a test email to the signed-in person
//   ?mailcheck=1 — can the function reach Gmail? (and is the password set?)
//   ?test=1      — send a test notification to the signed-in person's own
//                  devices (the website's "Send a test" button)
//
// Uses the database connection Supabase gives every function
// (SUPABASE_DB_URL) and the browser-standard Web Crypto API. Deploy with
// "Verify JWT" turned OFF.
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

// Has a class at "HH:MM" (Alaska time) already begun at this moment?
function classHasStarted(t: string, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Anchorage", hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value || 0);
  const [h, m] = t.split(":").map(Number);
  return get("hour") * 60 + get("minute") >= h * 60 + m;
}

function isoDay(d: unknown): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Email (Gmail, through the church account). Needs one secret set in
// Supabase → Edge Functions → Secrets: GMAIL_APP_PASSWORD (a Gmail "app
// password" for truenorthbaptist1@gmail.com). Without it, email is skipped
// and Settings → Behind the Scenes says so.
// ---------------------------------------------------------------------------
const GMAIL_USER = "truenorthbaptist1@gmail.com";
const FROM_NAME = "True North Baptist Church Bible Institute";

export type Wire = { read(buf: Uint8Array): Promise<number | null>; write(b: Uint8Array): Promise<number>; close(): void };
export type Mail = { to: string; subject: string; text: string; html?: string; attachment?: { name: string; type: string; bytes: Uint8Array } };

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, "$&\r\n");
}
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(enc.encode(s))}?=`;
}
function cleanAddress(a: string): string {
  const v = String(a || "").trim();
  if (!/^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/.test(v)) throw new Error("bad email address");
  return v;
}

export function buildMime(m: Mail, now = new Date()): string {
  const boundary = "tnbbi-" + crypto.randomUUID();
  const alt = "tnbbi-alt-" + crypto.randomUUID();
  const head = [
    `From: ${encodeHeader(FROM_NAME)} <${GMAIL_USER}>`,
    `To: <${cleanAddress(m.to)}>`,
    `Subject: ${encodeHeader(m.subject.replace(/[\r\n]+/g, " ").slice(0, 200))}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@tnbbibleinstitute.com>`,
    "MIME-Version: 1.0",
  ];
  const textPart = `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(enc.encode(m.text)))}`;
  const htmlPart = m.html ? `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(enc.encode(m.html)))}` : "";
  const body = m.html
    ? `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${textPart}\r\n--${alt}\r\n${htmlPart}\r\n--${alt}--\r\n`
    : textPart;
  if (!m.attachment) return head.join("\r\n") + "\r\n" + body;
  return head.join("\r\n") + `\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n` +
    `--${boundary}\r\n${body}\r\n` +
    `--${boundary}\r\nContent-Type: ${m.attachment.type}; name="${m.attachment.name}"\r\n` +
    `Content-Disposition: attachment; filename="${m.attachment.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    `${wrap76(b64(m.attachment.bytes))}\r\n--${boundary}--\r\n`;
}

// A small SMTP conversation (RFC 5321) over an already-encrypted connection.
export class Smtp {
  private buf = "";
  private wire: Wire;
  constructor(wire: Wire) { this.wire = wire; }
  private async line(): Promise<string> {
    const dec = new TextDecoder();
    for (;;) {
      const i = this.buf.indexOf("\r\n");
      if (i >= 0) { const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2); return l; }
      const chunk = new Uint8Array(4096);
      const n = await this.wire.read(chunk);
      if (n === null) throw new Error("The mail server closed the connection.");
      this.buf += dec.decode(chunk.subarray(0, n));
    }
  }
  async reply(expect: number[]): Promise<string> {
    let l = await this.line();
    let all = l;
    while (l.length > 3 && l[3] === "-") { l = await this.line(); all += "\n" + l; }
    const code = Number(l.slice(0, 3));
    if (!expect.includes(code)) throw new Error(`Mail server said: ${all.slice(0, 200)}`);
    return all;
  }
  async cmd(s: string, expect: number[]) {
    await this.wire.write(enc.encode(s + "\r\n"));
    return this.reply(expect);
  }
  async open(user: string, pass: string) {
    await this.reply([220]);
    await this.cmd("EHLO tnbbibleinstitute.com", [250]);
    await this.cmd("AUTH PLAIN " + b64(enc.encode(`\u0000${user}\u0000${pass}`)), [235]);
  }
  async send(from: string, to: string, mime: string) {
    await this.cmd(`MAIL FROM:<${from}>`, [250]);
    await this.cmd(`RCPT TO:<${cleanAddress(to)}>`, [250, 251]);
    await this.cmd("DATA", [354]);
    const stuffed = mime.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    await this.wire.write(enc.encode(stuffed + (stuffed.endsWith("\r\n") ? "" : "\r\n") + ".\r\n"));
    await this.reply([250]);
  }
  async close() {
    try { await this.cmd("QUIT", [221]); } catch (_) { /* ignore */ }
    try { this.wire.close(); } catch (_) { /* ignore */ }
  }
}

// deno-lint-ignore no-explicit-any
let connectMail: () => Promise<Wire> = async () => (await (Deno as any).connectTls({ hostname: "smtp.gmail.com", port: 465 })) as Wire;
export function setMailConnector(fn: () => Promise<Wire>) { connectMail = fn; }
function mailPassword(): string {
  try { return (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, ""); } catch (_) { return ""; }
}

// Sends several emails over one connection. Returns how many went.
export async function sendMails(mails: Mail[]): Promise<number> {
  if (!mails.length) return 0;
  const pass = mailPassword();
  if (!pass) throw new Error("Email isn't set up yet (the GMAIL_APP_PASSWORD secret is missing).");
  const smtp = new Smtp(await connectMail());
  let sent = 0;
  try {
    await smtp.open(GMAIL_USER, pass);
    for (const m of mails) {
      try { await smtp.send(GMAIL_USER, m.to, buildMime(m)); sent++; }
      catch (e) {
        console.warn("email to one person failed:", (e as Error).message);
        if (/closed the connection/.test((e as Error).message)) throw e;
        try { await smtp.cmd("RSET", [250]); } catch (_) { throw e; }
      }
    }
  } finally {
    await smtp.close();
  }
  return sent;
}

// ---------------------------------------------------------------------------
// What notifications look like on a phone and in an email
// ---------------------------------------------------------------------------
type Note = { user_id: string; subject: string; link: string; kind: string; email?: string; name?: string; digest?: boolean; created_at?: unknown };

const KIND_TITLE: Record<string, string> = {
  message: "New message", grade: "Grade posted", due: "Assignment due", cancel: "Class update",
  announcement: "Announcement", enrollment: "Enrollment", signup: "New sign-up waiting",
  transcript: "Final grade recorded", welcome: "Welcome!", teacher: "Your course",
  lecture: "New lecture", live: "Class is live",
};
function safeLink(link: string): string {
  return /^\/(\?[A-Za-z0-9_=&%.:\-|]*)?$/.test(link || "") ? link : "/";
}

export function groupByUser<T extends { user_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { if (!m.has(r.user_id)) m.set(r.user_id, []); m.get(r.user_id)!.push(r); }
  return m;
}

export function pushMessage(list: Note[]) {
  if (list.length === 1) {
    const n = list[0];
    return { title: KIND_TITLE[n.kind] || "Bible Institute", body: n.subject, url: SITE + safeLink(n.link), tag: `note-${n.kind}` };
  }
  const shown = list.slice(0, 3).map((n) => "• " + n.subject).join("\n") + (list.length > 3 ? `\n…and ${list.length - 3} more` : "");
  const sameLink = list.every((n) => n.link === list[0].link);
  return { title: `${list.length} new updates`, body: shown, url: SITE + (sameLink ? safeLink(list[0].link) : "/?notifications=1"), tag: "note-many" };
}

function escHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function emailFor(list: Note[], digest: boolean): Mail {
  const first = (list[0].name || "").trim().split(/\s+/)[0];
  const subject = digest
    ? `Your daily summary from the Bible Institute (${list.length} update${list.length === 1 ? "" : "s"})`
    : list.length === 1 ? list[0].subject : `${list.length} updates from the Bible Institute`;
  const intro = digest ? "Here's what happened at the Bible Institute since your last summary." : list.length === 1 ? "Here's an update from the Bible Institute." : "Here are a few updates from the Bible Institute.";
  const rows = list.map((n) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e7e2d6;">
        <div style="font:600 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#9a7a33;">${escHtml(KIND_TITLE[n.kind] || "Update")}</div>
        <div style="font:15px/1.5 Georgia,'Times New Roman',serif;color:#1a2c45;margin:4px 0 8px;">${escHtml(n.subject)}</div>
        <a href="${SITE}${safeLink(n.link)}" style="font:600 13px Arial,Helvetica,sans-serif;color:#3d5a78;text-decoration:none;">Open in the Institute &rarr;</a>
      </td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3ddcf;">
    <tr><td style="background:#1a2c45;padding:18px 24px;border-bottom:3px solid #b08d3f;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td><img src="${SITE}/brand/tnbbi-logo-color-sm.png" width="44" height="44" alt="" style="display:block;border:0;"></td>
        <td style="padding-left:12px;font:600 16px Georgia,'Times New Roman',serif;color:#ffffff;">True North Baptist Church<br><span style="font:12px Arial,Helvetica,sans-serif;color:#d8c9a3;">Bible Institute</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 24px 6px;">
      <p style="font:15px/1.5 Arial,Helvetica,sans-serif;color:#142033;margin:0 0 6px;">${first ? `Hello ${escHtml(first)},` : "Hello,"}</p>
      <p style="font:15px/1.5 Arial,Helvetica,sans-serif;color:#142033;margin:0;">${intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${rows}</table>
      <p style="margin:22px 0 8px;"><a href="${SITE}/" style="display:inline-block;background:#1a2c45;color:#ffffff;font:600 14px Arial,Helvetica,sans-serif;text-decoration:none;padding:11px 22px;border-radius:999px;">Go to the Bible Institute</a></p>
    </td></tr>
    <tr><td style="padding:14px 24px 22px;font:12px/1.5 Arial,Helvetica,sans-serif;color:#6b7280;">
      &ldquo;And the things that thou hast heard of me among many witnesses, the same commit thou to faithful men, who shall be able to teach others also.&rdquo; &mdash; 2 Timothy 2:2<br><br>
      You're receiving this because you have an account at tnbbibleinstitute.com. To get one summary a day instead, or no emails, go to <a href="${SITE}/?profile=notifications" style="color:#3d5a78;">My Profile &rarr; Notifications</a>.
    </td></tr>
  </table></td></tr></table></body></html>`;
  const text = `${first ? `Hello ${first},` : "Hello,"}\n\n${intro}\n\n` +
    list.map((n) => `• ${n.subject}\n  ${SITE}${safeLink(n.link)}`).join("\n\n") +
    `\n\nGo to the Bible Institute: ${SITE}/\n\nTo get one summary a day instead, or no emails: ${SITE}/?profile=notifications\n`;
  return { to: list[0].email || "", subject, text, html };
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await out.arrayBuffer());
}

async function setStatus(sql: Sql, key: string, ok: boolean, detail: string) {
  try { await sql`select public.set_service_status(${key}, ${ok}, ${detail})`; } catch (_) { /* older database */ }
}

// ---------------------------------------------------------------------------
// Lecture videos: read each course's YouTube playlist
// ---------------------------------------------------------------------------
// Uses a YouTube Data API key (free; Supabase → Edge Functions → Secrets →
// YOUTUBE_API_KEY). Videos must be Public or Unlisted — YouTube never shows
// Private videos to anyone else — with embedding allowed.
function youtubeKey(): string {
  try { return (Deno.env.get("YOUTUBE_API_KEY") || "").trim(); } catch (_) { return ""; }
}
function youtubeBase(): string {
  try { return Deno.env.get("YOUTUBE_API_BASE") || "https://www.googleapis.com/youtube/v3"; } catch (_) { return "https://www.googleapis.com/youtube/v3"; }
}
// "PT1H2M3S" → 3723 seconds ("P0D" while live → 0)
export function isoDuration(d: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}
function alaskaDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Anchorage", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}
type YtItem = { video_id: string; title: string; position: number; duration: number; published_at: string | null;
  recorded_on: string | null; status: string; in_playlist: boolean };
async function ytGet(path: string, params: Record<string, string>, fetchImpl: typeof fetch) {
  const q = new URLSearchParams({ ...params, key: youtubeKey() });
  const res = await fetchImpl(`${youtubeBase()}/${path}?${q}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body && body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason || "";
    const msg = body && body.error && body.error.message || `HTTP ${res.status}`;
    if (reason === "playlistNotFound" || res.status === 404)
      throw new Error("YouTube can't find this playlist. Check the link, and that the playlist is Public or Unlisted (not Private).");
    if (reason === "keyInvalid" || /API key not valid/i.test(msg)) throw new Error("The YouTube key isn't valid (Supabase secret YOUTUBE_API_KEY).");
    if (/quota/i.test(reason)) throw new Error("YouTube's daily limit was reached; it will try again tomorrow.");
    throw new Error(`YouTube said: ${msg}`);
  }
  return body;
}
export async function readPlaylist(playlistId: string, extraIds: string[], fetchImpl: typeof fetch): Promise<YtItem[]> {
  const order: { id: string; position: number; title: string; inPlaylist: boolean }[] = [];
  if (playlistId) {
    let pageToken = "";
    for (let page = 0; page < 20; page++) {  // up to 1,000 videos
      const body = await ytGet("playlistItems", { part: "snippet,contentDetails", maxResults: "50", playlistId, ...(pageToken ? { pageToken } : {}) }, fetchImpl);
      for (const it of body.items || []) {
        const id = it.contentDetails && it.contentDetails.videoId || it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId;
        if (id) order.push({ id, position: it.snippet ? Number(it.snippet.position) || 0 : order.length, title: it.snippet ? it.snippet.title || "" : "", inPlaylist: true });
      }
      pageToken = body.nextPageToken || "";
      if (!pageToken) break;
    }
  }
  for (const id of extraIds || []) if (id && !order.some((o) => o.id === id)) order.push({ id, position: 0, title: "", inPlaylist: false });
  const details: Record<string, any> = {};
  for (let i = 0; i < order.length; i += 50) {
    const ids = order.slice(i, i + 50).map((o) => o.id).join(",");
    const body = await ytGet("videos", { part: "snippet,contentDetails,status,liveStreamingDetails,recordingDetails", id: ids, maxResults: "50" }, fetchImpl);
    for (const v of body.items || []) details[v.id] = v;
  }
  return order.map((o) => {
    const v = details[o.id];
    if (!v) return { video_id: o.id, title: o.title, position: o.position, duration: 0, published_at: null, recorded_on: null, status: "private", in_playlist: o.inPlaylist };
    const sn = v.snippet || {}, st = v.status || {}, live = v.liveStreamingDetails || {}, rec = v.recordingDetails || {};
    const status = st.privacyStatus === "private" ? "private"
      : st.embeddable === false ? "no_embed"
      : sn.liveBroadcastContent === "live" ? "live"
      : sn.liveBroadcastContent === "upcoming" ? "upcoming" : "ok";
    const recorded = rec.recordingDate ? String(rec.recordingDate).slice(0, 10)
      : alaskaDay(live.actualStartTime || live.scheduledStartTime || sn.publishedAt);
    return { video_id: o.id, title: sn.title || o.title, position: o.position, duration: isoDuration(v.contentDetails && v.contentDetails.duration),
      published_at: sn.publishedAt || null, recorded_on: recorded, status, in_playlist: o.inPlaylist };
  });
}
export async function syncPlaylists(sql: Sql, fetchImpl: typeof fetch, now: Date) {
  const due = await sql`select * from public.courses_due_for_sync(${now})`;
  let added = 0;
  for (const c of due) {
    if (!youtubeKey()) {
      await sql`select public.sync_course_lessons(${c.course_id}, ${c.playlist_id}, '[]'::jsonb, ${"Lecture videos aren't connected yet: the YouTube key (Supabase secret YOUTUBE_API_KEY) hasn't been added."})`;
      continue;
    }
    try {
      const items = await readPlaylist(c.playlist_id, c.extra_ids || [], fetchImpl);
      const r = await sql`select public.sync_course_lessons(${c.course_id}, ${c.playlist_id}, ${sql.json(items)}) as n`;
      added += Number(r[0] && r[0].n) || 0;
    } catch (e) {
      await sql`select public.sync_course_lessons(${c.course_id}, ${c.playlist_id}, '[]'::jsonb, ${(e as Error).message})`;
    }
  }
  return { checked: due.length, added };
}

// ---------------------------------------------------------------------------
// The every-minute run
// ---------------------------------------------------------------------------
async function safely<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (e) { console.warn(label + ":", (e as Error).message || e); return null; }
}

export async function runReminders(sql: Sql, fetchImpl = fetch, now: Date = new Date()) {
  const out: Record<string, number> = { sent: 0 };
  let keys: Keys | null = null;
  const pushKeys = async () => (keys = keys || await getKeys(sql, true));

  // 1. Teachers: "time to take attendance" (5 minutes before class starts).
  const due = await sql`select * from public.claim_attendance_reminders()`;
  for (const r of due) {
    const date = isoDay(r.class_date);
    const started = classHasStarted(r.class_time, now);
    const res = await sendToUser(sql, r.teacher_id, {
      title: started ? "Time to take attendance" : "Class starts in 5 minutes",
      body: started
        ? `${r.course_title} started at ${prettyTime(r.class_time)}. Tap to mark who's here.`
        : `${r.course_title} starts at ${prettyTime(r.class_time)}. Tap to take attendance.`,
      url: `${SITE}/?attendance=${encodeURIComponent(r.course_id)}&date=${date}`,
      tag: `attendance-${r.course_id}-${date}`,
    }, (await pushKeys())!, fetchImpl);
    out.sent += res.delivered;
  }
  out.classes = due.length;

  // 1b. Lecture videos from YouTube playlists (new-lecture notices are sent
  //     below with everything else), then online attendance.
  const yt = await safely("playlists", () => syncPlaylists(sql, fetchImpl, now));
  if (yt) { out.playlists = yt.checked; out.lectures = yt.added; }
  out.attendance = (await safely("online attendance", async () =>
    (await sql`select public.settle_online_attendance() as n`)[0].n)) || 0;

  // 2. Students: assignment due dates become notifications (sent below).
  out.assignments = (await safely("assignment reminders", async () =>
    (await sql`select public.queue_assignment_reminders(${now}) as n`)[0].n)) || 0;

  // 3. Every new notification → phones.
  const pushes = (await safely("push deliveries", () => sql`select * from public.claim_push_deliveries(${now})`)) as Note[] | null;
  if (pushes && pushes.length) {
    for (const [userId, list] of groupByUser(pushes)) {
      const res = await sendToUser(sql, userId, pushMessage(list), (await pushKeys())!, fetchImpl);
      out.sent += res.delivered;
    }
  }

  // 4. … and email.
  const emails = (await safely("email deliveries", () => sql`select * from public.claim_email_deliveries(${now})`)) as Note[] | null;
  if (emails && emails.length) {
    const mails: Mail[] = [];
    for (const [, list] of groupByUser(emails)) {
      const digest = list.some((n) => n.digest);
      if (list[0].email) mails.push(emailFor(list, digest));
    }
    try {
      const n = await sendMails(mails);
      out.emails = n;
      await setStatus(sql, "email", true, `Last sent ${n} email${n === 1 ? "" : "s"} ${now.toISOString()}`);
    } catch (e) {
      console.warn("email:", (e as Error).message);
      await setStatus(sql, "email", false, (e as Error).message);
    }
  }

  // 5. Nightly backup (from 2 AM Alaska time), and a weekly copy by email.
  await safely("nightly backup", async () => {
    const r = await sql`select public.take_nightly_backup_if_due(${now}) as id`;
    if (r[0] && r[0].id) { out.backup = Number(r[0].id); await setStatus(sql, "backup", true, `Nightly backup taken ${now.toISOString()}`); }
  });
  await safely("weekly backup email", async () => {
    const r = await sql`select * from public.backup_to_email(${now})`;
    if (!r.length) return;
    const b = r[0];
    const day = new Date(b.taken_at).toISOString().slice(0, 10);
    const raw = enc.encode(typeof b.data === "string" ? b.data : JSON.stringify(b.data));
    const gz = await gzip(raw);
    try {
      await sendMails([{
        to: GMAIL_USER,
        subject: `Weekly backup — Bible Institute site (${day})`,
        text: `Attached is this week's backup of the Bible Institute site (taken ${day}).\n\n` +
          `Keep this email: it's an off-site copy of every course, grade, transcript, message, and account on tnbbibleinstitute.com. ` +
          `(Uploaded files such as course PDFs are stored separately and aren't in this file.)\n\n` +
          `Nightly backups are also kept for two weeks inside the site (Settings → Backups). To restore from a backup, see SETUP.md in the site's GitHub repository.\n`,
        attachment: { name: `tnbbi-backup-${day}.json.gz`, type: "application/gzip", bytes: gz },
      }]);
      await sql`select public.mark_backup_emailed(${b.id}, ${now})`;
      await setStatus(sql, "backup_email", true, `Weekly backup emailed ${now.toISOString()} (${Math.round(gz.length / 1024)} KB)`);
    } catch (e) {
      await setStatus(sql, "backup_email", false, (e as Error).message);
    }
  });
  return out;
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
        title: "Notifications are working",
        body: "Notes from the Bible Institute will arrive on this device like this one.",
        url: `${SITE}/`,
        tag: "tnbbi-test",
      }, keys!, fetchImpl);
      return json(res);
    }
    if (url.searchParams.has("mailcheck")) {
      // Can this function reach Gmail's mail server at all? (No password needed.)
      try {
        const smtp = new Smtp(await connectMail());
        const greeting = await smtp.reply([220]);
        await smtp.close();
        return json({ reachable: true, greeting: greeting.slice(0, 80), passwordSet: !!mailPassword() });
      } catch (e) {
        return json({ reachable: false, error: (e as Error).message, passwordSet: !!mailPassword() });
      }
    }
    if (url.searchParams.has("testemail")) {
      const uid = await callerId(req, fetchImpl);
      if (!uid) return json({ error: "Please sign in again." }, 401);
      const me = await sql`select email, name from public.profiles where id = ${uid} and status = 'active'`;
      if (!me.length || !me[0].email) return json({ error: "Your account doesn't have an email address." }, 400);
      try {
        await sendMails([emailFor([{ user_id: uid, email: me[0].email, name: me[0].name, kind: "general",
          subject: "Email notifications are working. You'll get notes like this when something needs your attention.", link: "/" }], false)]);
        await setStatus(sql, "email", true, `Test email sent ${new Date().toISOString()}`);
        return json({ sent: 1, to: me[0].email });
      } catch (e) {
        await setStatus(sql, "email", false, (e as Error).message);
        return json({ error: (e as Error).message }, 502);
      }
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
